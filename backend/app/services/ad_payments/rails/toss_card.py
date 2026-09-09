"""toss_card 레일 — 결제 개시가 있는 어댑터 (260907_toss_payment_rail_design.md §3-2/§3-3/§3-4).

`TossGateway` 프로토콜(confirm/get_payment/cancel 3메서드)로 HTTP 경계를 한 번 더 가른다.
어댑터 로직(orderId 파싱·금액 대조·매핑·멱등키)은 게이트웨이가 `HttpTossGateway`(진짜)든
`StubTossGateway`(dev)든 동일하므로 키 없이 전부 테스트된다(§5-1).

**토스 2키(클라이언트·시크릿)를 읽는 코드는 `config.py` 하나뿐이어야 한다** — 이 파일은
`config.get_toss_client_key()`/`config.toss_mode()` 를 통해서만 배선 여부를 안다(§5-4 경계).
"""

from __future__ import annotations

import base64
import copy
import json
import os
import secrets
from dataclasses import replace
from datetime import UTC, datetime
from typing import Protocol

import httpx

from .. import config
from .. import payment_code as payment_code_module
from ..port import DepositObservation
from .base import CheckoutResult, RailNotSupported, RailOffer, RailValidationError

_TOSS_API_BASE_URL = "https://api.tosspayments.com"

# successUrl/failUrl 베이스 — seam-A(계좌)와 같은 함정이었던 기존 env(ad_contract.py 와 동일하게
# 직접 읽는다. 카드 결제 2키(config.py 전용 경계, §5-4)와는 다른 변수라 여기서 읽어도 무방하다.
_BIZ_PORTAL_BASE_URL = os.getenv("BIZ_PORTAL_BASE_URL", "https://business.saigon-rider.com")


class TossApiError(Exception):
    """토스 API 가 4xx/5xx 를 반환했을 때. `code` 는 토스 에러코드(T-6 등)."""

    def __init__(self, code: str, message: str, *, status_code: int | None = None):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.status_code = status_code


class TossGateway(Protocol):
    async def confirm(self, *, payment_key: str, order_id: str, amount: int) -> dict: ...

    async def get_payment(self, payment_key: str) -> dict | None: ...

    async def cancel(
        self, *, payment_key: str, cancel_reason: str, cancel_amount: int | None, idempotency_key: str
    ) -> dict: ...


def _raise_for_toss_error_or_json(resp: httpx.Response) -> dict:
    try:
        data = resp.json()
    except ValueError:
        data = {}
    if resp.status_code >= 400:
        raise TossApiError(
            code=data.get("code", "UNKNOWN"), message=data.get("message", ""), status_code=resp.status_code
        )
    return data


class HttpTossGateway:
    """진짜 토스 API 호출. 시크릿 키는 생성자에서만 받는다 — 어디에도 저장/로그하지 않는다."""

    def __init__(self, secret_key: str):
        self._secret_key = secret_key

    def _headers(self, *, idempotency_key: str | None = None) -> dict:
        token = base64.b64encode(f"{self._secret_key}:".encode()).decode()
        headers = {"Authorization": f"Basic {token}"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return headers

    async def confirm(self, *, payment_key: str, order_id: str, amount: int) -> dict:
        async with httpx.AsyncClient(base_url=_TOSS_API_BASE_URL, timeout=10.0) as client:
            resp = await client.post(
                "/v1/payments/confirm",
                json={"paymentKey": payment_key, "orderId": order_id, "amount": amount},
                headers=self._headers(idempotency_key=payment_key),
            )
        return _raise_for_toss_error_or_json(resp)

    async def get_payment(self, payment_key: str) -> dict | None:
        async with httpx.AsyncClient(base_url=_TOSS_API_BASE_URL, timeout=10.0) as client:
            resp = await client.get(f"/v1/payments/{payment_key}", headers=self._headers())
        if resp.status_code == 404:
            return None
        return _raise_for_toss_error_or_json(resp)

    async def cancel(
        self, *, payment_key: str, cancel_reason: str, cancel_amount: int | None, idempotency_key: str
    ) -> dict:
        body: dict = {"cancelReason": cancel_reason}
        if cancel_amount is not None:
            body["cancelAmount"] = cancel_amount
        async with httpx.AsyncClient(base_url=_TOSS_API_BASE_URL, timeout=10.0) as client:
            resp = await client.post(
                f"/v1/payments/{payment_key}/cancel",
                json=body,
                headers=self._headers(idempotency_key=idempotency_key),
            )
        return _raise_for_toss_error_or_json(resp)


class StubTossGateway:
    """dev 전용(§5-1) — 대체하는 것은 '토스 서버' 뿐이다. 우리 코드(파싱·대조·멱등·매핑·자동승인)는
    한 줄도 우회하지 않는다. 프로세스 메모리에만 상태를 둔다(재기동 시 초기화, 의도된 동작)."""

    def __init__(self):
        self._payments: dict[str, dict] = {}
        self._cancel_results: dict[str, dict] = {}

    async def confirm(self, *, payment_key: str, order_id: str, amount: int) -> dict:
        existing = self._payments.get(payment_key)
        if existing is not None and existing.get("status") == "DONE":
            raise TossApiError(code="ALREADY_PROCESSED_PAYMENT", message="이미 처리된 결제입니다")
        payment = {
            "paymentKey": payment_key,
            "orderId": order_id,
            "status": "DONE",
            "totalAmount": amount,
            "currency": "KRW",
            "method": "카드",
            "approvedAt": datetime.now(UTC).isoformat(),
            "card": {"issuerCode": "71", "cardType": "체크", "ownerType": "개인", "number": "123456******7890"},
            "cancels": [],
            "lastTransactionKey": f"stub-confirm-{payment_key}",
            "balanceAmount": amount,
        }
        self._payments[payment_key] = payment
        return payment

    async def get_payment(self, payment_key: str) -> dict | None:
        return self._payments.get(payment_key)

    async def cancel(
        self, *, payment_key: str, cancel_reason: str, cancel_amount: int | None, idempotency_key: str
    ) -> dict:
        existing_result = self._cancel_results.get(idempotency_key)
        if existing_result is not None:
            return copy.deepcopy(existing_result)
        payment = self._payments.get(payment_key)
        if payment is None:
            raise TossApiError(code="NOT_FOUND_PAYMENT", message="결제를 찾을 수 없습니다")
        total = payment["totalAmount"]
        canceled_so_far = sum(item["cancelAmount"] for item in payment["cancels"])
        remaining = total - canceled_so_far
        amount = cancel_amount if cancel_amount is not None else remaining
        if amount <= 0 or amount > remaining:
            raise TossApiError(code="INVALID_CANCEL_AMOUNT", message="취소 가능 금액을 초과했습니다")
        transaction_key = f"stub-cancel-{len(payment['cancels']) + 1}"
        payment["cancels"].append(
            {
                "transactionKey": transaction_key,
                "cancelAmount": amount,
                "cancelReason": cancel_reason,
                "canceledAt": datetime.now(UTC).isoformat(),
                "cancelStatus": "DONE",
                "refundableAmount": remaining - amount,
            }
        )
        payment["status"] = "CANCELED" if canceled_so_far + amount >= total else "PARTIAL_CANCELED"
        payment["lastTransactionKey"] = transaction_key
        payment["balanceAmount"] = remaining - amount
        self._cancel_results[idempotency_key] = copy.deepcopy(payment)
        return copy.deepcopy(payment)


# dev 프로세스 안에서 confirm ↔ 웹훅(재조회) 이 같은 상태를 보게 하는 싱글턴(§5-1 stub 모드).
# 테스트는 이걸 쓰지 않고 각자 인스턴스를 어댑터 생성자에 주입한다(격리).
_STUB_GATEWAY = StubTossGateway()


def _order_id_payment_code(order_id: str) -> str | None:
    """`SGR-XXXXXXC-<attempt>` → `SGR-XXXXXXC` (체크문자 검증 포함). 형식이 아니면 None."""
    if not order_id:
        return None
    code_part = order_id.rsplit("-", 1)[0]
    return payment_code_module.parse_and_validate(code_part)


def _charge_from_snapshot(contract) -> dict | None:
    """계약 동의 시점에 고정된 KRW 청구액(§4-3) — `contract_snapshot["charge"]`. 없으면(KRW 가격
    미배선 상태에서 accept 됐거나 아직 draft) None — 카드 rail 은 그 경우 항상 미노출이어야 한다."""
    snapshot = contract.contract_snapshot
    if not snapshot:
        return None
    charge = snapshot.get("charge")
    if not charge or "value" not in charge:
        return None
    return charge


class TossCardRail:
    key = "toss_card"

    def __init__(self, gateway: TossGateway | None = None):
        self._injected_gateway = gateway

    def _gateway_instance(self) -> TossGateway:
        if self._injected_gateway is not None:
            return self._injected_gateway
        mode = config.toss_mode()
        if mode == "live":
            secret_key = config.get_toss_secret_key()
            assert secret_key is not None  # toss_mode()=="live" 는 이미 둘 다 있음을 보장
            return HttpTossGateway(secret_key)
        if mode == "stub":
            return _STUB_GATEWAY
        raise RailNotSupported("toss_card 가 배선되지 않았다")

    def wired(self) -> bool:
        # 게이트웨이가 주입됐으면(테스트) 실제 .env 배선 여부와 무관하게 배선된 것으로 본다 —
        # 그래야 키 없이도 어댑터 로직(파싱·대조·멱등·매핑)을 전부 테스트할 수 있다(§5-1).
        if self._injected_gateway is not None:
            return True
        return config.toss_mode() != "off"

    def offer(self, contract, ad, tier, *, now) -> RailOffer:
        if not self.wired():
            return RailOffer(rail=self.key, wired=False)
        charge = _charge_from_snapshot(contract)
        if charge is None:
            # KRW 가격 미배선(seam-D) — §4-3/design 8: 무료·오가 계약 방지, 카드 rail 항상 미노출.
            return RailOffer(rail=self.key, wired=False)
        attempt = secrets.randbelow(9999) + 1
        order_id = f"{contract.payment_code}-{attempt}"
        mode = config.toss_mode()
        checkout = {
            "client_key": config.get_toss_client_key(),
            "order_id": order_id,
            "order_name": f"{tier.name} {contract.months}개월",
            "amount": {"currency": charge.get("currency", "KRW"), "value": charge["value"]},
            "success_url": f"{_BIZ_PORTAL_BASE_URL}/apply/pay/return?token={contract.contract_token}",
            "fail_url": f"{_BIZ_PORTAL_BASE_URL}/apply/pay/fail?token={contract.contract_token}",
            "customer_name": contract.signer_name,
            "stub": mode == "stub",
        }
        return RailOffer(rail=self.key, wired=True, checkout=checkout)

    def _validate_payment(
        self,
        contract,
        payment: dict,
        *,
        expected_payment_key: str,
        expected_order_id: str | None = None,
        allowed_statuses: tuple[str, ...] = ("DONE",),
    ) -> None:
        """PSP Payment 객체를 계약 스냅샷과 대조한다. 통과 전에는 원장 객체를 만들지 않는다."""
        charge = _charge_from_snapshot(contract)
        if charge is None:
            raise RailValidationError("이 계약에는 KRW 청구 스냅샷이 없다")
        if payment.get("status") not in allowed_statuses:
            raise RailValidationError("PSP 결제 상태가 허용된 확정 상태가 아니다")
        if payment.get("paymentKey") != expected_payment_key:
            raise RailValidationError("PSP paymentKey 가 요청한 결제키와 일치하지 않는다")

        order_id = payment.get("orderId")
        if not isinstance(order_id, str):
            raise RailValidationError("PSP orderId 가 없다")
        if expected_order_id is not None and order_id != expected_order_id:
            raise RailValidationError("PSP orderId 가 승인 요청과 일치하지 않는다")
        code = _order_id_payment_code(order_id)
        if code is None or code != contract.payment_code:
            raise RailValidationError("PSP orderId 가 이 계약의 결제코드와 일치하지 않는다")

        value = payment.get("totalAmount")
        if isinstance(value, bool) or not isinstance(value, int) or value != charge.get("value"):
            raise RailValidationError("PSP 결제 금액이 청구 스냅샷과 일치하지 않는다")
        if payment.get("currency") != charge.get("currency"):
            raise RailValidationError("PSP 결제 통화가 청구 스냅샷과 일치하지 않는다")

    def _to_checkout_result(
        self,
        contract,
        payment: dict,
        *,
        already_final: bool,
        expected_payment_key: str,
        expected_order_id: str | None = None,
        allowed_statuses: tuple[str, ...] = ("DONE",),
    ) -> CheckoutResult:
        self._validate_payment(
            contract,
            payment,
            expected_payment_key=expected_payment_key,
            expected_order_id=expected_order_id,
            allowed_statuses=allowed_statuses,
        )
        card = payment.get("card") or {}
        order_id = payment.get("orderId") or ""
        code = _order_id_payment_code(order_id)
        approved_at_raw = payment.get("approvedAt")
        approved_at = datetime.fromisoformat(approved_at_raw) if approved_at_raw else datetime.now(UTC)
        bank_ref = None
        if card:
            bank_ref = f"{card.get('issuerCode', '')} {card.get('number', '')}".strip() or None
        observation = DepositObservation(
            amount_vnd=contract.amount_vnd,
            paid_at=approved_at,
            memo_raw=order_id or None,
            payer_name=contract.signer_name,
            bank_ref=bank_ref,
            source="toss",
            source_ref=payment.get("paymentKey"),
            kind="deposit",
            payment_code_hint=code or contract.payment_code,
        )
        charge_snapshot = {
            "currency": payment.get("currency"),
            "value": payment.get("totalAmount"),
            "psp": "toss",
            "payment_key": payment.get("paymentKey"),
            "order_id": order_id,
            "approved_at": approved_at.isoformat(),
            "method": payment.get("method"),
            "card": {
                "issuer_code": card.get("issuerCode"),
                "card_type": card.get("cardType"),
                "owner_type": card.get("ownerType"),
                "number": card.get("number"),
            }
            if card
            else None,
            "raw_status": payment.get("status"),
        }
        return CheckoutResult(observation=observation, charge_snapshot=charge_snapshot, already_final=already_final)

    async def confirm(self, contract, *, params: dict) -> CheckoutResult:
        order_id = params.get("orderId") or ""
        code = _order_id_payment_code(order_id)
        if code is None or code != contract.payment_code:
            raise RailValidationError("orderId 가 이 계약의 결제코드와 일치하지 않는다")

        charge = _charge_from_snapshot(contract)
        if charge is None:
            raise RailValidationError("이 계약에는 KRW 청구 스냅샷이 없다")

        try:
            amount = int(params.get("amount"))
        except (TypeError, ValueError) as exc:
            raise RailValidationError("amount 형식이 올바르지 않다") from exc
        if amount != charge["value"]:
            raise RailValidationError("결제 금액이 청구 스냅샷과 일치하지 않는다")

        payment_key = params.get("paymentKey")
        if not payment_key:
            raise RailValidationError("paymentKey 가 없다")

        gateway = self._gateway_instance()
        already_final = False
        try:
            payment = await gateway.confirm(payment_key=payment_key, order_id=order_id, amount=amount)
        except TossApiError as exc:
            if exc.code != "ALREADY_PROCESSED_PAYMENT" and not (exc.status_code is not None and exc.status_code >= 500):
                raise
            payment = await gateway.get_payment(payment_key)
            if payment is None:
                raise exc
            already_final = True
        except httpx.TransportError as exc:
            # 승인 요청은 PSP에서 처리됐지만 응답만 유실될 수 있다. 같은 승인 POST를 재시도하지 않고
            # paymentKey 조회 1회로 확정 상태를 복구한다(공식 Quick Reference §8).
            payment = await gateway.get_payment(payment_key)
            if payment is None:
                raise exc
            already_final = True

        return self._to_checkout_result(
            contract,
            payment,
            already_final=already_final,
            expected_payment_key=payment_key,
            expected_order_id=order_id,
        )

    async def lookup(self, contract, *, ref: str) -> CheckoutResult | None:
        gateway = self._gateway_instance()
        payment = await gateway.get_payment(ref)
        if payment is None or payment.get("status") != "DONE":
            return None
        return self._to_checkout_result(contract, payment, already_final=True, expected_payment_key=ref)

    async def fetch_payment(self, *, ref: str) -> dict | None:
        """웹훅 전용 단일 조회. 반환값은 계약을 찾은 뒤 `result_from_payment()`가 검증한다."""
        gateway = self._gateway_instance()
        return await gateway.get_payment(ref)

    def result_from_payment(self, contract, payment: dict, *, ref: str) -> CheckoutResult | None:
        """이미 한 번 조회한 웹훅 Payment를 재조회 없이 검증·매핑한다."""
        if payment.get("status") != "DONE":
            return None
        return self._to_checkout_result(contract, payment, already_final=True, expected_payment_key=ref)

    async def refund(
        self,
        contract,
        *,
        ref: str,
        amount_vnd: int | None,
        reason: str,
        idempotency_seed: str,
        remaining_amount_vnd: int | None = None,
    ) -> CheckoutResult:
        charge = _charge_from_snapshot(contract)
        if charge is None:
            raise RailValidationError("이 계약에는 KRW 청구 스냅샷이 없다")

        cancel_amount = None
        if amount_vnd is not None:
            # 부분 취소 비례 계산(§5-6) — 정수 나눗셈, 원 단위 절사. 이 한 곳만 비례 계산이 있다.
            cancel_amount = (charge["value"] * amount_vnd) // contract.amount_vnd

        gateway = self._gateway_instance()
        # 멱등키는 호출부(`idempotency_seed` — 대상 입금건·요청금액·기존환불횟수로 결정된 값)에서
        # 파생한다. 같은 요청의 재시도/더블클릭은 같은 seed → 같은 키 → 토스가 중복 차단하고,
        # 별개의 새 부분환불(다른 금액이거나 이전 환불 이후의 요청)은 seed 가 달라져 정상 처리된다.
        payment = await gateway.cancel(
            payment_key=ref,
            cancel_reason=reason,
            cancel_amount=cancel_amount,
            idempotency_key=f"{ref}:refund:{idempotency_seed}",
        )
        cancels = payment.get("cancels")
        if not isinstance(cancels, list) or not cancels:
            raise RailValidationError("PSP 취소 거래가 응답에 없다")
        transaction_key = payment.get("lastTransactionKey")
        if not isinstance(transaction_key, str) or not transaction_key:
            raise RailValidationError("PSP 마지막 거래키가 응답에 없다")
        matching_cancels = [
            item for item in cancels if isinstance(item, dict) and item.get("transactionKey") == transaction_key
        ]
        if len(matching_cancels) != 1:
            raise RailValidationError("PSP 마지막 거래키와 일치하는 취소 거래가 없다")
        last_cancel = matching_cancels[0]
        canceled_krw = last_cancel.get("cancelAmount")
        canceled_at = last_cancel.get("canceledAt")
        cancel_status = last_cancel.get("cancelStatus")
        if cancel_status != "DONE":
            raise RailValidationError("PSP 취소 거래가 DONE 상태가 아니다")
        if not isinstance(canceled_at, str) or not canceled_at:
            raise RailValidationError("PSP 취소 시각이 응답에 없다")
        try:
            parsed_canceled_at = datetime.fromisoformat(canceled_at)
        except ValueError as exc:
            raise RailValidationError("PSP 취소 시각 형식이 올바르지 않다") from exc
        if parsed_canceled_at.tzinfo is None:
            raise RailValidationError("PSP 취소 시각에 시간대가 없다")
        if isinstance(canceled_krw, bool) or not isinstance(canceled_krw, int) or canceled_krw <= 0:
            raise RailValidationError("PSP 취소 금액이 올바르지 않다")
        if cancel_amount is not None and canceled_krw != cancel_amount:
            raise RailValidationError("PSP 취소 금액이 요청 금액과 일치하지 않는다")
        if cancel_amount is None:
            canceled_total = sum(
                item.get("cancelAmount", 0)
                for item in cancels
                if isinstance(item, dict)
                and item.get("cancelStatus") == "DONE"
                and isinstance(item.get("cancelAmount"), int)
                and not isinstance(item.get("cancelAmount"), bool)
            )
            if payment.get("status") != "CANCELED" or canceled_total != charge["value"]:
                raise RailValidationError("PSP 잔여 전액 취소가 확인되지 않는다")
        base_result = self._to_checkout_result(
            contract,
            payment,
            already_final=False,
            expected_payment_key=ref,
            allowed_statuses=("PARTIAL_CANCELED", "CANCELED"),
        )
        refund_ref = f"{ref}:cancel:{transaction_key}"
        refund_observation = replace(
            base_result.observation,
            kind="refund",
            source_ref=refund_ref,
            paid_at=parsed_canceled_at,
            amount_vnd=(
                amount_vnd
                if amount_vnd is not None
                else remaining_amount_vnd
                if remaining_amount_vnd is not None
                else contract.amount_vnd
            ),
        )
        refund_snapshot = {
            **base_result.charge_snapshot,
            "lastTransactionKey": transaction_key,
            "cancelAmount": canceled_krw,
            "canceledAt": canceled_at,
            "transactionKey": transaction_key,
            "cancelStatus": cancel_status,
        }
        return CheckoutResult(observation=refund_observation, charge_snapshot=refund_snapshot, already_final=False)

    def parse_webhook(self, headers: dict, body: bytes) -> str | None:
        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, TypeError, UnicodeDecodeError):
            return None
        if not isinstance(payload, dict) or payload.get("eventType") != "PAYMENT_STATUS_CHANGED":
            return None
        data = payload.get("data")
        if not isinstance(data, dict):
            return None
        payment_key = data.get("paymentKey")
        return payment_key if isinstance(payment_key, str) and payment_key else None
