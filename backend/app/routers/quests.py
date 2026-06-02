import logging
import uuid
from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from passlib.context import CryptContext
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import Bookmark, Quest, User, UserQuest
from ..schemas import (
    BookmarkToggleRequest,
    BookmarkToggleResponse,
    Page,
    QuestAcceptRequest,
    QuestAcceptResponse,
    QuestCompleteRequest,
    QuestCompleteResponse,
    QuestOut,
    QuestParticipantOut,
    QuestPinOut,
)
from ..utils import APP_TZ, MOCK_IMG_ENDPOINT, build_imgproxy_url, resolve_avatar_url

log = logging.getLogger(__name__)

_pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


async def _verify_passcode(
    user_id: uuid.UUID,
    x_passcode: str,
    db: AsyncSession,
) -> None:
    user = await db.get(User, user_id)
    if not user or not user.passcode_hash or not _pwd_ctx.verify(x_passcode, user.passcode_hash):
        raise HTTPException(status_code=401, detail="인증 실패")


def _calc_period_key(period: str) -> str:
    today = datetime.now(APP_TZ).date()
    if period == "DAILY":
        return today.isoformat()
    if period == "WEEKLY":
        iso = today.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    return "ONCE"


def _calc_card_expires(period: str, ends_at: datetime | None) -> str | None:
    now_vn = datetime.now(APP_TZ)
    if period == "DAILY":
        eod = datetime.combine(now_vn.date(), time(23, 59, 59), tzinfo=APP_TZ)
        return eod.isoformat()
    if period == "WEEKLY":
        days_until_sunday = 6 - now_vn.weekday()
        eow = datetime.combine(
            now_vn.date() + timedelta(days=days_until_sunday),
            time(23, 59, 59),
            tzinfo=APP_TZ,
        )
        return eow.isoformat()
    if ends_at is not None:
        return ends_at.isoformat()
    return None


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
    """착용 아이템 효과에 따른 추가 수령 슬롯. TODO(A-2 아이템/효과 정의): 규칙 확정 후 구현. 현재 0."""
    return 0


async def _daily_claimable_max(db: AsyncSession, user: User | None) -> int:
    """일일 퀘스트 수령가능 최대 횟수 = base + 레벨 보너스 + 착용아이템 보너스.
    수령 게이트(accept)와 홈 추천 개수가 공유하는 단일 소스."""
    return await _daily_slot_base(db) + _level_slot_bonus(user) + await _item_slot_bonus(db, user)


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
):
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


@router.get("/active-card", summary="라이드 화면 폴링 — 활성 퀘스트 카드 상태")
async def get_active_quest_card(user_quest_id: uuid.UUID):
    try:
        return await engine_client.get_card_by_user_quest(str(user_quest_id))
    except Exception as exc:
        log.warning("active-card lookup failed: %s", exc)
        raise HTTPException(status_code=404, detail="Card not found") from exc


@router.get("/district-counts", summary="구역별 활성 퀘스트 수")
async def get_district_quest_counts(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Quest.district_id, func.count())
            .where(Quest.is_active == True, Quest.district_id.is_not(None))
            .group_by(Quest.district_id)
        )
    ).all()
    from ..models import District

    district_ids = [r[0] for r in rows]
    if district_ids:
        districts = (await db.execute(select(District).where(District.id.in_(district_ids)))).scalars().all()
        code_map = {d.id: d.code for d in districts}
    else:
        code_map = {}
    return {code_map.get(did, ""): cnt for did, cnt in rows if did in code_map}


# Q-1b
@router.get("/completed-ids", response_model=list[str], summary="현재 주기 완료된 퀘스트 ID 목록")
async def get_completed_ids(
    user_id: uuid.UUID,
    period: str = "DAILY",
    db: AsyncSession = Depends(get_db),
):
    period_key = _calc_period_key(period.upper())
    result = await db.execute(
        select(UserQuest.quest_id).where(
            UserQuest.user_id == user_id,
            UserQuest.status == "COMPLETED",
            UserQuest.period_key == period_key,
        )
    )
    return [str(r) for r in result.scalars().all()]


# Q-2
@router.get("/pins", response_model=list[QuestPinOut], summary="월드맵 핀 좌표 목록")
async def get_quest_pins(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            text("""
                SELECT qp.id, qp.quest_id,
                       ST_Y(qp.location::geometry) AS lat,
                       ST_X(qp.location::geometry) AS lng
                FROM quest_pins qp
                JOIN quests q ON qp.quest_id = q.id
                WHERE q.is_active = TRUE
            """)
        )
    ).all()
    return [QuestPinOut(id=r.id, quest_id=r.quest_id, lat=r.lat, lng=r.lng) for r in rows]


# Q-3
@router.get("/recommended", response_model=list[QuestOut], summary="추천 퀘스트 (유저 맞춤, 최대 N개)")
async def get_recommended_quests(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # 수령가능 횟수만큼만 제공 (= 공통 max - 오늘 사용량). 0 이하면 더 제공할 퀘스트 없음.
    period_key = _calc_period_key("DAILY")
    max_slots = await _daily_claimable_max(db, user)
    used = await _daily_slot_used(db, user_id, period_key)
    remaining = max(max_slots - used, 0)
    if remaining <= 0:
        return []

    # 오늘 이미 수령/완료/만료된 DAILY 퀘스트는 풀에서 제외
    claimed_today_sub = (
        select(UserQuest.quest_id).where(
            UserQuest.user_id == user_id,
            UserQuest.period_key == period_key,
            UserQuest.status.in_(["ACCEPTED", "COMPLETED", "EXPIRED"]),
        )
    ).correlate(None)

    # 수행가능한 DAILY 퀘스트 중 랜덤으로 remaining 개 선정
    result = await db.execute(
        select(Quest)
        .where(
            Quest.is_active == True,
            Quest.period == "DAILY",
            Quest.required_level <= user.level,
            Quest.id.not_in(claimed_today_sub),
        )
        .order_by(func.random())
        .limit(remaining)
    )
    quests = result.scalars().all()
    return [_to_out(q) for q in quests]


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


# Q-5b [DBG] 퀘스트 강제 완료 처리 (디버그용)
@router.post("/{quest_id}/complete", response_model=QuestCompleteResponse, summary="[DBG] 퀘스트 완료 처리")
async def complete_quest(
    quest_id: uuid.UUID,
    body: QuestCompleteRequest,
    x_passcode: str = Header(..., alias="X-Passcode"),
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _verify_passcode(body.user_id, x_passcode, db)
    quest = await _get_quest_or_404(quest_id, db)
    period_key = _calc_period_key(quest.period)

    result = await db.execute(
        select(UserQuest).where(
            UserQuest.user_id == body.user_id,
            UserQuest.quest_id == quest.id,
            UserQuest.period_key == period_key,
        )
    )
    uq = result.scalar_one_or_none()

    already_completed = uq and uq.status == "COMPLETED"

    if uq:
        uq.status = "COMPLETED"
        uq.completed_at = datetime.now(UTC)
    else:
        uq = UserQuest(
            user_id=body.user_id,
            quest_id=quest.id,
            status="COMPLETED",
            period_key=period_key,
            completed_at=datetime.now(UTC),
        )
        db.add(uq)

    # 이미 완료된 경우 보상 중복 지급 방지
    if not already_completed:
        user = await db.get(User, body.user_id)
        if user:
            user.exp += quest.reward_exp
            user.gold += quest.reward_gold

    await db.commit()
    await db.refresh(uq)
    return QuestCompleteResponse(
        quest_id=quest.id,
        user_quest_id=uq.id,
        status=uq.status,
        reward_exp=quest.reward_exp if not already_completed else 0,
        reward_gold=quest.reward_gold if not already_completed else 0,
        reward_item=quest.reward_item if not already_completed else None,
    )


# Q-6
@router.post("/{quest_id}/bookmark", response_model=BookmarkToggleResponse, summary="북마크 토글")
async def toggle_bookmark(
    quest_id: uuid.UUID,
    body: BookmarkToggleRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    await _get_quest_or_404(quest_id, db)

    existing = await db.get(Bookmark, {"user_id": body.user_id, "quest_id": quest_id})
    if existing:
        await db.delete(existing)
        await db.commit()
        return BookmarkToggleResponse(bookmarked=False)

    bookmark = Bookmark(user_id=body.user_id, quest_id=quest_id)
    db.add(bookmark)
    await db.commit()
    return BookmarkToggleResponse(bookmarked=True)


# Q-7
@router.get("/{quest_id}/participants", response_model=list[QuestParticipantOut], summary="퀘스트 참여자 목록")
async def get_quest_participants(quest_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _get_quest_or_404(quest_id, db)

    result = await db.execute(
        select(User)
        .join(UserQuest, UserQuest.user_id == User.id)
        .where(
            UserQuest.quest_id == quest_id,
            UserQuest.status.in_(["ACCEPTED", "ACTIVE"]),
        )
        .order_by(UserQuest.accepted_at.desc())
        .limit(50)
    )
    users = result.scalars().all()
    return [
        QuestParticipantOut(
            user_id=u.id,
            nickname=u.nickname,
            avatar_url=resolve_avatar_url(u),
        )
        for u in users
    ]
