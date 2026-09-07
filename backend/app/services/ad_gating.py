"""제휴 광고 '게시중/론칭중' 노출 게이트 predicate (공용 헬퍼).

market.py GET /ads, biz.py /public/{id}, admin_api/biz.py list_biz_ads(launching),
admin_api/dashboard.py get_summary 4곳에서 공용으로 splat 한다.

원래는 APPROVED+is_active+게시기간의 순수 추출이었으나, init/151 에서 광고주 중간 검증
불변식을 추가했다: 소유 business_profile 이 있는 유료 광고는 verification_status='verified'
여야 노출된다(미verified 파트너 광고는 시퀀스에서 제외). owner_business_profile_id 가
NULL 인 레거시/하우스 광고([DEV] 시드 등)는 소유 파트너가 없으므로 게이트 면제.

260907_biz_ad_payment_contract_adr.md §9 T-1: 결제(subscription_status/paid_until) 조건 추가.
미입금(pending_payment) 광고가 무한정 노출되던 결함 수정 — 아래 유예기간 안에서만 예외.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.orm import aliased

from ..models import BusinessProfile, MarketplaceAd

# 게이트 EXISTS 서브쿼리 전용 alias — 소비처(list_admin_ads)가 BusinessProfile 을 외부
# FROM 에 두어도 서브쿼리가 이를 auto-correlate 하지 않도록 별칭으로 분리한다.
_bp = aliased(BusinessProfile)

# routers/biz.py 와 공유(원래 그쪽에 있었으나, 유예기간 영업일 판정을 VN 로컬 날짜로 통일하며
# 이쪽으로 옮겼다 — biz.py 가 modules.ads.application 경유로 이 모듈을 import 하므로 반대
# 방향으로 import 하면 순환참조가 생겨서 최소 이동으로 여기 둔다). biz.py 는 여기서 재수입한다.
_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
VN_TZ = _VN_TZ  # public export — biz.py 는 이 이름으로 import 한다(private 심볼 직접 참조 금지).

# ── 유예기간 정책 (260907 ADR §0-1) ─────────────────────────────────────────
# 신규 계약: 승인(starts_at) 후 N영업일까지는 pending_payment 여도 노출 허용.
NEW_CONTRACT_GRACE_BUSINESS_DAYS = 3
# 갱신: paid_until 만료 후 N영업일까지는 노출 허용(그 사이 재입금 유예).
RENEWAL_GRACE_BUSINESS_DAYS = 5

# 영업일 계산에서 제외할 휴일 구간(양끝 포함). 토·일은 이 목록과 무관하게 항상 제외된다.
# 베트남 Tết 등 정부 공식 발표 후 여기에 채워 넣는다. 비어 있으면 토·일만 제외.
AD_GRACE_HOLIDAY_RANGES: tuple[tuple[date, date], ...] = ()


def _is_business_day(d: date) -> bool:
    if d.weekday() >= 5:  # 토(5)·일(6)
        return False
    return not any(start <= d <= end for start, end in AD_GRACE_HOLIDAY_RANGES)


def add_business_days(base: datetime, n: int) -> datetime:
    """base 이후 n번째 영업일의 VN 로컬 자정 직전(23:59:59.999999)을 반환한다. 토·일 + 설정된 휴일 제외.

    AD_GRACE_HOLIDAY_RANGES 는 베트남 로컬 날짜로 채우는 값이라, 영업일/휴일 판정은 base 를
    VN 로컬로 변환한 날짜 기준이어야 한다(호출부는 UTC now 를 넘기므로 그대로 .date() 를 쓰면
    UTC 00:00~07:00 구간에서 VN 기준 하루가 밀린다).
    """
    d = base.astimezone(_VN_TZ).date()
    remaining = n
    while remaining > 0:
        d += timedelta(days=1)
        if _is_business_day(d):
            remaining -= 1
    return datetime.combine(d, time.max, tzinfo=_VN_TZ)


def grace_cutoff(now: datetime, business_days: int) -> datetime:
    """`add_business_days(base, business_days) >= now` 를 만족하는 가장 이른 base(자정 00:00).

    base 컬럼(starts_at/paid_until)이 이 값 이상이면 아직 유예기간 안이라는 뜻 — 즉
    `base_col >= grace_cutoff(now, N)` 이 `now <= add_business_days(base_col, N)` 의 등가 SQL
    비교식이다(add_business_days 가 base 에 대해 단조증가이므로 역방향 탐색으로 계산).
    """
    margin = business_days * 3 + sum((end - start).days + 1 for start, end in AD_GRACE_HOLIDAY_RANGES) + 14
    candidate = datetime.combine(now.astimezone(_VN_TZ).date(), time.min, tzinfo=_VN_TZ) - timedelta(days=margin)
    while add_business_days(candidate, business_days) < now:
        candidate += timedelta(days=1)
    return candidate


def is_payment_ok(
    *,
    owner_business_profile_id: object | None,
    subscription_status: str,
    paid_until: datetime | None,
    starts_at: datetime | None,
    now: datetime,
) -> bool:
    """launching_ad_conditions() 의 결제 조건 or_() 절과 동일 규칙의 순수함수 버전.

    biz.py `_is_launching_ad()`(파이썬 객체 판정)가 이 함수를 호출해 SQL 게이트와 판정이
    어긋나지 않게 한다. SQL 쪽 or_() 절은 WHERE 절이라 이 함수를 직접 호출할 수 없으므로
    별도로 유지하되, 규칙을 바꿀 땐 두 곳을 함께 고쳐야 한다(아래 or_() 절 주석 참조).
    """
    if owner_business_profile_id is None:
        return True
    if subscription_status == "active":
        return paid_until is not None and paid_until >= grace_cutoff(now, RENEWAL_GRACE_BUSINESS_DAYS)
    if subscription_status == "pending_payment":
        return starts_at is not None and starts_at >= grace_cutoff(now, NEW_CONTRACT_GRACE_BUSINESS_DAYS)
    return False


def launching_ad_conditions(now: datetime) -> tuple[ColumnElement[bool], ...]:
    """APPROVED + is_active + 게시기간(starts_at/ends_at) 내 + 소유파트너 verified + 유료상태 — '론칭중' 게이트.

    `.where(*conds)` 또는 `func.count()/func.sum().filter(*conds)` 어디든 splat 가능.
    `now` 는 호출부가 계산한 aware datetime 을 그대로 전달한다(이 함수는 시간을 만들지 않는다).
    """
    renewal_cutoff = grace_cutoff(now, RENEWAL_GRACE_BUSINESS_DAYS)
    new_contract_cutoff = grace_cutoff(now, NEW_CONTRACT_GRACE_BUSINESS_DAYS)
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
        or_(
            # 이 or_() 블록은 is_payment_ok() 와 동일 규칙이어야 한다(biz.py `_is_launching_ad()`
            # 가 그 순수함수를 호출). 규칙을 바꿀 땐 두 곳을 함께 고칠 것.
            # owner_business_profile_id NULL(하우스/레거시 광고)은 계약 상대가 없어 입금
            # 개념이 없다 — 위 verified 면제와 동일 조건으로 결제 게이트도 면제(대표 결정).
            MarketplaceAd.owner_business_profile_id.is_(None),
            # active + paid_until 미래, 또는 만료 후 갱신 유예기간 이내.
            and_(
                MarketplaceAd.subscription_status == "active",
                MarketplaceAd.paid_until.isnot(None),
                MarketplaceAd.paid_until >= renewal_cutoff,
            ),
            # 신규계약 미입금 + 승인 후 유예기간 이내.
            and_(
                MarketplaceAd.subscription_status == "pending_payment",
                MarketplaceAd.starts_at.isnot(None),
                MarketplaceAd.starts_at >= new_contract_cutoff,
            ),
        ),
    )
