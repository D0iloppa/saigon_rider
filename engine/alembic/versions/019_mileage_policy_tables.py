"""마일리지 누적 + 보상 정책 엔진 + 단말-유저 매핑 테이블

- sre_user.total_distance_m 컬럼 추가
- device_user_map: 단말 UUID ↔ 로그인 유저 매핑
- user_mileage_log: GPS 기반 이동거리 개별 기록
- reward_policy: 보상 정책 정의 (conditions JSONB)
- reward_policy_action: 정책별 보상 액션 (1:N)
- user_policy_log: 유저별 정책 발동 이력

Revision ID: sre019
Revises: sre018
Create Date: 2026-05-20
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "sre019"
down_revision: Union[str, None] = "sre018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── ENUM ──
    op.execute("""
        CREATE TYPE reward_action_type_enum AS ENUM (
            'GRANT_EXP',
            'GRANT_BADGE',
            'GRANT_RP',
            'GRANT_GOLD'
        )
    """)

    # ── sre_user: 누적 이동거리 컬럼 ──
    op.execute("""
        ALTER TABLE sre_user
        ADD COLUMN total_distance_m BIGINT NOT NULL DEFAULT 0
    """)

    # ── device_user_map: 단말-유저 매핑 (로그인 시 UPSERT) ──
    op.execute("""
        CREATE TABLE device_user_map (
            device_uuid  VARCHAR(128) PRIMARY KEY,
            user_id      BIGINT       NOT NULL REFERENCES sre_user(user_id),
            logged_in_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("""
        CREATE INDEX idx_device_user_map_user
        ON device_user_map (user_id)
    """)

    # ── user_mileage_log: 이동거리 개별 기록 ──
    op.execute("""
        CREATE TABLE user_mileage_log (
            id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id     BIGINT      NOT NULL REFERENCES sre_user(user_id),
            distance_m  NUMERIC(12,2) NOT NULL,
            device_uuid TEXT,
            recorded_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("""
        CREATE INDEX idx_mileage_log_user_ts
        ON user_mileage_log (user_id, recorded_at DESC)
    """)

    # ── reward_policy: 보상 정책 정의 ──
    op.execute("""
        CREATE TABLE reward_policy (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            policy_code     VARCHAR(60)  NOT NULL,
            name            VARCHAR(120) NOT NULL,
            description     TEXT,
            conditions      JSONB        NOT NULL DEFAULT '[]',
            is_repeatable   BOOLEAN      NOT NULL DEFAULT FALSE,
            repeat_interval BIGINT,
            is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
            priority        SMALLINT     NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_reward_policy_code UNIQUE (policy_code)
        )
    """)
    op.execute(text(
        "COMMENT ON COLUMN reward_policy.conditions IS "
        '$$[{"metric":"total_distance_m","op":">=","value"\\:100000}] — AND 평가, op: >=, >, ==, in$$'
    ))
    op.execute(text(
        "COMMENT ON COLUMN reward_policy.repeat_interval IS "
        "'is_repeatable=true일 때, 주 metric 기준 반복 주기 (예: 10000 = 매 10km)'"
    ))
    op.execute("""
        CREATE INDEX idx_reward_policy_active
        ON reward_policy (is_active, priority)
        WHERE is_active = TRUE
    """)

    # ── reward_policy_action: 정책별 보상 액션 (1:N) ──
    op.execute("""
        CREATE TABLE reward_policy_action (
            id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            policy_id   BIGINT NOT NULL REFERENCES reward_policy(id) ON DELETE CASCADE,
            action_type reward_action_type_enum NOT NULL,
            value       INTEGER NOT NULL DEFAULT 0,
            ref_id      VARCHAR(64),
            sort_order  SMALLINT NOT NULL DEFAULT 0
        )
    """)
    op.execute("""
        CREATE INDEX idx_policy_action_policy
        ON reward_policy_action (policy_id, sort_order)
    """)

    # ── user_policy_log: 유저별 정책 발동 이력 ──
    op.execute("""
        CREATE TABLE user_policy_log (
            id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id           BIGINT NOT NULL REFERENCES sre_user(user_id),
            policy_id         BIGINT NOT NULL REFERENCES reward_policy(id),
            trigger_snapshot  JSONB,
            rewarded_at       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("""
        CREATE INDEX idx_policy_log_user_policy
        ON user_policy_log (user_id, policy_id, rewarded_at DESC)
    """)

    # ── updated_at 트리거 (reward_policy) ──
    op.execute("""
        CREATE TRIGGER trg_reward_policy_updated_at
        BEFORE UPDATE ON reward_policy
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_reward_policy_updated_at ON reward_policy")
    op.execute("DROP TABLE IF EXISTS user_policy_log")
    op.execute("DROP TABLE IF EXISTS reward_policy_action")
    op.execute("DROP TABLE IF EXISTS reward_policy")
    op.execute("DROP TABLE IF EXISTS user_mileage_log")
    op.execute("DROP TABLE IF EXISTS device_user_map")
    op.execute("ALTER TABLE sre_user DROP COLUMN IF EXISTS total_distance_m")
    op.execute("DROP TYPE IF EXISTS reward_action_type_enum")
