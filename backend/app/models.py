import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, SmallInteger, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


# create_type=False: DB에 이미 생성된 ENUM 사용 (001_init_schema.sql에서 생성됨)
_rider_type_enum = ENUM('COMMUTER', 'CAFE_HUNTER', 'NIGHT_RIDER', name='rider_type', create_type=False)


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
    passcode_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
