"""seam-C 포트·어댑터 회귀 — 260907_toss_payment_rail_design.md §3/§8 P2-3.

`StubTossGateway` 를 어댑터 생성자에 직접 주입해 키 없이 전부 검증한다(§5-1 "스텁이 대체하는
것은 '토스 서버' 뿐"). DB 를 쓰지 않는다 — `PaymentRail.offer/confirm/lookup/refund` 는 순수하게
`contract`/`ad`/`tier` 객체의 속성만 읽으므로 `SimpleNamespace` 로 충분하다.
"""

import asyncio
import base64
import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import httpx

from app.services.ad_payments import payment_code as payment_code_module
from app.services.ad_payments.rails.bank_transfer import BankTransferRail
from app.services.ad_payments.rails.base import RailNotSupported, RailValidationError
from app.services.ad_payments.rails.toss_card import HttpTossGateway, StubTossGateway, TossApiError, TossCardRail

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


def _done_payment(*, payment_key: str, order_id: str, amount: int = 10900) -> dict:
    return {
        "paymentKey": payment_key,
        "orderId": order_id,
        "status": "DONE",
        "totalAmount": amount,
        "currency": "KRW",
        "method": "카드",
        "approvedAt": datetime.now(UTC).isoformat(),
        "card": None,
        "cancels": [],
    }


class _FixedConfirmGateway:
    def __init__(self, payment: dict):
        self.payment = payment

    async def confirm(self, **_kwargs):
        return self.payment


class _LookupGateway:
    def __init__(self, payment: dict | None):
        self.payment = payment
        self.lookup_calls = 0

    async def get_payment(self, _payment_key):
        self.lookup_calls += 1
        return self.payment


class _AmbiguousConfirmGateway(_LookupGateway):
    def __init__(self, payment: dict | None, error: Exception):
        super().__init__(payment)
        self.error = error

    async def confirm(self, **_kwargs):
        raise self.error


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

    def test_http_gateway_basic_auth_includes_required_trailing_colon(self):
        gateway = HttpTossGateway("test_sk_dummy")
        expected = base64.b64encode(b"test_sk_dummy:").decode()
        self.assertEqual(gateway._headers()["Authorization"], f"Basic {expected}")


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

    def test_confirm_rejects_tampered_psp_payload_fields(self):
        contract = _make_contract(payment_code=_VALID_CODE, krw_value=10900)
        baseline = {
            "paymentKey": "pay_expected",
            "orderId": f"{_VALID_CODE}-1",
            "status": "DONE",
            "totalAmount": 10900,
            "currency": "KRW",
            "approvedAt": datetime.now(UTC).isoformat(),
        }
        mutations = (
            {"status": "READY"},
            {"paymentKey": "pay_other"},
            {"orderId": f"{_VALID_CODE}-2"},
            {"totalAmount": 1},
            {"currency": "USD"},
        )
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                gateway = _FixedConfirmGateway({**baseline, **mutation})
                rail = TossCardRail(gateway=gateway)
                with self.assertRaises(RailValidationError):
                    self._confirm(
                        rail,
                        contract,
                        payment_key="pay_expected",
                        order_id=f"{_VALID_CODE}-1",
                        amount=10900,
                    )

    def test_timeout_recovers_by_single_lookup(self):
        payment = _done_payment(payment_key="pay_timeout", order_id=f"{_VALID_CODE}-1")
        gateway = _AmbiguousConfirmGateway(payment, httpx.ReadTimeout("confirm response lost"))
        result = self._confirm(TossCardRail(gateway=gateway), _make_contract(), payment_key="pay_timeout")
        self.assertTrue(result.already_final)
        self.assertEqual(gateway.lookup_calls, 1)

    def test_server_error_recovers_by_single_lookup(self):
        payment = _done_payment(payment_key="pay_5xx", order_id=f"{_VALID_CODE}-1")
        gateway = _AmbiguousConfirmGateway(payment, TossApiError("UNKNOWN", "upstream failed", status_code=502))
        result = self._confirm(TossCardRail(gateway=gateway), _make_contract(), payment_key="pay_5xx")
        self.assertTrue(result.already_final)
        self.assertEqual(gateway.lookup_calls, 1)

    def test_ambiguous_recovery_never_accepts_mismatched_lookup(self):
        payment = _done_payment(payment_key="pay_timeout", order_id=f"{_VALID_CODE}-1")
        payment["totalAmount"] = 1
        gateway = _AmbiguousConfirmGateway(payment, httpx.ReadTimeout("confirm response lost"))
        with self.assertRaises(RailValidationError):
            self._confirm(TossCardRail(gateway=gateway), _make_contract(), payment_key="pay_timeout")


class TossCardLookupTests(unittest.TestCase):
    def test_lookup_returns_none_when_not_done(self):
        rail = TossCardRail(gateway=StubTossGateway())
        result = asyncio.run(rail.lookup(_make_contract(), ref="never_confirmed"))
        self.assertIsNone(result)

    def test_lookup_rejects_payment_belonging_to_other_contract(self):
        # [치명 1] rail-sync 로 다른 계약의 결제를 잘못 붙여넣어도 매칭되지 않아야 한다.
        gateway = StubTossGateway()
        rail = TossCardRail(gateway=gateway)
        other_contract = _make_contract(payment_code=_OTHER_VALID_CODE)
        asyncio.run(gateway.confirm(payment_key="pk_other", order_id=f"{_OTHER_VALID_CODE}-1", amount=10900))
        this_contract = _make_contract(payment_code=_VALID_CODE)
        with self.assertRaises(RailValidationError):
            asyncio.run(rail.lookup(this_contract, ref="pk_other"))
        # 진짜 소유자에게는 그대로 매칭된다.
        result_for_owner = asyncio.run(rail.lookup(other_contract, ref="pk_other"))
        self.assertIsNotNone(result_for_owner)

    def test_lookup_rejects_amount_currency_and_payment_key_mismatch(self):
        contract = _make_contract()
        for mutation in ({"totalAmount": 1}, {"currency": "USD"}, {"paymentKey": "other"}):
            with self.subTest(mutation=mutation):
                payment = {**_done_payment(payment_key="pay_lookup", order_id=f"{_VALID_CODE}-1"), **mutation}
                rail = TossCardRail(gateway=_LookupGateway(payment))
                with self.assertRaises(RailValidationError):
                    asyncio.run(rail.lookup(contract, ref="pay_lookup"))

    def test_webhook_fetch_and_mapping_use_one_query(self):
        payment = _done_payment(payment_key="pay_webhook", order_id=f"{_VALID_CODE}-1")
        gateway = _LookupGateway(payment)
        rail = TossCardRail(gateway=gateway)
        fetched = asyncio.run(rail.fetch_payment(ref="pay_webhook"))
        result = rail.result_from_payment(_make_contract(), fetched, ref="pay_webhook")
        self.assertEqual(result.observation.source_ref, "pay_webhook")
        self.assertEqual(gateway.lookup_calls, 1)

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


class _SpyCancelGateway(StubTossGateway):
    """cancel() 에 실제로 전달된 Idempotency-Key 를 기록한다 — [치명 2] 회귀용."""

    def __init__(self):
        super().__init__()
        self.cancel_idempotency_keys: list[str] = []
        self.cancel_amounts: list[int | None] = []

    async def cancel(self, *, payment_key, cancel_reason, cancel_amount, idempotency_key):
        self.cancel_idempotency_keys.append(idempotency_key)
        self.cancel_amounts.append(cancel_amount)
        return await super().cancel(
            payment_key=payment_key,
            cancel_reason=cancel_reason,
            cancel_amount=cancel_amount,
            idempotency_key=idempotency_key,
        )


class _TamperedCancelGateway(StubTossGateway):
    def __init__(self, mutation: str):
        super().__init__()
        self.mutation = mutation

    async def cancel(self, **kwargs):
        payment = await super().cancel(**kwargs)
        if self.mutation == "amount":
            payment["cancels"][-1]["cancelAmount"] = 1
        elif self.mutation == "pending":
            payment["cancels"][-1]["cancelStatus"] = "PENDING"
        elif self.mutation == "last_transaction_key":
            payment["lastTransactionKey"] = "different-transaction"
        elif self.mutation == "missing_evidence":
            payment["cancels"][-1].pop("canceledAt")
        return payment


class TossCardRefundIdempotencyTests(unittest.TestCase):
    """[치명 2] — idempotency_seed 가 refund() 를 거쳐 그대로 Idempotency-Key 파생에 쓰이는지.
    같은 seed(=더블클릭·재시도) 는 같은 키, 다른 seed(=별개 요청) 는 다른 키가 되어야 한다."""

    def _refund(self, rail, contract, *, amount_vnd, idempotency_seed, ref="pk_refund"):
        return asyncio.run(
            rail.refund(contract, ref=ref, amount_vnd=amount_vnd, reason="test", idempotency_seed=idempotency_seed)
        )

    def test_same_seed_produces_same_idempotency_key(self):
        gateway = _SpyCancelGateway()
        rail = TossCardRail(gateway=gateway)
        contract = _make_contract(payment_code=_VALID_CODE, amount_vnd=539000, krw_value=10900)
        asyncio.run(gateway.confirm(payment_key="pk_refund", order_id=f"{_VALID_CODE}-1", amount=10900))

        self._refund(rail, contract, amount_vnd=100000, idempotency_seed="dep1:100000:0")
        self._refund(rail, contract, amount_vnd=100000, idempotency_seed="dep1:100000:0")

        self.assertEqual(len(gateway.cancel_idempotency_keys), 2)
        self.assertEqual(gateway.cancel_idempotency_keys[0], gateway.cancel_idempotency_keys[1])

    def test_different_seed_produces_different_idempotency_key(self):
        gateway = _SpyCancelGateway()
        rail = TossCardRail(gateway=gateway)
        contract = _make_contract(payment_code=_VALID_CODE, amount_vnd=539000, krw_value=10900)
        asyncio.run(gateway.confirm(payment_key="pk_refund", order_id=f"{_VALID_CODE}-1", amount=10900))

        self._refund(rail, contract, amount_vnd=100000, idempotency_seed="dep1:100000:0")
        # 별개의 새 부분환불(다른 금액 또는 이전 환불이 반영된 뒤의 카운트) → 다른 seed.
        self._refund(rail, contract, amount_vnd=50000, idempotency_seed="dep1:50000:1")

        self.assertEqual(len(gateway.cancel_idempotency_keys), 2)
        self.assertNotEqual(gateway.cancel_idempotency_keys[0], gateway.cancel_idempotency_keys[1])

    def test_remaining_all_omits_cancel_amount_but_records_only_remaining_vnd(self):
        gateway = _SpyCancelGateway()
        rail = TossCardRail(gateway=gateway)
        contract = _make_contract(payment_code=_VALID_CODE, amount_vnd=539000, krw_value=10900)
        asyncio.run(gateway.confirm(payment_key="pk_refund", order_id=f"{_VALID_CODE}-1", amount=10900))
        self._refund(rail, contract, amount_vnd=400000, idempotency_seed="dep1:400000:0")

        result = asyncio.run(
            rail.refund(
                contract,
                ref="pk_refund",
                amount_vnd=None,
                remaining_amount_vnd=139000,
                reason="remaining all",
                idempotency_seed="dep1:full:1",
            )
        )

        self.assertIsNone(gateway.cancel_amounts[-1])
        self.assertEqual(result.observation.amount_vnd, 139000)
        self.assertEqual(result.charge_snapshot["value"], 10900)
        self.assertEqual(result.charge_snapshot["currency"], "KRW")
        self.assertEqual(result.charge_snapshot["cancelStatus"], "DONE")
        self.assertEqual(result.charge_snapshot["cancelAmount"], 10900 - (10900 * 400000) // 539000)
        self.assertEqual(result.charge_snapshot["transactionKey"], result.charge_snapshot["lastTransactionKey"])
        self.assertIsNotNone(result.charge_snapshot["canceledAt"])
        canceled_at = datetime.fromisoformat(result.charge_snapshot["canceledAt"])
        approved_at = datetime.fromisoformat(result.charge_snapshot["approved_at"])
        self.assertNotEqual(canceled_at, approved_at)
        self.assertEqual(result.observation.paid_at, canceled_at)

    def test_partial_refund_rejects_mismatched_psp_cancel_amount(self):
        self._assert_tampered_cancel_rejected("amount")

    def test_refund_rejects_pending_cancel(self):
        self._assert_tampered_cancel_rejected("pending")

    def test_refund_rejects_mismatched_last_transaction_key(self):
        self._assert_tampered_cancel_rejected("last_transaction_key")

    def test_refund_rejects_missing_cancel_evidence(self):
        self._assert_tampered_cancel_rejected("missing_evidence")

    def _assert_tampered_cancel_rejected(self, mutation: str):
        gateway = _TamperedCancelGateway(mutation)
        rail = TossCardRail(gateway=gateway)
        contract = _make_contract(payment_code=_VALID_CODE, amount_vnd=539000, krw_value=10900)
        asyncio.run(gateway.confirm(payment_key="pk_refund", order_id=f"{_VALID_CODE}-1", amount=10900))

        with self.assertRaises(RailValidationError):
            self._refund(rail, contract, amount_vnd=100000, idempotency_seed="dep1:100000:0")


class BankTransferNullObjectTests(unittest.TestCase):
    def test_confirm_lookup_refund_not_supported(self):
        rail = BankTransferRail()
        contract = _make_contract()
        with self.assertRaises(RailNotSupported):
            asyncio.run(rail.confirm(contract, params={}))
        with self.assertRaises(RailNotSupported):
            asyncio.run(rail.lookup(contract, ref="x"))
        with self.assertRaises(RailNotSupported):
            asyncio.run(rail.refund(contract, ref="x", amount_vnd=None, reason="test", idempotency_seed="seed"))
        with self.assertRaises(RailNotSupported):
            rail.parse_webhook({}, b"{}")


if __name__ == "__main__":
    unittest.main()
