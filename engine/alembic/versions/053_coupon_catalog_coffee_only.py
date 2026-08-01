"""기프티콘 카탈로그 정리 — 커피 쿠폰 1종만 유지

요청: 기프티콘 샵 리스트 전부 제거 후 '커피 쿠폰'(500 RP) 1종만 추가.
- 기존 카탈로그 6종(뱃지/프레임/데이터/Got It 2종)을 완전 삭제(DELETE).
- 선행 의존: reward_redemption(테스트 교환 이력)이 삭제 대상 카탈로그를 FK 참조 → 먼저 제거.
- 커피 쿠폰은 INTERNAL 파트너로 발급 → 구매 즉시 voucher_code(INT-xxxx) + FULFILLED
  (내 쿠폰함 QR 다운로드 더미 동작용). 실제 제휴 발급은 추후 파트너 어댑터로 교체.
- 썸네일: system/coupons/coffee-coupon.png (BFF build_imgproxy_url 경유).

asyncpg 규약: 한 op.execute 호출당 단일 SQL 문장.

Revision ID: sre053
Revises: sre052
Create Date: 2026-06-09
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sre053"
down_revision: Union[str, None] = "sre052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) 기존 교환 이력 제거 (FK fk_red_catalog 가 카탈로그 삭제를 막으므로 선행)
    op.execute("DELETE FROM reward_redemption")
    # 2) 기존 카탈로그 전체 삭제
    op.execute("DELETE FROM reward_catalog")
    # 3) 커피 쿠폰 1종 추가 (INTERNAL 파트너 = 즉시 발급)
    op.execute(
        """
        INSERT INTO reward_catalog
            (partner_id, item_code, item_name, category_code,
             required_xp, face_value_vnd, monthly_quota, monthly_issued,
             is_active, thumbnail_asset_uri)
        SELECT p.partner_id, 'COFFEE_COUPON', '커피 쿠폰', 'GIFTCARD',
               500, 50000, 200, 0,
               TRUE, 'system/coupons/coffee-coupon.png'
        FROM reward_partner p
        WHERE p.partner_code = 'INTERNAL'
        """
    )


def downgrade() -> None:
    # 데이터 시드 정리 마이그 — 비가역(원본 6종 복원 불가). 커피 쿠폰만 제거.
    op.execute("DELETE FROM reward_catalog WHERE item_code = 'COFFEE_COUPON'")
