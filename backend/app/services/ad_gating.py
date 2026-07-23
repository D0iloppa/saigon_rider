"""제휴 광고 '게시중/론칭중' 노출 게이트 predicate (공용 헬퍼).

market.py GET /ads, biz.py /public/{id}, admin_api/biz.py list_biz_ads(launching),
admin_api/dashboard.py get_summary 4곳에 동일 조건이 복붙돼 있던 것을 추출한 것.
순수 추출 리팩토링 — 조건의 의미·순서는 원본과 바이트 단위로 동일해야 한다.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ColumnElement, or_

from ..models import MarketplaceAd


def launching_ad_conditions(now: datetime) -> tuple[ColumnElement[bool], ...]:
    """APPROVED + is_active + 게시기간(starts_at/ends_at) 내 — '론칭중' 게이트.

    `.where(*conds)` 또는 `func.count()/func.sum().filter(*conds)` 어디든 splat 가능.
    `now` 는 호출부가 계산한 aware datetime 을 그대로 전달한다(이 함수는 시간을 만들지 않는다).
    """
    return (
        MarketplaceAd.review_status == "APPROVED",
        MarketplaceAd.is_active == True,
        or_(MarketplaceAd.starts_at.is_(None), MarketplaceAd.starts_at <= now),
        or_(MarketplaceAd.ends_at.is_(None), MarketplaceAd.ends_at >= now),
    )
