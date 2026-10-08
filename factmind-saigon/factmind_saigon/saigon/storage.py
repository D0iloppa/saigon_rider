"""fm_* tables (database/init/253_fm_tables.sql) — ORM on the host's shared declarative Base + small query helpers.

Public-route helpers (used as-is by routes_public): get_published_by_slug, list_published_business,
get_platform_publication, is_withdrawn_slug, is_platform_withdrawn, record_event.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from app.models import Base, utcnow
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, SmallInteger, String, Text, UniqueConstraint, select
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column


class FmSubject(Base):
    __tablename__ = "fm_subject"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    source_ref: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    slug: Mapped[Optional[str]] = mapped_column(Text, nullable=True, unique=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft")
    locale_source: Mapped[str] = mapped_column(Text, nullable=False, default="vi")
    ward_id: Mapped[Optional[int]] = mapped_column(SmallInteger, ForeignKey("wards.id", ondelete="SET NULL"), nullable=True)
    category_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)


class FmSnapshot(Base):
    __tablename__ = "fm_snapshot"
    __table_args__ = (UniqueConstraint("subject_id", "version"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fm_subject.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    facts: Mapped[dict] = mapped_column(JSONB, nullable=False)
    jsonld: Mapped[dict] = mapped_column(JSONB, nullable=False)
    source_digest: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class FmPublication(Base):
    __tablename__ = "fm_publication"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fm_subject.id", ondelete="CASCADE"), nullable=False)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("fm_snapshot.id"), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    files: Mapped[dict] = mapped_column(JSONB, nullable=False)
    artifact_digest: Mapped[str] = mapped_column(Text, nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    verification: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    index_notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class FmEvent(Base):
    __tablename__ = "fm_event"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    subject_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("fm_subject.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


async def get_published_by_slug(db: AsyncSession, slug: str) -> Optional[FmPublication]:
    """The live publication of a business subject (subject and publication both 'published'), else None."""
    return (
        await db.execute(
            select(FmPublication)
            .join(FmSubject, FmSubject.id == FmPublication.subject_id)
            .where(FmSubject.slug == slug, FmSubject.status == "published", FmPublication.status == "published")
        )
    ).scalar_one_or_none()


async def is_withdrawn_slug(db: AsyncSession, slug: str) -> bool:
    """True when the slug belongs to a withdrawn subject (public route answers 410 instead of 404)."""
    return (
        await db.execute(select(FmSubject.id).where(FmSubject.slug == slug, FmSubject.status == "withdrawn"))
    ).first() is not None


async def is_platform_withdrawn(db: AsyncSession) -> bool:
    return (
        await db.execute(select(FmSubject.id).where(FmSubject.kind == "platform", FmSubject.status == "withdrawn"))
    ).first() is not None


async def get_platform_publication(db: AsyncSession) -> Optional[FmPublication]:
    return (
        await db.execute(
            select(FmPublication)
            .join(FmSubject, FmSubject.id == FmPublication.subject_id)
            .where(FmSubject.kind == "platform", FmSubject.status == "published", FmPublication.status == "published")
        )
    ).scalar_one_or_none()


async def list_published_business(db: AsyncSession) -> list[tuple[FmSubject, FmPublication, FmSnapshot]]:
    """Live business subjects as (subject, publication, snapshot), ordered by published_at then id."""
    rows = (
        await db.execute(
            select(FmSubject, FmPublication, FmSnapshot)
            .join(FmPublication, FmPublication.subject_id == FmSubject.id)
            .join(FmSnapshot, FmSnapshot.id == FmPublication.snapshot_id)
            .where(FmSubject.kind == "business", FmSubject.status == "published", FmPublication.status == "published")
            .order_by(FmPublication.published_at, FmSubject.id)
        )
    ).all()
    return [(s, p, n) for s, p, n in rows]


async def record_event(db: AsyncSession, kind: str, body: dict, subject_id: Optional[uuid.UUID] = None) -> FmEvent:
    event = FmEvent(kind=kind, body=body, subject_id=subject_id)
    db.add(event)
    await db.flush()
    return event
