"""admin JSON API — 퀘스트 관리 (quests 테이블).

`admin_legacy.py`의 동명 Jinja 라우트(463-762행, `/admin-legacy/quests` +
`/admin-legacy/quests/{new,edit,delete}`)를 JSON 응답으로 이관한 것 — legacy 폼이
실제로 노출하는 필드(제목 ko/vi/en, period, district, required_level,
target_distance_km, badge, is_active, reward_exp/gold/item, starts_at/ends_at,
이미지 3슬롯)만 그대로 옮겼다. `criteria`(JSONB)/rider_type_id/card_type/
target_lat·lng/available_from·to/min_safety_grade_id/mission_code/rarity/csv/
hero_image_url 은 legacy 폼에서도 편집 대상이 아니므로(모델 컬럼은 존재하나
어드민 미노출) 이 포트에서도 손대지 않는다 — 생성 시 ORM 기본값을 그대로 둔다.
legacy 는 이미지 슬롯을 파일 업로드로 받지만, 이 SPA 는 다른 admin JSON API
(배지/POI/피드)와 동일하게 이미 업로드된 `contents.id`(UUID) 를 입력받는다
(업로드 위젯 없음).
구 `/admin-legacy/quests` 라우트는 손대지 않고 병행 유지한다.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_root_api
from ...database import get_db
from ...models import District, Quest
from ...schemas import Page
from ...utils import build_imgproxy_url
from ._audit import audit

router = APIRouter(prefix="/quests")

_PERIODS = ("DAILY", "WEEKLY", "EVENT")
_BADGES = ("HOT", "NEW", "LIMITED")

_THUMB_OPTS = "rs:fill:120:80:1"


def _img_url(content) -> str | None:
    return build_imgproxy_url(content.file_path, options=_THUMB_OPTS) if content and content.file_path else None


class QuestRow(BaseModel):
    id: uuid.UUID
    title_ko: str | None
    title_vi: str | None
    title_en: str | None
    period: str
    district_id: int | None
    district_name: str | None
    required_level: int
    target_distance_km: Decimal
    badge: str | None
    is_active: bool
    reward_exp: int
    reward_gold: int
    reward_item: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    main_content_id: uuid.UUID | None
    thumbnail_content_id: uuid.UUID | None
    banner_content_id: uuid.UUID | None
    main_image_url: str | None
    thumbnail_image_url: str | None
    banner_image_url: str | None
    created_at: datetime


class QuestWriteRequest(BaseModel):
    title_ko: str
    title_vi: str | None = None
    title_en: str | None = None
    period: str = "DAILY"
    district_id: int | None = None
    required_level: int = 1
    target_distance_km: Decimal
    badge: str | None = None
    is_active: bool = True
    reward_exp: int = 0
    reward_gold: int = 0
    reward_item: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    main_content_id: uuid.UUID | None = None
    thumbnail_content_id: uuid.UUID | None = None
    banner_content_id: uuid.UUID | None = None


def _quest_row(q: Quest) -> QuestRow:
    return QuestRow(
        id=q.id,
        title_ko=q.title_ko,
        title_vi=q.title_vi,
        title_en=q.title_en,
        period=q.period,
        district_id=q.district_id,
        district_name=q.district.name_ko if q.district else None,
        required_level=q.required_level,
        target_distance_km=q.target_distance_km,
        badge=q.badge,
        is_active=q.is_active,
        reward_exp=q.reward_exp,
        reward_gold=q.reward_gold,
        reward_item=q.reward_item,
        starts_at=q.starts_at,
        ends_at=q.ends_at,
        main_content_id=q.main_content_id,
        thumbnail_content_id=q.thumbnail_content_id,
        banner_content_id=q.banner_content_id,
        main_image_url=_img_url(q.main_content),
        thumbnail_image_url=_img_url(q.thumbnail_content),
        banner_image_url=_img_url(q.banner_content),
        created_at=q.created_at,
    )


async def _get_quest_or_404(db: AsyncSession, quest_id: uuid.UUID) -> Quest:
    quest = await db.get(Quest, quest_id)
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")
    return quest


def _validate_period(period: str) -> None:
    if period not in _PERIODS:
        raise HTTPException(status_code=400, detail="Invalid period")


def _validate_badge(badge: str | None) -> str | None:
    return badge if badge in _BADGES else None


@router.get("/meta", summary="드롭다운 소스 (구/기간/뱃지)")
async def get_quest_meta(
    _session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    districts = (await db.execute(select(District).order_by(District.sort_order, District.id))).scalars().all()
    return {
        "districts": [{"id": d.id, "name_ko": d.name_ko} for d in districts],
        "periods": list(_PERIODS),
        "badges": list(_BADGES),
    }


@router.get("", response_model=Page[QuestRow], summary="퀘스트 목록")
async def list_quests(
    q: str = "",
    period: str = "",
    active: str = "",
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Quest)
    count_stmt = select(func.count()).select_from(Quest)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Quest.title_ko.ilike(like))
        count_stmt = count_stmt.where(Quest.title_ko.ilike(like))
    if period in _PERIODS:
        stmt = stmt.where(Quest.period == period)
        count_stmt = count_stmt.where(Quest.period == period)
    if active in ("0", "1"):
        flag = active == "1"
        stmt = stmt.where(Quest.is_active.is_(flag))
        count_stmt = count_stmt.where(Quest.is_active.is_(flag))

    total = (await db.execute(count_stmt)).scalar_one()
    quests = (
        (await db.execute(stmt.order_by(Quest.created_at.desc()).offset((page - 1) * size).limit(size))).scalars().all()
    )
    return Page(items=[_quest_row(qu) for qu in quests], total=total, page=page, size=size)


@router.get("/{quest_id}", response_model=QuestRow, summary="퀘스트 단건 조회")
async def get_quest(
    quest_id: uuid.UUID,
    _session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    return _quest_row(await _get_quest_or_404(db, quest_id))


@router.post("", response_model=QuestRow, status_code=201, summary="퀘스트 생성")
async def create_quest(
    body: QuestWriteRequest,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    _validate_period(body.period)
    quest = Quest(
        title_ko=body.title_ko.strip() or None,
        title_vi=(body.title_vi or "").strip() or None,
        title_en=(body.title_en or "").strip() or None,
        period=body.period,
        district_id=body.district_id,
        required_level=body.required_level,
        target_distance_km=body.target_distance_km,
        badge=_validate_badge(body.badge),
        is_active=body.is_active,
        reward_exp=body.reward_exp,
        reward_gold=body.reward_gold,
        reward_item=(body.reward_item or "").strip() or None,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        main_content_id=body.main_content_id,
        thumbnail_content_id=body.thumbnail_content_id,
        banner_content_id=body.banner_content_id,
    )
    db.add(quest)
    await db.flush()
    await audit(db, session, request, "QUEST_CREATE", "quest", str(quest.id), {"title_ko": quest.title_ko})
    await db.commit()
    await db.refresh(quest, attribute_names=["district", "main_content", "thumbnail_content", "banner_content"])
    return _quest_row(quest)


@router.put("/{quest_id}", response_model=QuestRow, summary="퀘스트 수정")
async def update_quest(
    quest_id: uuid.UUID,
    body: QuestWriteRequest,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    quest = await _get_quest_or_404(db, quest_id)
    _validate_period(body.period)

    quest.title_ko = body.title_ko.strip() or None
    quest.title_vi = (body.title_vi or "").strip() or None
    quest.title_en = (body.title_en or "").strip() or None
    quest.period = body.period
    quest.district_id = body.district_id
    quest.required_level = body.required_level
    quest.target_distance_km = body.target_distance_km
    quest.badge = _validate_badge(body.badge)
    quest.is_active = body.is_active
    quest.reward_exp = body.reward_exp
    quest.reward_gold = body.reward_gold
    quest.reward_item = (body.reward_item or "").strip() or None
    quest.starts_at = body.starts_at
    quest.ends_at = body.ends_at
    quest.main_content_id = body.main_content_id
    quest.thumbnail_content_id = body.thumbnail_content_id
    quest.banner_content_id = body.banner_content_id

    await audit(db, session, request, "QUEST_UPDATE", "quest", str(quest_id), {"title_ko": quest.title_ko})
    await db.commit()
    await db.refresh(quest, attribute_names=["district", "main_content", "thumbnail_content", "banner_content"])
    return _quest_row(quest)


@router.delete("/{quest_id}", status_code=204, summary="퀘스트 삭제")
async def delete_quest(
    quest_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    quest = await _get_quest_or_404(db, quest_id)
    await db.delete(quest)
    await audit(db, session, request, "QUEST_DELETE", "quest", str(quest_id))
    await db.commit()
