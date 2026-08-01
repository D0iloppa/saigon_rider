"""가챠 확률 리밸런스를 Engine schema migration으로 소유한다.

Revision ID: sre059
Revises: sre058
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre059"
down_revision: Union[str, None] = "sre058"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("""
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'tier_definition'
              AND column_name = 'min_lifetime_rp'
          ) THEN
            ALTER TABLE tier_definition RENAME COLUMN min_lifetime_rp TO min_lifetime_xp;
          END IF;
        END $$
    """)
    # sre031의 item_collection TRUNCATE CASCADE가 fresh chain에서 가챠 seed를
    # 제거할 수 있으므로 최종 정책값으로 복구한다. 기존 DB는 conflict 시 보존한다.
    bind.exec_driver_sql("""
        INSERT INTO gacha_definition (
          gacha_code, display_name, description, cost_currency, cost_per_pull,
          cost_per_10_pull, collection_filter, drop_table, pity_threshold,
          pity_guarantee_rarity, pity_resets_with_season, status, is_listed, sort_order
        ) VALUES
        ('BASIC_PULL','Garage 일반 뽑기','Common~Rare','GP',150,1350,NULL,
         '{"weighted":[{"rarity":"C","weight":70},{"rarity":"R","weight":28},{"rarity":"E","weight":2}],"guaranteed_at_10":"R","duplicate_policy":"REFUND_GP"}'::jsonb,
         NULL,NULL,FALSE,'ACTIVE',TRUE,10),
        ('PREMIUM_PULL','Garage 프리미엄 뽑기','Rare~Epic','GP',1050,9450,NULL,
         '{"weighted":[{"rarity":"R","weight":65},{"rarity":"E","weight":33},{"rarity":"L","weight":2}],"guaranteed_at_10":"E","duplicate_policy":"REFUND_GP"}'::jsonb,
         100,'L',FALSE,'ACTIVE',TRUE,20),
        ('GC_PREMIUM_PULL','크리스탈 뽑기','Rare~Mythic','GC',30,270,NULL,
         '{"weighted":[{"rarity":"R","weight":91},{"rarity":"E","weight":5},{"rarity":"L","weight":3},{"rarity":"M","weight":1}],"guaranteed_at_10":"E","duplicate_policy":"REFUND_GC"}'::jsonb,
         80,'L',FALSE,'ACTIVE',TRUE,30),
        ('SEASON_PULL','시즌 한정 뽑기','시즌 컬렉션 전용','GC',25,225,'TET_FESTIVAL',
         '{"weighted":[{"rarity":"R","weight":91},{"rarity":"E","weight":5},{"rarity":"L","weight":3},{"rarity":"M","weight":1}],"guaranteed_at_10":"E","duplicate_policy":"REFUND_GC"}'::jsonb,
         60,'L',TRUE,'ACTIVE',TRUE,40),
        ('LEGEND_PULL','전설 뽑기','Epic~Mythic','GC',80,720,NULL,
         '{"weighted":[{"rarity":"E","weight":96},{"rarity":"L","weight":3},{"rarity":"M","weight":1}],"guaranteed_at_10":"L","duplicate_policy":"REFUND_GC"}'::jsonb,
         50,'M',FALSE,'ACTIVE',TRUE,50)
        ON CONFLICT (gacha_code) DO NOTHING
    """)
    weights = {
        "GC_PREMIUM_PULL": '[{"rarity":"R","weight":91},{"rarity":"E","weight":5},{"rarity":"L","weight":3},{"rarity":"M","weight":1}]',
        "SEASON_PULL": '[{"rarity":"R","weight":91},{"rarity":"E","weight":5},{"rarity":"L","weight":3},{"rarity":"M","weight":1}]',
        "LEGEND_PULL": '[{"rarity":"E","weight":96},{"rarity":"L","weight":3},{"rarity":"M","weight":1}]',
    }
    for code, weighted in weights.items():
        bind.exec_driver_sql(
            "UPDATE gacha_definition "
            f"SET drop_table = jsonb_set(drop_table, '{{weighted}}', '{weighted}'::jsonb) "
            f"WHERE gacha_code = '{code}'"
        )


def downgrade() -> None:
    # 확률 정책 데이터는 안전한 자동 역변환이 없으므로 schema downgrade에서 보존한다.
    pass
