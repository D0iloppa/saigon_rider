"""광고주 tier 계약 웹 게이트 (Apple 3.1.3(g) 회피 — 계약동의/결제안내는 앱 밖 웹에서).

전제: 회원가입·사업자검증(BizApply)은 앱에서 그대로 한다. 여기는 이미 앱에서 tier를
신청한 광고주가 계약서 동의와 결제안내 확인만 웹(business.saigon-rider.com)에서
처리하는 게이트다. 결제 자체는 여전히 계좌이체+관리자 수동승인
(routers/admin_api/biz.py activate-subscription, 무수정).

전자서명 벤더(DocuSign 등) 연동은 보류 — 체크박스 동의 + 서명자명 + 시각 + IP 만 기록한다
(contract_method='checkbox_v1'). 나중에 벤더 붙일 때 이 값만 바뀌면 되게.
"""

import os
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..models import BusinessProfile, MarketplaceAd

router = APIRouter(tags=["광고주 계약 웹 게이트 (Ad Contract Web Gate)"])

_BIZ_PORTAL_BASE_URL = os.getenv("BIZ_PORTAL_BASE_URL", "https://business.saigon-rider.com")


def _client_ip(request: Request) -> str | None:
    """실제 서명자 IP — uvicorn 이 --proxy-headers 없이 뜨므로 request.client.host 는
    nginx 컨테이너 IP 뿐이다. nginx 가 이미 X-Real-IP 를 원본 클라이언트로 세팅하므로
    (nginx/conf.d/default.conf) 이걸 우선 신뢰하고, 없으면 폴백한다."""
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    return request.client.host if request.client else None


# TODO: 계좌이체 안내 실제 문구/계좌번호는 이 작업 범위 밖 — admin activate-subscription 과
# 동일한 "오프라인 입금확인 후 수동승인" 흐름을 텍스트로만 안내한다.
_BANK_TRANSFER_INFO_PLACEHOLDER = (
    "계좌이체 안내: 담당자가 카카오톡/이메일로 계좌번호를 안내드립니다. 입금 확인 후 관리자가 구독을 활성화합니다."
)


class ContractLinkOut(BaseModel):
    url: str


class AdContractOut(BaseModel):
    tier_name: str
    monthly_price_vnd: int
    partner_name: str
    already_accepted: bool
    contract_text_version: str = "v1"


class AdContractAcceptRequest(BaseModel):
    signer_name: str


class AdContractAcceptOut(BaseModel):
    accepted_at: datetime
    bank_transfer_info: str


async def _own_pending_ad(db: AsyncSession, ad_id: uuid.UUID, user_id: uuid.UUID) -> MarketplaceAd:
    row = (
        await db.execute(
            select(MarketplaceAd)
            .join(BusinessProfile, BusinessProfile.id == MarketplaceAd.owner_business_profile_id)
            .where(MarketplaceAd.id == ad_id, BusinessProfile.user_id == user_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Ad not found")
    if row.subscription_status != "pending_payment":
        raise HTTPException(status_code=409, detail="Ad is not pending payment")
    return row


@router.post(
    "/bff/biz/ads/{ad_id}/contract-link", response_model=ContractLinkOut, summary="계약 웹 링크 발급 (앱 세션 인증)"
)
async def create_contract_link(
    ad_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
) -> ContractLinkOut:
    ad = await _own_pending_ad(db, ad_id, session_uid)
    if ad.contract_token is None:
        ad.contract_token = uuid.uuid4()
        await db.commit()
    return ContractLinkOut(url=f"{_BIZ_PORTAL_BASE_URL}/apply?token={ad.contract_token}")


@router.get("/bff/public/ad-contract/{token}", response_model=AdContractOut, summary="계약 정보 공개 조회 (무인증)")
async def get_ad_contract(token: uuid.UUID, db: AsyncSession = Depends(get_db)) -> AdContractOut:
    ad = (await db.execute(select(MarketplaceAd).where(MarketplaceAd.contract_token == token))).scalar_one_or_none()
    if ad is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    return AdContractOut(
        tier_name=ad.tier.name,
        monthly_price_vnd=ad.monthly_price_snapshot_vnd,
        partner_name=ad.partner_name,
        already_accepted=ad.contract_accepted_at is not None,
    )


@router.post(
    "/bff/public/ad-contract/{token}/accept", response_model=AdContractAcceptOut, summary="계약 동의 (무인증, 멱등)"
)
async def accept_ad_contract(
    token: uuid.UUID,
    body: AdContractAcceptRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AdContractAcceptOut:
    ad = (await db.execute(select(MarketplaceAd).where(MarketplaceAd.contract_token == token))).scalar_one_or_none()
    if ad is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    if ad.contract_accepted_at is None:
        ad.contract_accepted_at = datetime.now(UTC)
        ad.contract_method = "checkbox_v1"
        ad.contract_signer_name = body.signer_name
        ad.contract_signer_ip = _client_ip(request)
        await db.commit()
    return AdContractAcceptOut(accepted_at=ad.contract_accepted_at, bank_transfer_info=_BANK_TRANSFER_INFO_PLACEHOLDER)
