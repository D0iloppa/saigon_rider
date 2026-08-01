from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow():
    return datetime.now(UTC)


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
