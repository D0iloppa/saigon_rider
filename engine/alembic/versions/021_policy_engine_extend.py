"""정책 엔진 확장 — 메트릭 기반 반복, 레벨 시스템, 시드 정책 4건

sre_user.total_exp_granted 추가
reward_policy.repeat_metric / repeat_metric_interval 추가
기본 정책 4건 + 액션 시드

Revision ID: sre021
Revises: sre020
Create Date: 2026-05-21
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre021"
down_revision: Union[str, None] = "sre020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SEED_POLICIES = """
INSERT INTO reward_policy
  (policy_code, name, description, conditions, is_repeatable, repeat_metric, repeat_metric_interval, is_active, priority)
VALUES
  ('MILEAGE_EXP',    '마일리지 EXP 보상', '매 1km 주행 시 EXP 10 지급',
   '[{"metric":"total_distance_m","op":">=","value":1000}]'::jsonb,
   true, 'total_distance_m', 1000, true, 100),

  ('MILEAGE_XP',     '마일리지 XP 보상',  '매 5km 주행 시 XP 30 지급',
   '[{"metric":"total_distance_m","op":">=","value":5000}]'::jsonb,
   true, 'total_distance_m', 5000, true, 90),

  ('LEVELUP_REWARD', '레벨업 보상',       '레벨업 시 XP 100 + GOLD 50 지급',
   '[{"metric":"level","op":">=","value":2}]'::jsonb,
   true, 'level', 1, true, 80),

  ('BADGE_10KM',     '10km 달성 뱃지',    '누적 10km 달성 시 뱃지 지급',
   '[{"metric":"total_distance_m","op":">=","value":10000}]'::jsonb,
   false, null, null, true, 70)
ON CONFLICT (policy_code) DO NOTHING
"""

_SEED_ACTIONS = [
    """INSERT INTO reward_policy_action (policy_id, action_type, value, ref_id, sort_order)
SELECT id, 'GRANT_EXP', 10, null, 0
  FROM reward_policy WHERE policy_code = 'MILEAGE_EXP'
  AND NOT EXISTS (SELECT 1 FROM reward_policy_action WHERE policy_id = reward_policy.id)""",

    """INSERT INTO reward_policy_action (policy_id, action_type, value, ref_id, sort_order)
SELECT id, 'GRANT_XP', 30, null, 0
  FROM reward_policy WHERE policy_code = 'MILEAGE_XP'
  AND NOT EXISTS (SELECT 1 FROM reward_policy_action WHERE policy_id = reward_policy.id)""",

    """INSERT INTO reward_policy_action (policy_id, action_type, value, ref_id, sort_order)
SELECT id, 'GRANT_XP', 100, null, 0
  FROM reward_policy WHERE policy_code = 'LEVELUP_REWARD'
  AND NOT EXISTS (SELECT 1 FROM reward_policy_action WHERE policy_id = reward_policy.id)""",

    """INSERT INTO reward_policy_action (policy_id, action_type, value, ref_id, sort_order)
SELECT id, 'GRANT_GOLD', 50, null, 1
  FROM reward_policy WHERE policy_code = 'LEVELUP_REWARD'
  AND NOT EXISTS (SELECT 1 FROM reward_policy_action a2 WHERE a2.policy_id = reward_policy.id AND a2.sort_order = 1)""",

    """INSERT INTO reward_policy_action (policy_id, action_type, value, ref_id, sort_order)
SELECT id, 'GRANT_BADGE', 0, 'badge_10km', 0
  FROM reward_policy WHERE policy_code = 'BADGE_10KM'
  AND NOT EXISTS (SELECT 1 FROM reward_policy_action WHERE policy_id = reward_policy.id)""",
]


def upgrade() -> None:
    op.execute("""
        ALTER TABLE sre_user
        ADD COLUMN IF NOT EXISTS total_exp_granted BIGINT NOT NULL DEFAULT 0
    """)

    op.execute("""
        ALTER TABLE reward_policy
        ADD COLUMN IF NOT EXISTS repeat_metric VARCHAR(40) NULL
    """)
    op.execute("""
        ALTER TABLE reward_policy
        ADD COLUMN IF NOT EXISTS repeat_metric_interval BIGINT NULL
    """)

    bind = op.get_bind()
    bind.exec_driver_sql(_SEED_POLICIES)
    for stmt in _SEED_ACTIONS:
        bind.exec_driver_sql(stmt)


def downgrade() -> None:
    op.execute("""
        DELETE FROM reward_policy_action
        WHERE policy_id IN (
            SELECT id FROM reward_policy
            WHERE policy_code IN ('MILEAGE_EXP','MILEAGE_XP','LEVELUP_REWARD','BADGE_10KM')
        )
    """)
    op.execute("""
        DELETE FROM reward_policy
        WHERE policy_code IN ('MILEAGE_EXP','MILEAGE_XP','LEVELUP_REWARD','BADGE_10KM')
    """)

    op.execute("ALTER TABLE reward_policy DROP COLUMN IF EXISTS repeat_metric_interval")
    op.execute("ALTER TABLE reward_policy DROP COLUMN IF EXISTS repeat_metric")
    op.execute("ALTER TABLE sre_user DROP COLUMN IF EXISTS total_exp_granted")
