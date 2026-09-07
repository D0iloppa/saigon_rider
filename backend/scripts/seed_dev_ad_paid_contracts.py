"""[DEV ONLY] pending_payment 광고기능 점검용 시드를 99년 유효 계약으로 전환.

⚠️ __DEV 전용 스크립트다. seed_dev_test_accounts.py 와 동일한 fail-safe 화이트리스트로
운영(APP_ENV=production 등)에서는 실행 즉시 중단한다. database/init/*.sql(자동 부트스트랩
경로)에는 절대 넣지 않는다 — 그쪽은 fresh 볼륨 초기화 시 운영 환경에서도 실행되기 때문이다.
이 스크립트는 그 경로 밖에서 개발자가 수동으로만 실행한다(자동 실행 경로 없음).

배경: 260907_biz_ad_payment_contract_adr.md §9 T-1 로 노출 게이트가 subscription_status/
paid_until 을 검사하게 됐다. dev DB 의 pending_payment 광고 다수는 서비스 미오픈 상태에서
광고기능 점검용으로 만들어진 개발 데이터라 실제 계약이 아니다 — 게이트가 켜져도 이 개발
데이터가 막히지 않도록 유효 계약(active + paid_until 먼 미래)으로 만든다.

대상 좁히기: `paid_until IS NULL AND subscription_status='pending_payment'` 인 행만 건드린다.
이미 active 로 세팅된 행(진짜 계약이든 이미 이 스크립트로 처리됐든)은 절대 덮어쓰지 않는다
— 멱등: 재실행해도 이미 처리된 행은 WHERE 절에서 자동 제외된다.

Usage:
    DATABASE_URL=postgresql://user:pw@host:5432/db APP_ENV=development \\
    python -m scripts.seed_dev_ad_paid_contracts
"""

from __future__ import annotations

import os
import sys

import psycopg2

# backend/app/routers/auth.py 의 _DEV_ENV_VALUES 와 동일한 fail-safe 화이트리스트.
_DEV_ENV_VALUES = {"development", "dev", "local", "test"}

# 99년 후 — 사실상 무기한이지만 NULL(무한)은 피한다(파생 로직이 '만료일 있음'을 전제할 수 있어서).
_DEV_PAID_UNTIL = "2125-01-01T00:00:00+00:00"


def _require_dev_env() -> None:
    app_env = os.getenv("APP_ENV", "").strip().lower()
    if app_env not in _DEV_ENV_VALUES:
        print(
            f"ERROR: APP_ENV={app_env!r} 은 개발 환경 화이트리스트({sorted(_DEV_ENV_VALUES)})에 "
            "없습니다. 이 스크립트는 dev 전용이라 중단합니다.",
            file=sys.stderr,
        )
        sys.exit(1)


def main() -> None:
    _require_dev_env()

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    try:
        cur.execute(
            """
            UPDATE marketplace_ads
               SET subscription_status = 'active',
                   paid_until = %s
             WHERE paid_until IS NULL
               AND subscription_status = 'pending_payment'
            RETURNING id
            """,
            (_DEV_PAID_UNTIL,),
        )
        updated_ids = [str(row[0]) for row in cur.fetchall()]
        conn.commit()
        print(f"[완료] {len(updated_ids)}건을 active + paid_until={_DEV_PAID_UNTIL} 로 전환했습니다.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
