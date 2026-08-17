"""admin JSON API — 운영 대시보드 지표 (실시간 집계, BFF DB 한정 — Engine 호출 없음).

일자 경계는 Asia/Ho_Chi_Minh 기준. '오늘' = VN 자정 이후, '7일' = 오늘 포함 최근 7일.
거래 성사 시각은 marketplace_appointments.updated_at 근사(전용 완료시각 컬럼 없음).
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import Date, cast, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import (
    BusinessProfile,
    MarketplaceAppointment,
    MarketplaceListing,
    Report,
    SupportReply,
    SupportTicket,
    User,
)
from ...modules.ads import AdsApplication

router = APIRouter(prefix="/dashboard")

_VN_TZ_NAME = "Asia/Ho_Chi_Minh"
_VN_TZ = ZoneInfo(_VN_TZ_NAME)
_OPEN_REPORT_STATUSES = ("PENDING", "REVIEWING")


class ReasonCount(BaseModel):
    reason: str
    count: int


class AdTierCount(BaseModel):
    id: str
    name: str
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
    # Q-7(감사 260817): GMV = SOLD 매물의 agreed_price_vnd 합. 실측(2026-08-17)상 SOLD 21건 중
    # 1건만 agreed_price_vnd 가 채워져 있어 합계만으로는 오해를 낳는다 — 집계에 반영된 건수(sample)를
    # 함께 반환해 커버리지를 드러낸다. 성사 시각은 listing.updated_at 근사(trades_today 와 동일 관례).
    gmv_vnd_today: int
    gmv_vnd_7d: int
    gmv_vnd_total: int
    gmv_sample_today: int
    gmv_sample_7d: int
    gmv_sample_total: int
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
    biz_ads_tier_counts: list[AdTierCount]
    biz_ads_monthly_price_sum: int


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

    sold = MarketplaceListing.status == "SOLD"
    gmv_row = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(MarketplaceListing.agreed_price_vnd).filter(
                        sold, MarketplaceListing.updated_at >= today_start
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(MarketplaceListing.agreed_price_vnd).filter(
                        sold, MarketplaceListing.updated_at >= week_start
                    ),
                    0,
                ),
                func.coalesce(func.sum(MarketplaceListing.agreed_price_vnd).filter(sold), 0),
                func.count().filter(
                    sold, MarketplaceListing.agreed_price_vnd.isnot(None), MarketplaceListing.updated_at >= today_start
                ),
                func.count().filter(
                    sold, MarketplaceListing.agreed_price_vnd.isnot(None), MarketplaceListing.updated_at >= week_start
                ),
                func.count().filter(sold, MarketplaceListing.agreed_price_vnd.isnot(None)),
            ).select_from(MarketplaceListing)
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

    biz_ad_row, tier_rows = await AdsApplication(db).dashboard_stats(today_start, week_start)

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
        gmv_vnd_today=gmv_row[0],
        gmv_vnd_7d=gmv_row[1],
        gmv_vnd_total=gmv_row[2],
        gmv_sample_today=gmv_row[3],
        gmv_sample_7d=gmv_row[4],
        gmv_sample_total=gmv_row[5],
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
        biz_ads_tier_counts=[
            AdTierCount(id=str(tier_id), name=name, count=count) for tier_id, name, count in tier_rows
        ],
        biz_ads_monthly_price_sum=biz_ad_row[4],
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
    new_ads = await AdsApplication(db).created_counts_by_day(start_at, _VN_TZ_NAME)

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
