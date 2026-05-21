import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow():
    return datetime.now(UTC)


_content_owner_type_enum = ENUM("system", "user", "mock", "profile_mock", name="content_owner_type", create_type=False)
_quest_period_enum = ENUM("DAILY", "WEEKLY", "EVENT", name="quest_period", create_type=False)
_quest_badge_enum = ENUM("HOT", "NEW", "LIMITED", name="quest_badge_type", create_type=False)
_safety_grade_enum = ENUM("A", "B", "C", name="safety_grade", create_type=False)
_quest_status_enum = ENUM(
    "ACCEPTED", "ACTIVE", "COMPLETED", "FAILED", "ABANDONED", name="quest_status", create_type=False
)
_notification_type_enum = ENUM(
    "QUEST_RECOMMEND", "QUEST_EXPIRE", "EVENT", "RIDE_RESULT", "SOCIAL", name="notification_type", create_type=False
)
_badge_condition_enum = ENUM(
    "QUEST_CLEAR_COUNT",
    "DISTANCE_TOTAL_KM",
    "STREAK_DAYS",
    "SAFETY_GRADE_A_COUNT",
    name="badge_condition_type",
    create_type=False,
)
_app_platform_enum = ENUM("primary", "ios", "android", name="app_platform", create_type=False)


class District(Base):
    __tablename__ = "districts"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    name_ko: Mapped[str] = mapped_column(String(100), nullable=False)
    name_vi: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    image_content: Mapped["Content | None"] = relationship(
        "Content", foreign_keys="[District.image_content_id]", lazy="selectin"
    )
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class RiderType(Base):
    __tablename__ = "rider_types"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    name_ko: Mapped[str] = mapped_column(String(100), nullable=False)
    name_vi: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)


class SafetyGrade(Base):
    __tablename__ = "safety_grades"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(1), nullable=False, unique=True)
    name_ko: Mapped[str] = mapped_column(String(100), nullable=False)
    name_vi: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True)
    rider_type_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("rider_types.id"), nullable=True)
    rider_type: Mapped["RiderType | None"] = relationship("RiderType", foreign_keys=[rider_type_id], lazy="selectin")
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skill_pt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    avatar_content: Mapped["Content | None"] = relationship(
        "Content", foreign_keys=[avatar_content_id], lazy="selectin"
    )
    passcode_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Content(Base):
    __tablename__ = "contents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_type: Mapped[str] = mapped_column(_content_owner_type_enum, nullable=False)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Quest(Base):
    __tablename__ = "quests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hero_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    thumbnail_content: Mapped["Content | None"] = relationship(
        "Content", foreign_keys=[thumbnail_content_id], lazy="selectin"
    )
    district_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("districts.id"), nullable=True)
    district: Mapped["District | None"] = relationship("District", foreign_keys=[district_id], lazy="selectin")
    rider_type_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("rider_types.id"), nullable=True)
    rider_type: Mapped["RiderType | None"] = relationship("RiderType", foreign_keys=[rider_type_id], lazy="selectin")
    period: Mapped[str] = mapped_column(_quest_period_enum, nullable=False, default="DAILY")
    badge: Mapped[str | None] = mapped_column(_quest_badge_enum, nullable=True)
    required_level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    target_distance_km: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    min_safety_grade_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("safety_grades.id"), nullable=True)
    min_safety_grade: Mapped["SafetyGrade | None"] = relationship(
        "SafetyGrade", foreign_keys=[min_safety_grade_id], lazy="selectin"
    )
    reward_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_item: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    title_ko: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title_vi: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description_ko: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_vi: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_en: Mapped[str | None] = mapped_column(Text, nullable=True)


class UserQuest(Base):
    __tablename__ = "user_quests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    quest_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quests.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(_quest_status_enum, nullable=False, default="ACCEPTED")
    is_first_clear: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    period_key: Mapped[str | None] = mapped_column(String(20), nullable=True)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RideSession(Base):
    __tablename__ = "ride_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_quest_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_quests.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    quest_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quests.id", ondelete="CASCADE"), nullable=False
    )
    distance_km: Mapped[Decimal] = mapped_column(Numeric(7, 3), nullable=False, default=0)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_speed_kmh: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    safety_grade: Mapped[str | None] = mapped_column(_safety_grade_enum, nullable=True)
    reward_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_item: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fail_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RideStreak(Base):
    __tablename__ = "ride_streaks"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_ride_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Bookmark(Base):
    __tablename__ = "bookmarks"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    quest_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quests.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FeedPost(Base):
    __tablename__ = "feed_posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    ride_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ride_sessions.id", ondelete="SET NULL"), nullable=True
    )
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    image_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[image_content_id], lazy="selectin")
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    district_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("districts.id", ondelete="SET NULL"), nullable=True
    )
    district: Mapped["District | None"] = relationship("District", foreign_keys=[district_id], lazy="selectin")
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_story: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    images: Mapped[list["FeedPostImage"]] = relationship(
        "FeedPostImage",
        back_populates="post",
        lazy="selectin",
        order_by="FeedPostImage.sort_order",
        cascade="all, delete-orphan",
    )


class FeedPostImage(Base):
    __tablename__ = "feed_post_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feed_posts.id", ondelete="CASCADE"), nullable=False
    )
    content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    post: Mapped["FeedPost"] = relationship("FeedPost", back_populates="images")
    content: Mapped["Content"] = relationship("Content", lazy="selectin")


class PostLike(Base):
    __tablename__ = "post_likes"

    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feed_posts.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PostComment(Base):
    __tablename__ = "post_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feed_posts.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("post_comments.id", ondelete="CASCADE"), nullable=True
    )
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PostCommentLike(Base):
    __tablename__ = "post_comment_likes"

    comment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("post_comments.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Badge(Base):
    __tablename__ = "badges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    condition_type: Mapped[str | None] = mapped_column(_badge_condition_enum, nullable=True)
    condition_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    condition_rule: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    name_ko: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name_vi: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name_en: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description_ko: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_vi: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    icon_content: Mapped["Content | None"] = relationship(
        "Content", foreign_keys="[Badge.icon_content_id]", lazy="selectin"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserBadge(Base):
    __tablename__ = "user_badges"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    badge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("badges.id", ondelete="CASCADE"), primary_key=True
    )
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(_notification_type_enum, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdminAccount(Base):
    __tablename__ = "admin_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    quest_recommend: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    quest_expire: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    event: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ride_result: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    social: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class UserFollow(Base):
    __tablename__ = "user_follows"

    follower_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    following_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DmConversation(Base):
    __tablename__ = "dm_conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_1: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    participant_2: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DmMessage(Base):
    __tablename__ = "dm_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    image_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[image_content_id], lazy="selectin")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ── __DEV: 프로젝트 컨텍스트 관리 ────────────────────────────────

_dev_feature_status_enum = ENUM(
    "PLANNED", "IN_PROGRESS", "DONE", "DEFERRED", name="dev_feature_status", create_type=False
)
_dev_todo_priority_enum = ENUM("LOW", "MEDIUM", "HIGH", "URGENT", name="dev_todo_priority", create_type=False)
_dev_todo_status_enum = ENUM("TODO", "IN_PROGRESS", "DONE", "BLOCKED", name="dev_todo_status", create_type=False)


class DevContext(Base):
    __tablename__ = "__DEV_context"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="⏸")
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class DevFeature(Base):
    __tablename__ = "__DEV_features"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(_dev_feature_status_enum, nullable=False, default="PLANNED")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class NicknameWord(Base):
    __tablename__ = "nickname_words"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    word: Mapped[str] = mapped_column(String(30), nullable=False)
    word_type: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DevTodo(Base):
    __tablename__ = "__DEV_todos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(_dev_todo_priority_enum, nullable=False, default="MEDIUM")
    status: Mapped[str] = mapped_column(_dev_todo_status_enum, nullable=False, default="TODO")
    feature_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("__DEV_features.id", ondelete="SET NULL"), nullable=True
    )
    feature: Mapped["DevFeature | None"] = relationship("DevFeature", lazy="selectin")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AppConfig(Base):
    __tablename__ = "app_config"

    group_name: Mapped[str] = mapped_column(String(100), primary_key=True, default="default")
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    has_unread_reply: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="joined")
    replies: Mapped[list["SupportReply"]] = relationship(
        "SupportReply", back_populates="ticket", order_by="SupportReply.created_at", lazy="select"
    )


class SupportReply(Base):
    __tablename__ = "support_replies"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False
    )
    author_type: Mapped[str] = mapped_column(String(10), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    ticket: Mapped["SupportTicket"] = relationship("SupportTicket", back_populates="replies")


class AppVersion(Base):
    __tablename__ = "app_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    platform: Mapped[str] = mapped_column(_app_platform_enum, nullable=False, default="primary")
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("app_versions.id", ondelete="CASCADE"), nullable=True
    )
    build_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    release_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_force_update: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
