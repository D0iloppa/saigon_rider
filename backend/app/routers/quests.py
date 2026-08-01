import json
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import Quest, User, UserQuest
from ..schemas import (
    Page,
    QuestAcceptRequest,
    QuestAcceptResponse,
    QuestOut,
)
from ..utils import (
    MOCK_IMG_ENDPOINT,
    QUEST_BANNER_IMGPROXY_OPTIONS,
    QUEST_MAIN_IMGPROXY_OPTIONS,
    QUEST_THUMB_IMGPROXY_OPTIONS,
    QUEST_TZ,
    build_imgproxy_url,
    quest_card_expires_at,
)

log = logging.getLogger(__name__)

_CONTENTS_BASE_PATH = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))


def _quest_img_url(file_path: str, options: str) -> str:
    """imgproxy URL + 파일 mtime 캐시버스터. 동일 경로 파일이 교체돼도 클라가 새로 받게 한다
    (imgproxy 응답 Cache-Control max-age=1y 대응)."""
    url = build_imgproxy_url(file_path, options=options)
    try:
        return f"{url}?v={int((_CONTENTS_BASE_PATH / file_path).stat().st_mtime)}"
    except OSError:
        return url


def _calc_period_key(period: str) -> str:
    today = datetime.now(QUEST_TZ).date()
    if period == "DAILY":
        return today.isoformat()
    if period == "WEEKLY":
        iso = today.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    return "ONCE"


def _calc_card_expires(period: str, ends_at: datetime | None) -> str | None:
    expires_at = quest_card_expires_at(period, ends_at)
    return expires_at.isoformat() if expires_at else None


router = APIRouter(prefix="/quests", tags=["퀘스트 (Quest)"])


async def _daily_slot_base(db: AsyncSession) -> int:
    """sre_seed_config에서 일일 퀘스트 슬롯 기본값을 직접 읽음 (공유 DB)."""
    row = (
        await db.execute(text("SELECT value_text FROM sre_seed_config WHERE seed_code='DAILY_QUEST_BASE_SLOTS'"))
    ).first()
    try:
        return int(row[0]) if row else 3
    except (TypeError, ValueError):
        return 3


def _level_slot_bonus(user: User | None) -> int:
    """레벨에 따른 추가 수령 슬롯. TODO(A-2 아이템/효과 정의): 규칙 확정 후 구현. 현재 0."""
    return 0


async def _item_slot_bonus(db: AsyncSession, user: User | None) -> int:
    """추가 수령 슬롯 = 착용 아이템 QUEST_SLOT + 스킬(quest_slot 단계3에서 +1).
    스킬 컬럼은 0~9 서브포인트라 단계3 = 9 (SGR-280). 엔진 장애 시 아이템분만 0(graceful)."""
    if user is None:
        return 0
    skill_bonus = 1 if user.skill_quest_slot >= 9 else 0
    try:
        eff = await engine_client.get_equip_effects(str(user.id))
    except httpx.HTTPError:
        return skill_bonus
    # 아이템 슬롯 보너스는 +1 상한(cap +2 = 아이템 1 + 스킬 1). 복리(슬롯↑→RP↑) 억제.
    item_bonus = min(int(eff.get("quest_slot_bonus", 0)), 1)
    return item_bonus + skill_bonus


# 일일 슬롯 합산 하드캡 (SGR-228 후속). base3 + 레벨 +4 + 아이템 +2 = 9 가 설계 상한.
# RP/골드 일 수급 천장이 슬롯수에 직결되므로 명문화한다.
MAX_DAILY_SLOTS = 9


async def _daily_claimable_max(db: AsyncSession, user: User | None) -> int:
    """일일 퀘스트 수령가능 최대 횟수 = base + 레벨 보너스 + 착용아이템 보너스 (상한 9).
    수령 게이트(accept)와 홈 추천 개수가 공유하는 단일 소스."""
    total = await _daily_slot_base(db) + _level_slot_bonus(user) + await _item_slot_bonus(db, user)
    return min(total, MAX_DAILY_SLOTS)


async def _daily_slot_used(db: AsyncSession, user_id: uuid.UUID, period_key: str) -> int:
    """오늘 수령한 DAILY 퀘스트 수. ACCEPTED+COMPLETED+EXPIRED 모두 카운트
    (포기로 삭제된 row만 미카운트 — 환불 효과)."""
    result = await db.execute(
        select(func.count())
        .select_from(UserQuest)
        .join(Quest, Quest.id == UserQuest.quest_id)
        .where(
            UserQuest.user_id == user_id,
            UserQuest.period_key == period_key,
            Quest.period == "DAILY",
            UserQuest.status.in_(["ACCEPTED", "COMPLETED", "EXPIRED"]),
        )
    )
    return int(result.scalar_one())


def _to_out(quest: Quest) -> QuestOut:
    out = QuestOut.model_validate(quest)
    # 퀘스트 이미지 3종 — 각 슬롯은 자기 컨텐츠 파일에 매핑된다(썸네일·배너는 메인에서 생성된 파생 파일).
    # 슬롯별 교체(관리자 업로드)는 해당 슬롯 컨텐츠만 바꾼다. 옵션은 비표준 업로드를 정규화하는 안전장치.
    if quest.main_content and quest.main_content.file_path:
        out.main_image_url = _quest_img_url(quest.main_content.file_path, QUEST_MAIN_IMGPROXY_OPTIONS)
    if quest.thumbnail_content and quest.thumbnail_content.file_path:
        out.thumbnail_image_url = _quest_img_url(quest.thumbnail_content.file_path, QUEST_THUMB_IMGPROXY_OPTIONS)
    if quest.banner_content and quest.banner_content.file_path:
        out.banner_image_url = _quest_img_url(quest.banner_content.file_path, QUEST_BANNER_IMGPROXY_OPTIONS)
    chain: list[str] = []
    if quest.thumbnail_content and quest.thumbnail_content.file_path:
        chain.append(build_imgproxy_url(quest.thumbnail_content.file_path))
    if quest.hero_image_url:
        chain.append(quest.hero_image_url)
    if quest.district and quest.district.image_content and quest.district.image_content.file_path:
        chain.append(build_imgproxy_url(quest.district.image_content.file_path))
    chain.append(f"{MOCK_IMG_ENDPOINT}?seed={quest.id}")
    out.thumbnail_urls = chain
    out.thumbnail_url = chain[0]
    return out


async def _get_quest_or_404(quest_id: uuid.UUID, db: AsyncSession) -> Quest:
    result = await db.execute(select(Quest).where(Quest.id == quest_id))
    quest = result.scalar_one_or_none()
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")
    return quest


# Q-1
@router.get("", response_model=Page[QuestOut], summary="퀘스트 목록")
async def get_quests(
    period: str | None = None,
    district_id: int | None = None,
    rider_type_id: int | None = None,
    badge: str | None = None,
    safety_grade_id: int | None = None,
    user_id: uuid.UUID | None = Query(None),
    exclude_completed: bool = Query(False),
    only_completed: bool = Query(False),
    exclude_accepted: bool = Query(False),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Quest.is_active == True]

    if period:
        conditions.append(Quest.period == period.upper())
    if district_id:
        conditions.append(or_(Quest.district_id == district_id, Quest.district_id.is_(None)))
    if rider_type_id:
        conditions.append(or_(Quest.rider_type_id == rider_type_id, Quest.rider_type_id.is_(None)))
    if badge:
        conditions.append(Quest.badge == badge.upper())
    if safety_grade_id:
        conditions.append(or_(Quest.min_safety_grade_id == safety_grade_id, Quest.min_safety_grade_id.is_(None)))

    if user_id and period:
        period_key = _calc_period_key(period.upper())
        completed_subq = (
            select(UserQuest.quest_id)
            .where(UserQuest.user_id == user_id, UserQuest.period_key == period_key)
            .scalar_subquery()
        )
        if exclude_completed:
            conditions.append(Quest.id.not_in(completed_subq))
        elif only_completed:
            conditions.append(Quest.id.in_(completed_subq))

    if user_id and exclude_accepted:
        accepted_subq = (
            select(UserQuest.quest_id)
            .where(UserQuest.user_id == user_id, UserQuest.status == "ACCEPTED")
            .scalar_subquery()
        )
        conditions.append(Quest.id.not_in(accepted_subq))

    total = (await db.execute(select(func.count()).select_from(Quest).where(*conditions))).scalar_one()

    offset = (page - 1) * size
    stmt = select(Quest).where(*conditions).order_by(Quest.created_at.desc()).offset(offset).limit(size)
    result = await db.execute(stmt)
    items = [_to_out(q) for q in result.scalars().all()]
    return Page(items=items, total=total, page=page, size=size)


@router.get("/my-accepted", summary="내 퀘스트 — 수령했고 미완료인 UserQuest 목록")
async def get_my_accepted(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    if user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = (
        await db.execute(
            select(UserQuest, Quest)
            .join(Quest, Quest.id == UserQuest.quest_id)
            .where(
                UserQuest.user_id == user_id,
                UserQuest.status == "ACCEPTED",
                Quest.is_active == True,
            )
            .order_by(UserQuest.accepted_at.desc())
        )
    ).all()
    return [
        {
            "user_quest_id": str(uq.id),
            "accepted_at": uq.accepted_at.isoformat(),
            "period_key": uq.period_key,
            "quest": _to_out(q).model_dump(mode="json"),
        }
        for uq, q in rows
    ]


@router.get("/my-completed", summary="내 퀘스트 — 완료한 UserQuest 목록")
async def get_my_completed(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    if user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    rows = (
        await db.execute(
            select(UserQuest, Quest)
            .join(Quest, Quest.id == UserQuest.quest_id)
            .where(
                UserQuest.user_id == user_id,
                UserQuest.status == "COMPLETED",
            )
            .order_by(UserQuest.completed_at.desc())
        )
    ).all()
    return [
        {
            "user_quest_id": str(uq.id),
            "completed_at": uq.completed_at.isoformat() if uq.completed_at else None,
            "period_key": uq.period_key,
            "quest": _to_out(q).model_dump(mode="json"),
        }
        for uq, q in rows
    ]


@router.get("/active-card", summary="라이드 화면 폴링 — 활성 퀘스트 카드 상태")
async def get_active_quest_card(
    user_quest_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    uq = await db.get(UserQuest, user_quest_id)
    if uq is None or uq.user_id != _session_uid:
        raise HTTPException(status_code=404, detail="Card not found")
    try:
        return await engine_client.get_card_by_user_quest(str(user_quest_id))
    except Exception as exc:
        log.warning("active-card lookup failed: %s", exc)
        raise HTTPException(status_code=404, detail="Card not found") from exc


@router.get("/ride-trail", summary="라이드 화면 폴링 — GPS 이동경로(스트림 시각화)")
async def get_ride_trail(
    device_uuid: str = Query(...),
    since_ts: float | None = Query(None, description="라이드 시작 epoch(초). 이전 핑 제외"),
    count: int = Query(500, ge=1, le=500),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """현재 라이드의 GPS 이동경로 — engine redis 스트림에서 해당 device 의 gps 핑을 좌표열로 반환.
    오래된→최신 순. 시각화 전용(거리/완료 판정은 quest_tracker 가 담당)."""
    try:
        owned = await engine_client.lookup_device_map(str(_session_uid))
    except Exception as exc:
        log.warning("ride-trail device ownership lookup failed: %s", exc)
        raise HTTPException(status_code=403, detail="Forbidden") from exc
    if owned.get("device_uuid") != device_uuid:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        messages = await engine_client.admin_stream_messages(
            count=count,
            type_filter="gps",
            uuid_filter=device_uuid,
            start_ts=since_ts,
        )
    except Exception as exc:
        log.warning("ride-trail lookup failed: %s", exc)
        return {"points": []}

    points: list[dict] = []
    for msg in reversed(messages):  # 스트림은 최신→오래된 → 경로는 오래된→최신
        try:
            obj = json.loads(msg.get("message", "{}"))
            lat, lng = float(obj.get("y", 0)), float(obj.get("x", 0))
        except (ValueError, TypeError):
            continue
        if lat == 0 and lng == 0:
            continue
        points.append({"lat": lat, "lng": lng})
    return {"points": points}


# Q-1b
@router.get("/completed-ids", response_model=list[str], summary="현재 주기 완료된 퀘스트 ID 목록")
async def get_completed_ids(
    user_id: uuid.UUID,
    period: str = "DAILY",
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    if user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    period_key = _calc_period_key(period.upper())
    result = await db.execute(
        select(UserQuest.quest_id).where(
            UserQuest.user_id == user_id,
            UserQuest.status == "COMPLETED",
            UserQuest.period_key == period_key,
        )
    )
    return [str(r) for r in result.scalars().all()]


# Q-4
@router.get("/{quest_id}", response_model=QuestOut, summary="퀘스트 상세")
async def get_quest_detail(quest_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    quest = await _get_quest_or_404(quest_id, db)
    return _to_out(quest)


# Q-5
@router.post("/{quest_id}/accept", response_model=QuestAcceptResponse, summary="퀘스트 수락")
async def accept_quest(
    quest_id: uuid.UUID,
    body: QuestAcceptRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.user_id != _session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")
    quest = await _get_quest_or_404(quest_id, db)

    period_key = _calc_period_key(quest.period)

    existing = await db.execute(
        select(UserQuest).where(
            UserQuest.user_id == body.user_id,
            UserQuest.quest_id == quest.id,
            UserQuest.period_key == period_key,
            UserQuest.status == "COMPLETED",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 완료한 퀘스트입니다.")

    if quest.period == "DAILY":
        user = await db.get(User, body.user_id)
        max_slots = await _daily_claimable_max(db, user)
        used = await _daily_slot_used(db, body.user_id, period_key)
        if used >= max_slots:
            raise HTTPException(status_code=409, detail="일일 퀘스트 슬롯이 가득 찼습니다.")

    existing_active = await db.execute(
        select(UserQuest).where(
            UserQuest.user_id == body.user_id,
            UserQuest.quest_id == quest.id,
            UserQuest.period_key == period_key,
            UserQuest.status == "ACCEPTED",
        )
    )
    if existing_active.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 수령한 퀘스트입니다.")

    user_quest = UserQuest(
        user_id=body.user_id,
        quest_id=quest.id,
        status="ACCEPTED",
        period_key=period_key,
    )
    db.add(user_quest)
    await db.commit()
    await db.refresh(user_quest)

    return QuestAcceptResponse(session_id=user_quest.id, user_quest_id=user_quest.id)
