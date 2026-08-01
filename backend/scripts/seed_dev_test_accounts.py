"""[DEV ONLY] 실사용 테스트용 계정 3개(유저 2 + 업체 1) 시드.

⚠️ __DEV 전용 스크립트다. seed_ad_daily_stats.py 와 동일한 fail-safe 화이트리스트로
운영(APP_ENV=production 등)에서는 실행 즉시 중단한다.

배경: /auth/dev-login-as (backend/app/routers/auth.py) 는 OAuth 없이 "지정한 user_id"
로 즉시 로그인시키는 개발 서버 전용 우회다 — 임의 계정을 새로 만들지 않고 이미 존재하는
계정만 대상으로 하므로, 테스트 대상 계정을 먼저 이 스크립트로 만들어둬야 한다.

Usage:
    DATABASE_URL=postgresql://user:pw@host:5432/db APP_ENV=development \\
    python -m scripts.seed_dev_test_accounts

phone unique 컬럼 기준 upsert라 재실행해도 안전하다(멱등) — 매번 같은 3개 uuid 출력.
"""

from __future__ import annotations

import os
import sys

import psycopg2

# backend/app/routers/auth.py 의 _DEV_ENV_VALUES 와 동일한 fail-safe 화이트리스트.
_DEV_ENV_VALUES = {"development", "dev", "local", "test"}

# (phone, nickname) — phone 이 unique 컬럼이라 이 값으로 upsert 대상을 식별한다.
_USERS = [
    ("__dev_test_u1__", "DevTestUser1"),
    ("__dev_test_u2__", "DevTestUser2"),
    ("__dev_test_biz1__", "DevTestBizOwner"),
]
_BIZ_OWNER_PHONE = "__dev_test_biz1__"
_BIZ_NAME = "Dev Test 업체"


def _require_dev_env() -> None:
    app_env = os.getenv("APP_ENV", "").strip().lower()
    if app_env not in _DEV_ENV_VALUES:
        print(
            f"ERROR: APP_ENV={app_env!r} 은 개발 환경 화이트리스트({sorted(_DEV_ENV_VALUES)})에 "
            "없습니다. 이 스크립트는 dev 전용이라 중단합니다.",
            file=sys.stderr,
        )
        sys.exit(1)


def _upsert_user(cur, phone: str, nickname: str) -> str:
    cur.execute(
        """
        INSERT INTO users (id, phone, nickname, level, exp, xp, gold,
            skill_pt, skill_distance_rider, skill_gold_hunter, skill_quest_slot,
            skill_cost_discount, skill_mileage_rate, manner_temp, is_advertiser,
            status, created_at, updated_at)
        VALUES (gen_random_uuid(), %s, %s, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 36.5, false,
            'ACTIVE', NOW(), NOW())
        ON CONFLICT (phone) DO UPDATE SET nickname = EXCLUDED.nickname, updated_at = NOW()
        RETURNING id
        """,
        (phone, nickname),
    )
    return str(cur.fetchone()[0])


def _ensure_business_profile(cur, owner_id: str) -> str:
    cur.execute("SELECT id FROM business_profile WHERE user_id = %s LIMIT 1", (owner_id,))
    row = cur.fetchone()
    if row:
        return str(row[0])
    cur.execute(
        """
        INSERT INTO business_profile (id, user_id, name, status, verification_status,
            verified_at, phone_verified, created_at, updated_at)
        VALUES (gen_random_uuid(), %s, %s, 'APPROVED', 'verified', NOW(), true, NOW(), NOW())
        RETURNING id
        """,
        (owner_id, _BIZ_NAME),
    )
    return str(cur.fetchone()[0])


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
        user_ids: dict[str, str] = {}
        for phone, nickname in _USERS:
            user_ids[phone] = _upsert_user(cur, phone, nickname)

        biz_profile_id = _ensure_business_profile(cur, user_ids[_BIZ_OWNER_PHONE])
        conn.commit()

        print("[완료] 테스트 계정 3개 준비됨 (dev-login-as 용 user_id):")
        print(f"  유저1        user_id={user_ids['__dev_test_u1__']}")
        print(f"  유저2        user_id={user_ids['__dev_test_u2__']}")
        print(f"  업체계정     user_id={user_ids[_BIZ_OWNER_PHONE]}  business_profile_id={biz_profile_id}")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
