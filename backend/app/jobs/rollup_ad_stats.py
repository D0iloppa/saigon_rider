"""광고 성과 일별 롤업 배치 — ad_events → ad_daily_stats (정본 §5 #6, D-1).

ai-docs/spec/ad-performance-metrics.md §5 의 전체 설계(Redis Stream 워커, 5분 증분 롤업,
90일 원시 삭제)는 D-1(001_DECISIONS.md)이 최소 범위로 좁혔다 — 이 배치는 그중 "일별 롤업"만
구현한다. 매일 00:20 ICT 에 **전날(VN 로컬) 하루 전체**를 ad_events 에서 재집계해
ad_daily_stats 에 upsert 한다. "해당 일자 전체 재계산 후 upsert" 방식이라 같은 날짜를 여러 번
돌려도 값이 그대로다(증분 합산이 아니므로 멱등 — main.py 의 다른 배치들처럼 max_instances=1 +
coalesce=True 로 등록해 중복 실행 자체도 막는다).

시간대: 서비스 대상이 베트남이라 일별 경계를 Asia/Ho_Chi_Minh 기준으로 자른다(UTC 로 자르면
광고주가 보는 "어제"와 어긋난다 — admin_api/dashboard.py:234, modules/ads/application.py:293
선례와 동일한 관례). ad_events.stat_date 는 이미 적재 시점(routers/market.py, proximity.py)에
VN 로컬 일자로 계산해 저장하므로, 이 배치는 그 컬럼으로 단순 GROUP BY 하면 된다.

무료/유료 노출면 구분: 이 배치는 surface 를 그대로 보존해 (ad_id, stat_date, surface) 단위로
집계한다(ad_daily_stats PK 자체가 이미 surface 를 포함) — market_feed 류 유료 노출과
ad_detail/biz_profile 류 무료 노출을 여기서 합치지 않는다. 유료/무료 구분은 조회 단계
(routers/biz.py 의 PAID_AD_SURFACES 필터)에서 이뤄진다.
"""

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import String, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..database import AsyncSessionLocal
from ..models import AdDailyStat, AdEvent, MarketplaceAd

log = logging.getLogger(__name__)

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

# CTA-5/6/7 합계(ai-docs/spec/ad-performance-metrics.md §4-3 "cta_secondary").
_SECONDARY_CTA_TYPES = ("cta_news_view", "cta_profile_enter", "cta_share")
_IMPRESSION_TYPES = ("impression", "proximity_impression")

_UPSERT_COLUMNS = (
    "business_profile_id",
    "impressions",
    "reach",
    "clicks",
    "cta_call",
    "cta_follow",
    "cta_favorite",
    "cta_review",
    "cta_secondary",
    "self_impressions",
)


async def _rollup_date(target: date) -> int:
    """target(VN 로컬 stat_date) 하루치를 재집계해 upsert. 반영된 (ad_id, surface) 행 수 반환."""
    async with AsyncSessionLocal() as db:
        stmt = (
            select(
                AdEvent.ad_id,
                AdEvent.surface,
                func.count()
                .filter(AdEvent.event_type.in_(_IMPRESSION_TYPES), AdEvent.is_self.is_(False))
                .label("impressions"),
                func.count()
                .filter(AdEvent.event_type.in_(_IMPRESSION_TYPES), AdEvent.is_self.is_(True))
                .label("self_impressions"),
                # code-review high #4: 익명 노출(user_key=None)도 anon_key(HMAC 기반 일일 키,
                # routers/market.py _ad_anon_key)로 중복제거해 reach 에 반영한다. 로그인 사용자는
                # user_key, 익명은 anon_key 로 나뉘어 있으므로 COALESCE 로 하나의 식별자 집합으로
                # 합쳐 distinct 카운트한다. anon_key 는 IP+UA 해시 기반 근사치라 기기 변경·IP
                # 변경 시 다른 값이 되고 NAT/공유IP 시 과소집계될 수 있다 — reach 는 정확값이
                # 아니라 근사값이다(pepper 미설정 시 익명 reach 는 여전히 0).
                func.count(func.distinct(func.coalesce(func.cast(AdEvent.user_key, String), AdEvent.anon_key)))
                .filter(AdEvent.event_type.in_(_IMPRESSION_TYPES), AdEvent.is_self.is_(False))
                .label("reach"),
                func.count().filter(AdEvent.event_type == "click", AdEvent.is_self.is_(False)).label("clicks"),
                func.count().filter(AdEvent.event_type == "cta_call", AdEvent.is_self.is_(False)).label("cta_call"),
                func.count().filter(AdEvent.event_type == "cta_follow", AdEvent.is_self.is_(False)).label("cta_follow"),
                func.count()
                .filter(AdEvent.event_type == "cta_favorite", AdEvent.is_self.is_(False))
                .label("cta_favorite"),
                func.count().filter(AdEvent.event_type == "cta_review", AdEvent.is_self.is_(False)).label("cta_review"),
                func.count()
                .filter(AdEvent.event_type.in_(_SECONDARY_CTA_TYPES), AdEvent.is_self.is_(False))
                .label("cta_secondary"),
            )
            .where(AdEvent.stat_date == target)
            .group_by(AdEvent.ad_id, AdEvent.surface)
        )
        rows = (await db.execute(stmt)).all()
        if not rows:
            return 0

        # business_profile_id 는 ad_events 에 UUID로 아그리게이트 불가(postgres MAX(uuid) 없음)라
        # 소유 관계의 SoT 인 marketplace_ads 에서 직접 조회 — 한 번의 쿼리로 N+1 회피.
        ad_ids = {row.ad_id for row in rows}
        owner_by_ad = dict(
            (
                await db.execute(
                    select(MarketplaceAd.id, MarketplaceAd.owner_business_profile_id).where(
                        MarketplaceAd.id.in_(ad_ids)
                    )
                )
            ).all()
        )

        for row in rows:
            values = {
                "ad_id": row.ad_id,
                "stat_date": target,
                "surface": row.surface,
                "business_profile_id": owner_by_ad.get(row.ad_id),
                "impressions": row.impressions,
                "reach": row.reach,
                "clicks": row.clicks,
                "cta_call": row.cta_call,
                "cta_follow": row.cta_follow,
                "cta_favorite": row.cta_favorite,
                "cta_review": row.cta_review,
                "cta_secondary": row.cta_secondary,
                "self_impressions": row.self_impressions,
            }
            insert_stmt = pg_insert(AdDailyStat).values(**values)
            update_cols = {col: insert_stmt.excluded[col] for col in _UPSERT_COLUMNS}
            update_cols["updated_at"] = func.now()
            await db.execute(
                insert_stmt.on_conflict_do_update(index_elements=["ad_id", "stat_date", "surface"], set_=update_cols)
            )
        await db.commit()
        return len(rows)


async def rollup_ad_stats(days_back: int = 1) -> bool:
    """스케줄러 잡 진입점 — 기본은 "어제"(VN) 1일치 재계산.

    days_back>1 로 호출하면 최근 며칠을 함께 재계산한다(지연 도착 이벤트 흡수용 수동 백필).
    각 날짜는 전체 재계산 후 upsert 이므로 여러 날을 반복 호출해도 안전(멱등).
    """
    today_vn = datetime.now(_VN_TZ).date()
    try:
        total = 0
        for offset in range(1, days_back + 1):
            target = today_vn - timedelta(days=offset)
            total += await _rollup_date(target)
        log.info("ad_daily_stats rollup done: days_back=%s, %s (ad_id,surface) rows upserted", days_back, total)
        return True
    except Exception:
        log.exception("ad_daily_stats rollup failed")
        return False
