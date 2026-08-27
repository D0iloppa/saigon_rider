import re
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from enum import StrEnum
from typing import Generic, Literal, TypeVar
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from .utils import build_imgproxy_url, resolve_avatar_url, resolve_feed_image_url

T = TypeVar("T")

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

# D-21(감사 260817): price_vnd/가격제안 amount 공용 상한 — 200억 VND.
# 전역 단일 상한으로는 카테고리별 오입력(예: 오토바이 컬럼에 소파 100억 VND)까지는 못 잡는다
# (진짜 해답은 카테고리 밴드, W2 예정). 이 상수는 그 전 단계로 극단값만 차단하는 오버플로 가드다.
_MAX_PRICE_VND = 20_000_000_000

# 신고 첨부 사진 상한(대표 지적 2026-08-18) — 매물 등록 MAX_IMAGES(frontend MarketCreate.tsx, 10장)를
# 참고하되, 증빙 사진은 매물 사진보다 적게 필요해 5장으로 잡는다(무제한 금지).
_MAX_REPORT_IMAGES = 5


def _compute_is_open(business_hours: str) -> bool | None:
    """'HH:MM - HH:MM' 형식 파싱 → 현재 VN 시각 기준 영업 중 여부. '24시간'이면 항상 True."""
    if "24" in business_hours:
        return True
    m = re.match(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})", business_hours)
    if not m:
        return None
    now = datetime.now(_VN_TZ).time()
    open_t = time(int(m.group(1)), int(m.group(2)))
    close_t = time(int(m.group(3)), int(m.group(4)))
    return open_t <= now < close_t


# ── 공통 ─────────────────────────────────────────────────────────


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


# ── Master (District / RiderType / SafetyGrade) ───────────────────


class DistrictOut(BaseModel):
    id: int
    code: str
    name_ko: str
    name_vi: str
    name_en: str
    image_content_id: UUID | None = None
    image_url: str | None = None
    center_lat: float | None = None
    center_lng: float | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def resolve_image_from_content(cls, data):
        image_content = getattr(data, "image_content", None)
        if image_content is not None and image_content.file_path:
            return {
                "id": data.id,
                "code": data.code,
                "name_ko": data.name_ko,
                "name_vi": data.name_vi,
                "name_en": data.name_en,
                "image_content_id": data.image_content_id,
                "image_url": build_imgproxy_url(image_content.file_path),
                "center_lat": data.center_lat,
                "center_lng": data.center_lng,
            }
        return data


class WardOut(BaseModel):
    id: int
    code: str
    city_code: str
    name_vi: str
    name_en: str
    name_ko: str | None = None
    center_lat: float | None = None
    center_lng: float | None = None
    district: DistrictOut | None = None

    model_config = {"from_attributes": True}


class RiderTypeOut(BaseModel):
    id: int
    code: str
    name_ko: str
    name_vi: str
    name_en: str
    icon: str | None

    model_config = {"from_attributes": True}


class SafetyGradeOut(BaseModel):
    id: int
    code: str
    name_ko: str
    name_vi: str
    name_en: str

    model_config = {"from_attributes": True}


# ── 거래 플랫폼 (Marketplace, SGR-287) ────────────────────────────


class MarketplaceCategoryOut(BaseModel):
    id: int
    code: str
    name_ko: str
    name_vi: str
    name_en: str
    icon: str | None = None
    parent_id: int | None = None
    depth: int = 0
    sort_order: int = 0

    model_config = {"from_attributes": True}


class DistrictBrief(BaseModel):
    id: int
    name_ko: str
    name_vi: str
    name_en: str


class SellerBrief(BaseModel):
    id: UUID
    nickname: str | None = None
    avatar_url: str | None = None
    level: int = 1
    manner_temp: float = 36.5
    review_count: int = 0
    avg_rating: float | None = None
    sold_count: int = 0
    is_following: bool = False
    is_phone_verified: bool = False
    phone_masked: str | None = None


class MarketplaceListingCard(BaseModel):
    id: UUID
    seller_id: UUID | None = None
    title: str
    description: str | None = None
    price_vnd: int
    original_price_vnd: int | None = None
    is_negotiable: bool
    status: str
    category_code: str | None = None
    thumbnail_url: str | None = None
    # T-1: 업체 계정 매물 — 있으면 프론트가 판매자를 업체명으로 표기한다.
    business_profile_id: UUID | None = None
    business_name: str | None = None
    district: DistrictBrief | None = None
    like_count: int = 0
    chat_count: int = 0  # dm_conversations(context_type='listing') 집계 — 목록 API 만 채움
    bumped_at: datetime
    distance_m: int | None = None
    lat: float | None = None
    lng: float | None = None


class MarketplaceListingDetail(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    price_vnd: int
    original_price_vnd: int | None = None
    is_negotiable: bool
    status: str
    category: MarketplaceCategoryOut | None = None
    image_urls: list[str] = []
    # F-6/F-8: 매물 수정 화면이 기존 사진을 재업로드 없이 유지하려면 content id가 필요 (image_urls 와 순서 대응)
    image_content_ids: list[UUID] = []
    seller: SellerBrief
    district: DistrictBrief | None = None
    like_count: int = 0
    view_count: int = 0
    created_at: datetime
    bumped_at: datetime
    liked: bool = False
    other_listings: list[MarketplaceListingCard] = []
    translation_failed: bool = False
    # T-1: 업체 계정 매물 — 있으면 프론트가 판매자를 업체명으로 표기한다.
    business_profile_id: UUID | None = None
    business_name: str | None = None
    # 016 §4-6 #41: 서류·명의 상태 — 선택 표시(D-28=(a)), None=미기재. MISMATCH 는 상세 화면 배지로 노출.
    paper_status: str | None = None
    plate_province: str | None = None
    # 016 §4-7 #42: 미응답 거래결과핑 존재 여부 — 판매자 본인 조회 시에만 True 가 의미있다
    # (market.py 가 판매자가 아니어도 계산은 하지만 프론트는 본인 매물에서만 배너를 띄운다).
    pending_deal_ping: bool = False
    # R-2(017 §12-B): 내가 이미 신고한 매물인가 — 신고 버튼을 미리 비활성화해 중복 신고 409 를
    # UI 단계에서 막는다. 이게 없으면 사용자는 눌러봐야만 알 수 있었다(2026-08-18 대표 지적).
    # 비로그인은 항상 False.
    is_reported_by_me: bool = False
    # W7-3(260820) — is_reported_by_me 는 취소된 신고여도 True 라 "신고함" 문구가 거짓말을 했다
    # (실기기 지적). 신고가 CANCELLED 상태면 True — 프론트가 "신고함"/"신고 취소함" 을 구분한다.
    report_cancelled_by_me: bool = False


class MarketplaceListingCreateRequest(BaseModel):
    seller_id: UUID
    category_id: int | None = None
    title: str
    description: str | None = None
    # MKT-9/DB-2: 음수가 금지 (0 = 나눔). Q-2/D-21(감사 260817): 상한 200억 VND —
    # 자릿수 오입력 방어용 가드레일(오버플로 가드, 카테고리별 오입력 방어는 W2 밴드에서 처리).
    price_vnd: int = Field(0, ge=0, le=_MAX_PRICE_VND)
    is_negotiable: bool = False
    district_id: int | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    image_content_ids: list[UUID] = []
    # T-1: 검증된(verified) 업체 프로필로 등록 시 개인 휴대폰 인증 게이트를 대체한다. 세션 유저가
    # 소유(user_id)한 APPROVED 프로필이어야 한다 — market.py create_listing 이 검증.
    # (verification_status=verified 는 2026-08-11 대표 결정으로 초기 파일럿 기간엔 미요구)
    business_profile_id: UUID | None = None
    # 016 §4-6 #41: 서류·명의 — 선택 표시(D-28=(a)), 미기재 허용(등록 마찰 최소화).
    paper_status: Literal["MATCH", "MISMATCH", "NONE"] | None = None
    plate_province: str | None = None


class MarketplaceListingCreated(BaseModel):
    id: UUID


class MarketplaceBumpResult(BaseModel):
    id: UUID
    bumped_at: datetime


class MarketplaceReportCreateRequest(BaseModel):
    reason: str
    note: str | None = None
    # 코멘트 + 사진 첨부(B안, 대표 지적 2026-08-18) — 선업로드 방식(/contents/upload 로 먼저
    # 올린 content_id 를 붙인다), 둘 다 선택.
    image_content_ids: list[UUID] = Field(default_factory=list, max_length=_MAX_REPORT_IMAGES)


# ── 광고 성과 계측 (정본 §5 #6, D-1/D-19 — 260817_commercial_readiness_audit) ──────────


class AdEventType(StrEnum):
    """`ad_events.event_type` CHECK 제약(init/153+174)과 1:1. proximity 전용 2종
    (proximity_impression/proximity_visit)은 기존 경로(routers/proximity.py:137)만 쓰므로
    이 수집 API 의 카탈로그에는 넣지 않는다."""

    IMPRESSION = "impression"
    CLICK = "click"
    CTA_CALL = "cta_call"
    CTA_FOLLOW = "cta_follow"
    CTA_FAVORITE = "cta_favorite"
    CTA_REVIEW = "cta_review"
    CTA_NEWS_VIEW = "cta_news_view"
    CTA_PROFILE_ENTER = "cta_profile_enter"
    CTA_SHARE = "cta_share"


class AdEventSurface(StrEnum):
    """D-19(001_DECISIONS.md §3) 확정 카탈로그 중 이 수집 API 가 받는 6종.
    `proximity` 는 근접광고 전용 기존 INSERT 경로(proximity.py:137)가 이미 쓰고 있어 제외 —
    새 값을 추가할 땐 여기 멤버 하나만 늘리면 된다(DB CHECK 없음, 코드가 카탈로그의 SoT)."""

    MARKET_FEED = "market_feed"
    MARKET_TOP = "market_top"
    HOME_CARD = "home_card"
    HOME_EMPTY = "home_empty"
    AD_DETAIL = "ad_detail"
    BIZ_PROFILE = "biz_profile"


class AdEventIn(BaseModel):
    # code-review high #5: business_profile_id 는 받지 않는다 — 클라이언트가 임의 업체 ID 를
    # 지정해 CTR/CVR 등 광고주 지표를 다른 업체로 귀속시킬 수 있었다(귀속 위조). 서버가
    # ad_id 로부터 owner_business_profile_id 를 유도한다(routers/market.py post_ad_events).
    ad_id: UUID
    event_type: AdEventType
    surface: AdEventSurface
    occurred_at: AwareDatetime | None = None


class AdEventsIngestRequest(BaseModel):
    """배치 전송 — 스크롤당 다발하는 노출을 1건씩 POST 하면 요청이 폭주하므로 배열로 받는다.
    상한 20은 ai-docs/spec/ad-performance-metrics.md §5 의 "5s debounce, 최대 20건" 클라이언트
    설계와 맞춘 서버측 남용 방어(D-1 — 봇 필터 등은 범위 밖, 개수 상한만)."""

    events: list[AdEventIn] = Field(..., min_length=1, max_length=20)


# ── 퍼널 계측 (정본 §5 #5, D-18(a) — 260817_commercial_readiness_audit) ──────────────


class FunnelEventType(StrEnum):
    """`funnel_events.event_type` 값 카탈로그 — DB CHECK 없음, 이 Enum 이 SoT(ad_events.surface 의
    D-19 처리와 동일 이유: 값 추가가 마이그레이션을 부르지 않게). 서버측 요청 처리 지점에서만
    발화하는 내부 이벤트라 클라이언트 요청 바디로 노출되지 않는다(AdEventType 과 달리 pydantic
    검증 대상이 아니라 services/funnel_events.py 호출부의 파이썬 값)."""

    SIGNUP = "signup"
    LISTING_VIEW = "listing_view"
    LISTING_CREATE = "listing_create"
    INQUIRY = "inquiry"
    PRICE_OFFER = "price_offer"
    APPOINTMENT = "appointment"
    TRADE_COMPLETE = "trade_complete"
    REVIEW = "review"
    SEARCH = "search"


class ReportCreateRequest(BaseModel):
    """통합 신고 접수 (유저/DM 신고 공용) — reports 테이블 적재."""

    reason: str
    note: str | None = None


# ── 이슈 운영 — L5 (013_ISSUE_OPS_SYSTEM_4PERSONA / 016 §8, init/185) ────────────────


class IssueSeverity(StrEnum):
    """SEV1(최상위)~SEV4. reports 는 기존 `_REASON_PRIORITY_HOURS`(admin_api/reports.py)에서
    파생하고(신규 컬럼 없음 — 016 §8-3), support_tickets 는 category 로부터 기본값을 파생하거나
    트리아지 시 직접 지정한다."""

    SEV1 = "SEV1"
    SEV2 = "SEV2"
    SEV3 = "SEV3"
    SEV4 = "SEV4"


class IssueSource(StrEnum):
    """유입 채널 — 013 §1 P1(모든 유입은 하나의 큐로 수렴, 채널은 source 필드일 뿐)."""

    APP = "APP"  # 신고 버튼·일반 문의
    BIZ = "BIZ"  # #27 업체 전용 채널
    EXTERNAL = "EXTERNAL"  # #25 외부(규제기관·앱스토어 리뷰 등) 수기 등록


class IssuePersona(StrEnum):
    """013 §2 4관점."""

    USER = "USER"
    BIZ = "BIZ"
    OPS = "OPS"


class IssueCategory(StrEnum):
    """013 §2 / 016 §8-2 사고 유형 taxonomy — support_tickets.category 값 카탈로그(SoT).
    DB CHECK 없음(값 추가가 마이그레이션을 부르지 않도록 — funnel_events.event_type 관례 승계)."""

    # 구매자
    B_FRAUD_PREPAY = "B-FRAUD-PREPAY"
    B_FAKE_LISTING = "B-FAKE-LISTING"
    B_STALE = "B-STALE"
    B_BAIT_PRICE = "B-BAIT-PRICE"
    B_STOLEN = "B-STOLEN"
    B_NOSHOW = "B-NOSHOW"
    B_HARASS = "B-HARASS"
    B_PII = "B-PII"
    B_BUG = "B-BUG"
    # 판매자
    S_APPEAL = "S-APPEAL"
    S_FALSE_REPORT = "S-FALSE-REPORT"
    S_NOSHOW = "S-NOSHOW"
    S_LOWBALL = "S-LOWBALL"
    S_HIJACK = "S-HIJACK"
    S_PHOTO_THEFT = "S-PHOTO-THEFT"
    S_BAD_REVIEW = "S-BAD-REVIEW"
    S_POSTSALE = "S-POSTSALE"
    # 비즈니스 파트너
    P_NOSERVE = "P-NOSERVE"
    P_BILLING = "P-BILLING"
    P_CREATIVE = "P-CREATIVE"
    P_IMPERSONATE = "P-IMPERSONATE"
    P_BAD_REVIEW = "P-BAD-REVIEW"
    P_REPORT_DOUBT = "P-REPORT-DOUBT"
    P_CANCEL = "P-CANCEL"
    # 운영자(플랫폼)
    O_OUTAGE = "O-OUTAGE"
    O_BACKLOG = "O-BACKLOG"
    O_DATA_LEAK = "O-DATA-LEAK"
    O_MASS_ERROR = "O-MASS-ERROR"
    O_REGULATOR = "O-REGULATOR"
    O_ABUSE_SURGE = "O-ABUSE-SURGE"
    O_STORE_REVIEW = "O-STORE-REVIEW"


# 016 §8-2 표의 심각도 그대로 — 새 분류 기준을 만들지 않는다.
ISSUE_CATEGORY_SEVERITY: dict[str, str] = {
    IssueCategory.B_FRAUD_PREPAY: IssueSeverity.SEV1,
    IssueCategory.B_FAKE_LISTING: IssueSeverity.SEV3,
    IssueCategory.B_STALE: IssueSeverity.SEV4,
    IssueCategory.B_BAIT_PRICE: IssueSeverity.SEV3,
    IssueCategory.B_STOLEN: IssueSeverity.SEV1,
    IssueCategory.B_NOSHOW: IssueSeverity.SEV4,
    IssueCategory.B_HARASS: IssueSeverity.SEV2,
    IssueCategory.B_PII: IssueSeverity.SEV1,
    IssueCategory.B_BUG: IssueSeverity.SEV3,
    IssueCategory.S_APPEAL: IssueSeverity.SEV2,
    IssueCategory.S_FALSE_REPORT: IssueSeverity.SEV3,
    IssueCategory.S_NOSHOW: IssueSeverity.SEV4,
    IssueCategory.S_LOWBALL: IssueSeverity.SEV4,
    IssueCategory.S_HIJACK: IssueSeverity.SEV1,
    IssueCategory.S_PHOTO_THEFT: IssueSeverity.SEV3,
    IssueCategory.S_BAD_REVIEW: IssueSeverity.SEV4,
    IssueCategory.S_POSTSALE: IssueSeverity.SEV3,
    IssueCategory.P_NOSERVE: IssueSeverity.SEV2,
    IssueCategory.P_BILLING: IssueSeverity.SEV2,
    IssueCategory.P_CREATIVE: IssueSeverity.SEV3,
    IssueCategory.P_IMPERSONATE: IssueSeverity.SEV1,
    IssueCategory.P_BAD_REVIEW: IssueSeverity.SEV3,
    IssueCategory.P_REPORT_DOUBT: IssueSeverity.SEV3,
    IssueCategory.P_CANCEL: IssueSeverity.SEV2,
    IssueCategory.O_OUTAGE: IssueSeverity.SEV1,
    IssueCategory.O_BACKLOG: IssueSeverity.SEV2,
    IssueCategory.O_DATA_LEAK: IssueSeverity.SEV1,
    IssueCategory.O_MASS_ERROR: IssueSeverity.SEV1,
    IssueCategory.O_REGULATOR: IssueSeverity.SEV1,
    IssueCategory.O_ABUSE_SURGE: IssueSeverity.SEV2,
    IssueCategory.O_STORE_REVIEW: IssueSeverity.SEV3,
}


class IssueResultCode(StrEnum):
    """#26 처리 결과 코드 — RESOLVED/REJECTED 전이 시 미입력이면 422(B4 원칙: 결과 코드 없이 종결 불가).
    조치 세부(제재 종류·기간)를 신고자에게 노출하지 않는 기존 원칙(§5 #1)과 별개로, 내부 집계·주간
    리뷰용 코드다."""

    NO_ACTION = "NO_ACTION"
    WARNING_ISSUED = "WARNING_ISSUED"
    CONTENT_REMOVED = "CONTENT_REMOVED"
    ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED"
    ACCOUNT_BANNED = "ACCOUNT_BANNED"
    MAKEGOOD_GRANTED = "MAKEGOOD_GRANTED"
    ESCALATED = "ESCALATED"
    DUPLICATE = "DUPLICATE"
    INVALID = "INVALID"
    OTHER = "OTHER"


class MarketplaceAdOut(BaseModel):
    id: UUID
    partner_name: str
    title: str
    body: str | None = None
    image_url: str | None = None
    link_url: str | None = None
    phone: str | None = None
    address: str | None = None
    owner_id: UUID | None = None
    owner_business_profile_id: UUID | None = None
    district_id: int | None = None
    category: str | None = None
    rating: float | None = None
    service_count: int | None = None
    established_year: int | None = None
    business_hours: str | None = None
    is_open: bool | None = None
    translation_failed: bool = False

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def resolve_image_and_status(self) -> "MarketplaceAdOut":
        if self.image_url and not self.image_url.startswith("http"):
            self.image_url = build_imgproxy_url(self.image_url, options="rs:fill:360:200:1")
        if self.business_hours:
            self.is_open = _compute_is_open(self.business_hours)
        return self


class MarketplaceListingStatusUpdate(BaseModel):
    seller_id: UUID
    status: str  # ON_SALE | RESERVED | SOLD | WITHDRAWN


class DealResultResponseRequest(BaseModel):
    """016 §4-7 #42 — 거래 결과 확인 핑 응답. 4지선다."""

    result: Literal["SOLD", "STILL_SELLING", "SOLD_ELSEWHERE", "GAVE_UP"]


class MarketplaceListingUpdateRequest(BaseModel):
    seller_id: UUID
    title: str
    description: str | None = None
    category_id: int | None = None
    image_content_ids: list[UUID] = []
    # 016 §4-6 #41: 등록 후에도 추가/정정 가능 — 선택 표시(D-28=(a)).
    paper_status: Literal["MATCH", "MISMATCH", "NONE"] | None = None
    plate_province: str | None = None


class MarketplaceListingPriceUpdate(BaseModel):
    seller_id: UUID
    # Q-2/D-21(감사 260817): create 와 동일한 상한 — 같은 price_vnd 필드, 같은 오입력 방어 필요.
    price_vnd: int = Field(le=_MAX_PRICE_VND)


class MarketplaceReviewCreateRequest(BaseModel):
    reviewer_id: UUID
    target_id: UUID
    listing_id: UUID | None = None
    rating: int  # 1~5
    manner_tags: list[str] = []
    comment: str | None = None


class MarketplaceReviewResult(BaseModel):
    id: UUID
    target_manner_temp: float


class MarketplaceLikeRequest(BaseModel):
    user_id: UUID


class MarketplaceLikeResult(BaseModel):
    liked: bool
    like_count: int


class MarketplaceKeywordAlertOut(BaseModel):
    id: UUID
    keyword: str

    model_config = {"from_attributes": True}


class MarketplaceKeywordAlertCreateRequest(BaseModel):
    user_id: UUID
    keyword: str = Field(max_length=60)


class MarketplaceKeywordAlertDeleteRequest(BaseModel):
    user_id: UUID


class MarketplaceKeywordAlertUpdateRequest(BaseModel):
    user_id: UUID
    keyword: str = Field(max_length=60)


# ── 실시간 번역 ───────────────────────────────────────────────────


class TranslateRequest(BaseModel):
    text: str
    target_lang: str  # ko | en | vi
    source_lang: str | None = None


class TranslateResponse(BaseModel):
    translated: str
    target_lang: str
    source_lang: str | None = None
    cached: bool


class TranslateAllRequest(BaseModel):
    text: str


class TranslateAllResponse(BaseModel):
    kr: str
    en: str
    vi: str
    source_lang: str


# ── Auth / User ──────────────────────────────────────────────────


class OAuthLoginRequest(BaseModel):
    provider: str  # 'google' | 'facebook' | 'apple'
    token: str
    token_type: str = "id_token"  # 'id_token' | 'access_token'
    # 유입 귀속 코드(016 §6-2 #30) — 신규가입일 때만 쓰인다(first-touch). 정규화는
    # routers/auth.py:_normalize_acq_source() 가 담당.
    ref: str | None = None


class SessionVerifyRequest(BaseModel):
    user_id: UUID
    session_token: str


class UserOut(BaseModel):
    id: UUID
    phone: str | None
    phone_verified: bool = False
    nickname: str | None
    rider_type: RiderTypeOut | None = None
    level: int
    exp: int
    xp: int
    gold: int
    skill_pt: int
    skills: dict[str, int]
    avatar_url: str | None
    manner_temp: float = 36.5
    created_at: datetime
    # F-9 우회 차단: 프론트가 이 값으로 서비스 진입을 게이트한다 — null 이면 동의 미기록.
    consent_agreed_at: datetime | None = None
    # P4-1: 동네 귀속 (Q-7 — 수동 설정). null 이면 미설정.
    home_ward_id: int | None = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def resolve_avatar_from_content(cls, data):
        """avatar_url 을 contents 중개(avatar_content_id) 기준으로 해석."""
        if isinstance(data, dict):
            return data
        return {
            "id": data.id,
            "phone": data.phone,
            "phone_verified": data.phone_verified_at is not None,
            "nickname": data.nickname,
            "rider_type": data.rider_type,
            "level": data.level,
            "exp": data.exp,
            "xp": data.xp,
            "gold": data.gold,
            "skill_pt": data.skill_pt,
            "skills": {
                "distance_rider": data.skill_distance_rider,
                "gold_hunter": data.skill_gold_hunter,
                "quest_slot": data.skill_quest_slot,
                "cost_discount": data.skill_cost_discount,
                "mileage_rate": data.skill_mileage_rate,
            },
            "avatar_url": resolve_avatar_url(data),
            "manner_temp": float(data.manner_temp) if data.manner_temp is not None else 36.5,
            "created_at": data.created_at,
            "consent_agreed_at": data.consent_agreed_at,
            "home_ward_id": data.home_ward_id,
        }


class LoginResponse(BaseModel):
    user: UserOut


class OAuthLoginResponse(BaseModel):
    user: UserOut
    session_token: str
    is_new: bool


# ── 휴대폰 OTP 인증 (판매자 온보딩) — 코드 평문은 요청에만 존재, 응답에 절대 미포함 ──


class OtpRequestIn(BaseModel):
    phone: str


class OtpRequestOut(BaseModel):
    phone: str  # 정규화된 E.164 (+84…) — verify 에 이 값을 그대로 보낼 것
    expires_in_sec: int
    resend_cooldown_sec: int


class OtpVerifyIn(BaseModel):
    phone: str
    code: str


class OtpVerifyOut(BaseModel):
    phone: str
    phone_verified: bool


# ── Profile ──────────────────────────────────────────────────────


class ProfileSaveRequest(BaseModel):
    user_id: UUID
    nickname: str
    rider_type: str | None = None


class HomeWardUpdateRequest(BaseModel):
    """P4-1: 유저 동네 귀속 수동 설정 (Q-7). null 이면 동네 설정 해제."""

    user_id: UUID
    ward_id: int | None = None


class ConsentSaveRequest(BaseModel):
    """F-9: 약관/개인정보처리방침 동의 캡처. age_confirmed(만 14세 이상, 약관 §1)는 별개 체크박스 —
    필수 필드라 미포함(구 클라이언트)은 422, false 는 서버가 400 으로 거부해 가입이 진행되지 않는다."""

    user_id: UUID
    terms_version: str
    privacy_version: str
    age_confirmed: bool


class NicknameCheckResponse(BaseModel):
    available: bool
    nickname: str


class AvatarUpdateResponse(BaseModel):
    user: UserOut
    content_id: UUID


class RandomNicknameResponse(BaseModel):
    nickname: str


# ── Contents ─────────────────────────────────────────────────────


class ContentOut(BaseModel):
    id: UUID
    owner_type: str
    owner_id: UUID | None
    file_path: str
    mime_type: str | None
    original_filename: str | None
    file_size: int | None
    imgproxy_url: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Quest ─────────────────────────────────────────────────────────


class QuestOut(BaseModel):
    id: UUID
    hero_image_url: str | None
    thumbnail_url: str | None = None
    thumbnail_urls: list[str] = []
    # 퀘스트 이미지 3종 (개별 연결 시에만 세팅, 미설정이면 None → 프론트가 공유 카드아트 폴백)
    thumbnail_image_url: str | None = None  # 리스트 카드
    main_image_url: str | None = None  # 상세 히어로
    banner_image_url: str | None = None  # 홈/이벤트 배너
    district: DistrictOut | None = None
    rider_type: RiderTypeOut | None = None
    period: str
    badge: str | None
    required_level: int
    target_distance_km: Decimal
    card_type: str = "DISTANCE"
    csv: str | None = None  # 정적 SVG 카드 id(카드코드) → 프론트 sprite #card-{csv}
    target_lat: Decimal | None = None
    target_lng: Decimal | None = None
    available_from: time | None = None
    available_to: time | None = None
    min_safety_grade: SafetyGradeOut | None = None
    reward_exp: int
    reward_gold: int
    reward_item: str | None
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime
    title_ko: str | None = None
    title_vi: str | None = None
    title_en: str | None = None
    description_ko: str | None = None
    description_vi: str | None = None
    description_en: str | None = None
    mission_code: str | None = None
    rarity: str = "C"

    model_config = {"from_attributes": True}


class UserQuestOut(BaseModel):
    id: UUID
    user_id: UUID
    quest_id: UUID
    status: str
    is_first_clear: bool
    accepted_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class QuestAcceptRequest(BaseModel):
    user_id: UUID


class QuestAcceptResponse(BaseModel):
    session_id: UUID
    user_quest_id: UUID


# ── Feed ─────────────────────────────────────────────────────────


class FeedPostOut(BaseModel):
    id: UUID
    user_id: UUID
    ride_session_id: UUID | None
    content: str | None
    image_url: str | None
    like_count: int
    comment_count: int
    is_story: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def resolve_image_from_content(cls, data):
        """image_url 을 contents 중개(image_content_id) 기준으로 해석."""
        if isinstance(data, dict):
            return data
        return {
            "id": data.id,
            "user_id": data.user_id,
            "ride_session_id": data.ride_session_id,
            "content": data.content,
            "image_url": resolve_feed_image_url(data),
            "like_count": data.like_count,
            "comment_count": data.comment_count,
            "is_story": data.is_story,
            "created_at": data.created_at,
        }


class FeedPostEnrichedOut(BaseModel):
    id: UUID
    user_id: UUID
    user_nickname: str | None
    user_avatar_url: str | None
    user_level: int
    ride_session_id: UUID | None
    content: str | None
    image_url: str | None
    image_urls: list[str] = []
    image_content_ids: list[UUID] = []
    like_count: int
    comment_count: int
    is_story: bool
    created_at: datetime
    distance_km: Decimal | None = None
    safety_grade: str | None = None
    reward_exp: int | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    translation_failed: bool = False
    group_id: UUID | None = None
    hashtags: list[str] = []


class FeedCreateRequest(BaseModel):
    user_id: UUID
    ride_session_id: UUID | None = None
    content: str | None = None
    image_content_id: UUID | None = None
    image_content_ids: list[UUID] = []
    image_url: str | None = None
    is_story: bool = False
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    district_id: int | None = None
    group_id: UUID | None = None  # 260827 그룹 게시판 (204_community_group.sql)

    @model_validator(mode="after")
    def validate_location_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be provided together")
        return self


class FeedUpdateRequest(BaseModel):
    user_id: UUID
    content: str | None = None
    image_content_id: UUID | None = None
    image_content_ids: list[UUID] | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    update_location: bool = False  # True 시 lat/lng 갱신(None 이면 위치 해제)

    @model_validator(mode="after")
    def validate_location_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be provided together")
        return self


class FeedDeleteRequest(BaseModel):
    user_id: UUID


class LikeToggleRequest(BaseModel):
    user_id: UUID


class LikeToggleResponse(BaseModel):
    liked: bool
    like_count: int


class CommentOut(BaseModel):
    id: UUID
    post_id: UUID
    user_id: UUID
    user_nickname: str | None = None
    user_avatar_url: str | None = None
    parent_id: UUID | None
    content: str | None
    image_url: str | None
    like_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentCreateRequest(BaseModel):
    user_id: UUID
    content: str | None = None
    image_url: str | None = None
    parent_id: UUID | None = None


# ── Notification ──────────────────────────────────────────────────


class NotificationOut(BaseModel):
    id: int
    user_id: UUID
    type: str
    title: str
    body: str | None
    link: str | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    items: list[NotificationOut]
    unread_count: int
    total: int
    page: int
    size: int


class NotificationSettingsOut(BaseModel):
    user_id: UUID
    quest_recommend: bool
    quest_expire: bool
    event: bool
    ride_result: bool
    social: bool
    keyword_alert: bool
    chat: bool
    group_post: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class NotificationSettingsUpdate(BaseModel):
    user_id: UUID
    quest_recommend: bool = True
    quest_expire: bool = True
    event: bool = True
    ride_result: bool = True
    social: bool = True
    keyword_alert: bool = True
    chat: bool = True
    group_post: bool = True


# ── Badge ─────────────────────────────────────────────────────────


class BadgeOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    icon_url: str | None
    condition_type: str | None
    condition_value: int | None
    condition_rule: dict | None = None
    name_ko: str | None = None
    name_vi: str | None = None
    name_en: str | None = None
    description_ko: str | None = None
    description_vi: str | None = None
    description_en: str | None = None
    is_active: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def resolve_icon(cls, data):
        if isinstance(data, dict):
            return data
        icon_content = getattr(data, "icon_content", None)
        d = {
            "id": data.id,
            "name": data.name,
            "description": data.description,
            "icon_url": data.icon_url,
            "condition_type": data.condition_type,
            "condition_value": data.condition_value,
            "condition_rule": data.condition_rule,
            "name_ko": data.name_ko,
            "name_vi": data.name_vi,
            "name_en": data.name_en,
            "description_ko": data.description_ko,
            "description_vi": data.description_vi,
            "description_en": data.description_en,
            "is_active": data.is_active,
            "created_at": data.created_at,
        }
        if icon_content and icon_content.file_path:
            d["icon_url"] = build_imgproxy_url(icon_content.file_path)
        return d


class BadgeWithEarnedOut(BaseModel):
    badge: BadgeOut
    earned: bool
    acquired_at: datetime | None = None


class QuestHistoryOut(BaseModel):
    id: UUID
    quest_id: UUID
    quest_title: str | None = None
    distance_km: Decimal | None = None
    safety_grade: str | None = None
    reward_exp: int = 0
    reward_gold: int = 0
    completed_at: datetime | None = None


# ── User Stats ────────────────────────────────────────────────────


class UserStatsOut(BaseModel):
    month: str  # "YYYY-MM" (VN 시간 UTC+7 기준)
    total_km: Decimal  # 이번 달 주행거리
    lifetime_km: Decimal  # 평생 누적 주행거리
    quest_count: int
    avg_safety_grade: str | None  # "A" / "B" / "C" or None
    review_count: int = 0  # 전체 거래 후기 수 (GOOD + BAD)
    avg_rating: float | None = None  # 0.0~5.0, 후기 없으면 None


class UserExportResponse(BaseModel):
    request_id: str
    status: str
    estimated_ready_at: datetime


# ── Follow ───────────────────────────────────────────────────────


class FollowRequest(BaseModel):
    user_id: UUID


class FollowUserOut(BaseModel):
    id: UUID
    nickname: str | None
    avatar_url: str | None
    level: int
    is_following: bool = False  # 요청 세션 뷰어(X-User-Id) 기준 팔로우 여부

    model_config = {"from_attributes": True}


class FollowCountsOut(BaseModel):
    follower_count: int
    following_count: int


class UserProfileOut(BaseModel):
    id: UUID
    nickname: str | None
    avatar_url: str | None
    level: int
    rider_style: str | None
    follower_count: int
    following_count: int
    is_following: bool
    # P4-4: 맞팔(is_following 이고 상대도 나를 팔로우) 여부 — 친구 표기용
    is_friend: bool = False
    is_phone_verified: bool = False
    phone_masked: str | None = None


# ── 커뮤니티 그룹 (204_community_group.sql, Phase2) ────────────────


class CommunityGroupOut(BaseModel):
    id: UUID
    slug: str | None = None
    name: str
    description: str | None = None
    cover_url: str | None = None
    group_type: str
    ward_id: int | None = None
    district_id: int | None = None
    join_policy: str
    visibility: str
    owner_id: UUID | None = None
    member_count: int
    post_count: int
    status: str
    created_at: datetime
    # 조회 세션 유저 기준 — 그룹 목록/상세 화면이 "가입하기" vs "이미 가입됨"을 바로 렌더할 수 있게.
    my_membership_status: str | None = None  # None(비가입) | 'PENDING' | 'ACTIVE' | 'BANNED'
    my_role: str | None = None
    conversation_id: UUID | None = None

    model_config = {"from_attributes": True}


class CommunityGroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = None
    group_type: str = "interest"  # 'interest' | 'neighborhood'
    ward_id: int | None = None
    district_id: int | None = None
    join_policy: str = "open"  # 'open' | 'approval' | 'invite'
    visibility: str = "public"  # 'public' | 'private'
    cover_content_id: UUID | None = None

    @model_validator(mode="after")
    def validate_neighborhood(self):
        if self.group_type not in ("interest", "neighborhood"):
            raise ValueError("group_type must be 'interest' or 'neighborhood'")
        if self.group_type == "neighborhood" and self.ward_id is None and self.district_id is None:
            raise ValueError("neighborhood group requires ward_id or district_id")
        if self.join_policy not in ("open", "approval", "invite"):
            raise ValueError("join_policy must be 'open', 'approval' or 'invite'")
        if self.visibility not in ("public", "private"):
            raise ValueError("visibility must be 'public' or 'private'")
        return self


class CommunityGroupPatchRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = None
    join_policy: str | None = None
    visibility: str | None = None
    cover_content_id: UUID | None = None


class CommunityGroupMemberOut(BaseModel):
    user_id: UUID
    nickname: str | None
    avatar_url: str | None
    role: str
    status: str
    joined_at: datetime


# ── DM ───────────────────────────────────────────────────────────


class DmConversationOut(BaseModel):
    id: UUID
    other_user_id: UUID | None = None
    other_user_nickname: str | None = None
    other_user_avatar_url: str | None = None
    last_message_preview: str | None
    # price_offer/appointment 미리보기는 프론트가 뷰어 로케일로 조립 (DM-5)
    last_message_type: str | None = None
    last_message_meta: dict | None = None
    last_message_at: datetime
    unread_count: int
    context_type: str | None = None
    context_id: UUID | None = None
    context_listing: MarketplaceListingCard | None = None
    # 약속잡기 게이트 — 판매자는 항상 true, 구매자는 판매자의 거래진행 액션 이후에만 true
    appointment_unlocked: bool = False
    # 260827 group/open 확장 (§3.5) — direct 는 other_user_* 만 채워지고 아래는 기본값 유지
    conversation_type: str = "direct"
    title: str | None = None
    photo_url: str | None = None
    member_count: int = 2
    community_group_id: UUID | None = None


class DmRecordingUserOut(BaseModel):
    id: UUID
    nickname: str | None = None


class DmPresenceOut(BaseModel):
    """워키토키 채널정보(A-7 UX) — 대화방 참석 인원 + 현재 녹음 중인 참가자."""

    total_members: int
    active_members: int
    recording_users: list[DmRecordingUserOut] = []


class DmRecordingPresenceRequest(BaseModel):
    action: Literal["start", "stop"] = "start"


class DmConversationCreateRequest(BaseModel):
    other_user_id: UUID
    context_type: str | None = None
    context_id: UUID | None = None

    @model_validator(mode="after")
    def validate_context_pair(self):
        if (self.context_type is None) != (self.context_id is None):
            raise ValueError("context_type and context_id must be provided together")
        return self


class DmGroupConversationCreateRequest(BaseModel):
    title: str
    member_ids: list[UUID] = Field(min_length=1)
    photo_content_id: UUID | None = None


class DmMemberInviteRequest(BaseModel):
    user_ids: list[UUID] = Field(min_length=1)


class DmConversationPatchRequest(BaseModel):
    title: str | None = None
    photo_content_id: UUID | None = None


class DmMemberRolePatchRequest(BaseModel):
    """관리자 임명/해임 — 개설자(owner)만 호출할 수 있고, owner 자신은 대상이 될 수 없다."""

    role: Literal["admin", "member"]


class DmBanRequest(BaseModel):
    """블랙리스트 등록. 활성 멤버면 함께 퇴장 처리된다."""

    user_id: UUID
    reason: str | None = None


class DmBanOut(BaseModel):
    user_id: UUID
    nickname: str | None = None
    avatar_url: str | None = None
    banned_by: UUID | None = None
    reason: str | None = None
    created_at: datetime


class AppointmentOut(BaseModel):
    id: UUID
    listing_id: UUID
    conversation_id: UUID
    proposer_id: UUID
    seller_id: UUID | None = None
    when_at: datetime
    place_name: str | None = None
    place_lat: float | None = None
    place_lng: float | None = None
    status: str
    # S-16: 구매자 완료 요청 상태. status 는 ACCEPTED 그대로이고 이 필드로 요청 여부를 판별한다.
    completion_requested_by: UUID | None = None
    completion_requested_at: datetime | None = None
    completion_declined_at: datetime | None = None
    # 거절 행위자 — 판매자 거절이면 판매자 id, 운영 기각이면 None(프론트가 문구를 분기한다).
    completion_declined_by: UUID | None = None


class AppointmentProposeRequest(BaseModel):
    conversation_id: UUID
    # naive datetime 은 서버 OS 타임존에 따라 해석이 달라지므로 tz-aware 만 허용 (DM-1)
    when_at: AwareDatetime
    place_name: str | None = None
    place_lat: float | None = None
    place_lng: float | None = None


class LocationShareStartRequest(BaseModel):
    consent_version: str


class LocationSharePingRequest(BaseModel):
    lat: float
    lng: float
    accuracy_m: int


class LocationShareStatusOut(BaseModel):
    # M-6: 대칭 강제 아님 — 내 상태/상대 상태를 각각 표시한다.
    my_status: str  # "sharing" | "stopped" | "not_started"
    peer_status: str  # "sharing" | "stopped" | "not_started"
    peer_lat: float | None = None
    peer_lng: float | None = None
    expires_at: datetime | None = None


class PriceOfferOut(BaseModel):
    id: UUID
    listing_id: UUID
    conversation_id: UUID
    proposer_id: UUID
    seller_id: UUID | None = None
    amount: int
    status: str


class PriceOfferProposeRequest(BaseModel):
    conversation_id: UUID
    # Q-2/D-21(감사 260817): 매물 price_vnd 와 같은 상한 — 가격 제안도 같은 자릿수 오입력 리스크.
    amount: int = Field(le=_MAX_PRICE_VND)


class BlockedUserOut(BaseModel):
    user_id: UUID
    nickname: str | None = None
    avatar_url: str | None = None


class ReviewBrief(BaseModel):
    rating: int  # 1~5
    manner_tags: list | None = None
    comment: str | None = None
    created_at: datetime


class TradeHistoryItem(BaseModel):
    appointment_id: UUID
    conversation_id: UUID
    listing_id: UUID
    listing_title: str
    thumbnail_url: str | None = None
    price_vnd: int
    role: str  # 'sold' | 'bought'
    counterpart_id: UUID
    counterpart_nickname: str | None = None
    counterpart_avatar_url: str | None = None
    completed_at: datetime
    review_left: bool
    my_review: ReviewBrief | None = None


class DmMessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    content: str | None
    image_url: str | None
    # 워키토키 음성메시지(D-5 재생URL) — 재생완료로 삭제된 뒤에는 None (meta.playedAt 로 구분)
    audio_url: str | None = None
    read_at: datetime | None
    created_at: datetime
    message_type: str = "text"
    meta: dict | None = None
    appointment: AppointmentOut | None = None
    price_offer: PriceOfferOut | None = None


class DmMessageCreateRequest(BaseModel):
    content: str | None = None
    image_content_id: UUID | None = None
    audio_content_id: UUID | None = None
    message_type: str = "text"
    meta: dict | None = None


# ── App Version ──────────────────────────────────────────────────


class AppVersionChild(BaseModel):
    id: int
    version: str
    platform: str
    build_number: str | None = None
    release_note: str | None = None
    is_force_update: bool = False
    is_active: bool = True
    released_at: datetime | None = None

    class Config:
        from_attributes = True


class AppVersionOut(BaseModel):
    id: int
    version: str
    platform: str
    build_number: str | None = None
    release_note: str | None = None
    is_force_update: bool = False
    is_active: bool = True
    released_at: datetime | None = None
    children: list[AppVersionChild] = []

    class Config:
        from_attributes = True


class AppVersionCurrentOut(BaseModel):
    primary: AppVersionChild | None = None
    ios: AppVersionChild | None = None
    android: AppVersionChild | None = None


class AppVersionCreateRequest(BaseModel):
    version: str
    platform: str = "primary"
    parent_id: int | None = None
    build_number: str | None = None
    release_note: str | None = None
    is_force_update: bool = False
    is_active: bool = True


class AppVersionUpdateRequest(BaseModel):
    version: str | None = None
    build_number: str | None = None
    release_note: str | None = None
    is_force_update: bool | None = None
    is_active: bool | None = None


# ── 고객센터 ──────────────────────────────────────────────────────


class SupportTicketCreate(BaseModel):
    title: str
    body: str


class SupportReplyCreateRequest(BaseModel):
    body: str


class SupportReplyOut(BaseModel):
    id: int
    author_type: str
    body: str
    created_at: datetime

    class Config:
        from_attributes = True


class SupportTicketOut(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    status: str
    has_unread_reply: bool
    reply_count: int = 0
    created_at: datetime
    updated_at: datetime
    category: str | None = None
    severity: str | None = None
    source: str = "APP"
    persona: str = "USER"

    class Config:
        from_attributes = True


class SupportTicketDetail(SupportTicketOut):
    replies: list[SupportReplyOut] = []


class ReportOut(BaseModel):
    """R-1(260817 §12-B) 내 신고 목록. status 는 PENDING/REVIEWING/RESOLVED/REJECTED 를
    REVIEWING/RESOLVED/REJECTED 3단계로 뭉갠 값 — result_code/resolution_note 원본은 절대
    내려주지 않는다(상대방 제재 내역 노출은 개인정보이자 보복 위험).
    note/images 는 신고자 본인이 작성·첨부한 데이터라 그대로 노출한다(R-1, 260819 W3).
    resolution_summary 는 resolution_note(내부 메모)와 분리된 공개용 요약 사유(R-2)."""

    id: uuid.UUID
    target_type: str
    reason: str
    status: str
    created_at: datetime
    handled_at: datetime | None = None
    listing_id: uuid.UUID | None = None
    target_title: str | None = None
    target_thumbnail_url: str | None = None
    # R-3(260817 §12-B) — 원본 status(PENDING/REVIEWING 등)는 노출하지 않고 서버가 계산해 내려준다.
    can_cancel: bool = False
    # R-1(260819 W3) — 신고자 본인이 남긴 코멘트/첨부사진(타인 정보 아님, 노출 무해).
    note: str | None = None
    images: list[str] = []
    # R-2(260819 W3) — resolution_note 원본이 아니라 어드민이 입력한 공개용 요약만.
    resolution_summary: str | None = None
    # O-4(260827 §7) — 신고 대상의 부모 맥락(예: "○○업체의 후기", 게시물 제목). REVIEW/COMMENT 만 채워진다.
    # 숨겨지거나 삭제된 부모는 식별정보를 노출하지 않고 익명화한 일반 문구로 대체한다(§7 확정).
    parent_context: str | None = None

    class Config:
        from_attributes = True


class BizIssueCreateRequest(BaseModel):
    """#27 업체 전용 이슈 채널 — BizDashboard 진입점. ad_id 로 계약 컨텍스트(계약ID·지면·기간)를
    서버가 자동 첨부한다(사용자가 직접 입력하지 않음)."""

    ad_id: uuid.UUID
    category: IssueCategory = IssueCategory.P_NOSERVE
    title: str
    body: str


# ── 비즈니스 파트너 (SGR-312 BP-2) ────────────────────────────────


class BusinessCategoryOut(BaseModel):
    code: str
    group_code: str
    group_label_ko: str
    group_label_vi: str
    group_label_en: str
    icon: str
    label_ko: str
    label_vi: str
    label_en: str
    sort_order: int

    model_config = {"from_attributes": True}


class BusinessProfileApplyRequest(BaseModel):
    name: str
    category: str | None = None
    address: str
    latitude: Decimal
    longitude: Decimal
    phone: str
    photo_content_id: uuid.UUID | None = None
    intro: str | None = Field(default=None, max_length=500)


class BusinessProfileUpdateRequest(BaseModel):
    name: str
    category: str | None = None
    address: str
    latitude: Decimal
    longitude: Decimal
    phone: str
    photo_content_id: uuid.UUID | None = None
    intro: str | None = Field(default=None, max_length=500)


class BusinessProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None = None
    address: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    phone: str | None = None
    photo_content_id: uuid.UUID | None = None
    photo_url: str | None = None
    intro: str | None = None
    status: str
    reject_reason: str | None = None
    # 검증축 (init/151) — 계정 승인축 status 와 별개. 원문 경로가 아닌 content_id UUID 만 노출.
    verification_status: str = "pending"
    biz_license_content_id: uuid.UUID | None = None
    signboard_content_id: uuid.UUID | None = None
    rep_name: str | None = None
    verified_at: datetime | None = None
    verification_reject_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class BusinessVerificationRequest(BaseModel):
    """광고주 문서 제출 (init/151) — content 는 contents 라우터로 선업로드 후 UUID 만 전달."""

    profile_id: uuid.UUID
    biz_license_content_id: uuid.UUID
    signboard_content_id: uuid.UUID | None = None
    rep_name: str | None = None


# ── 비즈니스 파트너 광고 (SGR-312 BP-4) ───────────────────────────


class BusinessAdCreateRequest(BaseModel):
    profile_id: uuid.UUID
    tier_id: uuid.UUID
    title: str
    body: str | None = None
    image_content_id: uuid.UUID
    # starts_at 은 광고주 미입력(서버가 승인 시점 세팅). is_ongoing=true 면 ends_at 무시.
    is_ongoing: bool = True
    ends_at: datetime | None = None


class BusinessAdOut(BaseModel):
    id: uuid.UUID
    profile_id: uuid.UUID | None = None
    tier_id: uuid.UUID
    tier_name: str
    monthly_price_snapshot_vnd: int = 0
    title: str
    body: str | None = None
    image_url: str | None = None
    review_status: str
    reject_reason: str | None = None
    is_ongoing: bool = True
    subscription_status: str = "pending_payment"
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    created_at: datetime


class AdTierOut(BaseModel):
    id: uuid.UUID
    name: str
    monthly_price_vnd: int
    exposure_weight: int
    is_active: bool
    display_order: int
    features_json: list | None = None

    model_config = {"from_attributes": True}


# ── 광고 성과 대시보드 요약 (ai-docs/spec/ad-performance-metrics.md §7/§8 B-9) ─────
# 롤업 테이블(ad_daily_stats)만 조회 — 수집 파이프라인 미구현 상태에서 숫자는 항상 0 이 정상.


class BizAdStatsSummaryOut(BaseModel):
    # no_ads / pending / warming_up / low_sample / normal (§7-3 A~E) — 숫자 표시 방식을 결정하는 버킷.
    state: str
    period: str
    period_days: int
    impressions: int = 0
    reach: int = 0
    clicks: int = 0
    cta_call: int = 0
    cta_follow: int = 0
    cta_favorite: int = 0
    cta_review: int = 0
    primary_cta_total: int = 0
    cta_secondary: int = 0
    min_sample_for_ratio: int
    # 표본(§7-3 D) 미달·비정상 상태에서는 전부 None — 프론트가 숨긴다.
    ctr: float | None = None
    cvr: float | None = None
    ad_spend_vnd: int | None = None
    cpm_vnd: float | None = None
    cpc_vnd: float | None = None
    cpa_vnd: float | None = None
    # 현재 게시 중인 광고가 없고 과거에 게시된 적만 있음 — §7-3 F "게시 종료" 배지용(숫자 자체는 감추지 않는다)
    is_ended: bool = False
    ad_started_at: datetime | None = None
    ad_ends_at: datetime | None = None


# ── 광고 성과 시계열 (ai-docs/spec/ad-performance-metrics.md — 대시보드 차트/기간비교/광고별 분해) ──


class AdStatsSeriesPoint(BaseModel):
    date: date
    impressions: int = 0
    reach: int = 0
    clicks: int = 0
    cta_primary: int = 0  # call + follow + favorite + review
    cta_secondary: int = 0


class AdStatsSeriesTotals(BaseModel):
    impressions: int = 0
    reach: int = 0
    clicks: int = 0
    cta_call: int = 0
    cta_follow: int = 0
    cta_favorite: int = 0
    cta_review: int = 0
    cta_primary: int = 0
    cta_secondary: int = 0


class AdStatsSeriesPrevious(BaseModel):
    """직전 동일 길이 기간 합계 — 증감 표시용."""

    impressions: int = 0
    reach: int = 0
    clicks: int = 0
    cta_primary: int = 0
    cta_secondary: int = 0


class AdStatsByAdItem(BaseModel):
    ad_id: uuid.UUID
    title: str
    impressions: int = 0
    reach: int = 0
    clicks: int = 0
    cta_primary: int = 0
    spend_vnd: int = 0
    review_status: str
    is_ended: bool = False


class BizAdStatsSeriesOut(BaseModel):
    period: str
    period_days: int
    series: list[AdStatsSeriesPoint]
    totals: AdStatsSeriesTotals
    previous: AdStatsSeriesPrevious
    by_ad: list[AdStatsByAdItem]
    spend_vnd: int = 0
    min_sample_for_ratio: int
    # 표본(§7-3 D) 미달 시 전부 None — 프론트가 숨긴다.
    ctr: float | None = None
    cvr: float | None = None
    cpm_vnd: float | None = None
    cpc_vnd: float | None = None
    cpa_vnd: float | None = None


# ── 공개 비즈니스 프로필 (SGR-312 BP-6) ───────────────────────────


class BusinessPublicProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None = None
    address: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    phone: str | None = None
    photo_url: str | None = None
    intro: str | None = None
    ads: list[MarketplaceAdOut]
    # 단골(팔로우, init/152) — 찜(favorite)과 별개 개념
    follower_count: int = 0
    is_following: bool = False
    is_owner: bool = False


# ── 업체 지도 공개 조회 (SGR-321) ─────────────────────────────────


class BusinessNewsBrief(BaseModel):
    title: str
    created_at: datetime
    photos: list[str] = []


class BusinessNewsItemOut(BaseModel):
    """업체 소식 목록 항목 (공개 프로필 '소식' 섹션) — photos 는 imgproxy URL.

    photo_content_ids 는 photos 와 같은 순서(sort_order)의 병렬 배열 — 수정 화면이 기존
    사진 집합을 그대로 재제출(PATCH photo_content_ids)할 수 있게 UUID 를 함께 내려준다(T4)."""

    id: uuid.UUID
    title: str
    body: str | None = None
    created_at: datetime
    photos: list[str] = []
    photo_content_ids: list[uuid.UUID] = []


class BusinessNewsFeedItemOut(BaseModel):
    """홈 '업체 소식' 섹션 — 여러 업체의 최신 소식 1건씩(업체당 1건). 카드 렌더용 업체 식별정보 포함."""

    profile_id: uuid.UUID
    profile_name: str
    category: str | None = None
    photo_url: str | None = None
    news_id: uuid.UUID
    title: str
    created_at: datetime
    photos: list[str] = []


class BusinessNewsCreateRequest(BaseModel):
    """업체 오너가 소식 등록 — photo_content_ids 는 contents 라우터로 선업로드 후 UUID 만 전달."""

    profile_id: uuid.UUID
    title: str
    body: str | None = None
    photo_content_ids: list[uuid.UUID] = []


class BusinessNewsUpdateRequest(BaseModel):
    """업체 오너가 소식 수정 — title/body 는 항상 대체. photo_content_ids 는 생략(None) 시 기존 사진 유지,
    값을 주면 create_news 와 동일하게 전체 대체(update_listing 패턴 미러)."""

    title: str
    body: str | None = None
    photo_content_ids: list[uuid.UUID] | None = None


class BusinessPriceItemOut(BaseModel):
    """업체 가격표 항목 (오너/공개 공용)."""

    id: uuid.UUID
    name: str
    price_vnd: int
    sort_order: int
    created_at: datetime


class BusinessPriceCreateRequest(BaseModel):
    """업체 오너가 가격표 항목 등록."""

    profile_id: uuid.UUID
    name: str
    price_vnd: int = Field(ge=0)


class BusinessReviewCreateRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    body: str


class BusinessReviewOut(BaseModel):
    id: uuid.UUID
    rating: int
    body: str
    created_at: datetime
    reviewer_nickname: str | None = None
    # 사장님 댓글 (③, 016 §8-2 P-BAD-REVIEW) — 후기당 1개, init/198.
    owner_reply: str | None = None
    owner_replied_at: datetime | None = None
    # 운영자 조치(숨김) — 목록(get_public_reviews)에선 항상 None(숨김 후기는 거기서 제외됨).
    # "내 후기"(get_my_public_review) 에서만 non-null 로 내려가 작성자가 사유를 보고 이의제기할 수 있다.
    hidden_at: datetime | None = None
    hidden_reason: str | None = None


class BusinessReviewReplyRequest(BaseModel):
    """사장님 댓글 작성/수정 — 오너만, 후기당 1개(upsert)."""

    body: str = Field(min_length=1)


class ReviewAppealCreateRequest(BaseModel):
    """숨김 조치된 후기에 대한 작성자 이의제기 — 010 #2 S-APPEAL 폐루프에 얹는다(새 인프라 없음)."""

    body: str = Field(min_length=1)


class BusinessReviewListOut(BaseModel):
    """후기 목록 wrapper — info_repair {reviews, total, has_more} 관례 미러 + 평균 별점."""

    reviews: list[BusinessReviewOut]
    total: int
    avg_rating: float | None = None
    has_more: bool


class BusinessOwnerReviewOut(BaseModel):
    """오너 전용 후기 목록 항목(GET /biz/reviews) — 소비자 공개 응답(BusinessReviewOut)과
    분리(T2 (ii)). hidden=True 인 항목은 body 를 내려주지 않는다(운영자 조치 사실만 통지,
    원문은 블라인드). hidden_reason(자유텍스트 원문)은 신고자 익명성/보복 위험으로 이 응답에
    아예 없다 — O-1(260827) 확정: 대신 hidden_reason_code 만 내려주고, 프론트가 i18n 매핑해
    문구로 보여준다(신고 사유와 동일 코드셋, BizReviewReportReason 참조)."""

    id: uuid.UUID
    rating: int
    body: str | None
    created_at: datetime
    reviewer_nickname: str | None = None
    owner_reply: str | None = None
    owner_replied_at: datetime | None = None
    hidden: bool = False
    # 숨김 사유 코드(원문 아님) — hidden=False 면 항상 None.
    hidden_reason_code: str | None = None
    # 오너 본인이 이 후기를 신고했는지 여부만 — 타인의 신고 여부는 절대 노출하지 않는다.
    is_reported_by_me: bool = False


class BusinessOwnerReviewListOut(BaseModel):
    """오너 후기 목록 wrapper — unanswered_count 는 owner_reply IS NULL 인 전체 건수
    (필터와 무관하게 항상 전체 기준, W4 파트너 요약 카드 배지가 그대로 쓴다). avg_rating 은
    소비자 공개 목록과 동일하게 숨김 제외 기준(get_public_reviews 미러, BizDashboard 지표 카드용)."""

    reviews: list[BusinessOwnerReviewOut]
    total: int
    unanswered_count: int
    avg_rating: float | None = None
    has_more: bool


class BusinessReviewBrief(BaseModel):
    """동네지도 가게 카드 리뷰 프리뷰 — 최신 후기 별점 + 본문 일부."""

    rating: int
    body: str


class BusinessMapItemOut(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None = None
    address: str | None = None
    lat: Decimal
    lng: Decimal
    photo_url: str | None = None
    latest_news: BusinessNewsBrief | None = None
    # 좌표 기반 최근접 ward(phường/xã) 조회 결과 — 매칭 ward 없으면 전부 None
    ward_name_ko: str | None = None
    ward_name_vi: str | None = None
    ward_name_en: str | None = None
    # 당근형 리치 카드 (동네지도 리스트) — 별점·후기수·단골수·리뷰 프리뷰
    rating: float | None = None
    review_count: int = 0
    follower_count: int = 0
    # 찜(favorite) 총수 — 단골(follower)과 별개 개념, 동일 패턴 미러
    favorite_count: int = 0
    review_previews: list[BusinessReviewBrief] = []


# ── POI (Phase A-1 — 지형·랜드마크/행정·생활 지도 핀) ─────────────


class POIMapItemOut(BaseModel):
    id: uuid.UUID
    category: str
    name_ko: str
    name_vi: str | None = None
    name_en: str | None = None
    address: str | None = None
    lat: Decimal
    lng: Decimal
    photo_url: str | None = None


class POIBulkItem(BaseModel):
    """Phase B 에이전트 인제스천 — 단건 upsert 항목. (source, external_ref) 가 upsert 키."""

    category: str
    name_ko: str
    name_vi: str | None = None
    name_en: str | None = None
    description: str | None = None
    address: str | None = None
    lat: Decimal
    lng: Decimal
    source: str
    external_ref: str


class POIBulkRequest(BaseModel):
    items: list[POIBulkItem]


class POIBulkResult(BaseModel):
    inserted: int
    updated: int
    skipped: int


# ── 업체 찜 (동네지도 프로필 실배선 P-BE T1) ─────────────────────


class BusinessFavoriteOut(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None = None
    address: str | None = None
    lat: Decimal | None = None
    lng: Decimal | None = None
    photo_url: str | None = None
    latest_news: BusinessNewsBrief | None = None
    favorited_at: datetime


class BusinessFollowOut(BaseModel):
    """내 단골(팔로우) 업체 목록 — BusinessFavoriteOut 미러 (SGR-330 감독 지시)."""

    id: uuid.UUID
    name: str
    category: str | None = None
    address: str | None = None
    lat: Decimal | None = None
    lng: Decimal | None = None
    photo_url: str | None = None
    latest_news: BusinessNewsBrief | None = None
    followed_at: datetime


# ── 장소 제안 (동네지도 프로필 실배선 P-BE T2) ───────────────────


class PlaceSuggestionCreateRequest(BaseModel):
    name: str
    category: str | None = None
    address: str | None = None
    lat: Decimal
    lng: Decimal
    note: str | None = None


class PlaceSuggestionOut(BaseModel):
    id: int
    name: str
    category: str | None = None
    address: str | None = None
    lat: Decimal
    lng: Decimal
    note: str | None = None
    status: str
    review_note: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None

    model_config = {"from_attributes": True}
