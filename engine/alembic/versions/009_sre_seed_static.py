"""정적 시드: tier_definition, action_definition, abuse_rule, reward_partner, reward_catalog

Revision ID: sre009
Revises: sre008
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre009"
down_revision: Union[str, None] = "sre008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── tier_definition (5행) ─────────────────────────────────
    op.execute("""
        INSERT INTO tier_definition (tier_code, tier_name, min_lifetime_rp, min_diversity_count, sort_order) VALUES
          ('ROOKIE',  'Rookie',       0,      0, 1),
          ('RIDER',   'Rider',     5000,      2, 2),
          ('VETERAN', 'Veteran',  25000,      3, 3),
          ('PRO',     'Pro',     100000,      4, 4),
          ('LEGEND',  'Legend',  500000,      5, 5)
    """)

    # ── action_definition (12종) ──────────────────────────────
    op.execute("""
        INSERT INTO action_definition (action_code, category_code, display_name, base_rp, daily_count_limit) VALUES
          ('RIDE_KM',             'RIDING',    '주행 거리 1km',        1,    NULL),
          ('QUEST_COMPLETE',      'RIDING',    '퀘스트 완료',         50,    NULL),
          ('STREAK_7',            'RIDING',    '7일 연속 라이딩',    500,       1),
          ('GROUP_RIDE',          'RIDING',    '그룹 라이딩',         20,    NULL),
          ('MAINTENANCE_RECEIPT', 'MAINT',     '정비 영수증 인증',   200,       1),
          ('FUEL_RECEIPT',        'MAINT',     '주유 영수증 인증',    50,       1),
          ('MARKET_LISTING',      'MARKET',    '중고 부품 등록',      30,       3),
          ('MARKET_SUCCESS',      'MARKET',    '중고 거래 성공',     500,    NULL),
          ('REVIEW_PHOTO',        'COMMUNITY', '리뷰 사진 작성',     100,       3),
          ('REFERRAL',            'COMMUNITY', '친구 초대 성공',     250,    NULL),
          ('SHARE_SNS',           'COMMUNITY', 'SNS 공유',            30,       1),
          ('DELIVERY_RECEIPT',    'DELIVERY',  '배달 영수증 인증',     5,     100)
    """)

    # ── abuse_rule (4종) ──────────────────────────────────────
    op.execute("""
        INSERT INTO abuse_rule (rule_code, rule_name, severity, condition_json, action) VALUES
          ('DAILY_RP_CAP',      '일일 RP 상한',         'MEDIUM', '{"max_per_day": 250}',                   'REDUCE'),
          ('NEW_ACCOUNT_50',    '신규 3일 50%% 적립',   'LOW',    '{"within_days": 3, "multiplier": 0.5}',  'REDUCE'),
          ('GPS_SPEED_RANGE',   'GPS 속도 5~80 km/h',  'HIGH',   '{"min_kmh": 5, "max_kmh": 80}',          'REJECT'),
          ('DUPLICATE_RECEIPT', '영수증 중복 OCR',      'HIGH',   '{"hash_window_days": 30}',               'REJECT')
    """)

    # ── reward_partner (3종) ──────────────────────────────────
    op.execute("""
        INSERT INTO reward_partner (partner_code, partner_name, integration_type, is_active) VALUES
          ('INTERNAL', '자체 디지털 굿즈',     'INTERNAL', TRUE),
          ('VIETTEL',  'Viettel 데이터 충전', 'TELCO',    TRUE),
          ('GOTIT',    'Got It 베트남',       'GOTIT',    TRUE)
    """)

    # ── reward_catalog (6종) ──────────────────────────────────
    op.execute("""
        INSERT INTO reward_catalog (partner_id, item_code, item_name, category_code, required_rp, face_value_vnd, is_active)
        VALUES
          ((SELECT partner_id FROM reward_partner WHERE partner_code='INTERNAL'),
           'BADGE_FOUNDER',        '창립 멤버 한정 뱃지',         'BADGE',    200,    NULL, TRUE),
          ((SELECT partner_id FROM reward_partner WHERE partner_code='VIETTEL'),
           'DATA_1GB',             'Viettel 데이터 1GB',          'TELCO',    300,   14000, TRUE),
          ((SELECT partner_id FROM reward_partner WHERE partner_code='INTERNAL'),
           'FRAME_NEON',           '네온 프로필 프레임',           'COSMETIC', 800,    NULL, TRUE),
          ((SELECT partner_id FROM reward_partner WHERE partner_code='GOTIT'),
           'GOTIT_50K',            'Got It 50K VND',              'GIFTCARD', 1200,  50000, TRUE),
          ((SELECT partner_id FROM reward_partner WHERE partner_code='GOTIT'),
           'GOTIT_100K',           'Got It 100K VND',             'GIFTCARD', 3000, 100000, TRUE),
          ((SELECT partner_id FROM reward_partner WHERE partner_code='INTERNAL'),
           'BADGE_LEGEND_FIRST100','Legend 1호~100호 한정 뱃지',  'BADGE',    7000,   NULL, TRUE)
    """)


def downgrade() -> None:
    op.execute("DELETE FROM reward_catalog WHERE item_code IN ('BADGE_FOUNDER','DATA_1GB','FRAME_NEON','GOTIT_50K','GOTIT_100K','BADGE_LEGEND_FIRST100')")
    op.execute("DELETE FROM reward_partner WHERE partner_code IN ('INTERNAL','VIETTEL','GOTIT')")
    op.execute("DELETE FROM abuse_rule WHERE rule_code IN ('DAILY_RP_CAP','NEW_ACCOUNT_50','GPS_SPEED_RANGE','DUPLICATE_RECEIPT')")
    op.execute("DELETE FROM action_definition WHERE action_code IN ('RIDE_KM','QUEST_COMPLETE','STREAK_7','GROUP_RIDE','MAINTENANCE_RECEIPT','FUEL_RECEIPT','MARKET_LISTING','MARKET_SUCCESS','REVIEW_PHOTO','REFERRAL','SHARE_SNS','DELIVERY_RECEIPT')")
    op.execute("DELETE FROM tier_definition WHERE tier_code IN ('ROOKIE','RIDER','VETERAN','PRO','LEGEND')")
