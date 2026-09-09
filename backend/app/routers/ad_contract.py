"""광고주 tier 계약 웹 게이트 (Apple 3.1.3(g) 회피 — 계약동의/결제안내는 앱 밖 웹에서).

전제: 회원가입·사업자검증(BizApply)은 앱에서 그대로 한다. 여기는 이미 앱에서 tier를
신청한 광고주가 계약서 동의와 입금 안내 확인을 웹(business.saigon-rider.com)에서 처리하는
게이트다. 계약·입금·대조·승인 파이프라인 본체는 `services/ad_payments/`(260907
ad_payment_pipeline_design.md) 에 있고, 이 라우터는 `ad_contracts` 테이블 기준으로 그
코어를 호출만 한다 — 상태값을 직접 대입하지 않는다.

전자서명 벤더(DocuSign 등) 연동은 보류 — 체크박스 동의 + 서명자명 + 시각 + IP 만 기록한다
(contract_method='checkbox_v1'). 나중에 벤더 붙일 때 이 값만 바뀌면 되게.
"""

import hashlib
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import AdContract, AdDeposit, AdTier, BusinessProfile, MarketplaceAd
from ..services.ad_payments import checkout as checkout_core
from ..services.ad_payments import config as bank_config
from ..services.ad_payments import constants as payment_constants
from ..services.ad_payments import contracts as contract_fsm
from ..services.ad_payments import payment_code
from ..services.ad_payments.rails import RAILS, RailNotSupported, RailValidationError
from ..services.ad_payments.rails.toss_card import TossApiError
from ..services.ad_payments.reconcile import reconcile_contract

router = APIRouter(tags=["광고주 계약 웹 게이트 (Ad Contract Web Gate)"])

_BIZ_PORTAL_BASE_URL = os.getenv("BIZ_PORTAL_BASE_URL", "https://business.saigon-rider.com")

# 계약 문안 SoT. 기존 랜딩 3개 locale 문구를 그대로 서버로 옮긴 v2이며 법률 문구를 새로
# 만들지 않는다. 선택 가능한 결제 rail(계좌/카드)과 모순되지 않도록 기존의 일반 문구를 유지한다.
_CONTRACT_TEXT_VERSION = "v2"
_CONTRACT_TEXT_BY_LOCALE = {
    "vi": (
        "Hợp đồng này liên quan đến việc đăng ký gói quảng cáo {tier} theo kỳ hạn đã chọn. "
        "Việc đồng ý dưới đây đồng nghĩa với việc bạn chấp nhận Điều khoản dịch vụ và Chính sách "
        "đăng quảng cáo của Saigon Rider."
    ),
    "ko": (
        "본 계약은 {tier} 광고 상품의 선택한 기간 게재에 관한 것으로, 아래 동의는 "
        "사이공라이더 서비스 이용약관 및 광고 게재 정책에 동의함을 의미합니다."
    ),
    "en": (
        "This contract concerns the {tier} advertising plan for the selected period. Agreeing below "
        "means you accept Saigon Rider's Terms of Service and Ad Posting Policy."
    ),
}

# 계약이 진행 중(draft 재사용 대상 제외)이라고 보는 상태 — 이 상태가 있으면 새 draft 를 만들지 않는다.
_UNCLOSED_NON_DRAFT_STATUSES = ("accepted", "awaiting_payment", "partially_paid", "paid")

_MAX_PAYMENT_CODE_RETRIES = 5


def _client_ip(request: Request) -> str | None:
    """실제 서명자 IP — uvicorn 이 --proxy-headers 없이 뜨므로 request.client.host 는
    nginx 컨테이너 IP 뿐이다. nginx 가 이미 X-Real-IP 를 원본 클라이언트로 세팅하므로
    (nginx/conf.d/default.conf) 이걸 우선 신뢰하고, 없으면 폴백한다."""
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    return request.client.host if request.client else None


def _tier_price_for_months(tier: AdTier, months: int) -> int | None:
    """확정가 조회. 3/6개월은 `ad_tiers.price_3m_vnd`/`price_6m_vnd` 가 NULL 일 수 있다(init/228) —
    그 경우 None 을 그대로 반환한다(§치명 2: 0 으로 치환하면 무료 계약이 만들어진다)."""
    if months == 1:
        return tier.monthly_price_vnd
    if months == 3:
        return tier.price_3m_vnd
    return tier.price_6m_vnd  # months == 6


def _tier_krw_price_for_months(tier: AdTier, months: int) -> int | None:
    """카드 결제 청구용 KRW 확정가(seam-D, 260907_toss_payment_rail_design.md §4-3). NULL 이면
    카드 rail 이 미노출된다 — `_tier_price_for_months` 와 같은 원칙(0 으로 치환 금지)."""
    if months == 1:
        return tier.price_1m_krw
    if months == 3:
        return tier.price_3m_krw
    return tier.price_6m_krw  # months == 6


class ContractLinkOut(BaseModel):
    url: str


class BankInfoOut(BaseModel):
    name: str
    account_no: str
    holder: str


class TierPriceOptionsOut(BaseModel):
    month_1_vnd: int
    month_3_vnd: int | None
    month_6_vnd: int | None
    month_1_krw: int | None
    month_3_krw: int | None
    month_6_krw: int | None


class RailOfferOut(BaseModel):
    """seam-C(design §3-2 RailOffer) 를 그대로 JSON 화. `checkout.client_key` 는 공개 가능한
    값(브라우저 SDK 초기화용)만 담긴다 — 시크릿 키는 이 파일 어디에도 들어오지 않는다."""

    rail: str
    wired: bool
    instructions: dict | None = None
    checkout: dict | None = None


class AdContractOut(BaseModel):
    status: str
    tier_name: str
    partner_name: str
    months: int
    amount_vnd: int
    payment_code: str
    received_vnd: int
    due_at: datetime | None
    bank: BankInfoOut | None
    rails: list[RailOfferOut]
    period_start: datetime | None
    period_end: datetime | None
    contract_text: str
    contract_text_version: str
    contract_locale: str
    contract_text_sha256: str
    tier_price_options: TierPriceOptionsOut
    snapshot: dict | None = None


class AdContractAcceptRequest(BaseModel):
    months: Literal[1, 3, 6]
    signer_name: str
    locale: str = "vi"
    presented_text_version: str | None = None
    presented_text_sha256: str | None = None
    presented_quote: bool = False
    presented_amount_vnd: int | None = None
    presented_amount_krw: int | None = None


class CheckoutConfirmRequest(BaseModel):
    paymentKey: str
    orderId: str
    amount: int


class CheckoutConfirmOut(BaseModel):
    status: str
    approved: bool


async def _own_ad(db: AsyncSession, ad_id: uuid.UUID, user_id: uuid.UUID) -> MarketplaceAd:
    row = (
        await db.execute(
            select(MarketplaceAd)
            .join(BusinessProfile, BusinessProfile.id == MarketplaceAd.owner_business_profile_id)
            .where(MarketplaceAd.id == ad_id, BusinessProfile.user_id == user_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    return row


async def _generate_unique_payment_code(db: AsyncSession) -> str:
    for _ in range(_MAX_PAYMENT_CODE_RETRIES):
        code = payment_code.generate_payment_code()
        existing = (await db.execute(select(AdContract.id).where(AdContract.payment_code == code))).scalar_one_or_none()
        if existing is None:
            return code
    raise HTTPException(status_code=500, detail="Failed to allocate payment code")


async def _load_contract_by_token(db: AsyncSession, token: uuid.UUID) -> AdContract:
    contract = (await db.execute(select(AdContract).where(AdContract.contract_token == token))).scalar_one_or_none()
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract


def _presented_contract(contract: AdContract, tier: AdTier, locale: str) -> tuple[str, str, str]:
    snapshot = contract.contract_snapshot or {}
    snap_text = snapshot.get("contract_text")
    snap_version = snapshot.get("contract_text_version")
    if isinstance(snap_text, str) and isinstance(snap_version, str):
        snap_locale = snapshot.get("contract_locale")
        # v1 스냅샷은 서버 한국어 문구였고 locale 필드가 없었다. 이미 서명한 증거는 바꾸지 않는다.
        return snap_text, snap_version, snap_locale if snap_locale in _CONTRACT_TEXT_BY_LOCALE else "ko"
    selected_locale = locale if locale in _CONTRACT_TEXT_BY_LOCALE else "vi"
    return (
        _CONTRACT_TEXT_BY_LOCALE[selected_locale].format(tier=tier.name),
        _CONTRACT_TEXT_VERSION,
        selected_locale,
    )


async def _build_contract_out(
    db: AsyncSession, contract: AdContract, ad: MarketplaceAd, tier: AdTier, *, locale: str = "vi"
) -> AdContractOut:
    deposits = (await db.execute(select(AdDeposit).where(AdDeposit.contract_id == contract.id))).scalars().all()
    outcome = reconcile_contract(expected_vnd=contract.amount_vnd, deposits=deposits, partner_name=ad.partner_name)

    due_at = None
    if contract.payment_instructions_issued_at is not None:
        due_at = contract.payment_instructions_issued_at + timedelta(days=payment_constants.PAYMENT_DUE_DAYS)

    bank_info = bank_config.get_bank_info()

    now = datetime.now(UTC)
    rails_out = [
        RailOfferOut(rail=offer.rail, wired=offer.wired, instructions=offer.instructions, checkout=offer.checkout)
        for offer in (rail.offer(contract, ad, tier, now=now) for rail in RAILS.values())
    ]
    contract_text, contract_text_version, contract_locale = _presented_contract(contract, tier, locale)

    return AdContractOut(
        status=contract.status,
        tier_name=tier.name,
        partner_name=ad.partner_name,
        months=contract.months,
        amount_vnd=contract.amount_vnd,
        payment_code=contract.payment_code,
        received_vnd=outcome.received_vnd,
        due_at=due_at,
        bank=BankInfoOut(**bank_info) if bank_info else None,
        rails=rails_out,
        period_start=contract.period_start,
        period_end=contract.period_end,
        contract_text=contract_text,
        contract_text_version=contract_text_version,
        contract_locale=contract_locale,
        contract_text_sha256=hashlib.sha256(contract_text.encode("utf-8")).hexdigest(),
        tier_price_options=TierPriceOptionsOut(
            month_1_vnd=_tier_price_for_months(tier, 1),
            month_3_vnd=_tier_price_for_months(tier, 3),
            month_6_vnd=_tier_price_for_months(tier, 6),
            month_1_krw=_tier_krw_price_for_months(tier, 1),
            month_3_krw=_tier_krw_price_for_months(tier, 3),
            month_6_krw=_tier_krw_price_for_months(tier, 6),
        ),
        snapshot=contract.contract_snapshot,
    )


@router.post(
    "/biz/ads/{ad_id}/contract-link", response_model=ContractLinkOut, summary="계약 웹 링크 발급 (앱 세션 인증)"
)
async def create_contract_link(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> ContractLinkOut:
    ad = await _own_ad(db, ad_id, session_uid)
    if ad.review_status != "APPROVED":
        raise HTTPException(status_code=409, detail="Ad is not approved yet")

    existing = (
        (await db.execute(select(AdContract).where(AdContract.ad_id == ad_id).order_by(AdContract.created_at.desc())))
        .scalars()
        .all()
    )
    tier = await db.get(AdTier, ad.tier_id)
    if tier is None:
        raise HTTPException(status_code=404, detail="Ad tier not found")

    draft = next((c for c in existing if c.status == "draft"), None)
    if draft is not None:
        # [치명 3] 재사용 draft 는 아직 동의 전이라 금액이 안 굳어 있다 — ad.tier_id 가 발급
        # 이후 바뀌었으면(admin set_tier) 옛 tier 로 굳혀서 재사용하지 말고 현재 tier 로
        # 갱신한다. amount_vnd 는 accept() 가 최종 확정가로 덮어쓰는 임시값이라 여기서도
        # 임시값(월 단가)만 맞춰 둔다.
        if draft.tier_id != ad.tier_id:
            draft.tier_id = ad.tier_id
            draft.amount_vnd = tier.monthly_price_vnd
            await db.commit()
        return ContractLinkOut(url=f"{_BIZ_PORTAL_BASE_URL}/apply?token={draft.contract_token}")
    if any(c.status in _UNCLOSED_NON_DRAFT_STATUSES for c in existing):
        raise HTTPException(status_code=409, detail="A contract is already in progress for this ad")

    code = await _generate_unique_payment_code(db)
    contract = AdContract(
        ad_id=ad.id,
        tier_id=ad.tier_id,
        months=1,  # 임시값 — accept() 가 광고주 선택으로 덮어쓴다
        amount_vnd=tier.monthly_price_vnd,  # 임시값 — accept() 가 확정가로 덮어쓴다
        payment_code=code,
        status="draft",
        contract_token=uuid.uuid4(),
    )
    db.add(contract)
    try:
        await db.commit()
    except IntegrityError:
        # 동시 요청 2개가 각각 "열린 계약 없음" 을 보고 동시에 draft 를 만드는 경쟁(check-then-act) —
        # DB 부분 유니크 인덱스(init/230, 열린 상태만 유니크)가 두 번째를 거부한다. 먼저 커밋된
        # draft 를 재조회해 그 링크를 돌려줘 경쟁을 흡수한다(광고주에게 경쟁은 보이지 않는다).
        await db.rollback()
        winner = (
            (
                await db.execute(
                    select(AdContract)
                    .where(AdContract.ad_id == ad_id, AdContract.status == "draft")
                    .order_by(AdContract.created_at.desc())
                )
            )
            .scalars()
            .first()
        )
        if winner is not None:
            return ContractLinkOut(url=f"{_BIZ_PORTAL_BASE_URL}/apply?token={winner.contract_token}")
        raise HTTPException(status_code=409, detail="Contract creation conflict, retry") from None

    return ContractLinkOut(url=f"{_BIZ_PORTAL_BASE_URL}/apply?token={contract.contract_token}")


@router.get("/public/ad-contract/{token}", response_model=AdContractOut, summary="계약 정보 공개 조회 (무인증)")
async def get_ad_contract(token: uuid.UUID, locale: str = "vi", db: AsyncSession = Depends(get_db)) -> AdContractOut:
    contract = await _load_contract_by_token(db, token)
    ad = await db.get(MarketplaceAd, contract.ad_id)
    if ad is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    tier = await db.get(AdTier, contract.tier_id)
    if tier is None:
        raise HTTPException(status_code=404, detail="Ad tier not found")

    if contract_fsm.issue_instructions(contract, now=datetime.now(UTC)):
        await db.commit()

    return await _build_contract_out(db, contract, ad, tier, locale=locale)


@router.post("/public/ad-contract/{token}/accept", response_model=AdContractOut, summary="계약 동의 (무인증, 멱등)")
async def accept_ad_contract(
    token: uuid.UUID,
    body: AdContractAcceptRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdContractOut:
    contract = await _load_contract_by_token(db, token)
    ad = await db.get(MarketplaceAd, contract.ad_id)
    if ad is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    tier = await db.get(AdTier, contract.tier_id)
    if tier is None:
        raise HTTPException(status_code=404, detail="Ad tier not found")

    # [하] 종결 상태(cancelled/refunded)에 대한 accept 는 멱등 200 이 아니라 409 여야 한다 —
    # 그렇지 않으면 취소·환불된 계약도 "서명됨"으로 잘못 렌더될 수 있다. draft/그 외
    # 진행중 상태는 기존 멱등 동작(재조회만) 유지.
    if contract.status in ("cancelled", "refunded"):
        raise HTTPException(status_code=409, detail="Contract is closed")

    if contract.status == "draft":
        amount_vnd = _tier_price_for_months(tier, body.months)
        if amount_vnd is None:
            raise HTTPException(status_code=422, detail="선택한 기간의 확정가가 설정되지 않았습니다")
        contract_text, contract_text_version, contract_locale = _presented_contract(contract, tier, body.locale)
        contract_text_sha256 = hashlib.sha256(contract_text.encode("utf-8")).hexdigest()
        amount_krw = _tier_krw_price_for_months(tier, body.months)
        if (
            (body.presented_text_version is not None and body.presented_text_version != contract_text_version)
            or (body.presented_text_sha256 is not None and body.presented_text_sha256 != contract_text_sha256)
            or (
                body.presented_quote
                and (body.presented_amount_vnd != amount_vnd or body.presented_amount_krw != amount_krw)
            )
        ):
            raise HTTPException(status_code=409, detail={"error": "contract_version_changed"})
        snapshot = {
            "tier_name": tier.name,
            "months": body.months,
            "amount_vnd": amount_vnd,
            "contract_text_version": contract_text_version,
            "contract_text": contract_text,
            "contract_locale": contract_locale,
            "contract_text_sha256": contract_text_sha256,
        }
        # seam-D(§4-3) — 동의 시점에 KRW 청구액을 함께 고정한다. NULL(대표 결정 D-F 보류)이면
        # charge 없이 accept 되고, 이 계약엔 이후에도 카드 rail 이 뜨지 않는다(계좌이체만 가능).
        krw_col_by_months = {1: "price_1m_krw", 3: "price_3m_krw", 6: "price_6m_krw"}
        krw_value = amount_krw
        if krw_value is not None:
            snapshot["charge"] = {
                "currency": "KRW",
                "value": krw_value,
                "price_col": krw_col_by_months[body.months],
            }
        contract_fsm.accept(
            contract,
            months=body.months,
            amount_vnd=amount_vnd,
            signer_name=body.signer_name,
            signer_ip=_client_ip(request),
            now=datetime.now(UTC),
            snapshot=snapshot,
        )
        await db.commit()

    return await _build_contract_out(db, contract, ad, tier, locale=body.locale)


@router.post(
    "/public/ad-contract/{token}/checkout/confirm",
    response_model=CheckoutConfirmOut,
    summary="카드 결제 승인 확정 (무인증, seam-C toss_card)",
)
async def confirm_checkout(
    token: uuid.UUID,
    body: CheckoutConfirmRequest,
    db: AsyncSession = Depends(get_db),
) -> CheckoutConfirmOut:
    """토스 결제창 successUrl 복귀 쿼리(paymentKey/orderId/amount) 를 그대로 받는다 — SPA 는
    금액을 신뢰하지도 계산하지도 않는다(design §5-5 D-4). 대조·승인은 전부 여기서."""
    contract = await _load_contract_by_token(db, token)
    ad = await db.get(MarketplaceAd, contract.ad_id)
    if ad is None:
        raise HTTPException(status_code=404, detail="Ad not found")

    # 실카드 결제(토스 confirm) 호출 **전에** 계약 상태를 락과 함께 재확인한다 — 취소·승인된
    # 계약에 대해서는 돈이 나가지 않아야 한다(사후 환불이 아니라 사전 차단, checkout.py 참조).
    try:
        await checkout_core.lock_and_assert_chargeable(db, contract)
    except checkout_core.CheckoutNotAllowed as exc:
        raise HTTPException(status_code=409, detail={"error": "contract_not_chargeable", "status": str(exc)}) from None

    rail = RAILS["toss_card"]
    try:
        result = await rail.confirm(
            contract, params={"paymentKey": body.paymentKey, "orderId": body.orderId, "amount": body.amount}
        )
    except RailValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except RailNotSupported as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except TossApiError as exc:
        raise HTTPException(
            status_code=502,
            detail={"error": "toss_confirm_failed", "message": exc.message},
        ) from None
    except httpx.TransportError:
        raise HTTPException(
            status_code=503,
            detail={"error": "toss_temporarily_unavailable"},
        ) from None

    outcome = await checkout_core.complete_checkout(db, contract, ad, result, now=datetime.now(UTC))
    await checkout_core.record_auto_approve_audit(db, outcome)

    await db.refresh(contract)
    return CheckoutConfirmOut(status=contract.status, approved=outcome.approved)
