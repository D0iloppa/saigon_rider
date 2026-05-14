import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


_rider_type_enum = ENUM('COMMUTER', 'CAFE_HUNTER', 'NIGHT_RIDER', name='rider_type', create_type=False)
_content_owner_type_enum = ENUM('system', 'user', name='content_owner_type', create_type=False)
_quest_period_enum = ENUM('DAILY', 'WEEKLY', 'EVENT', name='quest_period', create_type=False)
_quest_badge_enum = ENUM('HOT', 'NEW', 'LIMITED', name='quest_badge_type', create_type=False)
_safety_grade_enum = ENUM('A', 'B', 'C', name='safety_grade', create_type=False)
_quest_status_enum = ENUM('ACCEPTED', 'ACTIVE', 'COMPLETED', 'FAILED', 'ABANDONED', name='quest_status', create_type=False)
_notification_type_enum = ENUM('QUEST_RECOMMEND', 'QUEST_EXPIRE', 'EVENT', 'RIDE_RESULT', 'SOCIAL', name='notification_type', create_type=False)
_badge_condition_enum = ENUM('QUEST_CLEAR_COUNT', 'DISTANCE_TOTAL_KM', 'STREAK_DAYS', 'SAFETY_GRADE_A_COUNT', name='badge_condition_type', create_type=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True)
    rider_type: Mapped[str | None] = mapped_column(_rider_type_enum, nullable=True)
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skill_pt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_content_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
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
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    hero_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True)
    period: Mapped[str] = mapped_column(_quest_period_enum, nullable=False, default="DAILY")
    badge: Mapped[str | None] = mapped_column(_quest_badge_enum, nullable=True)
    required_level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    target_distance_km: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    min_safety_grade: Mapped[str | None] = mapped_column(_safety_grade_enum, nullable=True)
    reward_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reward_item: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class UserQuest(Base):
    __tablename__ = "user_quests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("quests.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(_quest_status_enum, nullable=False, default="ACCEPTED")
    is_first_clear: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RideSession(Base):
    __tablename__ = "ride_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_quest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user_quests.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("quests.id", ondelete="CASCADE"), nullable=False)
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

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_ride_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Bookmark(Base):
    __tablename__ = "bookmarks"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    quest_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("quests.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FeedPost(Base):
    __tablename__ = "feed_posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ride_session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ride_sessions.id", ondelete="SET NULL"), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_story: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PostLike(Base):
    __tablename__ = "post_likes"

    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("feed_posts.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PostComment(Base):
    __tablename__ = "post_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("feed_posts.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("post_comments.id", ondelete="CASCADE"), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Badge(Base):
    __tablename__ = "badges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    condition_type: Mapped[str | None] = mapped_column(_badge_condition_enum, nullable=True)
    condition_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserBadge(Base):
    __tablename__ = "user_badges"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    badge_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("badges.id", ondelete="CASCADE"), primary_key=True)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(_notification_type_enum, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    quest_recommend: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    quest_expire: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    event: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ride_result: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    social: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
