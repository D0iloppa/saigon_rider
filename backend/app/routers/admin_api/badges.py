"""admin JSON API — 배지 관리 (badges 테이블).

`admin_legacy.py`의 동명 Jinja 라우트(2643-2805)를 JSON 응답으로 이관한 것 — i18n
이름/설명(ko/vi/en), 아이콘(emoji/URL 텍스트 또는 contents 이미지), 습득 조건
룰(condition_rule: {operator, conditions:[{metric,op,value}]}) 을 그대로 옮겼다.
구 `/admin-legacy/badges` 라우트는 손대지 않고 병행 유지한다.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import Badge, UserBadge
from ...utils import build_imgproxy_url
from ._audit import audit

router = APIRouter(prefix="/badges")

_ICON_THUMB_OPTS = "rs:fill:96:96:1"

# legacy _BADGE_METRICS / _BADGE_OPS 와 동일 — 습득 조건 룰의 허용값
BADGE_METRICS = [
    ("QUEST_CLEAR_COUNT", "퀘스트 클리어 횟수"),
    ("DISTANCE_TOTAL_KM", "누적 주행 거리 (km)"),
    ("STREAK_DAYS", "연속 라이딩 일수"),
    ("SAFETY_GRADE_A_COUNT", "안전등급 A 횟수"),
    ("LEVEL", "유저 레벨"),
    ("RIDE_COUNT", "총 라이딩 횟수"),
]
_BADGE_METRIC_CODES = {code for code, _ in BADGE_METRICS}
BADGE_OPS = [">=", ">", "==", "<=", "<"]


class BadgeCondition(BaseModel):
    metric: str
    op: str
    value: float

    @field_validator("metric")
    @classmethod
    def _check_metric(cls, v: str) -> str:
        if v not in _BADGE_METRIC_CODES:
            raise ValueError(f"invalid metric (allowed: {sorted(_BADGE_METRIC_CODES)})")
        return v

    @field_validator("op")
    @classmethod
    def _check_op(cls, v: str) -> str:
        if v not in BADGE_OPS:
            raise ValueError(f"invalid op (allowed: {BADGE_OPS})")
        return v


class BadgeConditionRule(BaseModel):
    operator: str = "AND"
    conditions: list[BadgeCondition] = []

    @field_validator("operator")
    @classmethod
    def _check_operator(cls, v: str) -> str:
        if v not in ("AND", "OR"):
            raise ValueError("operator must be AND or OR")
        return v


class BadgeRow(BaseModel):
    id: uuid.UUID
    name: str
    name_ko: str | None
    name_vi: str | None
    name_en: str | None
    description_ko: str | None
    description_vi: str | None
    description_en: str | None
    icon_url: str | None
    icon_content_id: uuid.UUID | None
    icon_display_url: str | None
    condition_rule: BadgeConditionRule | None
    is_active: bool
    earned_count: int
    created_at: datetime


class BadgeWriteRequest(BaseModel):
    name: str
    name_ko: str | None = None
    name_vi: str | None = None
    name_en: str | None = None
    description_ko: str | None = None
    description_vi: str | None = None
    description_en: str | None = None
    icon_url: str | None = None
    icon_content_id: uuid.UUID | None = None
    is_active: bool = True
    condition_rule: BadgeConditionRule | None = None


def _badge_row(b: Badge, earned_count: int) -> BadgeRow:
    return BadgeRow(
        id=b.id,
        name=b.name,
        name_ko=b.name_ko,
        name_vi=b.name_vi,
        name_en=b.name_en,
        description_ko=b.description_ko,
        description_vi=b.description_vi,
        description_en=b.description_en,
        icon_url=b.icon_url,
        icon_content_id=b.icon_content_id,
        icon_display_url=build_imgproxy_url(b.icon_content.file_path, options=_ICON_THUMB_OPTS)
        if b.icon_content
        else None,
        condition_rule=b.condition_rule,
        is_active=b.is_active,
        earned_count=earned_count,
        created_at=b.created_at,
    )


async def _get_badge_or_404(db: AsyncSession, badge_id: uuid.UUID) -> Badge:
    badge = await db.get(Badge, badge_id)
    if badge is None:
        raise HTTPException(status_code=404, detail="Badge not found")
    return badge


@router.get("/meta", summary="습득 조건 허용값 (metric/op)")
async def get_badge_meta(_session: AdminSession = Depends(verify_admin_api)):
    return {
        "metrics": [{"code": code, "label": label} for code, label in BADGE_METRICS],
        "ops": BADGE_OPS,
    }


@router.get("", response_model=list[BadgeRow], summary="배지 목록")
async def list_badges(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    badges = (await db.execute(select(Badge).order_by(Badge.created_at.desc()))).scalars().all()
    counts = dict((await db.execute(select(UserBadge.badge_id, func.count()).group_by(UserBadge.badge_id))).all())
    return [_badge_row(b, counts.get(b.id, 0)) for b in badges]


@router.post("", response_model=BadgeRow, status_code=201, summary="배지 생성")
async def create_badge(
    body: BadgeWriteRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    badge = Badge(
        name=body.name.strip(),
        name_ko=(body.name_ko or "").strip() or None,
        name_vi=(body.name_vi or "").strip() or None,
        name_en=(body.name_en or "").strip() or None,
        description_ko=(body.description_ko or "").strip() or None,
        description_vi=(body.description_vi or "").strip() or None,
        description_en=(body.description_en or "").strip() or None,
        icon_url=(body.icon_url or "").strip() or None,
        icon_content_id=body.icon_content_id,
        is_active=body.is_active,
        condition_rule=body.condition_rule.model_dump() if body.condition_rule else None,
    )
    db.add(badge)
    await db.flush()
    await audit(db, session, request, "BADGE_CREATE", "badge", str(badge.id), {"name": badge.name})
    await db.commit()
    await db.refresh(badge)
    return _badge_row(badge, 0)


@router.put("/{badge_id}", response_model=BadgeRow, summary="배지 수정")
async def update_badge(
    badge_id: uuid.UUID,
    body: BadgeWriteRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    badge = await _get_badge_or_404(db, badge_id)
    badge.name = body.name.strip()
    badge.name_ko = (body.name_ko or "").strip() or None
    badge.name_vi = (body.name_vi or "").strip() or None
    badge.name_en = (body.name_en or "").strip() or None
    badge.description_ko = (body.description_ko or "").strip() or None
    badge.description_vi = (body.description_vi or "").strip() or None
    badge.description_en = (body.description_en or "").strip() or None
    badge.icon_url = (body.icon_url or "").strip() or None
    badge.icon_content_id = body.icon_content_id
    badge.is_active = body.is_active
    badge.condition_rule = body.condition_rule.model_dump() if body.condition_rule else None

    await audit(db, session, request, "BADGE_UPDATE", "badge", str(badge_id), {"name": badge.name})
    await db.commit()
    await db.refresh(badge)
    count = (await db.execute(select(func.count()).where(UserBadge.badge_id == badge_id))).scalar_one()
    return _badge_row(badge, count)


@router.delete("/{badge_id}", status_code=204, summary="배지 삭제")
async def delete_badge(
    badge_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    badge = await _get_badge_or_404(db, badge_id)
    await db.delete(badge)
    await audit(db, session, request, "BADGE_DELETE", "badge", str(badge_id))
    await db.commit()
