"""제휴 광고 '게시중/론칭중' 노출 게이트 predicate (공용 헬퍼).

market.py GET /ads, biz.py /public/{id}, admin_api/biz.py list_biz_ads(launching),
admin_api/dashboard.py get_summary 4곳에서 공용으로 splat 한다.

원래는 APPROVED+is_active+게시기간의 순수 추출이었으나, init/151 에서 광고주 중간 검증
불변식을 추가했다: 소유 business_profile 이 있는 유료 광고는 verification_status='verified'
여야 노출된다(미verified 파트너 광고는 시퀀스에서 제외). owner_business_profile_id 가
NULL 인 레거시/하우스 광고([DEV] 시드 등)는 소유 파트너가 없으므로 게이트 면제.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.orm import aliased

from ..models import BusinessProfile, MarketplaceAd

# 게이트 EXISTS 서브쿼리 전용 alias — 소비처(list_admin_ads)가 BusinessProfile 을 외부
# FROM 에 두어도 서브쿼리가 이를 auto-correlate 하지 않도록 별칭으로 분리한다.
_bp = aliased(BusinessProfile)


def launching_ad_conditions(now: datetime) -> tuple[ColumnElement[bool], ...]:
    """APPROVED + is_active + 게시기간(starts_at/ends_at) 내 + 소유파트너 verified — '론칭중' 게이트.

    `.where(*conds)` 또는 `func.count()/func.sum().filter(*conds)` 어디든 splat 가능.
    `now` 는 호출부가 계산한 aware datetime 을 그대로 전달한다(이 함수는 시간을 만들지 않는다).
    """
    return (
        MarketplaceAd.review_status == "APPROVED",
        MarketplaceAd.is_active == True,
        or_(MarketplaceAd.starts_at.is_(None), MarketplaceAd.starts_at <= now),
        or_(MarketplaceAd.ends_at.is_(None), MarketplaceAd.ends_at >= now),
        or_(
            MarketplaceAd.owner_business_profile_id.is_(None),
            # aliased + correlate(MarketplaceAd): list_admin_ads 는 BusinessProfile 을 외부
            # outerjoin 에 이미 두므로, 서브쿼리가 BusinessProfile 을 외부로 auto-correlate 해
            # FROM 이 소실되는 500(InvalidRequestError)을 alias 로 끊는다.
            select(_bp.id)
            .where(
                _bp.id == MarketplaceAd.owner_business_profile_id,
                _bp.verification_status == "verified",
            )
            .correlate(MarketplaceAd)
            .exists(),
        ),
    )
