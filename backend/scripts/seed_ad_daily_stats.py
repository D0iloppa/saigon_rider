"""[DEV ONLY] ad_daily_stats 개발용 시드 — 광고 성과 대시보드 차트 검증용.

⚠️ __DEV 전용 스크립트다. 운영(APP_ENV=production 등)에서는 실행 즉시 중단한다
(아래 _DEV_ENV_VALUES 화이트리스트 — backend/app/routers/auth.py 의 fail-safe 관례와
동일하게 "dev로 알려진 값만 통과"시킨다. sms_client.py/app_version.py 식
`not in ("production","prod")` fail-open 은 쓰지 않는다).

배경: rollup_ad_stats 배치(B-7, ai-docs/spec/ad-performance-metrics.md §7)가 아직
없어 ad_daily_stats 가 항상 비어 있고, 대시보드(get_ad_stats_summary)가 늘 0/no_ads
로만 보여 차트를 눈으로 검증할 방법이 없다. 이 스크립트는 dev DB 에 최근 30일치
결정적(deterministic)·현실적인 롤업 행을 채운다.

Usage:
    (backend 컨테이너/venv 에 psycopg2 가 없으면 먼저 `pip install psycopg2-binary` —
    requirements*.txt 에는 없다. seed_dummy_market.py 도 동일한 선재 상태.)

    DATABASE_URL=postgresql://user:pw@host:5432/db APP_ENV=development \\
    python -m scripts.seed_ad_daily_stats [--ad-id UUID ...] [--days 30] [--purge]

되돌리기: --purge 를 붙여 같은 대상(ad-id 지정 시 그것만, 아니면 APPROVED 전체)의
최근 --days 일 행을 삭제한다. 다시 채우려면 --purge 없이 재실행.
"""

from __future__ import annotations

import argparse
import hashlib
import math
import os
import random
import sys
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg2

# backend/app/routers/auth.py 의 _DEV_ENV_VALUES 와 동일한 fail-safe 화이트리스트 —
# 목록에 없는 값(운영 포함 오탈자/미설정)은 전부 차단한다.
_DEV_ENV_VALUES = {"development", "dev", "local", "test"}

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

# ai-docs/spec/ad-performance-metrics.md §1-C 의 S1~S6 중 노출량이 큰 3개만 사용:
# feed(피드 카드, 최다 노출), home(홈 배너), ad_detail(상세 진입, 최소 노출).
# 나머지(feed_top/home_empty/biz_profile)는 차트 검증엔 과한 세분화라 생략.
SURFACES = ("feed", "home", "ad_detail")
_SURFACE_WEIGHT = {"feed": 1.0, "home": 0.4, "ad_detail": 0.12}

# feed 기준 일일 기대 노출(가중치 적용 전). 대시보드 표본 게이트(100)를 가볍게 넘기는
# 수준을 넘어, 클릭/CTA 가 정수 절삭으로 항상 0이 되지 않도록 행당 클릭 수십 건이
# 나오는 규모로 잡는다(리뷰 피드백 — 행당 평균 클릭 0.65 는 광고 규모로 비현실적).
_BASE_IMPRESSIONS_PER_DAY = 2500.0


def _require_dev_env() -> None:
    app_env = os.getenv("APP_ENV", "").strip().lower()
    if app_env not in _DEV_ENV_VALUES:
        print(
            f"ERROR: APP_ENV={app_env!r} 은 개발 환경 화이트리스트({sorted(_DEV_ENV_VALUES)})에 "
            "없습니다. 이 스크립트는 dev 전용이라 중단합니다.",
            file=sys.stderr,
        )
        sys.exit(1)


def _seeded_random(*parts: str) -> random.Random:
    """(ad_id, surface) 등으로 결정적 시드를 만든다 — 몇 번을 돌려도 같은 값."""
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return random.Random(int(digest[:16], 16))


def _stoch_round(rng: random.Random, value: float) -> int:
    """확률적 반올림 — 기대값을 보존한다. 단순 int()/round() 절삭은 값이 작을 때
    (예: 0.65 클릭 x 10% CTA율 = 0.065) 항상 0 으로 사라져 대시보드 검증이 불가능해진다.
    소수부만큼의 확률로 올림해 여러 행에 걸쳐 평균적으로 실제 비율을 재현한다.
    """
    floor = math.floor(value)
    frac = value - floor
    return floor + (1 if rng.random() < frac else 0)


def _ad_tier(ad_id: str) -> dict:
    """광고마다 성과가 갈리도록 하는 결정적 "실력" 배수 — 잘 되는 광고/그저 그런 광고가
    섞이게 한다(캠페인별 표가 전부 동일하면 의미가 없다는 피드백 반영).
    """
    rng = _seeded_random(ad_id, "tier")
    return {
        "volume": rng.uniform(0.35, 2.2),
        "ctr": rng.uniform(0.6, 1.8),
        "cvr": rng.uniform(0.4, 1.9),
    }


def _day_stats(
    rng: random.Random,
    day_idx: int,
    total_days: int,
    weekday: int,
    base: float,
    tier: dict,
) -> dict:
    """하루치 퍼널 수치. weekday: 0=월 ... 5=토 6=일 (주말은 트래픽 소폭 하락으로 가정 —
    출퇴근/업무시간 중 앱 사용이 많은 라이더 서비스 특성상 평일이 더 활발함).
    trend: 30일 구간에 걸쳐 완만한 상승(0.85배 → 1.15배).
    """
    weekend_factor = 0.75 if weekday >= 5 else 1.0
    trend_factor = 0.85 + 0.30 * (day_idx / max(total_days - 1, 1))
    noise = rng.uniform(0.9, 1.1)
    impressions = max(5, round(base * weekend_factor * trend_factor * noise))

    reach = max(1, _stoch_round(rng, impressions * rng.uniform(0.70, 0.95)))
    reach = min(reach, impressions)

    click_rate = rng.uniform(0.01, 0.04) * tier["ctr"]
    clicks = _stoch_round(rng, impressions * click_rate)
    clicks = min(clicks, impressions - 1)
    clicks = max(clicks, 0)

    primary_rate = rng.uniform(0.05, 0.15) * tier["cvr"]
    primary_total = _stoch_round(rng, clicks * primary_rate) if clicks else 0
    primary_total = min(primary_total, clicks)  # cta_primary ≤ clicks 강제
    weights = [rng.random() for _ in range(4)]  # call, follow, favorite, review
    wsum = sum(weights) or 1.0
    shares = [round(primary_total * w / wsum) for w in weights]
    # 반올림 오차 보정 — 마지막 항목이 흡수
    shares[-1] += primary_total - sum(shares)
    cta_call, cta_follow, cta_favorite, cta_review = (max(0, s) for s in shares)

    cta_secondary = max(0, _stoch_round(rng, primary_total * rng.uniform(1.0, 1.5)))
    self_impressions = _stoch_round(rng, impressions * rng.uniform(0.005, 0.02))
    self_impressions = min(self_impressions, impressions - 1) if impressions > 0 else 0

    return dict(
        impressions=impressions,
        reach=reach,
        clicks=clicks,
        cta_call=cta_call,
        cta_follow=cta_follow,
        cta_favorite=cta_favorite,
        cta_review=cta_review,
        cta_secondary=cta_secondary,
        self_impressions=self_impressions,
    )


def _fetch_target_ads(cur, ad_ids: list[str] | None) -> list[tuple[str, str | None, str]]:
    if ad_ids:
        cur.execute(
            "SELECT id, owner_business_profile_id, partner_name FROM marketplace_ads "
            "WHERE id = ANY(%s::uuid[]) AND review_status = 'APPROVED'",
            (ad_ids,),
        )
    else:
        cur.execute(
            "SELECT id, owner_business_profile_id, partner_name FROM marketplace_ads WHERE review_status = 'APPROVED'"
        )
    return [(str(r[0]), str(r[1]) if r[1] else None, r[2]) for r in cur.fetchall()]


def _purge(cur, ads: list[tuple[str, str | None, str]], start: date, end: date) -> int:
    cur.execute(
        "DELETE FROM ad_daily_stats WHERE ad_id = ANY(%s::uuid[]) AND stat_date BETWEEN %s AND %s",
        ([a[0] for a in ads], start, end),
    )
    return cur.rowcount


def main() -> None:
    _require_dev_env()

    parser = argparse.ArgumentParser()
    parser.add_argument("--ad-id", action="append", help="대상 ad_id (반복 가능). 미지정 시 APPROVED 전체")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--purge", action="store_true", help="시드 행 삭제(되돌리기)")
    args = parser.parse_args()

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    try:
        ads = _fetch_target_ads(cur, args.ad_id)
        if not ads:
            print("대상 광고 없음(review_status='APPROVED' 인 광고가 없거나 지정한 ad-id 가 없음).")
            return

        print(f"대상 광고 {len(ads)}건:")
        for ad_id, profile_id, partner_name in ads:
            print(f"  - {ad_id}  profile={profile_id}  ({partner_name})")

        end_date = datetime.now(_VN_TZ).date()  # 대시보드(get_ad_stats_summary)와 동일하게 VN 기준 날짜
        start_date = end_date - timedelta(days=args.days - 1)

        if args.purge:
            deleted = _purge(cur, ads, start_date, end_date)
            conn.commit()
            print(f"[purge] {deleted}행 삭제 ({start_date} ~ {end_date})")
            return

        rows = 0
        for ad_id, profile_id, _partner_name in ads:
            tier = _ad_tier(ad_id)
            for surface in SURFACES:
                base = _BASE_IMPRESSIONS_PER_DAY * _SURFACE_WEIGHT[surface] * tier["volume"]
                rng = _seeded_random(ad_id, surface)
                for day_idx in range(args.days):
                    stat_date = start_date + timedelta(days=day_idx)
                    stats = _day_stats(rng, day_idx, args.days, stat_date.weekday(), base, tier)
                    cur.execute(
                        """
                        INSERT INTO ad_daily_stats
                            (ad_id, stat_date, surface, business_profile_id,
                             impressions, reach, clicks,
                             cta_call, cta_follow, cta_favorite, cta_review, cta_secondary,
                             self_impressions, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (ad_id, stat_date, surface) DO UPDATE SET
                            business_profile_id = EXCLUDED.business_profile_id,
                            impressions = EXCLUDED.impressions,
                            reach = EXCLUDED.reach,
                            clicks = EXCLUDED.clicks,
                            cta_call = EXCLUDED.cta_call,
                            cta_follow = EXCLUDED.cta_follow,
                            cta_favorite = EXCLUDED.cta_favorite,
                            cta_review = EXCLUDED.cta_review,
                            cta_secondary = EXCLUDED.cta_secondary,
                            self_impressions = EXCLUDED.self_impressions,
                            updated_at = NOW()
                        """,
                        (
                            ad_id,
                            stat_date,
                            surface,
                            profile_id,
                            stats["impressions"],
                            stats["reach"],
                            stats["clicks"],
                            stats["cta_call"],
                            stats["cta_follow"],
                            stats["cta_favorite"],
                            stats["cta_review"],
                            stats["cta_secondary"],
                            stats["self_impressions"],
                        ),
                    )
                    rows += 1
        conn.commit()
        print(f"[완료] {rows}행 upsert ({start_date} ~ {end_date}, surfaces={SURFACES})")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
