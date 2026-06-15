"""마일리지 보상을 RP+Gold+EXP 3종 직접지급으로 확장

- MILEAGE_XP 정책의 지급 통화를 XP(GRANT_XP) → RP(GRANT_RP)로 전환 (020 XP 개명을 되돌리지 않고 마일리지 한정 RP 명칭 사용)
- 마일리지에 거리비례 GOLD 직접지급 액션 추가 (기존엔 레벨업 때만 지급)
- 값은 구조 우선·밸런싱 후속 (placeholder)

Revision ID: sre054
Revises: sre053
Create Date: 2026-06-10
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre054"
down_revision: Union[str, None] = "sre053"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 1) MILEAGE_XP 의 RP 지급 액션: GRANT_XP → GRANT_RP (current_balance 적립처는 동일, 명칭만 RP)
_RENAME_XP_TO_RP = """
UPDATE reward_policy_action
   SET action_type = 'GRANT_RP'
 WHERE action_type = 'GRANT_XP'
   AND policy_id IN (SELECT id FROM reward_policy WHERE policy_code = 'MILEAGE_XP')
"""

# 2) 정책 메타 갱신 (RP+Gold 지급으로 의미 명확화)
_UPDATE_POLICY_META = """
UPDATE reward_policy
   SET name = '마일리지 RP+Gold 보상',
       description = '매 5km 주행 시 RP 30 + Gold 20 지급'
 WHERE policy_code = 'MILEAGE_XP'
"""

# 3) 거리비례 GOLD 직접지급 액션 추가 (sort_order 1, placeholder 20)
_ADD_MILEAGE_GOLD = """
INSERT INTO reward_policy_action (policy_id, action_type, value, ref_id, sort_order)
SELECT id, 'GRANT_GOLD', 20, null, 1
  FROM reward_policy WHERE policy_code = 'MILEAGE_XP'
  AND NOT EXISTS (
    SELECT 1 FROM reward_policy_action a2
     WHERE a2.policy_id = reward_policy.id AND a2.sort_order = 1
  )
"""


def upgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql(_RENAME_XP_TO_RP)
    bind.exec_driver_sql(_UPDATE_POLICY_META)
    bind.exec_driver_sql(_ADD_MILEAGE_GOLD)


def downgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("""
        DELETE FROM reward_policy_action
         WHERE sort_order = 1
           AND action_type = 'GRANT_GOLD'
           AND policy_id IN (SELECT id FROM reward_policy WHERE policy_code = 'MILEAGE_XP')
    """)
    bind.exec_driver_sql("""
        UPDATE reward_policy
           SET name = '마일리지 XP 보상',
               description = '매 5km 주행 시 XP 30 지급'
         WHERE policy_code = 'MILEAGE_XP'
    """)
    bind.exec_driver_sql("""
        UPDATE reward_policy_action
           SET action_type = 'GRANT_XP'
         WHERE action_type = 'GRANT_RP'
           AND policy_id IN (SELECT id FROM reward_policy WHERE policy_code = 'MILEAGE_XP')
    """)
