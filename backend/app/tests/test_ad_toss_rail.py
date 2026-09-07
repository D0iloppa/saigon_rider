"""seam-C 포트·어댑터 회귀 — 260907_toss_payment_rail_design.md §3/§8 P2-3.

`StubTossGateway` 를 어댑터 생성자에 직접 주입해 키 없이 전부 검증한다(§5-1 "스텁이 대체하는
것은 '토스 서버' 뿐"). DB 를 쓰지 않는다 — `PaymentRail.offer/confirm/lookup/refund` 는 순수하게
`contract`/`ad`/`tier` 객체의 속성만 읽으므로 `SimpleNamespace` 로 충분하다.
"""

import asyncio
import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from app.services.ad_payments import payment_code as payment_code_module
from app.services.ad_payments.rails.bank_transfer import BankTransferRail
from app.services.ad_payments.rails.base import RailNotSupported, RailValidationError
from app.services.ad_payments.rails.toss_card import StubTossGateway, TossCardRail

_VALID_CODE = payment_code_module.generate_payment_code()
_OTHER_VALID_CODE = payment_code_module.generate_payment_code()
while _OTHER_VALID_CODE == _VALID_CODE:
    _OTHER_VALID_CODE = payment_code_module.generate_payment_code()


def _make_contract(
    *, payment_code=_VALID_CODE, amount_vnd=539000, krw_value=10900, months=3, signer_name="Nguyen Van A"
):
    return SimpleNamespace(
        id=uuid.uuid4(),
        payment_code=payment_code,
        amount_vnd=amount_vnd,
        months=months,
        signer_name=signer_name,
        contract_token=uuid.uuid4(),
        payment_instructions_issued_at=None,
        contract_snapshot={"charge": {"currency": "KRW", "value": krw_value, "price_col": "price_3m_krw"}}
        if krw_value is not None
        else None,
    )


def _make_ad():
    return SimpleNamespace(id=uuid.uuid4())


def _make_tier():
    return SimpleNamespace(name="일반")


class TossCardOfferTests(unittest.TestCase):
    def test_offer_has_no_secret_key_string_anywhere(self):
        rail = TossCardRail(gateway=StubTossGateway())
        contract = _make_contract()
        offer = rail.offer(contract, _make_ad(), _make_tier(), now=datetime.now(UTC))
        self.assertTrue(offer.wired)
        # 시크릿 키를 다루는 필드 자체가 없다 — client_key 만.
        self.assertNotIn("secret", offer.checkout)
        self.assertNotIn("secret_key", offer.checkout)

    def test_order_id_format(self):
        rail = TossCardRail(gateway=StubTossGateway())
        contract = _make_contract(payment_code=_VALID_CODE)
        offer = rail.offer(contract, _make_ad(), _make_tier(), now=datetime.now(UTC))
        order_id = offer.checkout["order_id"]
        self.assertTrue(order_id.startswith(f"{_VALID_CODE}-"))
        suffix = order_id.rsplit("-", 1)[-1]
        self.assertTrue(suffix.isdigit())
        self.assertTrue(1 <= int(suffix) <= 9999)

    def test_offer_hidden_when_krw_price_missing(self):
        rail = TossCardRail(gateway=StubTossGateway())
        contract = _make_contract(krw_value=None)
        offer = rail.offer(contract, _make_ad(), _make_tier(), now=datetime.now(UTC))
        self.assertFalse(offer.wired)
        self.assertIsNone(offer.checkout)


class TossCardConfirmTests(unittest.TestCase):
    def _confirm(self, rail, contract, *, payment_key="pay_1", order_id=None, amount=10900):
        order_id = order_id or f"{contract.payment_code}-1"
        return asyncio.run(
            rail.confirm(contract, params={"paymentKey": payment_key, "orderId": order_id, "amount": amount})
        )

    def test_amount_mismatch_raises(self):
        rail = TossCardRail(gateway=StubTossGateway())
        contract = _make_contract(krw_value=10900)
        with self.assertRaises(RailValidationError):
            self._confirm(rail, contract, amount=99)

    def test_wrong_contract_order_id_raises(self):
        rail = TossCardRail(gateway=StubTossGateway())
        contract = _make_contract(payment_code=_VALID_CODE)
        with self.assertRaises(RailValidationError):
            self._confirm(rail, contract, order_id=f"{_OTHER_VALID_CODE}-1")

    def test_successful_confirm_maps_all_fields(self):
        rail = TossCardRail(gateway=StubTossGateway())
        contract = _make_contract(payment_code=_VALID_CODE, amount_vnd=539000, krw_value=10900)
        result = self._confirm(rail, contract, payment_key="pay_123", amount=10900)

        obs = result.observation
        self.assertEqual(obs.source, "toss")
        self.assertEqual(obs.source_ref, "pay_123")
        self.assertEqual(obs.amount_vnd, 539000)  # VND 액면 — contract.amount_vnd 그대로
        self.assertEqual(obs.kind, "deposit")
        self.assertEqual(obs.payment_code_hint, _VALID_CODE)
        self.assertEqual(obs.payer_name, "Nguyen Van A")
        self.assertIn(f"{_VALID_CODE}-1", obs.memo_raw)
        self.assertIsNotNone(obs.bank_ref)
        self.assertFalse(result.already_final)
        self.assertEqual(result.charge_snapshot["currency"], "KRW")
        self.assertEqual(result.charge_snapshot["value"], 10900)
        self.assertEqual(result.charge_snapshot["payment_key"], "pay_123")

    def test_already_processed_falls_back_to_lookup(self):
        gateway = StubTossGateway()
        rail = TossCardRail(gateway=gateway)
        contract = _make_contract(payment_code=_VALID_CODE, amount_vnd=539000, krw_value=10900)
        # 먼저 정상 confirm 으로 DONE 상태를 만든다.
        first = self._confirm(rail, contract, payment_key="pay_dup", amount=10900)
        self.assertFalse(first.already_final)
        # 같은 paymentKey 로 다시 confirm → StubTossGateway 가 ALREADY_PROCESSED_PAYMENT → lookup 대체.
        second = self._confirm(rail, contract, payment_key="pay_dup", amount=10900)
        self.assertTrue(second.already_final)
        self.assertEqual(second.observation.source_ref, "pay_dup")


class TossCardLookupTests(unittest.TestCase):
    def test_lookup_returns_none_when_not_done(self):
        rail = TossCardRail(gateway=StubTossGateway())
        result = asyncio.run(rail.lookup(_make_contract(), ref="never_confirmed"))
        self.assertIsNone(result)

    def test_parse_webhook_ignores_tampered_status_and_amount(self):
        # 웹훅 서명이 없으므로(T-10) 페이로드의 status/amount 는 신뢰하지 않는다 — parse_webhook
        # 은 paymentKey 만 뽑는다. 상태/금액을 조작해도 결과가 같아야 한다.
        rail = TossCardRail(gateway=StubTossGateway())
        import json

        tampered = json.dumps(
            {
                "eventType": "PAYMENT_STATUS_CHANGED",
                "data": {"paymentKey": "pay_abc", "status": "DONE", "totalAmount": 1},
            }
        ).encode()
        self.assertEqual(rail.parse_webhook({}, tampered), "pay_abc")

        also_tampered = json.dumps(
            {"eventType": "PAYMENT_STATUS_CHANGED", "data": {"paymentKey": "pay_abc", "status": "CANCELED"}}
        ).encode()
        self.assertEqual(rail.parse_webhook({}, also_tampered), "pay_abc")

    def test_parse_webhook_rejects_other_event_types(self):
        rail = TossCardRail(gateway=StubTossGateway())
        import json

        payload = json.dumps({"eventType": "OTHER_EVENT", "data": {"paymentKey": "pay_abc"}}).encode()
        self.assertIsNone(rail.parse_webhook({}, payload))


class BankTransferNullObjectTests(unittest.TestCase):
    def test_confirm_lookup_refund_not_supported(self):
        rail = BankTransferRail()
        contract = _make_contract()
        with self.assertRaises(RailNotSupported):
            asyncio.run(rail.confirm(contract, params={}))
        with self.assertRaises(RailNotSupported):
            asyncio.run(rail.lookup(contract, ref="x"))
        with self.assertRaises(RailNotSupported):
            asyncio.run(rail.refund(contract, ref="x", amount_vnd=None, reason="test"))
        with self.assertRaises(RailNotSupported):
            rail.parse_webhook({}, b"{}")


if __name__ == "__main__":
    unittest.main()
