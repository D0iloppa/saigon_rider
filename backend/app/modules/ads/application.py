from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Date, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models import AdTier, BusinessProfile, MarketplaceAd
from ...services.ad_gating import launching_ad_conditions


class AdsError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


@dataclass(slots=True)
class TierRead:
    id: uuid.UUID
    name: str
    monthly_price_vnd: int
    exposure_weight: int
    is_active: bool
    display_order: int
    features_json: list | None


@dataclass(slots=True)
class OwnerRead:
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    status: str


@dataclass(slots=True)
class AdRead:
    id: uuid.UUID
    partner_name: str
    title: str
    body: str | None
    image_url: str | None
    image_file_path: str | None
    link_url: str | None
    phone: str | None
    address: str | None
    owner_id: uuid.UUID | None
    owner_business_profile_id: uuid.UUID | None
    district_id: int | None
    category: str | None
    rating: Decimal | None
    service_count: int | None
    established_year: int | None
    business_hours: str | None
    is_active: bool
    review_status: str
    reject_reason: str | None
    is_ongoing: bool
    subscription_status: str
    starts_at: datetime | None
    ends_at: datetime | None
    sort_order: int
    ad_fee: int
    tier_id: uuid.UUID
    tier_name: str
    monthly_price_snapshot_vnd: int
    created_at: datetime


@dataclass(slots=True)
class WeightedAd:
    ad: AdRead
    exposure_weight: int
    ad_fee: int


class AdsApplication:
    """광고 use-case 경계. 라우터는 광고 ORM이나 정책을 직접 다루지 않는다."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _tier_read(tier: AdTier) -> TierRead:
        return TierRead(
            id=tier.id,
            name=tier.name,
            monthly_price_vnd=tier.monthly_price_vnd,
            exposure_weight=tier.exposure_weight,
            is_active=tier.is_active,
            display_order=tier.display_order,
            features_json=tier.features_json,
        )

    @staticmethod
    def _owner_read(profile: BusinessProfile) -> OwnerRead:
        return OwnerRead(id=profile.id, user_id=profile.user_id, name=profile.name, status=profile.status)

    @staticmethod
    def _ad_read(ad: MarketplaceAd, tier: AdTier | None = None) -> AdRead:
        resolved_tier = tier or ad.tier
        if resolved_tier is None:
            raise AdsError(500, "Ad tier is missing")
        return AdRead(
            id=ad.id,
            partner_name=ad.partner_name,
            title=ad.title,
            body=ad.body,
            image_url=ad.image_url,
            image_file_path=ad.image_content.file_path if ad.image_content else None,
            link_url=ad.link_url,
            phone=ad.phone,
            address=ad.address,
            owner_id=ad.owner_id,
            owner_business_profile_id=ad.owner_business_profile_id,
            district_id=ad.district_id,
            category=ad.category,
            rating=ad.rating,
            service_count=ad.service_count,
            established_year=ad.established_year,
            business_hours=ad.business_hours,
            is_active=ad.is_active,
            review_status=ad.review_status,
            reject_reason=ad.reject_reason,
            is_ongoing=ad.is_ongoing,
            subscription_status=ad.subscription_status,
            starts_at=ad.starts_at,
            ends_at=ad.ends_at,
            sort_order=ad.sort_order,
            ad_fee=ad.ad_fee,
            tier_id=ad.tier_id,
            tier_name=resolved_tier.name,
            monthly_price_snapshot_vnd=ad.monthly_price_snapshot_vnd,
            created_at=ad.created_at,
        )

    async def list_active_tiers(self) -> list[TierRead]:
        tiers = (
            (
                await self.db.execute(
                    select(AdTier).where(AdTier.is_active == True).order_by(AdTier.display_order, AdTier.id)
                )
            )
            .scalars()
            .all()
        )
        return [self._tier_read(tier) for tier in tiers]

    async def list_tiers(self) -> list[TierRead]:
        tiers = (await self.db.execute(select(AdTier).order_by(AdTier.display_order, AdTier.id))).scalars().all()
        return [self._tier_read(tier) for tier in tiers]

    async def get_tier(self, tier_id: uuid.UUID, *, active: bool = False) -> AdTier:
        tier = await self.db.get(AdTier, tier_id)
        if tier is None or (active and not tier.is_active):
            raise AdsError(400, "Invalid or inactive ad tier")
        return tier

    async def create_tier(self, **values) -> TierRead:
        tier = AdTier(**values)
        self.db.add(tier)
        await self.db.flush()
        return self._tier_read(tier)

    async def update_tier(self, tier_id: uuid.UUID, **values) -> TierRead:
        tier = await self.get_tier(tier_id)
        for key, value in values.items():
            if value is not None:
                setattr(tier, key, value)
        await self.db.flush()
        return self._tier_read(tier)

    async def create_ad(
        self,
        *,
        profile: BusinessProfile,
        user_id: uuid.UUID,
        tier_id: uuid.UUID,
        title: str,
        body: str | None,
        image_content_id: uuid.UUID,
        is_ongoing: bool,
        ends_at: datetime | None,
    ) -> AdRead:
        tier = await self.get_tier(tier_id, active=True)
        # starts_at 은 광고주 미입력 — 승인 시점(approve)에 서버가 세팅한다.
        # is_ongoing=true(상시 게시)면 ends_at 무시(null).
        ad = MarketplaceAd(
            partner_name=profile.name[:80],
            title=title,
            body=body,
            image_content_id=image_content_id,
            phone=profile.phone,
            address=profile.address,
            owner_id=user_id,
            owner_business_profile_id=profile.id,
            review_status="PENDING",
            is_ongoing=is_ongoing,
            subscription_status="pending_payment",
            starts_at=None,
            ends_at=None if is_ongoing else ends_at,
            tier_id=tier.id,
            tier=tier,
            monthly_price_snapshot_vnd=tier.monthly_price_vnd,
            ad_fee=1,
            created_at=datetime.now(UTC),
        )
        self.db.add(ad)
        await self.db.commit()
        await self.db.refresh(ad)
        return self._ad_read(ad, tier)

    async def public_ads(self, district_id: int | None = None) -> list[WeightedAd]:
        now = datetime.now(UTC)
        stmt = (
            select(MarketplaceAd, AdTier)
            .join(AdTier, AdTier.id == MarketplaceAd.tier_id)
            .where(*launching_ad_conditions(now))
        )
        if district_id is not None:
            stmt = stmt.where(or_(MarketplaceAd.district_id == district_id, MarketplaceAd.district_id.is_(None)))
        rows = (await self.db.execute(stmt.order_by(MarketplaceAd.sort_order, MarketplaceAd.id))).all()
        return [
            WeightedAd(ad=self._ad_read(ad, tier), exposure_weight=tier.exposure_weight, ad_fee=ad.ad_fee)
            for ad, tier in rows
        ]

    async def public_ad(self, ad_id: uuid.UUID) -> AdRead:
        row = (
            await self.db.execute(
                select(MarketplaceAd, AdTier)
                .join(AdTier, AdTier.id == MarketplaceAd.tier_id)
                .where(
                    MarketplaceAd.id == ad_id,
                    *launching_ad_conditions(datetime.now(UTC)),
                )
            )
        ).first()
        if row is None:
            raise AdsError(404, "Ad not found")
        return self._ad_read(row[0], row[1])

    async def list_admin_ads(self, status: str | None, profile_id: uuid.UUID | None, launching: bool | None):
        stmt = (
            select(MarketplaceAd, BusinessProfile, AdTier)
            .outerjoin(BusinessProfile, BusinessProfile.id == MarketplaceAd.owner_business_profile_id)
            .join(AdTier, AdTier.id == MarketplaceAd.tier_id)
        )
        if status:
            stmt = stmt.where(MarketplaceAd.review_status == status)
        if profile_id:
            stmt = stmt.where(MarketplaceAd.owner_business_profile_id == profile_id)
        if launching:
            stmt = stmt.where(*launching_ad_conditions(datetime.now(UTC)))
        rows = (
            await self.db.execute(
                stmt.order_by(
                    case((MarketplaceAd.review_status == "PENDING", 0), else_=1), MarketplaceAd.created_at.desc()
                )
            )
        ).all()
        return [(self._ad_read(ad, tier), self._owner_read(profile) if profile else None) for ad, profile, tier in rows]

    async def dashboard_stats(self, today_start: datetime, week_start: datetime):
        launching = launching_ad_conditions(datetime.now(UTC))
        totals = (
            await self.db.execute(
                select(
                    func.count().filter(MarketplaceAd.review_status == "PENDING"),
                    func.count().filter(*launching),
                    func.count().filter(MarketplaceAd.created_at >= today_start),
                    func.count().filter(MarketplaceAd.created_at >= week_start),
                    func.coalesce(func.sum(MarketplaceAd.monthly_price_snapshot_vnd).filter(*launching), 0),
                ).select_from(MarketplaceAd)
            )
        ).one()
        tiers = (
            await self.db.execute(
                select(AdTier.id, AdTier.name, func.count(MarketplaceAd.id))
                .outerjoin(MarketplaceAd, (MarketplaceAd.tier_id == AdTier.id) & and_(*launching))
                .group_by(AdTier.id, AdTier.name, AdTier.display_order)
                .order_by(AdTier.display_order, AdTier.id)
            )
        ).all()
        return totals, tiers

    async def created_counts_by_day(self, start_at: datetime, timezone_name: str) -> dict:
        day = cast(func.timezone(timezone_name, MarketplaceAd.created_at), Date)
        rows = (
            await self.db.execute(select(day, func.count()).where(MarketplaceAd.created_at >= start_at).group_by(day))
        ).all()
        return dict(rows)

    async def _get_ad_model(self, ad_id: uuid.UUID) -> MarketplaceAd:
        ad = await self.db.get(MarketplaceAd, ad_id)
        if ad is None:
            raise AdsError(404, "Ad not found")
        return ad

    async def get_ad(self, ad_id: uuid.UUID) -> AdRead:
        return self._ad_read(await self._get_ad_model(ad_id))

    async def get_ad_with_owner(self, ad_id: uuid.UUID) -> tuple[AdRead, OwnerRead | None]:
        ad = await self._get_ad_model(ad_id)
        profile = (
            await self.db.get(BusinessProfile, ad.owner_business_profile_id) if ad.owner_business_profile_id else None
        )
        return self._ad_read(ad), self._owner_read(profile) if profile else None

    async def _own_ad_models(self, ad_id: uuid.UUID, user_id: uuid.UUID) -> tuple[MarketplaceAd, BusinessProfile]:
        row = (
            await self.db.execute(
                select(MarketplaceAd, BusinessProfile)
                .join(BusinessProfile, BusinessProfile.id == MarketplaceAd.owner_business_profile_id)
                .where(MarketplaceAd.id == ad_id, BusinessProfile.user_id == user_id)
            )
        ).first()
        if row is None:
            raise AdsError(404, "Ad not found")
        return row[0], row[1]

    async def own_ad(self, ad_id: uuid.UUID, user_id: uuid.UUID) -> tuple[AdRead, OwnerRead]:
        ad, profile = await self._own_ad_models(ad_id, user_id)
        return self._ad_read(ad), self._owner_read(profile)

    async def own_ads(self, profile_id: uuid.UUID) -> list[AdRead]:
        rows = (
            await self.db.execute(
                select(MarketplaceAd, AdTier)
                .join(AdTier, AdTier.id == MarketplaceAd.tier_id)
                .where(MarketplaceAd.owner_business_profile_id == profile_id)
                .order_by(MarketplaceAd.created_at.desc())
            )
        ).all()
        return [self._ad_read(ad, tier) for ad, tier in rows]

    async def stop_profile_ads(self, profile_id: uuid.UUID) -> int:
        ads = (
            (
                await self.db.execute(
                    select(MarketplaceAd).where(
                        MarketplaceAd.owner_business_profile_id == profile_id,
                        MarketplaceAd.review_status == "APPROVED",
                    )
                )
            )
            .scalars()
            .all()
        )
        for ad in ads:
            ad.review_status = "STOPPED"
        return len(ads)

    async def stop(self, ad_id: uuid.UUID, user_id: uuid.UUID) -> AdRead:
        ad, _ = await self._own_ad_models(ad_id, user_id)
        if ad.review_status != "APPROVED":
            raise AdsError(409, "Only published (APPROVED) ads can be stopped")
        ad.review_status = "STOPPED"
        await self.db.commit()
        await self.db.refresh(ad)
        return self._ad_read(ad)

    async def resume(self, ad_id: uuid.UUID, user_id: uuid.UUID) -> AdRead:
        ad, profile = await self._own_ad_models(ad_id, user_id)
        if ad.review_status != "STOPPED":
            raise AdsError(409, "Only stopped ads can be resumed")
        if profile.status != "APPROVED":
            raise AdsError(409, "Business profile is not active")
        ad.review_status = "APPROVED"
        await self.db.commit()
        await self.db.refresh(ad)
        return self._ad_read(ad)

    async def profile_public_ads(self, profile_id: uuid.UUID) -> list[AdRead]:
        rows = (
            await self.db.execute(
                select(MarketplaceAd, AdTier)
                .join(AdTier, AdTier.id == MarketplaceAd.tier_id)
                .where(
                    MarketplaceAd.owner_business_profile_id == profile_id,
                    *launching_ad_conditions(datetime.now(UTC)),
                )
                .order_by(MarketplaceAd.sort_order)
            )
        ).all()
        return [self._ad_read(ad, tier) for ad, tier in rows]

    async def approve(self, ad_id: uuid.UUID) -> tuple[AdRead, OwnerRead | None]:
        ad = await self._get_ad_model(ad_id)
        if ad.review_status != "PENDING":
            raise AdsError(409, "already processed")
        profile = (
            await self.db.get(BusinessProfile, ad.owner_business_profile_id) if ad.owner_business_profile_id else None
        )
        if profile and profile.status != "APPROVED":
            raise AdsError(409, "owner profile is not active")
        ad.review_status = "APPROVED"
        # 광고주 미입력 — 게시 시작은 승인 시점(서버). 이미 세팅돼 있으면 보존.
        if ad.starts_at is None:
            ad.starts_at = datetime.now(UTC)
        return self._ad_read(ad), self._owner_read(profile) if profile else None

    async def reject(self, ad_id: uuid.UUID, reason: str) -> tuple[AdRead, OwnerRead | None]:
        ad = await self._get_ad_model(ad_id)
        if ad.review_status != "PENDING":
            raise AdsError(409, "already processed")
        ad.review_status = "REJECTED"
        ad.reject_reason = reason
        profile = (
            await self.db.get(BusinessProfile, ad.owner_business_profile_id) if ad.owner_business_profile_id else None
        )
        return self._ad_read(ad), self._owner_read(profile) if profile else None

    async def set_tier(self, ad_id: uuid.UUID, tier_id: uuid.UUID) -> AdRead:
        ad = await self._get_ad_model(ad_id)
        tier = await self.get_tier(tier_id, active=True)
        ad.tier_id = tier.id
        ad.tier = tier
        ad.ad_fee = 1
        return self._ad_read(ad, tier)

    async def activate_subscription(self, ad_id: uuid.UUID) -> tuple[AdRead, OwnerRead | None]:
        """월구독 오프라인 입금확인 후 admin 이 게시 활성 (subscription_status=active)."""
        ad = await self._get_ad_model(ad_id)
        if ad.subscription_status == "active":
            raise AdsError(409, "subscription already active")
        ad.subscription_status = "active"
        profile = (
            await self.db.get(BusinessProfile, ad.owner_business_profile_id) if ad.owner_business_profile_id else None
        )
        return self._ad_read(ad), self._owner_read(profile) if profile else None
