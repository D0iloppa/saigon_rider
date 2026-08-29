import uuid
from datetime import UTC, date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow():
    return datetime.now(UTC)


_content_owner_type_enum = ENUM("system", "user", "mock", "profile_mock", name="content_owner_type", create_type=False)
_quest_period_enum = ENUM("DAILY", "WEEKLY", "EVENT", name="quest_period", create_type=False)
_quest_badge_enum = ENUM("HOT", "NEW", "LIMITED", name="quest_badge_type", create_type=False)
_quest_card_type_enum = ENUM("DISTANCE", "CHECKPOINT", name="quest_card_type", create_type=False)
_safety_grade_enum = ENUM("A", "B", "C", name="safety_grade", create_type=False)
# EXPIRED: 엔진 expire 잡이 실제로 기록하는 값 — 모델에 빠져 있으면 해당 행 조회 시 LookupError 500
_quest_status_enum = ENUM(
    "ACCEPTED", "ACTIVE", "COMPLETED", "FAILED", "ABANDONED", "EXPIRED", name="quest_status", create_type=False
)
_notification_type_enum = ENUM(
    "QUEST_RECOMMEND",
    "QUEST_EXPIRE",
    "EVENT",
    "RIDE_RESULT",
    "SOCIAL",
    "KEYWORD",
    "BIZ",
    "MODERATION",
    "SUPPORT",
    "TITLE_TRANSFER",
    name="notification_type",
    create_type=False,
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
    center_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Ward(Base):
    """2025-07-01 베트남 행정 통폐합 이후 최하위 행정 단위 (phường/xã/특구)."""

    __tablename__ = "wards"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    city_code: Mapped[str] = mapped_column(String(10), nullable=False, default="HCMC")
    name_vi: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    name_ko: Mapped[str | None] = mapped_column(String(100), nullable=True)
    center_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    center_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
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
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    nickname: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True)
    rider_type_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("rider_types.id"), nullable=True)
    rider_type: Mapped["RiderType | None"] = relationship("RiderType", foreign_keys=[rider_type_id], lazy="selectin")
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    exp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skill_pt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skill_distance_rider: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    skill_gold_hunter: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    skill_quest_slot: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    skill_cost_discount: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    skill_mileage_rate: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    avatar_content: Mapped["Content | None"] = relationship(
        "Content", foreign_keys=[avatar_content_id], lazy="selectin"
    )
    manner_temp: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False, default=Decimal("36.5"))
    passcode_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    session_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_advertiser: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="ACTIVE", server_default="ACTIVE")
    suspended_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 가입 시 약관/개인정보처리방침 동의 캡처 (F-9) — 문서별 버전을 구분해 기록.
    # 현재 UI는 단일 체크박스로 두 문서에 동시 동의하므로 시각은 하나만 둔다.
    consent_agreed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_terms_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    consent_privacy_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # 연령(만 14세 이상) 확인 — 약관/개인정보와 별개 체크박스로 받는다 (171). 버전은 약관 §1 기준(terms_version).
    consent_age_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consent_age_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # 유입 귀속 — 016 §6-2 #30, D-30=(b), init/188. first-touch·불변: 가입(find-or-create
    # 신규 분기) 시 1회만 쓰고 이후 로그인 경로에서는 절대 갱신하지 않는다(routers/auth.py).
    acquisition_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # P4-1: 유저 동네 귀속 (Q-7 — 수동 설정, GPS 자동추정 금지). 그룹 추천(동네 기반)에 쓰인다.
    home_ward_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("wards.id", ondelete="SET NULL"), nullable=True
    )


class UserOtp(Base):
    """휴대폰 인증 OTP — 평문 미저장(otp_hash 만), 001 의 otp_code 컬럼은 dead(신규 쓰기 금지)."""

    __tablename__ = "user_otp"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    otp_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attempt_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserOAuthIdentity(Base):
    __tablename__ = "user_oauth_identities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_profile: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class WithdrawnMemberArchive(Base):
    """탈퇴회원 식별자 해시 아카이브 (170) — 부정이용(재가입·제재회피) 방지 추적용.

    원본 식별자는 저장하지 않는다 — value_hash 는 HMAC-SHA256(pepper=env WITHDRAWN_HASH_PEPPER).
    1년(purge_after) 경과분은 purge_deleted_accounts.py 가 파기하고, 계정 복구 시에는
    restore_account(routers/auth.py)가 해당 유저 행을 삭제한다.
    UNIQUE (user_id, kind, provider, value_hash) NULLS NOT DISTINCT — 탈퇴→복구→재탈퇴 중복 방지.
    """

    __tablename__ = "withdrawn_member_archive"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "provider", "value_hash", postgresql_nulls_not_distinct=True),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # 'phone' | 'oauth'
    provider: Mapped[str | None] = mapped_column(Text, nullable=True)  # kind='oauth' 일 때만
    value_hash: Mapped[str] = mapped_column(Text, nullable=False)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    purge_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Content(Base):
    __tablename__ = "contents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_type: Mapped[str] = mapped_column(_content_owner_type_enum, nullable=False)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # F-06 잔여: 업로드 시점에 지정하는 비공개 플래그 — 사업자등록증·간판 등 검증 문서용.
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 016 §4-3 #38 — 이미지 perceptual hash(dHash, init/193). 산출만, 판정 로직 없음(D-34=(a)).
    phash: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ContentFingerprintWhitelist(Base):
    """016 §4-3 #38 오탐 방지 — 제조사 카탈로그 등 반복 등장이 정상인 phash 화이트리스트.
    운영자가 수기 등록(init/193). 초기값 없음."""

    __tablename__ = "content_fingerprint_whitelist"

    phash: Mapped[str] = mapped_column(String(16), primary_key=True)
    note: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


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
    main_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    main_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[main_content_id], lazy="selectin")
    banner_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    banner_content: Mapped["Content | None"] = relationship(
        "Content", foreign_keys=[banner_content_id], lazy="selectin"
    )
    district_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("districts.id"), nullable=True)
    district: Mapped["District | None"] = relationship("District", foreign_keys=[district_id], lazy="selectin")
    rider_type_id: Mapped[int | None] = mapped_column(SmallInteger, ForeignKey("rider_types.id"), nullable=True)
    rider_type: Mapped["RiderType | None"] = relationship("RiderType", foreign_keys=[rider_type_id], lazy="selectin")
    period: Mapped[str] = mapped_column(_quest_period_enum, nullable=False, default="DAILY")
    badge: Mapped[str | None] = mapped_column(_quest_badge_enum, nullable=True)
    required_level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    target_distance_km: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    card_type: Mapped[str] = mapped_column(_quest_card_type_enum, nullable=False, default="DISTANCE")
    target_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    target_lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    # 비-GPS 검증타입(COUNT_EVENT 등) 목표 파라미터. start-ride 가 그대로 엔진 카드 criteria 로 전달.
    criteria: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # 수행가능 시간대 (ICT 로컬시각, NULL=제약없음). start-ride 게이트에서 검사.
    available_from: Mapped[time | None] = mapped_column(Time, nullable=True)
    available_to: Mapped[time | None] = mapped_column(Time, nullable=True)
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
    mission_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rarity: Mapped[str] = mapped_column(String(1), nullable=False, default="C")
    csv: Mapped[str | None] = mapped_column(String(40), nullable=True)


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
    reward_grant_status: Mapped[str] = mapped_column(String(10), nullable=False, default="PENDING")
    reward_idempotency_key: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    reward_last_error: Mapped[str | None] = mapped_column(Text, nullable=True)


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
    ward_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("wards.id", ondelete="SET NULL"), nullable=True
    )
    ward: Mapped["Ward | None"] = relationship("Ward", foreign_keys=[ward_id], lazy="selectin")
    district_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("districts.id", ondelete="SET NULL"), nullable=True
    )
    district: Mapped["District | None"] = relationship("District", foreign_keys=[district_id], lazy="selectin")
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_story: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    # 다국어 검색용 정규화 blob (164 migration, search_index.py 가 씀). None = 미색인(폴백 COALESCE 필요).
    search_blob: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 204_community_group.sql — 커뮤니티 그룹 게시판(nullable, 기존 글은 전부 NULL = 전체 공개 피드)
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("community_groups.id", ondelete="CASCADE"), nullable=True
    )

    images: Mapped[list["FeedPostImage"]] = relationship(
        "FeedPostImage",
        back_populates="post",
        lazy="selectin",
        order_by="FeedPostImage.sort_order",
        cascade="all, delete-orphan",
    )
    hashtags: Mapped[list["PostHashtag"]] = relationship(
        "PostHashtag",
        back_populates="post",
        lazy="selectin",
        order_by="PostHashtag.tag",
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


# ── 게시물 해시태그 (205_post_hashtags.sql, Phase3) ───────────────


class PostHashtag(Base):
    __tablename__ = "post_hashtags"

    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feed_posts.id", ondelete="CASCADE"), primary_key=True
    )
    tag: Mapped[str] = mapped_column(String(50), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    post: Mapped["FeedPost"] = relationship("FeedPost", back_populates="hashtags")


# ── 커뮤니티 그룹 (204_community_group.sql, Phase2) ───────────────


class CommunityGroup(Base):
    __tablename__ = "community_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    cover_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[cover_content_id], lazy="selectin")
    group_type: Mapped[str] = mapped_column(String(20), nullable=False, default="interest")
    ward_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("wards.id", ondelete="SET NULL"), nullable=True
    )
    district_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("districts.id", ondelete="SET NULL"), nullable=True
    )
    join_policy: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="public")
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    member_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    post_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class CommunityGroupMember(Base):
    __tablename__ = "community_group_members"

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("community_groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(12), nullable=False, default="member")
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="ACTIVE")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ── 거래 플랫폼 (Marketplace, SGR-287) ───────────────────────────


class MarketplaceCategory(Base):
    __tablename__ = "marketplace_categories"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    name_ko: Mapped[str] = mapped_column(String(100), nullable=False)
    name_vi: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(10), nullable=True)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    parent_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("marketplace_categories.id", ondelete="CASCADE"), nullable=True
    )
    depth: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)


class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    seller: Mapped["User"] = relationship("User", foreign_keys=[seller_id], lazy="selectin")
    # T-1(업체 매물 등록 경로) — marketplace_ads.owner_business_profile_id 패턴 미러 (177 migration).
    # NULL = 개인 판매자 매물. 관계는 두지 않고 app 레이어에서 명시적으로 조회(ads 선례와 동일).
    business_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="SET NULL"), nullable=True
    )
    category_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("marketplace_categories.id", ondelete="SET NULL"), nullable=True
    )
    category: Mapped["MarketplaceCategory | None"] = relationship(
        "MarketplaceCategory", foreign_keys=[category_id], lazy="selectin"
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    original_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # MKT-7: 거래 완료(complete_appointment) 시점의 합의가 스냅샷. 이력 정합성 근거.
    agreed_price_vnd: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    is_negotiable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ON_SALE")
    district_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("districts.id", ondelete="SET NULL"), nullable=True
    )
    district: Mapped["District | None"] = relationship("District", foreign_keys=[district_id], lazy="selectin")
    ward_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("wards.id", ondelete="SET NULL"), nullable=True
    )
    ward: Mapped["Ward | None"] = relationship("Ward", foreign_keys=[ward_id], lazy="selectin")
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    like_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bumped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    # 다국어 검색용 정규화 blob (164 migration, search_index.py 가 씀). None = 미색인(폴백 COALESCE 필요).
    search_blob: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 016 §4-3 #38 — 제목+설명 정규화 텍스트의 simhash(init/193). 산출만, 판정 로직 없음(D-34=(a)).
    text_fingerprint: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 016 §4-6 #41 — 서류·명의 상태(init/194). NULL=미기재(선택 표시, D-28=(a) — 강제 입력 아님).
    # MISMATCH(등록증 명의 불일치)가 핵심 위험 신호 — 매물 상세에 배지로 노출한다.
    paper_status: Mapped[str | None] = mapped_column(String(10), nullable=True)
    plate_province: Mapped[str | None] = mapped_column(String(80), nullable=True)

    images: Mapped[list["MarketplaceListingImage"]] = relationship(
        "MarketplaceListingImage",
        back_populates="listing",
        lazy="selectin",
        order_by="MarketplaceListingImage.sort_order",
        cascade="all, delete-orphan",
    )


class ListingStateLog(Base):
    """016 §4-1 #36 — 매물 상태 전이 이력 (init/191). 상태가 바뀌는 모든 지점에서
    services.listing_state.log_transition() 을 통해 적재된다. 조회 전용 — ORM relationship 은
    두지 않는다(#36 완료조건은 기록·조회 가능이며 매물 상세에 얹는 UI 는 비범위)."""

    __tablename__ = "listing_state_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False
    )
    from_state: Mapped[str | None] = mapped_column(String(12), nullable=True)
    to_state: Mapped[str] = mapped_column(String(12), nullable=False)
    actor_type: Mapped[str] = mapped_column(String(10), nullable=False)  # 'user'|'admin'|'system'
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ListingPriceLog(Base):
    """016 §4-2 #37 — 매물 가격 변동 이력 (init/192). update_price 가 가격이 바뀔 때마다(인상·
    인하 모두) 적재한다 — 미끼가(B-BAIT-PRICE: 낮은 가격으로 문의 유입 후 인상) 탐지(#39)는
    인상 기록이 있어야 성립하므로 인하만 남기면 안 된다. 인하 알림(이 파일 아래)만 인하일 때로
    한정된다."""

    __tablename__ = "listing_price_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False
    )
    old_price_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    new_price_vnd: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TitleTransferReminderLog(Base):
    """016 §4-6 #41 — 명의이전 D+7/D+25 리마인더 발송 이력 (init/194). 앵커는 이 테이블이 아니라
    listing_state_log 의 SOLD 전이 시각(jobs.title_transfer_reminders 가 조회). 이 테이블은 중복
    발송 방지용(UNIQUE listing_id+reminder_type)."""

    __tablename__ = "title_transfer_reminder_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False
    )
    reminder_type: Mapped[str] = mapped_column(String(4), nullable=False)  # 'D7' | 'D25'
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DealResultPingLog(Base):
    """016 §4-7 #42 — 거래 결과 확인 핑 발송·응답 이력 (init/195). jobs.deal_result_ping 이
    문의를 받고 조용해진 ON_SALE 매물에 매물당 1회만 발송(UNIQUE listing_id)하고, 응답은
    market.py 의 respond_deal_result 가 이 행에 result·responded_at 을 채운다. result IS NULL
    = 미응답. "다른 데서 판매" 비율(경쟁 플랫폼 유출률)은 이 테이블에서 직접 집계한다."""

    __tablename__ = "deal_result_ping_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False
    )
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result: Mapped[str | None] = mapped_column(String(20), nullable=True)


class MarketplaceListingImage(Base):
    __tablename__ = "marketplace_listing_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False
    )
    content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    listing: Mapped["MarketplaceListing"] = relationship("MarketplaceListing", back_populates="images")
    content: Mapped["Content"] = relationship("Content", lazy="selectin")


class MarketplaceReview(Base):
    __tablename__ = "marketplace_reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="SET NULL"), nullable=True
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    target_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    manner_tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MarketplaceListingLike(Base):
    __tablename__ = "marketplace_listing_likes"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MarketplaceKeywordAlert(Base):
    __tablename__ = "marketplace_keyword_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    keyword: Mapped[str] = mapped_column(String(60), nullable=False)
    # search_norm.norm() 규약으로 정규화된 매칭/중복판정 전용 컬럼 (180 마이그레이션).
    # 백필 전 기존 행은 NULL 일 수 있어 nullable — scripts/backfill_keyword_alert_norm.py 로 채운다.
    keyword_norm: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MarketplaceListingReport(Base):
    __tablename__ = "marketplace_listing_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="PENDING")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserBlock(Base):
    __tablename__ = "user_blocks"

    blocker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    blocked_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BusinessGroup(Base):
    """브랜드 그룹 (D4 — 스키마 자리만 선확보, 관리 UI 없음)."""

    __tablename__ = "business_group"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BusinessProfile(Base):
    """비즈니스 파트너 프로필 (D1 — 계정 부착형, 1계정:N프로필. 상한 3은 API 레벨 제약)."""

    __tablename__ = "business_profile"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # NULL = 관리자가 직접 등록해 소유자가 아직 연결되지 않은 프로필 (init/168 — 대표 결정, 소유자
    # 연결 기능은 후속 미구현). 자가신청(apply)은 항상 값을 채운다.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_group.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    intro: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    photo_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    photo_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[photo_content_id], lazy="selectin")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 검증축(계정 승인축 status 와 별개, init/151) — 중간 검증: CCCD 미수집
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    biz_license_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    biz_license_content: Mapped["Content | None"] = relationship(
        "Content", foreign_keys=[biz_license_content_id], lazy="selectin"
    )
    signboard_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    signboard_content: Mapped["Content | None"] = relationship(
        "Content", foreign_keys=[signboard_content_id], lazy="selectin"
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    rep_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    # 다국어 검색용 정규화 blob (164 migration, search_index.py 가 씀). None = 미색인(폴백 COALESCE 필요).
    search_blob: Mapped[str | None] = mapped_column(Text, nullable=True)


class UserFavoriteBusiness(Base):
    """업체 찜 (동네지도 프로필 실배선 P-BE T1). marketplace_listing_likes 패턴 미러."""

    __tablename__ = "user_favorite_business"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BusinessFollow(Base):
    """업체 단골(팔로우) — 찜(UserFavoriteBusiness)과 별개 개념, 동일 패턴 미러 (init/152)."""

    __tablename__ = "business_follow"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BusinessCategory(Base):
    """업체 카테고리 (W3-BE T1 — 오토바이 생활권 15종, 그룹 4종, 아이콘·3개국어 라벨)."""

    __tablename__ = "business_category"

    code: Mapped[str] = mapped_column(String(30), primary_key=True)
    group_code: Mapped[str] = mapped_column(String(20), nullable=False)
    group_label_ko: Mapped[str] = mapped_column(String(40), nullable=False)
    group_label_vi: Mapped[str] = mapped_column(String(40), nullable=False)
    group_label_en: Mapped[str] = mapped_column(String(40), nullable=False)
    group_sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    icon: Mapped[str] = mapped_column(String(30), nullable=False)
    label_ko: Mapped[str] = mapped_column(String(40), nullable=False)
    label_vi: Mapped[str] = mapped_column(String(40), nullable=False)
    label_en: Mapped[str] = mapped_column(String(40), nullable=False)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class PoiCategory(Base):
    """POI 대분류 (Phase A-1 — 지형·랜드마크/행정·생활 2종, 3개국어 라벨). BusinessCategory 미러."""

    __tablename__ = "poi_category"

    code: Mapped[str] = mapped_column(String(60), primary_key=True)
    label_ko: Mapped[str] = mapped_column(String(80), nullable=False)
    label_vi: Mapped[str] = mapped_column(String(80), nullable=False)
    label_en: Mapped[str] = mapped_column(String(80), nullable=False)
    icon: Mapped[str] = mapped_column(String(80), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Poi(Base):
    """POI (Phase A-1 — 읽기 전용 지도 핀. Phase B 에이전트 인제스천 대비). BusinessProfile 미러."""

    __tablename__ = "poi"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category: Mapped[str] = mapped_column(String(60), ForeignKey("poi_category.code"), nullable=False)
    name_ko: Mapped[str] = mapped_column(String(160), nullable=False)
    name_vi: Mapped[str | None] = mapped_column(String(160), nullable=True)
    name_en: Mapped[str | None] = mapped_column(String(160), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    photo_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    photo_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[photo_content_id], lazy="selectin")
    source: Mapped[str | None] = mapped_column(String(60), nullable=True)
    external_ref: Mapped[str | None] = mapped_column(String(200), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class BusinessReview(Base):
    """업체 후기 (동네지도 '후기쓰기' 실배선) — 장소 평가형: 유저당 업체 1건, 재작성 시 갱신.
    RepairReview(방문 건별 기록형)와 도메인이 달라 UNIQUE(profile_id, user_id) 를 둔다 (init/123)."""

    __tablename__ = "business_review"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    # 사장님 댓글 (③, 016 §8-2 P-BAD-REVIEW) — 후기당 1개라 컬럼 2개로 충분(새 테이블 불필요, init/198).
    owner_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 운영자 조치(숨김/복원, 대표 지적 260818) — marketplace_listing.moderated_at 과 같은 원리로
    # 컬럼만 추가(새 테이블 불필요). hidden_by 는 Report.handled_by 와 동일하게 admin username 문자열
    # (root 계정은 .env 정적 계정이라 UUID FK 가 불가능 — listings.py _admin_uuid 사고 회피).
    hidden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hidden_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    hidden_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # 사장님 노출용 사유 코드(O-1, 260827) — hidden_reason(자유텍스트, 신고자 특정 단서 위험)은
    # 오너에게 절대 내려주지 않고, 이 코드만 i18n 매핑해 노출한다. BizReviewReportReason 과 동일
    # 코드셋(SPAM/ABUSE/INAPPROPRIATE/OTHER) 재사용 — 새 마이그레이션 이전에 숨겨진 기존 건은 NULL.
    hidden_reason_code: Mapped[str | None] = mapped_column(String(20), nullable=True)


class BusinessNews(Base):
    """업체 소식 (SGR-326 T1 — 광고 BusinessAd 와 별개, 당근 비즈프로필 '소식' 모델 미러)."""

    __tablename__ = "business_news"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # 다국어 검색용 정규화 blob (164 migration, search_index.py 가 씀). None = 미색인(폴백 COALESCE 필요).
    search_blob: Mapped[str | None] = mapped_column(Text, nullable=True)

    photos: Mapped[list["BusinessNewsPhoto"]] = relationship(
        "BusinessNewsPhoto",
        back_populates="news",
        lazy="selectin",
        order_by="BusinessNewsPhoto.sort_order",
        cascade="all, delete-orphan",
    )


class BusinessNewsPhoto(Base):
    """업체 소식 사진 (W3-BE T1 — feed_post_images 패턴 미러)."""

    __tablename__ = "business_news_photo"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    news_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_news.id", ondelete="CASCADE"), nullable=False
    )
    content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    news: Mapped["BusinessNews"] = relationship("BusinessNews", back_populates="photos")
    content: Mapped["Content"] = relationship("Content", lazy="selectin")


class BusinessPrice(Base):
    """업체 가격표 항목 (파트너 라운지 가격표 등록 — business_news 컬럼 관례 미러)."""

    __tablename__ = "business_price"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MarketplaceAd(Base):
    __tablename__ = "marketplace_ads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_name: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str | None] = mapped_column(String(160), nullable=True)
    image_url: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # 레거시 read-only 폴백 (BP-4 이후 신규는 image_content_id)
    image_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    image_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[image_content_id], lazy="selectin")
    link_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    owner_business_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="SET NULL"), nullable=True
    )
    district_id: Mapped[int | None] = mapped_column(
        SmallInteger, ForeignKey("districts.id", ondelete="SET NULL"), nullable=True
    )
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)
    rating: Mapped[float | None] = mapped_column(Numeric(2, 1), nullable=True)
    service_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    established_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    business_hours: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    review_status: Mapped[str] = mapped_column(String(20), nullable=False, default="APPROVED")
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_ongoing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    subscription_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending_payment")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ad_fee: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    tier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ad_tiers.id", ondelete="RESTRICT"), nullable=False
    )
    tier: Mapped["AdTier"] = relationship("AdTier", lazy="selectin")
    monthly_price_snapshot_vnd: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # 다국어 검색용 정규화 blob (164 migration, search_index.py 가 씀). None = 미색인(폴백 COALESCE 필요).
    search_blob: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 웹 계약 게이트 (176 migration) — Apple 3.1.3(g) 회피: 계약동의/결제안내는 앱 밖 웹에서.
    # contract_method 는 현재 'checkbox_v1' 만. 실 전자서명 벤더 연동 시 이 값만 바뀌면 됨.
    contract_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), unique=True, nullable=True)
    contract_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contract_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    contract_signer_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contract_signer_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)


class AdTier(Base):
    __tablename__ = "ad_tiers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    monthly_price_vnd: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    exposure_weight: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    features_json: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # 근접 광고 계약형태 옵션A(260810_proximity_ad_contract_model.md) — 프리미엄만 TRUE(174 migration)
    proximity_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AdEvent(Base):
    """광고 성과 원시 이벤트 (ai-docs/spec/ad-performance-metrics.md §4-2, init/153).

    수집 엔드포인트가 후속 단계라 지금까지 ORM 모델 없이 테이블만 존재했다. 근접 광고
    엔드포인트(POST /proximity/enter)가 최초 실 삽입 경로 — surface='proximity'.
    """

    __tablename__ = "ad_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_ads.id", ondelete="CASCADE"), nullable=False
    )
    business_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(24), nullable=False)
    surface: Mapped[str] = mapped_column(String(24), nullable=False)
    user_key: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    anon_key: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_self: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    attributed_ad_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    stat_date: Mapped[date] = mapped_column(Date, nullable=False)


class ProximityPolicy(Base):
    """근접 광고 정책 파라미터 — 단일 row(id=1), 킬스위치 is_enabled(260806_proximity_ad_design.md §5-3)."""

    __tablename__ = "proximity_policy"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    notify_radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    visit_radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    visit_dwell_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    cooldown_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    daily_notify_cap: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    daily_rp_cap: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    max_speed_kmh: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    candidate_radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=3000)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ProximityHit(Base):
    """근접 진입 판정 상태·쿨다운·방문 적립 근거 (260806_proximity_ad_design.md §5-2).

    한 row 는 "알림 반경 진입 1회 episode"를 나타낸다 — notified_at 이 찍힌 뒤, 후속 호출에서
    같은 row 를 재사용해 dwell(체류) 조건이 차면 visit_confirmed_at/rp_granted 를 채운다.
    """

    __tablename__ = "proximity_hit"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_key: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    business_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="CASCADE"), nullable=False
    )
    ad_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_ads.id", ondelete="SET NULL"), nullable=True
    )
    hit_lat: Mapped[float] = mapped_column(Float, nullable=False)
    hit_lng: Mapped[float] = mapped_column(Float, nullable=False)
    distance_m: Mapped[int] = mapped_column(Integer, nullable=False)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    visit_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rp_granted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdDailyStat(Base):
    """광고 성과 일별 롤업 — 조회 전용(ai-docs/spec/ad-performance-metrics.md §4-3).

    적재 파이프라인(수집 엔드포인트·롤업 배치)은 후속 단계라 이 테이블은 지금 항상 비어 있다.
    대시보드/조회 API 는 반드시 이 롤업만 읽는다(원시 ad_events 스캔 금지).
    """

    __tablename__ = "ad_daily_stats"

    ad_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_ads.id", ondelete="CASCADE"), primary_key=True
    )
    stat_date: Mapped[date] = mapped_column(Date, primary_key=True)
    surface: Mapped[str] = mapped_column(String(24), primary_key=True)
    business_profile_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    impressions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reach: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    clicks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cta_call: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cta_follow: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cta_favorite: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cta_review: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cta_secondary: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    self_impressions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class FunnelEvent(Base):
    """퍼널 계측 원시 이벤트 (정본 §5 #5, D-18(a) — init/182 + 016 §3-2 #16 상호작용 로그 확장 — init/183).

    핵심 이벤트 8종(가입·매물조회·등록·문의·가격제안·약속·완료·후기) + 검색(#21) 등을 서버측 요청
    처리 지점에서 적재한다(ad_events 와 같은 패턴). event_type 카탈로그는 schemas.FunnelEventType
    이 SoT — DB CHECK 제약 없음(값 추가가 마이그레이션을 부르지 않도록). entity_id 는 이벤트
    종류마다 대상이 달라(매물/대화/약속/후기) 단일 FK 를 걸지 않는다. subject_type 과 짝지어
    (subject_type, entity_id) 로 대상을 특정한다(016 초안의 subject_id 대신 기존 UUID 체계 유지).
    """

    __tablename__ = "funnel_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(24), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    stat_date: Mapped[date] = mapped_column(Date, nullable=False)
    anon_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    subject_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    surface: Mapped[str | None] = mapped_column(String(30), nullable=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    acq_source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    props: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class FunnelDailyStat(Base):
    """퍼널 이벤트 일별 단계 수 롤업 — 조회 전용(어드민 API 는 이 테이블만 읽는다)."""

    __tablename__ = "funnel_daily_stats"

    stat_date: Mapped[date] = mapped_column(Date, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(24), primary_key=True)
    event_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class UserIdentityLink(Base):
    """익명ID→회원ID 소급 연결 (init/213, C5) — 로그인 시점에 요청 헤더의 anon_id/session_id 를
    적어둔다. 같은 세션 범위로만 연결하는 게 불변식이라, 이 표 자체가 "그 세션에서 로그인했다"는
    사실 이상을 주장하지 않는다 — 과거 다른 세션의 익명 활동을 이 링크로 소급 귀속시키지 않는다."""

    __tablename__ = "user_identity_links"

    anon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UserFirstTouchAttribution(Base):
    """익명ID 단위 first-touch 유입채널 (init/213, C6). PK=anon_id — 서비스 코드는
    INSERT ... ON CONFLICT DO NOTHING 만 쓴다(UPDATE 경로 없음, 덮어쓰기 원천 봉쇄).
    users.acquisition_source(단일 문자열, 가입 시점 값)와는 별개 — 대체하지 않는다."""

    __tablename__ = "user_first_touch_attribution"

    anon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    utm_source: Mapped[str | None] = mapped_column(String(60), nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String(60), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(60), nullable=True)
    utm_content: Mapped[str | None] = mapped_column(String(60), nullable=True)
    utm_term: Mapped[str | None] = mapped_column(String(60), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Translation(Base):
    __tablename__ = "translations"

    source_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_lang: Mapped[str | None] = mapped_column(String(8), nullable=True)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    text_ko: Mapped[str | None] = mapped_column(Text, nullable=True)
    text_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    text_vi: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


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


class InternalRewardGrant(Base):
    __tablename__ = "internal_reward_grants"

    idempotency_key: Mapped[str] = mapped_column(String(160), primary_key=True)
    operation: Mapped[str] = mapped_column(String(30), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index(
            "uq_notifications_source_event_user",
            "source_event_id",
            "user_id",
            unique=True,
            postgresql_where=text("source_event_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source_event_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    type: Mapped[str] = mapped_column(_notification_type_enum, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 알림함 클릭 이동용 딥링크 — 기존 push navigateTo 규약과 동일 (예: 'dm&id=<conv_id>', 'market&id=<listing_id>')
    link: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class NotificationOutbox(Base):
    """FD-6: producer transactional outbox.

    요청 핸들러가 도메인 변경과 **같은 트랜잭션**으로 이 row 를 적재하면(``noti_events.enqueue``),
    noti_worker 의 relay 가 Redis stream(noti:events)으로 발행하고 published_at 을 찍는다. Redis 순단·
    커밋~발행 사이 프로세스 종료로 인한 이벤트 유실을 막는다. 재발행 시 stream msg_id 가 바뀌어도
    소비자 멱등키는 이 row.id(event_id)로 고정되므로 중복 알림이 생기지 않는다.
    """

    __tablename__ = "notification_outbox"
    __table_args__ = (
        Index(
            "ix_notification_outbox_unpublished",
            "id",
            postgresql_where=text("published_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AdminAccount(Base):
    __tablename__ = "admin_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False, default="manager")  # 'admin'(root동등) | 'manager'
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
    keyword_alert: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    chat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    group_post: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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
    participant_1: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    participant_2: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    context_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    context_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # 203_group_conversation.sql — 그룹/오픈톡방 확장 (기본값 'direct' 는 기존 1:1 DM)
    conversation_type: Mapped[str] = mapped_column(String(20), nullable=False, default="direct")
    community_group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str | None] = mapped_column(String(60), nullable=True)
    photo_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    photo_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[photo_content_id], lazy="selectin")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    member_count: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 217_dm_conversation_notice.sql — 방마다 활성 공지 1건 (direct 방은 사용하지 않는다)
    notice_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_messages.id", ondelete="SET NULL"), nullable=True
    )
    notice_set_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notice_set_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DmConversationMember(Base):
    __tablename__ = "dm_conversation_members"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(12), nullable=False, default="member")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    muted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DmConversationBan(Base):
    """그룹 대화방 블랙리스트 (212_dm_conversation_bans.sql).

    강퇴(`DmConversationMember.left_at`)와 구분된다 — 강퇴는 재초대로 복귀 가능하지만,
    밴은 해제(레코드 삭제) 전까지 초대·입장을 모두 거부한다.
    """

    __tablename__ = "dm_conversation_bans"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # 등록자가 삭제돼도 밴 자체는 유지한다(SET NULL) — CASCADE 면 그 운영진의 밴이 전부 풀린다.
    banned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    # 자유 문자열(CHECK 제약 없음) — 'text'/'appointment'/'price_offer'/'voice'(워키토키 Phase A, 260827) 등
    message_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    # message_type='voice' 일 때: { durationMs: int, waveform?: number[] } (파형은 선택)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    image_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    image_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[image_content_id], lazy="selectin")
    # 210_dm_voice_message.sql — 워키토키 음성메시지용 FK (image_content_id 재사용 안 함)
    audio_content_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="SET NULL"), nullable=True
    )
    audio_content: Mapped["Content | None"] = relationship("Content", foreign_keys=[audio_content_id], lazy="selectin")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # 215_dm_message_sync.sql — 신규/수정/소프트삭제/공감변경 통합 폴링 워터마크.
    # onupdate 를 걸지 않는다 — read_at 갱신(읽음처리) 같은 무관한 UPDATE 가 폴링에 실리면
    # 안 되므로, 워터마크 대상 이벤트에서만 애플리케이션이 명시적으로 bump 한다.
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reply_to_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_messages.id", ondelete="SET NULL"), nullable=True
    )
    # 답장 앵커 스냅샷 { senderId, senderNickname, content } — 원본이 캐시/보관기간 밖이어도 렌더 가능
    reply_preview: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class DmConversationChannel(Base):
    """대화방 안의 게시판 채널 (218_dm_channel_board.sql).

    Discord 식 — 방(group/open) 하나에 채널 N개, 채널마다 글 목록. direct 방은 애플리케이션이 막는다.
    생성·수정·삭제는 운영진(owner/admin)만.
    """

    __tablename__ = "dm_conversation_channels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_conversations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 개설자가 탈퇴해도 채널은 방의 자산으로 남는다
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DmChannelPost(Base):
    """채널 게시글 (218_dm_channel_board.sql). 삭제는 소프트삭제 — 조회 시 서버가 필터한다."""

    __tablename__ = "dm_channel_posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_conversation_channels.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # contents.id 배열 (순서 = 표시 순서). 이미지는 전부 contents 중개 — 여기에 URL 을 담지 않는다.
    image_content_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DmMessageReaction(Base):
    """DM 메시지 공감 (Slack 스타일, 고정 팔레트) — 215_dm_message_sync.sql"""

    __tablename__ = "dm_message_reactions"

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    emoji: Mapped[str] = mapped_column(Text, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MarketplaceAppointment(Base):
    __tablename__ = "marketplace_appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_conversations.id", ondelete="CASCADE"), nullable=False
    )
    proposer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    when_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    place_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    place_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    place_lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PROPOSED")
    # S-16: 구매자의 거래 완료 요청. status 는 ACCEPTED 로 유지되고 이 필드로만 요청 여부를 표현한다.
    completion_requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    completion_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completion_declined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 거절 행위자 — 판매자 거절이면 판매자 id, 운영 이의 큐 기각이면 NULL (init/179 주석 참조).
    completion_declined_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MarketplaceLocationShare(Base):
    """거래중 실시간 위치공유 — 최신 좌표 1건만 보관(이력 미보관), 약속당 사용자별 1행."""

    __tablename__ = "marketplace_location_shares"
    __table_args__ = (
        UniqueConstraint("appointment_id", "user_id", name="marketplace_location_shares_appointment_user_uq"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_appointments.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    lat: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    accuracy_m: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consented_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consent_version: Mapped[str] = mapped_column(String(20), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class LiveActivityToken(Base):
    """iOS Live Activity 원격 갱신 푸시토큰 — Activity 별 발급, 사용자·종류·대상당 1행 (init/216).
    ai-docs/task/active/260829_live_activity_task.md Phase 3."""

    __tablename__ = "live_activity_tokens"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "subject_id", name="live_activity_tokens_user_kind_subject_uq"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    push_token: Mapped[str] = mapped_column(Text, nullable=False)
    locale: Mapped[str] = mapped_column(String(8), nullable=False, default="vi")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MarketplacePriceOffer(Base):
    __tablename__ = "marketplace_price_offers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_conversations.id", ondelete="CASCADE"), nullable=False
    )
    proposer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PROPOSED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


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
    """고객센터 문의. 013/016 §8(L5 이슈) #25~#27 로 이슈 인테이크 필드 확장(init/185).

    D-27=(a): 신고(Report)는 별도 테이블로 유지하고, 어드민 API 계층(admin_api/issues.py)에서
    이 테이블과 UNION 병합한다 — 신규 incident 테이블은 만들지 않는다.
    """

    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # EXTERNAL 채널(외부 수기 등록, #25)은 앱 사용자가 아닐 수 있어 nullable.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    has_unread_reply: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    # #25/#26/#27 — 값 카탈로그는 schemas.py 가 SoT (DB CHECK 없음, 기존 reason/event_type 관례 승계).
    category: Mapped[str | None] = mapped_column(String(30), nullable=True)
    severity: Mapped[str | None] = mapped_column(String(10), nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="APP")
    persona: Mapped[str] = mapped_column(String(10), nullable=False, default="USER")
    result_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    contract_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

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


# ── Info Modules ──────────────────────────────────────────────────


class WeatherCache(Base):
    __tablename__ = "weather_cache"

    cache_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    district_code: Mapped[str] = mapped_column(String(20), nullable=False)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    weather_type: Mapped[str] = mapped_column(String(20), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserFavoriteLocation(Base):
    __tablename__ = "user_favorite_location"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    label: Mapped[str] = mapped_column(String(50), primary_key=True)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    notify_rain: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FloodReport(Base):
    __tablename__ = "flood_report"

    report_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    reporter_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    district_code: Mapped[str] = mapped_column(String(20), nullable=False)
    street_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    depth_level: Mapped[str] = mapped_column(String(20), nullable=False)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confidence_score: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FloodConfirmation(Base):
    __tablename__ = "flood_confirmation"

    confirmation_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("flood_report.report_id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    confirmation_type: Mapped[str] = mapped_column(String(20), nullable=False)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FloodRiskDaily(Base):
    """날씨 기반 일일 침수 예측 위험 (상습 핫스팟 x 강수예보). 실제 제보와 분리."""

    __tablename__ = "flood_risk_daily"

    risk_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    hotspot_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    district_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    street_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    rain_prob: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(10), nullable=False)
    depth_hint: Mapped[str | None] = mapped_column(String(20), nullable=True)
    predicted_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class GasStation(Base):
    __tablename__ = "gas_station"

    station_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    osm_id: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    brand: Mapped[str | None] = mapped_column(String(50), nullable=True)
    brand_normalized: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    district_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    street_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    opening_hours: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    source_type: Mapped[str | None] = mapped_column(String(30), default="OSM", nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_24h: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GasStationSubmission(Base):
    """사용자 신규 주유소 제보 대기큐. confirm 시에만 gas_station 으로 upsert."""

    __tablename__ = "gas_station_submission"

    submission_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(50), nullable=True)
    brand_normalized: Mapped[str | None] = mapped_column(String(32), nullable=True)
    district_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reporter_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resulting_station_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("gas_station.station_id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PlaceSubmission(Base):
    """사용자 장소 제안 대기큐 (동네지도 프로필 실배선 P-BE T2). gas_station_submission 패턴 미러 —
    승인은 상태 전환만, business_profile 자동 upsert 는 이번 범위 아님."""

    __tablename__ = "place_submission"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reporter_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(12), default="PENDING")
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FuelPriceSnapshot(Base):
    __tablename__ = "fuel_price_snapshot"

    snapshot_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    effective_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    region: Mapped[str] = mapped_column(String(10), nullable=False)
    brand: Mapped[str] = mapped_column(String(32), nullable=False)
    fuel_type: Mapped[str] = mapped_column(String(20), nullable=False)
    price_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    validated_by: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FuelPriceReport(Base):
    __tablename__ = "fuel_price_report"

    report_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    station_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("gas_station.station_id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    fuel_type: Mapped[str] = mapped_column(String(20), nullable=False)
    price_vnd: Mapped[int] = mapped_column(Integer, nullable=False)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    deviation_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)


class FuelPriceFetchLog(Base):
    __tablename__ = "fuel_price_fetch_log"

    log_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    items_found: Mapped[int] = mapped_column(Integer, default=0)
    items_inserted: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)


class GasStationWaitReport(Base):
    __tablename__ = "gas_station_wait_report"

    wait_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    station_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("gas_station.station_id"), nullable=False)
    reporter_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    wait_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class RepairShop(Base):
    __tablename__ = "repair_shop"

    shop_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    osm_id: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    district_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    street_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    opening_hours: Mapped[str | None] = mapped_column(String(100), nullable=True)
    brand_focus: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    added_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RepairShopSubmission(Base):
    """사용자 신규 정비소 제보 대기큐. confirm 시에만 repair_shop 으로 upsert."""

    __tablename__ = "repair_shop_submission"

    submission_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    lng: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    district_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reporter_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resulting_shop_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("repair_shop.shop_id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RepairServiceType(Base):
    __tablename__ = "repair_service_type"

    service_code: Mapped[str] = mapped_column(String(20), primary_key=True)
    service_name_ko: Mapped[str | None] = mapped_column(String(100), nullable=True)
    service_name_vi: Mapped[str | None] = mapped_column(String(100), nullable=True)
    service_name_en: Mapped[str | None] = mapped_column(String(100), nullable=True)
    typical_duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)


class RepairReview(Base):
    __tablename__ = "repair_review"

    review_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    shop_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("repair_shop.shop_id"), nullable=False)
    reviewer_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    service_code: Mapped[str | None] = mapped_column(
        String(20), ForeignKey("repair_service_type.service_code"), nullable=True
    )
    motorcycle_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    price_vnd: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    upvotes: Mapped[int] = mapped_column(Integer, default=0)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)


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


class LevelupRewardPolicy(Base):
    """레벨업 보상 정책 (단일행 config). gain_exp() 가 레벨업 시 읽어 적용. SGR-228."""

    __tablename__ = "levelup_reward_policy"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    gold: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    skill_pt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


# ── T&S 관리자 콘솔 리메이크 (통합 신고/제재/감사로그/공지·FAQ/금칙어) ──────


class Report(Base):
    """통합 신고 (LISTING/USER/DM/POST/COMMENT/REVIEW/BIZ/GROUP_MESSAGE). 093 marketplace_listing_reports 는 동결 보존, 이 테이블로 일원화."""

    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_type: Mapped[str] = mapped_column(String(12), nullable=False)
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # BIZ 신고(199)는 오너 미연결 업체(init/168, user_id NULL)도 대상이 될 수 있어 NULL 허용.
    reported_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE"), nullable=True
    )
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_conversations.id", ondelete="CASCADE"), nullable=True
    )
    post_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("feed_posts.id", ondelete="SET NULL"), nullable=True
    )
    comment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("post_comments.id", ondelete="SET NULL"), nullable=True
    )
    # 업체 후기 신고(④, 016 §8-2 P-BAD-REVIEW) — 새 인프라 대신 REVIEW 를 통합 reports 에 합류(init/198).
    review_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_review.id", ondelete="CASCADE"), nullable=True
    )
    # 소비자→업체 신고(199, 대표 지적 2026-08-18) — 기존 신고 방향에 빠져 있던 갭. BIZ 로 합류.
    business_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_profile.id", ondelete="CASCADE"), nullable=True
    )
    # 그룹 대화 신고(209, P5-5 — Q-3: 방 전체가 아니라 특정 메시지 단위). 그룹/오픈톡방도
    # 전용 테이블 없이 dm_messages 를 재사용(203)하므로 그 메시지를 그대로 참조한다.
    group_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dm_messages.id", ondelete="CASCADE"), nullable=True
    )
    reason: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="PENDING")
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # R-2(260819 W3) — resolution_note(내부 메모)와 분리된 신고자 공개용 요약 사유.
    # 어드민이 종결(RESOLVED/REJECTED) 시 선택 입력, 비어있으면 통보 문구는 고정 문구로 폴백.
    public_resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    handled_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # #26(013/016 §8) — 처리 결과 코드. RESOLVED/REJECTED 전이 시 미입력이면 422(init/185).
    result_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # R-3(017 §12-B) — 신고자 본인의 취소 시각. status='CANCELLED' 전이 시 세팅(196).
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 신고 코멘트 + 사진 첨부(197, 대표 지적 2026-08-18) — marketplace_listing_images 팬아웃 미러.
    images: Mapped[list["ReportImage"]] = relationship(
        "ReportImage",
        back_populates="report",
        lazy="selectin",
        order_by="ReportImage.sort_order",
        cascade="all, delete-orphan",
    )


class ReportImage(Base):
    __tablename__ = "report_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False
    )
    content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contents.id", ondelete="CASCADE"), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    report: Mapped["Report"] = relationship("Report", back_populates="images")
    content: Mapped["Content"] = relationship("Content", lazy="selectin")


@event.listens_for(Report, "after_insert")
def _report_after_insert_alert_ops(mapper, connection, target):
    """F-17: 신고 접수 시 운영자 알림을 FD-6 outbox 에 적재한다.

    신고 진입점이 여러 라우터(users/dm/feed/market)에 흩어져 있어 각각 배선하는 대신
    Report INSERT 자체에 훅을 걸어 빠짐없이 잡는다. after_insert 는 flush 중 호출되며
    ORM Session 이 아닌 Core Connection 만 제공하므로 noti_events.enqueue()(session.add) 대신
    같은 connection/트랜잭션에 직접 INSERT 한다 — Report 커밋과 outbox 적재는 여전히 원자적이다.
    """
    connection.execute(
        NotificationOutbox.__table__.insert().values(
            event_type="report.submitted",
            payload={
                "report_id": str(target.id),
                "target_type": target.target_type,
                "reason": target.reason,
                "reporter_id": str(target.reporter_id),
                "reported_user_id": str(target.reported_user_id),
            },
        )
    )


class UserSanction(Base):
    __tablename__ = "user_sanctions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    report_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id", ondelete="SET NULL"), nullable=True
    )
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    admin_username: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    admin_username: Mapped[str] = mapped_column(String(50), nullable=False)
    admin_role: Mapped[str] = mapped_column(String(10), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notice(Base):
    __tablename__ = "notices"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title_vi: Mapped[str] = mapped_column(String(200), nullable=False)
    title_ko: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title_en: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body_vi: Mapped[str] = mapped_column(Text, nullable=False)
    body_ko: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Faq(Base):
    __tablename__ = "faqs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False, default="GENERAL")
    question_vi: Mapped[str] = mapped_column(String(300), nullable=False)
    question_ko: Mapped[str | None] = mapped_column(String(300), nullable=True)
    question_en: Mapped[str | None] = mapped_column(String(300), nullable=True)
    answer_vi: Mapped[str] = mapped_column(Text, nullable=False)
    answer_ko: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class BannedKeyword(Base):
    __tablename__ = "banned_keywords"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    keyword: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
