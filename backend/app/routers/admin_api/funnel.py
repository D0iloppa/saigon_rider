"""admin JSON API — 퍼널 계측 일별 단계 수 조회 (정본 §5 #5, D-18(a)).

핵심 이벤트 8종(가입·매물조회·등록·문의·가격제안·약속·완료·후기)의 일별 카운트를
funnel_daily_stats 롤업 테이블에서만 읽는다(원시 funnel_events 스캔 금지 — biz.py 의
ad_daily_stats 선례와 동일 관례). 롤업은 jobs/rollup_funnel_stats.py 가 매일 00:25 ICT 에 채운다.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import FunnelDailyStat, FunnelEvent
from ...schemas import FunnelEventType

_ACQ_REFERRAL_PREFIX = "u:"  # 초대자 코드 형식(016 §6-2 #31) — init/188 주석과 동일 카탈로그

router = APIRouter(prefix="/funnel")

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


class DailyFunnelPoint(BaseModel):
    date: str
    counts: dict[str, int]


@router.get("/daily", response_model=list[DailyFunnelPoint])
async def get_daily_funnel(
    days: int = Query(14),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    days = max(7, min(90, days))  # 7~90 클램프 (dashboard.py get_daily 와 동일한 관례)
    start_date = datetime.now(_VN_TZ).date() - timedelta(days=days - 1)

    rows = (
        await db.execute(
            select(FunnelDailyStat.stat_date, FunnelDailyStat.event_type, FunnelDailyStat.event_count).where(
                FunnelDailyStat.stat_date >= start_date
            )
        )
    ).all()
    counts_by_day: dict = {}
    for stat_date, event_type, event_count in rows:
        counts_by_day.setdefault(stat_date, {})[event_type] = event_count

    all_types = [t.value for t in FunnelEventType]
    return [
        DailyFunnelPoint(
            date=d.isoformat(),
            counts={t: counts_by_day.get(d, {}).get(t, 0) for t in all_types},
        )
        for d in (start_date + timedelta(days=i) for i in range(days))
    ]


class ZeroResultSearchTerm(BaseModel):
    query: str
    search_count: int


@router.get("/search/zero-results", response_model=list[ZeroResultSearchTerm])
async def get_zero_result_searches(
    days: int = Query(14),
    limit: int = Query(20),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """결과 0건 검색어 상위 N (016 §3-3/#21 완료 검증 조건).

    검색어별 집계라 funnel_daily_stats 롤업(event_type 단위)으로는 못 뽑는다 — 원시
    funnel_events 를 직접 스캔한다. 파일럿 규모 트래픽 가정(daily.py 의 rollup-only 관례와
    달리 여기만 예외).
    """
    days = max(1, min(90, days))
    limit = max(1, min(100, limit))
    since = datetime.now(_VN_TZ) - timedelta(days=days)

    query_expr = FunnelEvent.props["query"].astext
    stmt = (
        select(query_expr.label("query"), func.count().label("search_count"))
        .where(
            FunnelEvent.event_type == FunnelEventType.SEARCH.value,
            FunnelEvent.occurred_at >= since,
            text("(funnel_events.props->>'result_count')::int = 0"),
            query_expr.isnot(None),
        )
        .group_by(query_expr)
        .order_by(func.count().desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [ZeroResultSearchTerm(query=q, search_count=c) for q, c in rows]


class SegmentedFunnelRow(BaseModel):
    week_start: str
    acq_source: str
    persona: str
    ward_id: int | None
    signups: int
    verified_phone: int
    searched: int
    listing_viewed: int
    inquiry_started: int
    contact_exchanged: int
    deal_completed: int


@router.get("/segmented", response_model=list[SegmentedFunnelRow])
async def get_segmented_funnel(
    days: int = Query(56),
    acq_source: str | None = Query(default=None),
    persona: str | None = Query(default=None),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """전환 퍼널 — 유입출처 x 주차(가입 코호트) x 페르소나 x 구(ward) 세그먼트 (016 §6-4 #32).

    가입 코호트 기준 원시 funnel_events + users 를 직접 스캔한다(zero-results 와 동일한
    파일럿 규모 예외 — funnel_daily_stats 롤업은 event_type 단위라 유저별 존재(bool_or) 집계나
    유입출처 교차를 못 담는다). 일 1회 조회하는 어드민 화면이라 실시간 요구 없음(§12 기각 목록).

    - persona 는 저장 필드가 없어 "매물을 1건이라도 등록했는가"로 휴리스틱 판정한다
      (구매자/판매자 구분의 근사치 — 정확한 역할 필드가 생기면 교체 대상).
    - ward는 유저 단위 필드가 없어 판매자의 가장 최근 매물의 ward로만 채운다(구매자는 NULL).
    - inquiry_started/contact_exchanged 는 §6-4 의 ★ 대리 전환 지표(inquiry/appointment 이벤트
      존재로 근사) — deal_completed(자기신고, trade_complete)는 하한선으로만 쓴다.
    """
    days = max(7, min(180, days))
    since = datetime.now(_VN_TZ) - timedelta(days=days)

    stmt = text(
        """
        WITH base AS (
            SELECT
                u.id AS user_id,
                (date_trunc('week', u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::date AS week_start,
                COALESCE(u.acquisition_source, 'organic') AS acq_source,
                CASE WHEN EXISTS (
                    SELECT 1 FROM marketplace_listings ml WHERE ml.seller_id = u.id
                ) THEN 'seller' ELSE 'buyer' END AS persona,
                (u.phone_verified_at IS NOT NULL) AS verified,
                lw.ward_id AS ward_id
            FROM users u
            LEFT JOIN LATERAL (
                SELECT ml.ward_id FROM marketplace_listings ml
                WHERE ml.seller_id = u.id
                ORDER BY ml.created_at DESC
                LIMIT 1
            ) lw ON true
            WHERE u.created_at >= :since AND u.deleted_at IS NULL
        ),
        steps AS (
            SELECT
                b.week_start, b.acq_source, b.persona, b.verified, b.ward_id,
                bool_or(fe.event_type = 'search') AS did_search,
                bool_or(fe.event_type = 'listing_view') AS did_view,
                bool_or(fe.event_type = 'inquiry') AS did_inquiry,
                bool_or(fe.event_type = 'appointment') AS did_contact,
                bool_or(fe.event_type = 'trade_complete') AS did_deal
            FROM base b
            LEFT JOIN funnel_events fe ON fe.user_id = b.user_id
            GROUP BY b.user_id, b.week_start, b.acq_source, b.persona, b.verified, b.ward_id
        )
        SELECT
            week_start, acq_source, persona, ward_id,
            count(*) AS signups,
            count(*) FILTER (WHERE verified) AS verified_phone,
            count(*) FILTER (WHERE did_search) AS searched,
            count(*) FILTER (WHERE did_view) AS listing_viewed,
            count(*) FILTER (WHERE did_inquiry) AS inquiry_started,
            count(*) FILTER (WHERE did_contact) AS contact_exchanged,
            count(*) FILTER (WHERE did_deal) AS deal_completed
        FROM steps
        -- CAST(... AS text) 필수 — 없으면 asyncpg 가 "바인드파라미터 IS NULL" 비교에서
        -- 파라미터 타입을 추론하지 못해 AmbiguousParameterError 로 **항상 500** 이 난다
        -- (값을 넘겨도 동일). 2026-08-18 어드민 퍼널 화면 구축 중 발견 — 이 API 는
        -- 그때까지 한 번도 실호출된 적이 없어 코드 리뷰만으로는 드러나지 않았다.
        -- ⚠️ 이 주석에 콜론+단어 형태를 쓰지 마라 — SQLAlchemy text() 는 **주석 안까지**
        --    파싱해 바인드 파라미터로 인식한다(실제로 그렇게 한 번 깨뜨렸다).
        WHERE (CAST(:acq_source AS text) IS NULL OR acq_source = CAST(:acq_source AS text))
          AND (CAST(:persona AS text) IS NULL OR persona = CAST(:persona AS text))
        GROUP BY week_start, acq_source, persona, ward_id
        ORDER BY week_start DESC, acq_source, persona
        """
    )
    rows = (await db.execute(stmt, {"since": since, "acq_source": acq_source, "persona": persona})).all()
    return [
        SegmentedFunnelRow(
            week_start=week_start.isoformat(),
            acq_source=acq_source_val,
            persona=persona_val,
            ward_id=ward_id,
            signups=signups,
            verified_phone=verified_phone,
            searched=searched,
            listing_viewed=listing_viewed,
            inquiry_started=inquiry_started,
            contact_exchanged=contact_exchanged,
            deal_completed=deal_completed,
        )
        for (
            week_start,
            acq_source_val,
            persona_val,
            ward_id,
            signups,
            verified_phone,
            searched,
            listing_viewed,
            inquiry_started,
            contact_exchanged,
            deal_completed,
        ) in rows
    ]


class TopReferrer(BaseModel):
    inviter_user_id: str
    inviter_nickname: str | None
    signup_count: int


@router.get("/referrals/top", response_model=list[TopReferrer])
async def get_top_referrers(
    days: int = Query(90),
    limit: int = Query(20),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """초대자별 가입 수 집계 (016 §6-3 #31 완료 검증 조건).

    users.acquisition_source 가 'u:<inviter_user_id>' 형식인 행만 대상 — 매물 공유 링크와
    지인 소개 초대 코드가 동일 규약을 쓴다(§6-2·§6-3, 별도 초대코드 테이블 신설 없음).
    ref 는 자유 입력이라 초대자 id 부분이 실제 UUID 형식인 행만 카운트한다(정규식 필터).
    """
    days = max(1, min(365, days))
    limit = max(1, min(100, limit))
    since = datetime.now(_VN_TZ) - timedelta(days=days)

    prefix_len = len(_ACQ_REFERRAL_PREFIX)
    stmt = text(
        f"""
        SELECT
            substring(u.acquisition_source FROM {prefix_len + 1}) AS inviter_id_text,
            count(*) AS signup_count
        FROM users u
        WHERE u.acquisition_source LIKE :prefix_pattern
          AND u.created_at >= :since
          AND u.deleted_at IS NULL
          AND substring(u.acquisition_source FROM {prefix_len + 1})
              ~ '^[0-9a-fA-F]{{8}}-[0-9a-fA-F]{{4}}-[0-9a-fA-F]{{4}}-[0-9a-fA-F]{{4}}-[0-9a-fA-F]{{12}}$'
        GROUP BY inviter_id_text
        ORDER BY signup_count DESC
        LIMIT :limit
        """
    )
    rows = (
        await db.execute(stmt, {"prefix_pattern": f"{_ACQ_REFERRAL_PREFIX}%", "since": since, "limit": limit})
    ).all()
    if not rows:
        return []

    inviter_ids = [r[0] for r in rows]
    nickname_stmt = text("SELECT id::text, nickname FROM users WHERE id::text = ANY(:ids)")
    nickname_rows = (await db.execute(nickname_stmt, {"ids": inviter_ids})).all()
    nickname_by_id = {uid: nick for uid, nick in nickname_rows}

    return [
        TopReferrer(
            inviter_user_id=inviter_id,
            inviter_nickname=nickname_by_id.get(inviter_id),
            signup_count=signup_count,
        )
        for inviter_id, signup_count in rows
    ]
