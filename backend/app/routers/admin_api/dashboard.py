"""admin JSON API — 운영 대시보드 지표 (실시간 집계, BFF DB 한정 — Engine 호출 없음).

일자 경계는 Asia/Ho_Chi_Minh 기준. '오늘' = VN 자정 이후, '7일' = 오늘 포함 최근 7일.
거래 성사 시각은 marketplace_appointments.updated_at 근사(전용 완료시각 컬럼 없음).
"""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import Date, cast, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import (
    BusinessProfile,
    MarketplaceAd,
    MarketplaceAppointment,
    MarketplaceListing,
    Report,
    SupportReply,
    SupportTicket,
    User,
)
from ...services.ad_gating import launching_ad_conditions

router = APIRouter(prefix="/dashboard")

_VN_TZ_NAME = "Asia/Ho_Chi_Minh"
_VN_TZ = ZoneInfo(_VN_TZ_NAME)
_OPEN_REPORT_STATUSES = ("PENDING", "REVIEWING")


class ReasonCount(BaseModel):
    reason: str
    count: int


class DashboardSummary(BaseModel):
    dau: int
    new_users_today: int
    new_users_7d: int
    listings_today: int
    listings_7d: int
    listings_on_sale: int
    listings_hidden: int
    trades_today: int
    trades_7d: int
    reports_today: int
    reports_open: int
    reports_resolved_7d: int
    tickets_today: int
    tickets_open: int
    first_reply_sla_hours: float | None
    users_suspended: int
    users_banned: int
    reports_by_reason: list[ReasonCount]
    biz_partners_pending: int
    biz_ads_pending: int
    biz_partners_approved: int
    biz_partners_new_today: int
    biz_partners_new_7d: int
    biz_partners_suspended: int
    biz_ads_launching: int
    biz_ads_today: int
    biz_ads_7d: int
    biz_ads_tier_gold: int
    biz_ads_tier_silver: int
    biz_ads_tier_bronze: int
    biz_ads_fee_sum: int


class DailyPoint(BaseModel):
    date: str  # YYYY-MM-DD (VN 로컬 일자)
    new_users: int
    new_listings: int
    trades_completed: int
    reports_created: int
    tickets_created: int
    new_partners: int
    new_ads: int


@router.get("/summary", response_model=DashboardSummary)
async def get_summary(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    today_start = datetime.now(_VN_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=6)  # 오늘 포함 최근 7일

    user_row = (
        await db.execute(
            select(
                func.count().filter(User.last_seen_at >= today_start),
                func.count().filter(User.created_at >= today_start),
                func.count().filter(User.created_at >= week_start),
                func.count().filter(User.status == "SUSPENDED"),
                func.count().filter(User.status == "BANNED"),
            ).select_from(User)
        )
    ).one()

    listing_row = (
        await db.execute(
            select(
                func.count().filter(MarketplaceListing.created_at >= today_start),
                func.count().filter(MarketplaceListing.created_at >= week_start),
                func.count().filter(MarketplaceListing.status == "ON_SALE"),
                func.count().filter(MarketplaceListing.status == "HIDDEN"),
            ).select_from(MarketplaceListing)
        )
    ).one()

    completed = MarketplaceAppointment.status == "COMPLETED"
    trade_row = (
        await db.execute(
            select(
                func.count().filter(completed, MarketplaceAppointment.updated_at >= today_start),
                func.count().filter(completed, MarketplaceAppointment.updated_at >= week_start),
            ).select_from(MarketplaceAppointment)
        )
    ).one()

    report_row = (
        await db.execute(
            select(
                func.count().filter(Report.created_at >= today_start),
                func.count().filter(Report.status.in_(_OPEN_REPORT_STATUSES)),
                func.count().filter(Report.status == "RESOLVED", Report.handled_at >= week_start),
            ).select_from(Report)
        )
    ).one()

    ticket_row = (
        await db.execute(
            select(
                func.count().filter(SupportTicket.created_at >= today_start),
                func.count().filter(SupportTicket.status == "OPEN"),
            ).select_from(SupportTicket)
        )
    ).one()

    # 첫 응답 SLA — 최근 7일 생성 티켓 중 관리자 답변이 달린 것만, (최초 관리자 답변 - 접수) 평균
    first_reply = (
        select(SupportReply.ticket_id, func.min(SupportReply.created_at).label("first_reply_at"))
        .where(SupportReply.author_type == "admin")
        .group_by(SupportReply.ticket_id)
        .subquery()
    )
    sla_seconds = (
        await db.execute(
            select(func.avg(extract("epoch", first_reply.c.first_reply_at - SupportTicket.created_at)))
            .join_from(SupportTicket, first_reply, first_reply.c.ticket_id == SupportTicket.id)
            .where(SupportTicket.created_at >= week_start)
        )
    ).scalar_one()

    reason_rows = (
        await db.execute(
            select(Report.reason, func.count())
            .where(Report.status.in_(_OPEN_REPORT_STATUSES))
            .group_by(Report.reason)
            .order_by(func.count().desc(), Report.reason)
            .limit(5)
        )
    ).all()

    biz_partner_row = (
        await db.execute(
            select(
                func.count().filter(BusinessProfile.status == "PENDING"),
                func.count().filter(BusinessProfile.status == "APPROVED"),
                func.count().filter(BusinessProfile.status == "SUSPENDED"),
                func.count().filter(BusinessProfile.created_at >= today_start),
                func.count().filter(BusinessProfile.created_at >= week_start),
            ).select_from(BusinessProfile)
        )
    ).one()

    # '론칭중' 판정 — market.py get_ads 의 공개 노출 게이트와 동일 정의(시각 비교이므로 VN 일자경계가 아닌 UTC aware now 사용)
    ad_now = datetime.now(UTC)
    launching = launching_ad_conditions(ad_now)

    biz_ad_row = (
        await db.execute(
            select(
                func.count().filter(MarketplaceAd.review_status == "PENDING"),
                func.count().filter(*launching),
                func.count().filter(MarketplaceAd.created_at >= today_start),
                func.count().filter(MarketplaceAd.created_at >= week_start),
                func.count().filter(*launching, MarketplaceAd.exposure_tier == "GOLD"),
                func.count().filter(*launching, MarketplaceAd.exposure_tier == "SILVER"),
                func.count().filter(*launching, MarketplaceAd.exposure_tier == "BRONZE"),
                func.coalesce(func.sum(MarketplaceAd.ad_fee).filter(*launching), 0),
            ).select_from(MarketplaceAd)
        )
    ).one()

    return DashboardSummary(
        dau=user_row[0],
        new_users_today=user_row[1],
        new_users_7d=user_row[2],
        users_suspended=user_row[3],
        users_banned=user_row[4],
        listings_today=listing_row[0],
        listings_7d=listing_row[1],
        listings_on_sale=listing_row[2],
        listings_hidden=listing_row[3],
        trades_today=trade_row[0],
        trades_7d=trade_row[1],
        reports_today=report_row[0],
        reports_open=report_row[1],
        reports_resolved_7d=report_row[2],
        tickets_today=ticket_row[0],
        tickets_open=ticket_row[1],
        first_reply_sla_hours=float(sla_seconds) / 3600 if sla_seconds is not None else None,
        reports_by_reason=[ReasonCount(reason=reason, count=count) for reason, count in reason_rows],
        biz_partners_pending=biz_partner_row[0],
        biz_partners_approved=biz_partner_row[1],
        biz_partners_suspended=biz_partner_row[2],
        biz_partners_new_today=biz_partner_row[3],
        biz_partners_new_7d=biz_partner_row[4],
        biz_ads_pending=biz_ad_row[0],
        biz_ads_launching=biz_ad_row[1],
        biz_ads_today=biz_ad_row[2],
        biz_ads_7d=biz_ad_row[3],
        biz_ads_tier_gold=biz_ad_row[4],
        biz_ads_tier_silver=biz_ad_row[5],
        biz_ads_tier_bronze=biz_ad_row[6],
        biz_ads_fee_sum=biz_ad_row[7],
    )


@router.get("/daily", response_model=list[DailyPoint])
async def get_daily(
    days: int = Query(14),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    days = max(7, min(30, days))  # 7~30 클램프
    start_date = datetime.now(_VN_TZ).date() - timedelta(days=days - 1)
    start_at = datetime.combine(start_date, time.min, tzinfo=_VN_TZ)

    async def count_by_day(col, *conds):
        day = cast(func.timezone(_VN_TZ_NAME, col), Date)  # col AT TIME ZONE 'Asia/Ho_Chi_Minh' → VN 로컬 일자
        rows = (await db.execute(select(day, func.count()).where(col >= start_at, *conds).group_by(day))).all()
        return dict(rows)

    new_users = await count_by_day(User.created_at)
    new_listings = await count_by_day(MarketplaceListing.created_at)
    trades = await count_by_day(MarketplaceAppointment.updated_at, MarketplaceAppointment.status == "COMPLETED")
    reports = await count_by_day(Report.created_at)
    tickets = await count_by_day(SupportTicket.created_at)
    new_partners = await count_by_day(BusinessProfile.created_at)
    new_ads = await count_by_day(MarketplaceAd.created_at)

    return [
        DailyPoint(
            date=d.isoformat(),
            new_users=new_users.get(d, 0),
            new_listings=new_listings.get(d, 0),
            trades_completed=trades.get(d, 0),
            reports_created=reports.get(d, 0),
            tickets_created=tickets.get(d, 0),
            new_partners=new_partners.get(d, 0),
            new_ads=new_ads.get(d, 0),
        )
        for d in (start_date + timedelta(days=i) for i in range(days))
    ]
