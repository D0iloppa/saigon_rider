import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, field_validator, model_validator

from .utils import build_imgproxy_url, default_avatar_url, resolve_avatar_url, resolve_feed_image_url

T = TypeVar("T")


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
    is_following: bool = False


class MarketplaceListingCard(BaseModel):
    id: UUID
    title: str
    price_vnd: int
    original_price_vnd: int | None = None
    is_negotiable: bool
    status: str
    category_code: str | None = None
    thumbnail_url: str | None = None
    district: DistrictBrief | None = None
    like_count: int = 0
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
    seller: SellerBrief
    district: DistrictBrief | None = None
    like_count: int = 0
    view_count: int = 0
    created_at: datetime
    bumped_at: datetime
    liked: bool = False
    other_listings: list[MarketplaceListingCard] = []


class MarketplaceListingCreateRequest(BaseModel):
    seller_id: UUID
    category_id: int | None = None
    title: str
    description: str | None = None
    price_vnd: int = 0
    is_negotiable: bool = False
    district_id: int | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    image_content_ids: list[UUID] = []


class MarketplaceListingCreated(BaseModel):
    id: UUID


class MarketplaceListingStatusUpdate(BaseModel):
    seller_id: UUID
    status: str  # ON_SALE | RESERVED | SOLD


class MarketplaceListingPriceUpdate(BaseModel):
    seller_id: UUID
    price_vnd: int


class MarketplaceReviewCreateRequest(BaseModel):
    reviewer_id: UUID
    target_id: UUID
    listing_id: UUID | None = None
    rating: str  # GOOD | BAD
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
    keyword: str


class MarketplaceKeywordAlertDeleteRequest(BaseModel):
    user_id: UUID


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


# ── Auth / User ──────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    phone: str


class LoginRequest(BaseModel):
    phone: str
    passcode: str


class UserOut(BaseModel):
    id: UUID
    phone: str
    nickname: str | None
    rider_type: RiderTypeOut | None = None
    level: int
    exp: int
    xp: int
    gold: int
    skill_pt: int
    skills: dict[str, int]
    avatar_url: str | None
    created_at: datetime

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
            "created_at": data.created_at,
        }


class RegisterResponse(BaseModel):
    passcode: str
    is_new: bool
    user: UserOut


class LoginResponse(BaseModel):
    user: UserOut


# ── Profile ──────────────────────────────────────────────────────


class NicknameUpdateRequest(BaseModel):
    user_id: UUID
    nickname: str


class ProfileSaveRequest(BaseModel):
    user_id: UUID
    nickname: str
    rider_type: str | None = None


class NicknameCheckResponse(BaseModel):
    available: bool
    nickname: str


class AvatarUpdateResponse(BaseModel):
    user: UserOut
    content_id: UUID


class RandomNicknameResponse(BaseModel):
    nickname: str


class XpBalanceResponse(BaseModel):
    user_id: str
    current_balance: int
    total_earned: int | None = None
    total_spent: int | None = None


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


class QuestPinOut(BaseModel):
    id: int
    quest_id: UUID
    lat: float
    lng: float


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


class QuestCompleteRequest(BaseModel):
    user_id: UUID


class QuestCompleteResponse(BaseModel):
    quest_id: UUID
    user_quest_id: UUID
    status: str
    reward_exp: int
    reward_gold: int
    reward_item: str | None


class BookmarkToggleRequest(BaseModel):
    user_id: UUID


class BookmarkToggleResponse(BaseModel):
    bookmarked: bool


class QuestParticipantOut(BaseModel):
    user_id: UUID
    nickname: str | None
    avatar_url: str | None

    @field_validator("avatar_url", mode="before")
    @classmethod
    def fill_default_avatar(cls, v):
        return v if v is not None else default_avatar_url()


# ── Ride ─────────────────────────────────────────────────────────


class RideSubmitRequest(BaseModel):
    user_id: UUID
    user_quest_id: UUID
    quest_id: UUID
    distance_km: Decimal
    duration_sec: int
    avg_speed_kmh: Decimal | None = None
    safety_grade: str | None = None
    is_success: bool
    fail_reason: str | None = None


class RideResultOut(BaseModel):
    session_id: UUID
    is_success: bool
    distance_km: Decimal
    duration_sec: int
    safety_grade: str | None
    reward_exp: int
    reward_gold: int
    reward_item: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RideSessionOut(BaseModel):
    id: UUID
    quest_id: UUID
    distance_km: Decimal
    duration_sec: int
    avg_speed_kmh: Decimal | None
    safety_grade: str | None
    reward_exp: int
    reward_gold: int
    is_success: bool
    fail_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RideStreakOut(BaseModel):
    user_id: UUID
    current_streak: int
    longest_streak: int
    last_ride_date: date | None

    model_config = {"from_attributes": True}


class SafetyGradeRequest(BaseModel):
    avg_speed_kmh: float
    braking_count: int = 0
    duration_sec: int = 0


class SafetyGradeResponse(BaseModel):
    grade: str


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


class FeedUpdateRequest(BaseModel):
    user_id: UUID
    content: str | None = None
    image_content_id: UUID | None = None
    image_content_ids: list[UUID] | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    update_location: bool = False  # True 시 lat/lng 갱신(None 이면 위치 해제)


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
    updated_at: datetime

    model_config = {"from_attributes": True}


class NotificationSettingsUpdate(BaseModel):
    user_id: UUID
    quest_recommend: bool = True
    quest_expire: bool = True
    event: bool = True
    ride_result: bool = True
    social: bool = True


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


class UserBadgeOut(BaseModel):
    badge: BadgeOut
    acquired_at: datetime


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


# ── DM ───────────────────────────────────────────────────────────


class DmConversationOut(BaseModel):
    id: UUID
    other_user_id: UUID
    other_user_nickname: str | None
    other_user_avatar_url: str | None
    last_message_preview: str | None
    last_message_at: datetime
    unread_count: int
    context_type: str | None = None
    context_id: UUID | None = None
    context_listing: MarketplaceListingCard | None = None


class DmConversationCreateRequest(BaseModel):
    user_id: UUID
    other_user_id: UUID
    context_type: str | None = None
    context_id: UUID | None = None


class DmMessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    content: str | None
    image_url: str | None
    read_at: datetime | None
    created_at: datetime
    message_type: str = "text"
    meta: dict | None = None


class DmMessageCreateRequest(BaseModel):
    sender_id: UUID
    content: str | None = None
    image_content_id: UUID | None = None
    message_type: str = "text"
    meta: dict | None = None


class DmMarkReadRequest(BaseModel):
    user_id: UUID


# ── __DEV: 프로젝트 컨텍스트 관리 ────────────────────────────────


class DevContextOut(BaseModel):
    id: int
    key: str
    value: str | None = None
    status: str = "⏸"
    meta: dict | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class DevContextUpsertRequest(BaseModel):
    key: str
    value: str | None = None
    status: str | None = None
    meta: dict | None = None


class DevFeatureOut(BaseModel):
    id: int
    category: str
    name: str
    description: str | None = None
    status: str
    sort_order: int
    meta: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DevFeatureCreateRequest(BaseModel):
    category: str
    name: str
    description: str | None = None
    status: str = "PLANNED"
    sort_order: int = 0
    meta: dict | None = None


class DevFeatureUpdateRequest(BaseModel):
    category: str | None = None
    name: str | None = None
    description: str | None = None
    status: str | None = None
    sort_order: int | None = None
    meta: dict | None = None


class DevTodoOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    priority: str
    status: str
    feature_id: int | None = None
    feature: DevFeatureOut | None = None
    due_date: date | None = None
    meta: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DevTodoCreateRequest(BaseModel):
    title: str
    description: str | None = None
    priority: str = "MEDIUM"
    status: str = "TODO"
    feature_id: int | None = None
    due_date: date | None = None
    meta: dict | None = None


class DevTodoUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    feature_id: int | None = None
    due_date: date | None = None
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

    class Config:
        from_attributes = True


class SupportTicketDetail(SupportTicketOut):
    replies: list[SupportReplyOut] = []
