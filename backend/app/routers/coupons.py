"""쿠폰/기프티콘 (RP 교환) — SGR-213 P1.

엔진 reward 엔진(catalog/redemption)을 앱에 프록시한다.
구매 재화는 RP(=engine xp_balance). 썸네일은 엔진의 thumbnail_asset_uri(불투명 문자열)를
BFF가 build_imgproxy_url 로 변환한다.
"""

import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import verify_user_session
from ..engine_client import engine_client
from ..utils import build_imgproxy_url

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/coupons", tags=["coupons"])


def _thumb(asset_uri: str | None) -> str | None:
    return build_imgproxy_url(asset_uri) if asset_uri else None


class CouponOut(BaseModel):
    catalog_id: int
    item_code: str
    item_name: str
    category_code: str
    required_rp: int
    face_value_vnd: int | None = None
    thumbnail_url: str | None = None


class RedeemRequest(BaseModel):
    catalog_id: int
    idempotency_key: str | None = None


class RedemptionOut(BaseModel):
    redemption_id: int
    catalog_id: int | None = None
    item_name: str
    status: str
    voucher_code: str | None = None
    requested_at: str
    fulfilled_at: str | None = None
    expires_at: str | None = None
    thumbnail_url: str | None = None


def _redemption_out(r: dict) -> RedemptionOut:
    cat = r.get("catalog") or {}
    return RedemptionOut(
        redemption_id=r["redemption_id"],
        catalog_id=cat.get("catalog_id"),
        item_name=cat.get("item_name", ""),
        status=r["status"],
        voucher_code=r.get("voucher_code"),
        requested_at=r["requested_at"],
        fulfilled_at=r.get("fulfilled_at"),
        expires_at=r.get("expires_at"),
        thumbnail_url=_thumb(cat.get("thumbnail_asset_uri")),
    )


@router.get("", response_model=list[CouponOut], summary="쿠폰 카탈로그 (RP 교환)")
async def list_coupons(
    category: str | None = None,
    _user_id: uuid.UUID = Depends(verify_user_session),
):
    try:
        items = await engine_client.list_catalog(category=category)
    except httpx.HTTPError as err:
        log.warning("coupon catalog engine call failed: %r", err)
        raise HTTPException(status_code=502, detail="Engine unavailable") from err
    return [
        CouponOut(
            catalog_id=i["catalog_id"],
            item_code=i["item_code"],
            item_name=i["item_name"],
            category_code=i["category_code"],
            required_rp=i["required_xp"],
            face_value_vnd=i.get("face_value_vnd"),
            thumbnail_url=_thumb(i.get("thumbnail_asset_uri")),
        )
        for i in items
    ]


@router.post("/redeem", response_model=RedemptionOut, summary="RP로 쿠폰 교환")
async def redeem_coupon(
    body: RedeemRequest,
    user_id: uuid.UUID = Depends(verify_user_session),
):
    idem = body.idempotency_key or uuid.uuid4().hex
    try:
        r = await engine_client.create_redemption(str(user_id), catalog_id=body.catalog_id, idempotency_key=idem)
    except httpx.HTTPStatusError as err:
        code = err.response.status_code
        if code == 402:
            raise HTTPException(status_code=402, detail="RP 잔액이 부족합니다") from err
        if code == 409:
            raise HTTPException(status_code=409, detail="교환할 수 없는 쿠폰입니다") from err
        if code == 404:
            raise HTTPException(status_code=404, detail="쿠폰을 찾을 수 없습니다") from err
        log.warning("coupon redeem engine error: %r", err)
        raise HTTPException(status_code=502, detail="Engine unavailable") from err
    except httpx.HTTPError as err:
        log.warning("coupon redeem engine call failed: %r", err)
        raise HTTPException(status_code=502, detail="Engine unavailable") from err
    return _redemption_out(r)


@router.get("/mine", response_model=list[RedemptionOut], summary="내 쿠폰함")
async def my_coupons(
    user_id: uuid.UUID = Depends(verify_user_session),
):
    try:
        items = await engine_client.list_redemptions(str(user_id))
    except httpx.HTTPError as err:
        log.warning("my coupons engine call failed: %r", err)
        raise HTTPException(status_code=502, detail="Engine unavailable") from err
    return [_redemption_out(r) for r in items]
