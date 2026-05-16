from datetime import date, datetime
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
    rider_type: str


class NicknameCheckResponse(BaseModel):
    available: bool
    nickname: str


class AvatarUpdateResponse(BaseModel):
    user: UserOut
    content_id: UUID


class RpBalanceResponse(BaseModel):
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
    district: DistrictOut | None = None
    rider_type: RiderTypeOut | None = None
    period: str
    badge: str | None
    required_level: int
    target_distance_km: Decimal
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
    like_count: int
    comment_count: int
    is_story: bool
    created_at: datetime
    distance_km: Decimal | None = None
    safety_grade: str | None = None
    reward_exp: int | None = None


class FeedCreateRequest(BaseModel):
    user_id: UUID
    ride_session_id: UUID | None = None
    content: str | None = None
    image_content_id: UUID | None = None
    image_url: str | None = None
    is_story: bool = False
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    district_id: int | None = None


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
    created_at: datetime

    model_config = {"from_attributes": True}


class UserBadgeOut(BaseModel):
    badge: BadgeOut
    acquired_at: datetime


# ── User Stats ────────────────────────────────────────────────────


class UserStatsOut(BaseModel):
    month: str  # "YYYY-MM" (VN 시간 UTC+7 기준)
    total_km: Decimal
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


# ── DM ───────────────────────────────────────────────────────────


class DmConversationOut(BaseModel):
    id: UUID
    other_user_id: UUID
    other_user_nickname: str | None
    other_user_avatar_url: str | None
    last_message_preview: str | None
    last_message_at: datetime
    unread_count: int


class DmConversationCreateRequest(BaseModel):
    user_id: UUID
    other_user_id: UUID


class DmMessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    content: str | None
    image_url: str | None
    read_at: datetime | None
    created_at: datetime


class DmMessageCreateRequest(BaseModel):
    sender_id: UUID
    content: str | None = None
    image_content_id: UUID | None = None


class DmMarkReadRequest(BaseModel):
    user_id: UUID
