from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...models import AdTier, BusinessProfile, MarketplaceAd, ProximityHit, ProximityPolicy
from ...services.ad_exposure import build_exposure_sequence
from ...services.ad_gating import launching_ad_conditions
from ...utils import haversine_m
from ..ads.application import AdsApplication, WeightedAd


@dataclass(slots=True)
class PolicyRead:
    notify_radius_m: int
    visit_radius_m: int
    visit_dwell_sec: int
    cooldown_hours: int
    daily_notify_cap: int
    daily_rp_cap: int
    max_speed_kmh: int
    candidate_radius_m: int
    is_enabled: bool


class ProximityApplication:
    """근접 판정 use-case 경계 — 후보조회·쿨다운·일일상한·위치일관성 검증만 소유한다
    (260806_proximity_ad_design.md §3-4). 광고 선택(tier 가중)은 modules/ads 의
    AdRead/build_exposure_sequence 를 그대로 재사용한다 — 새 광고 시스템을 만들지 않는다(§3-2).
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_policy(self) -> PolicyRead:
        policy = await self.db.get(ProximityPolicy, 1)
        if policy is None:
            # seed row 누락 시에도 절대 fail-open 하지 않고 킬스위치로 취급한다.
            return PolicyRead(300, 50, 120, 24, 5, 3, 120, 3000, False)
        return PolicyRead(
            notify_radius_m=policy.notify_radius_m,
            visit_radius_m=policy.visit_radius_m,
            visit_dwell_sec=policy.visit_dwell_sec,
            cooldown_hours=policy.cooldown_hours,
            daily_notify_cap=policy.daily_notify_cap,
            daily_rp_cap=policy.daily_rp_cap,
            max_speed_kmh=policy.max_speed_kmh,
            candidate_radius_m=policy.candidate_radius_m,
            is_enabled=policy.is_enabled,
        )

    # ── 위조 방어(위치 일관성) ────────────────────────────────────

    @staticmethod
    def validate_speed(
        *,
        prev_lat: float | None,
        prev_lng: float | None,
        prev_at: datetime | None,
        lat: float,
        lng: float,
        occurred_at: datetime,
        max_speed_kmh: int,
    ) -> bool:
        """직전 좌표 대비 이동 속도가 물리적으로 가능한지 검증한다.

        직전 샘플이 없으면(최초 진입) 판단 근거가 없어 통과시킨다 — 판정은 서버 확정(RP)의
        방어선이므로, 최초 샘플까지 막으면 정상 사용자가 전부 막힌다.
        """
        if prev_lat is None or prev_lng is None or prev_at is None:
            return True
        elapsed_sec = (occurred_at - prev_at).total_seconds()
        distance_m = haversine_m(prev_lat, prev_lng, lat, lng)
        if elapsed_sec <= 0:
            return distance_m <= 5  # 동시각/역행 타임스탬프는 같은 지점일 때만 허용
        speed_kmh = (distance_m / 1000) / (elapsed_sec / 3600)
        return speed_kmh <= max_speed_kmh

    # ── 후보 조회 (G-1 게이트 + ST_DWithin 서버 재검증) ────────────

    async def find_candidate(
        self, *, business_profile_id: uuid.UUID, lat: float, lng: float, radius_m: int
    ) -> WeightedAd | None:
        """클라이언트가 주장한 가맹점 근접을 서버가 재검증하며 노출할 광고를 확정한다.

        G-1(260810_proximity_ad_contract_model.md §0-4): `subscription_status='active'` 게이트는
        이 근접 경로 전용 신규 조건이다 — 미납 광고주가 취소 불가능한 푸시로 사용자 일일 쿼터를
        소진하는 것을 막는다. 기존 피드 광고 쿼리(launching_ad_conditions 소비처)는 무수정.
        """
        rows = (
            await self.db.execute(
                select(MarketplaceAd, AdTier)
                .join(AdTier, AdTier.id == MarketplaceAd.tier_id)
                .join(BusinessProfile, BusinessProfile.id == MarketplaceAd.owner_business_profile_id)
                .where(
                    MarketplaceAd.owner_business_profile_id == business_profile_id,
                    AdTier.proximity_enabled == True,
                    MarketplaceAd.subscription_status == "active",  # G-1
                    *launching_ad_conditions(datetime.now(UTC)),
                    text(
                        "ST_DWithin(business_profile.geom, "
                        "ST_SetSRID(ST_MakePoint(:proximity_lng, :proximity_lat), 4326)::geography, "
                        ":proximity_radius_m)"
                    ).bindparams(proximity_lng=lng, proximity_lat=lat, proximity_radius_m=radius_m),
                )
            )
        ).all()
        if not rows:
            return None
        weighted = [
            WeightedAd(ad=AdsApplication._ad_read(ad, tier), exposure_weight=tier.exposure_weight, ad_fee=ad.ad_fee)
            for ad, tier in rows
        ]
        return build_exposure_sequence(weighted)[0]

    # ── 후보 목록 조회 (앱 시작 시 1회, 좌표만 배포 — §4 "가맹점 목록 노출: 비노출") ──

    async def find_candidates_near(
        self, *, lat: float, lng: float, radius_m: int
    ) -> list[tuple[uuid.UUID, float, float]]:
        """반경 내 근접알림 대상 가맹점의 (business_profile_id, lat, lng) 목록만 반환한다.

        find_candidate() 와 동일한 G-1 게이트(subscription_status='active') + tier.proximity_enabled
        조건을 유지한다 — 미납/일반 tier 광고주가 좌표조차 클라이언트에 배포되지 않게 막는다.
        상세정보(이름·주소 등)는 절대 포함하지 않는다 — 진입 확정은 서버가 /enter 에서 재검증한다.
        """
        rows = (
            await self.db.execute(
                select(BusinessProfile.id, BusinessProfile.latitude, BusinessProfile.longitude)
                .join(MarketplaceAd, MarketplaceAd.owner_business_profile_id == BusinessProfile.id)
                .join(AdTier, AdTier.id == MarketplaceAd.tier_id)
                .where(
                    AdTier.proximity_enabled == True,
                    MarketplaceAd.subscription_status == "active",  # G-1
                    *launching_ad_conditions(datetime.now(UTC)),
                    text(
                        "ST_DWithin(business_profile.geom, "
                        "ST_SetSRID(ST_MakePoint(:proximity_lng, :proximity_lat), 4326)::geography, "
                        ":proximity_radius_m)"
                    ).bindparams(proximity_lng=lng, proximity_lat=lat, proximity_radius_m=radius_m),
                )
                .distinct()
            )
        ).all()
        return [
            (row.id, float(row.latitude), float(row.longitude))
            for row in rows
            if row.latitude is not None and row.longitude is not None
        ]

    # ── 쿨다운 · 일일 상한 ──────────────────────────────────────

    async def is_in_cooldown(
        self, *, user_id: uuid.UUID, business_profile_id: uuid.UUID, cooldown_hours: int, now: datetime
    ) -> bool:
        last_notified = await self.db.scalar(
            select(func.max(ProximityHit.notified_at)).where(
                ProximityHit.user_key == user_id,
                ProximityHit.business_profile_id == business_profile_id,
                ProximityHit.notified_at.is_not(None),
            )
        )
        if last_notified is None:
            return False
        return now - last_notified < timedelta(hours=cooldown_hours)

    async def daily_notify_count(self, *, user_id: uuid.UUID, now: datetime) -> int:
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return (
            await self.db.scalar(
                select(func.count()).where(
                    ProximityHit.user_key == user_id,
                    ProximityHit.notified_at.is_not(None),
                    ProximityHit.notified_at >= day_start,
                )
            )
            or 0
        )

    async def daily_rp_count(self, *, user_id: uuid.UUID, now: datetime) -> int:
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return (
            await self.db.scalar(
                select(func.count()).where(
                    ProximityHit.user_key == user_id,
                    ProximityHit.rp_granted == True,
                    ProximityHit.visit_confirmed_at >= day_start,
                )
            )
            or 0
        )

    # ── 진입 상태(dwell 추적) ────────────────────────────────────

    async def open_hit(self, *, user_id: uuid.UUID, business_profile_id: uuid.UUID) -> ProximityHit | None:
        """visit 미확정인 가장 최근 hit row — 방문 체류(dwell) 추적용 진입 episode."""
        return await self.db.scalar(
            select(ProximityHit)
            .where(
                ProximityHit.user_key == user_id,
                ProximityHit.business_profile_id == business_profile_id,
                ProximityHit.visit_confirmed_at.is_(None),
            )
            .order_by(ProximityHit.occurred_at.desc())
            .limit(1)
        )

    def record_notify(
        self,
        *,
        user_id: uuid.UUID,
        business_profile_id: uuid.UUID,
        ad_id: uuid.UUID,
        lat: float,
        lng: float,
        distance_m: int,
        occurred_at: datetime,
    ) -> ProximityHit:
        """알림 반경 진입 신규 episode 를 기록한다 — 같은 트랜잭션에서 호출부가 커밋한다."""
        hit = ProximityHit(
            user_key=user_id,
            business_profile_id=business_profile_id,
            ad_id=ad_id,
            hit_lat=lat,
            hit_lng=lng,
            distance_m=distance_m,
            notified_at=occurred_at,
            occurred_at=occurred_at,
        )
        self.db.add(hit)
        return hit

    # ── 적립 자격 판정(방문 확정) ─────────────────────────────────

    @staticmethod
    def visit_eligible(
        *, hit: ProximityHit, distance_m: int, visit_radius_m: int, visit_dwell_sec: int, now: datetime
    ) -> bool:
        """방문 인정 조건: 이미 확정되지 않았고, 방문 반경 안이며, 최초 진입 이후 체류시간을 채웠는가."""
        if hit.visit_confirmed_at is not None:
            return False
        if distance_m > visit_radius_m:
            return False
        elapsed_sec = (now - hit.occurred_at).total_seconds()
        return elapsed_sec >= visit_dwell_sec

    def confirm_visit(self, hit: ProximityHit, *, occurred_at: datetime, rp_granted: bool) -> None:
        hit.visit_confirmed_at = occurred_at
        hit.rp_granted = rp_granted
