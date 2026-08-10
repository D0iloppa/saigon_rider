"""근접 광고(Proximity Ad) 진입 엔드포인트 — ai-docs/260806_proximity_ad_design.md §4, §9-4.

판정은 하이브리드다: 클라이언트가 로컬 반경 판정으로 즉시 알림 카드를 띄우고 여기로 진입을
보고하면, 서버는 ST_DWithin 재검증 + 위치 일관성(속도) 검증 + 쿨다운/일일상한을 거쳐 광고를
확정하고, 방문(체류) 조건이 차면 RP 를 적립한다. `proximity_policy.is_enabled=FALSE` 인 동안은
전부 무동작이다(킬스위치, 오픈을 막지 않음).
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import AdEvent, BusinessProfile
from ..modules.proximity.application import ProximityApplication
from ..routers.market import _public_ad_out
from ..schemas import MarketplaceAdOut
from ..services import noti_events
from ..services.coordinates import Latitude, Longitude
from ..utils import haversine_m

router = APIRouter(prefix="/proximity", tags=["근접 광고"])

RP_ACTION_CODE = "BIZ_PROXIMITY_VISIT"


class ProximityEnterRequest(BaseModel):
    business_profile_id: uuid.UUID
    lat: Latitude
    lng: Longitude
    occurred_at: datetime | None = None
    prev_lat: Latitude | None = None
    prev_lng: Longitude | None = None
    prev_at: datetime | None = None


class ProximityEnterResponse(BaseModel):
    notified: bool
    visit_confirmed: bool
    rp_earned: int
    reason: str | None = None
    # 알림이 실제로 뜬 경우에만 채운다 — 프론트가 기존 AdCard 로 그대로 렌더링한다.
    ad: MarketplaceAdOut | None = None


class ProximityCandidateOut(BaseModel):
    """앱 시작 시 1회 배포하는 후보 좌표 — §4 "가맹점 목록 노출: 비노출" 과 정합하도록 좌표만."""

    business_profile_id: uuid.UUID
    lat: float
    lng: float


@router.get("/candidates", response_model=list[ProximityCandidateOut])
async def get_candidates(
    lat: Latitude = Query(...),
    lng: Longitude = Query(...),
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
) -> list[ProximityCandidateOut]:
    app = ProximityApplication(db)
    policy = await app.get_policy()
    if not policy.is_enabled:
        return []
    rows = await app.find_candidates_near(lat=lat, lng=lng, radius_m=policy.candidate_radius_m)
    return [
        ProximityCandidateOut(business_profile_id=business_profile_id, lat=row_lat, lng=row_lng)
        for business_profile_id, row_lat, row_lng in rows
    ]


@router.post("/enter", response_model=ProximityEnterResponse)
async def enter_proximity(
    body: ProximityEnterRequest,
    user_id: uuid.UUID = Depends(verify_user_session),
    db: AsyncSession = Depends(get_db),
) -> ProximityEnterResponse:
    app = ProximityApplication(db)
    policy = await app.get_policy()
    if not policy.is_enabled:
        return ProximityEnterResponse(notified=False, visit_confirmed=False, rp_earned=0, reason="disabled")

    now = body.occurred_at or datetime.now(UTC)

    if not ProximityApplication.validate_speed(
        prev_lat=body.prev_lat,
        prev_lng=body.prev_lng,
        prev_at=body.prev_at,
        lat=body.lat,
        lng=body.lng,
        occurred_at=now,
        max_speed_kmh=policy.max_speed_kmh,
    ):
        return ProximityEnterResponse(
            notified=False, visit_confirmed=False, rp_earned=0, reason="location_inconsistent"
        )

    candidate = await app.find_candidate(
        business_profile_id=body.business_profile_id, lat=body.lat, lng=body.lng, radius_m=policy.notify_radius_m
    )
    if candidate is None:
        return ProximityEnterResponse(notified=False, visit_confirmed=False, rp_earned=0, reason="no_candidate")

    profile = await db.get(BusinessProfile, body.business_profile_id)
    if profile is None or profile.latitude is None or profile.longitude is None:
        return ProximityEnterResponse(notified=False, visit_confirmed=False, rp_earned=0, reason="no_candidate")
    distance_m = int(haversine_m(body.lat, body.lng, float(profile.latitude), float(profile.longitude)))

    existing_hit = await app.open_hit(user_id=user_id, business_profile_id=body.business_profile_id)

    notified = False
    reason: str | None = None
    ad_card: MarketplaceAdOut | None = None
    tracking_hit = existing_hit
    if await app.is_in_cooldown(
        user_id=user_id, business_profile_id=body.business_profile_id, cooldown_hours=policy.cooldown_hours, now=now
    ):
        reason = "cooldown"
    elif await app.daily_notify_count(user_id=user_id, now=now) >= policy.daily_notify_cap:
        reason = "daily_notify_cap"
    else:
        tracking_hit = app.record_notify(
            user_id=user_id,
            business_profile_id=body.business_profile_id,
            ad_id=candidate.ad.id,
            lat=body.lat,
            lng=body.lng,
            distance_m=distance_m,
            occurred_at=now,
        )
        db.add(
            AdEvent(
                ad_id=candidate.ad.id,
                business_profile_id=body.business_profile_id,
                event_type="proximity_impression",
                surface="proximity",
                user_key=user_id,
                occurred_at=now,
                stat_date=now.date(),
            )
        )
        noti_events.enqueue(
            db,
            "proximity.hit",
            {
                "user_id": str(user_id),
                "ad_id": str(candidate.ad.id),
                "title": candidate.ad.title,
                "body": candidate.ad.body,
                "partner_name": candidate.ad.partner_name,
            },
        )
        notified = True
        ad_card = _public_ad_out(candidate.ad)

    visit_now_eligible = tracking_hit is not None and ProximityApplication.visit_eligible(
        hit=tracking_hit,
        distance_m=distance_m,
        visit_radius_m=policy.visit_radius_m,
        visit_dwell_sec=policy.visit_dwell_sec,
        now=now,
    )
    rp_earned = 0
    visit_confirmed = False
    if visit_now_eligible:
        under_rp_cap = await app.daily_rp_count(user_id=user_id, now=now) < policy.daily_rp_cap
        await db.commit()
        if under_rp_cap:
            granted = await engine_client.post_event_safe(
                user_uuid=str(user_id),
                action_code=RP_ACTION_CODE,
                occurred_at=now,
                payload={"business_profile_id": str(body.business_profile_id), "ad_id": str(tracking_hit.ad_id)},
                idem_key=f"proximity-visit-{tracking_hit.id}",
            )
        else:
            granted = False
        app.confirm_visit(tracking_hit, occurred_at=now, rp_granted=granted)
        await db.commit()
        visit_confirmed = True
        rp_earned = 10 if granted else 0
    else:
        await db.commit()

    return ProximityEnterResponse(
        notified=notified,
        visit_confirmed=visit_confirmed,
        rp_earned=rp_earned,
        reason=None if notified else reason,
        ad=ad_card,
    )
