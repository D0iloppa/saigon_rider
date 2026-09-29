import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import (
    MarketplaceAppointment,
    MarketplaceListing,
    MarketplaceReview,
    Quest,
    Report,
    RideSession,
    User,
    UserBadge,
    UserBlock,
    UserFollow,
    UserOAuthIdentity,
    UserQuest,
    WithdrawnMemberArchive,
)
from ..schemas import (
    FollowUserOut,
    Page,
    QuestHistoryOut,
    ReportCreateRequest,
    ReviewerOut,
    ReviewItemOut,
    ReviewSummaryOut,
    ReviewTagCount,
    UserLanguageUpdateRequest,
    UserOut,
    UserProfileOut,
    UserReviewPage,
    UserStatsOut,
)
from ..services.ops_alerts import send_ops_alert
from ..services.withdrawn_archive import WITHDRAWN_ARCHIVE_RETENTION, hash_identifier
from ..utils import APP_TZ, mask_phone, resolve_avatar_url
from ._report_guard import guard_duplicate_report

log = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["유저 (Users)"])

_GRADE_SCORE = {"A": 3, "B": 2, "C": 1}


def _score_to_grade(score: float) -> str:
    if score >= 2.5:
        return "A"
    if score >= 1.5:
        return "B"
    return "C"


def _month_bounds() -> tuple[datetime, datetime]:
    """APP_TZ 기준 이번 달 시작/끝(UTC aware)을 반환."""
    now_local = datetime.now(APP_TZ)
    month_start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now_local.month == 12:
        month_end_local = month_start_local.replace(year=now_local.year + 1, month=1)
    else:
        month_end_local = month_start_local.replace(month=now_local.month + 1)
    return (
        month_start_local.astimezone(UTC),
        month_end_local.astimezone(UTC),
    )


async def _get_user_or_404(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return user


def _require_self(user_id: uuid.UUID, session_uid: uuid.UUID) -> None:
    """본인 대상 엔드포인트에서 세션과 대상 user_id 대조 — 타인 계정 조작 차단."""
    if user_id != session_uid:
        raise HTTPException(status_code=403, detail="Forbidden")


# SGR-209 A3: 스킬 키 → users 컬럼
_SKILL_COLUMN = {
    "distance_rider": "skill_distance_rider",
    "gold_hunter": "skill_gold_hunter",
    "quest_slot": "skill_quest_slot",
    "cost_discount": "skill_cost_discount",
    "mileage_rate": "skill_mileage_rate",
}


@router.post("/me/skills/{skill_key}/invest", response_model=UserOut, summary="스킬 투자 (SP 1 차감, 서브포인트 +1)")
async def invest_skill(
    skill_key: str,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    _require_self(user_id, _session_uid)
    # SGR-280: 스킬은 0~9 서브포인트, 단계 = //3. 클릭당 SP 1 차감·서브포인트 +1 (한 단계 = 3 SP).
    col = _SKILL_COLUMN.get(skill_key)
    if col is None:
        raise HTTPException(status_code=422, detail="invalid skill_key")
    col_attr = getattr(User, col)
    # AUTH-9: read-check-then-write는 동시요청 시 skill_pt 음수화 레이스 → 원자적 조건부 UPDATE로 대체
    result = await db.execute(
        update(User)
        .where(User.id == user_id, User.skill_pt >= 1, col_attr < 9)
        .values(skill_pt=User.skill_pt - 1, **{col: col_attr + 1})
    )
    if result.rowcount == 0:
        await db.rollback()
        raise HTTPException(status_code=409, detail="insufficient skill points or skill at max level")
    await db.commit()
    user = await _get_user_or_404(user_id, db)
    return UserOut.model_validate(user)


# U-1
@router.get("/me/stats", response_model=UserStatsOut, summary="이번 달 누적 통계 조회")
async def get_user_stats(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    _require_self(user_id, _session_uid)
    await _get_user_or_404(user_id, db)

    month_start, month_end = _month_bounds()
    now_local = datetime.now(APP_TZ)
    month_label = now_local.strftime("%Y-%m")

    # GPS 마일리지: 이번 달(total_km) + 평생 누적(lifetime_km) 둘 다 Engine 에서 조회
    try:
        mileage = await engine_client.get_mileage(str(user_id), since=month_start.isoformat())
        period_m = int(mileage.get("period_distance_m", 0))
        lifetime_m = int(mileage.get("total_distance_m", 0))
    except Exception:
        period_m = 0
        lifetime_m = 0
    total_km = Decimal(period_m) / Decimal(1000)
    lifetime_km = Decimal(lifetime_m) / Decimal(1000)

    # 완료 퀘스트 수
    quest_result = await db.execute(
        select(func.count()).where(
            UserQuest.user_id == user_id,
            UserQuest.status == "COMPLETED",
            UserQuest.completed_at >= month_start,
            UserQuest.completed_at < month_end,
        )
    )
    quest_count = quest_result.scalar_one()

    # 평균 안전도: 등급을 점수로 변환 후 평균 → 다시 등급화
    grades_result = await db.execute(
        select(RideSession.safety_grade).where(
            RideSession.user_id == user_id,
            RideSession.safety_grade.isnot(None),
            RideSession.created_at >= month_start,
            RideSession.created_at < month_end,
        )
    )
    grades = [row[0] for row in grades_result.all()]
    if grades:
        avg_score = sum(_GRADE_SCORE.get(g, 0) for g in grades) / len(grades)
        avg_safety_grade = _score_to_grade(avg_score)
    else:
        avg_safety_grade = None

    # 거래 후기 별점: 1~5 평균
    review_scores = (
        (await db.execute(select(MarketplaceReview.rating).where(MarketplaceReview.target_id == user_id)))
        .scalars()
        .all()
    )
    total_reviews = len(review_scores)
    avg_rating = round(sum(review_scores) / total_reviews, 1) if total_reviews > 0 else None

    return UserStatsOut(
        month=month_label,
        total_km=total_km,
        lifetime_km=lifetime_km,
        quest_count=quest_count,
        avg_safety_grade=avg_safety_grade,
        review_count=total_reviews,
        avg_rating=avg_rating,
    )


@router.get("/me/quest-history", response_model=Page[QuestHistoryOut], summary="퀘스트 완료 이력")
async def get_quest_history(
    user_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    _require_self(user_id, _session_uid)
    await _get_user_or_404(user_id, db)
    offset = (page - 1) * size

    base_filter = [
        UserQuest.user_id == user_id,
        UserQuest.status == "COMPLETED",
    ]

    total_result = await db.execute(select(func.count()).where(*base_filter))
    total = total_result.scalar_one()

    rows = (
        await db.execute(
            select(UserQuest, Quest, RideSession)
            .join(Quest, UserQuest.quest_id == Quest.id)
            .outerjoin(
                RideSession,
                (RideSession.user_quest_id == UserQuest.id) & (RideSession.is_success == True),
            )
            .where(*base_filter)
            .order_by(UserQuest.completed_at.desc())
            .offset(offset)
            .limit(size)
        )
    ).all()

    items = []
    for uq, quest, ride in rows:
        items.append(
            QuestHistoryOut(
                id=uq.id,
                quest_id=quest.id,
                quest_title=quest.title_ko or quest.title_en or quest.title_vi,
                distance_km=ride.distance_km if ride else None,
                safety_grade=ride.safety_grade if ride else None,
                reward_exp=quest.reward_exp,
                reward_gold=quest.reward_gold,
                completed_at=uq.completed_at,
            )
        )

    return Page(items=items, total=total, page=page, size=size)


# A-3
@router.put("/me/language", status_code=204, summary="앱 표시 언어 동기화")
async def update_preferred_language(
    user_id: uuid.UUID,
    body: UserLanguageUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    """221 — 앱이 선택 언어를 localStorage 에만 갖고 있어 서버가 알림 문안을 항상 한국어로 만들던
    문제를 없앤다. 프론트가 로그인 직후/언어 변경 시 호출한다(멱등)."""
    _require_self(user_id, _session_uid)
    await db.execute(update(User).where(User.id == user_id).values(preferred_lang=body.lang))
    await db.commit()
    return Response(status_code=204)


@router.delete("/me", status_code=204, summary="계정 탈퇴 (논리 삭제)")
async def delete_account(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    _require_self(user_id, _session_uid)
    user = await _get_user_or_404(user_id, db)
    now = datetime.now(UTC)

    # 식별자 해시 아카이브 (170, 대표 결정 2026-08-02) — 아래 익명화로 phone 원본이,
    # 30일 파기 배치로 user_oauth_identities 가 사라지기 전에, 재가입·제재회피 추적용으로
    # HMAC-SHA256 해시만 1년 보관한다. user.phone 은 OTP 인증 시 _normalize_vn_phone 이
    # E.164(+84…) 정규형으로 저장한 값이므로 그대로 해시한다 (admin withdrawn-check 조회도
    # 같은 정규화를 거쳐 형식이 일치).
    identities = (
        (await db.execute(select(UserOAuthIdentity).where(UserOAuthIdentity.user_id == user.id))).scalars().all()
    )
    candidates: list[tuple[str, str | None, str | None]] = [("phone", None, user.phone)]
    candidates += [("oauth", i.provider, i.provider_user_id) for i in identities]
    archive_rows: list[dict] = []
    pepper_missing = False
    for kind, provider, value in candidates:
        if not value:
            continue  # OAuth 가입자는 phone 미보유 가능
        if kind == "phone" and value.startswith("del_"):
            # 복구(restore) 후 재탈퇴 — 복구는 전화번호를 되살리지 않으므로 phone 이 아직
            # 익명화값(del_*)이다. 이걸 해시하면 영원히 매칭되지 않는 쓰레기 행만 남는다.
            continue
        value_hash = hash_identifier(value)
        if value_hash is None:
            pepper_missing = True
            break
        archive_rows.append(
            {
                "user_id": user.id,
                "kind": kind,
                "provider": provider,
                "value_hash": value_hash,
                "deleted_at": now,
                "purge_after": now + WITHDRAWN_ARCHIVE_RETENTION,
            }
        )
    if pepper_missing:
        # fail-open: 아카이브는 부가 추적 장치일 뿐 — 그 실패(운영 설정 누락)가 이용자의
        # 탈퇴권(개인정보 파기 요구) 행사를 막으면 안 된다. 탈퇴는 정상 진행하고 경보만 남긴다.
        log.error("WITHDRAWN_HASH_PEPPER unset — withdrawn identifier archive skipped (user=%s)", user.id)
        await send_ops_alert(
            f"[withdrawn-archive] WITHDRAWN_HASH_PEPPER 미설정 — 탈퇴 식별자 아카이브 누락 (user={user.id})",
            key="withdrawn_archive_pepper_unset",
        )
    elif archive_rows:
        # 탈퇴→복구→재탈퇴 반복 시 UNIQUE(user_id,kind,provider,value_hash) 충돌 → DO NOTHING
        await db.execute(pg_insert(WithdrawnMemberArchive).values(archive_rows).on_conflict_do_nothing())

    user.deleted_at = now
    # 익명화 값은 uuid4 기반 — 초 단위 timestamp 는 같은 초에 두 명이 탈퇴하면
    # UNIQUE(users.phone / users.nickname) 위반으로 500 이 났다.
    # "del_" 접두는 purge 배치(_is_purge_eligible)의 익명화 흔적 판정에 쓰이므로 유지.
    # "del_" + hex 16자 = 20자 — phone String(20) / nickname String(30) 한도 내.
    user.phone = f"del_{uuid.uuid4().hex[:16]}"
    user.phone_verified_at = None
    if user.nickname:
        user.nickname = f"del_{uuid.uuid4().hex[:16]}"
    user.passcode_hash = None
    await db.commit()
    return Response(status_code=204)


# A-4
@router.get("/me/export", summary="내 데이터 JSON 다운로드")
async def export_user_data(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    # 전화번호 포함 전체 PII 덤프 — 반드시 본인만
    _require_self(user_id, _session_uid)
    user = await _get_user_or_404(user_id, db)

    rides_result = await db.execute(
        select(RideSession).where(RideSession.user_id == user_id).order_by(RideSession.created_at.desc())
    )
    rides = [
        {
            "date": r.created_at.isoformat(),
            "distance_km": float(r.distance_km),
            "duration_sec": r.duration_sec,
            "avg_speed_kmh": float(r.avg_speed_kmh) if r.avg_speed_kmh else None,
            "safety_grade": r.safety_grade,
            "reward_exp": r.reward_exp,
            "reward_gold": r.reward_gold,
        }
        for r in rides_result.scalars()
    ]

    quests_result = await db.execute(
        select(UserQuest).where(UserQuest.user_id == user_id).order_by(UserQuest.accepted_at.desc())
    )
    quests = [
        {
            "quest_id": str(q.quest_id),
            "status": q.status,
            "accepted_at": q.accepted_at.isoformat(),
            "completed_at": q.completed_at.isoformat() if q.completed_at else None,
        }
        for q in quests_result.scalars()
    ]

    badges_result = await db.execute(select(UserBadge).where(UserBadge.user_id == user_id))
    badges = [{"badge_id": str(b.badge_id), "earned_at": b.acquired_at.isoformat()} for b in badges_result.scalars()]

    data = {
        "profile": {
            "id": str(user.id),
            "phone": user.phone,
            "nickname": user.nickname,
            "level": user.level,
            "exp": user.exp,
            "xp": user.xp,
            "gold": user.gold,
            "created_at": user.created_at.isoformat(),
        },
        "rides": rides,
        "quests": quests,
        "badges": badges,
        "exported_at": datetime.now(UTC).isoformat(),
    }
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": "attachment; filename=saigon_rider_data.json"},
    )


def _get_trust_tier(temp: Decimal) -> str:
    """공개 프로필 신뢰 티어 매핑. SoT 는 frontend/src/lib/trustTier.ts::getTrustTier —
    이 함수는 그 구간을 그대로 미러링한다(양쪽 수정 시 함께 맞출 것). 원값 manner_temp 를
    응답에 싣지 않기 위해 서버에서 미리 티어 문자열로 변환한다(WP-4, 2026-09-09)."""
    t = float(temp)
    if t < 30:
        return "caution"
    if t < 40:
        return "new"
    if t < 55:
        return "good"
    if t < 75:
        return "trusted"
    return "top"


async def _assert_not_blocked(db: AsyncSession, viewer_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """양방향 차단이면 존재하지 않는 유저처럼 404 (프로필·후기 목록 공통)."""
    if viewer_id == user_id:
        return
    blocked = (
        await db.execute(
            select(UserBlock.blocker_id).where(
                or_(
                    (UserBlock.blocker_id == viewer_id) & (UserBlock.blocked_id == user_id),
                    (UserBlock.blocker_id == user_id) & (UserBlock.blocked_id == viewer_id),
                )
            )
        )
    ).first()
    if blocked is not None:
        raise HTTPException(status_code=404, detail="User not found")


async def _review_aggregate(db: AsyncSession, user_id: uuid.UUID) -> tuple[int, float | None, list[ReviewTagCount]]:
    """받은 후기 전체의 (건수, 평균 별점, 태그별 건수 내림차순). 별점·태그 두 컬럼만 1쿼리로 읽는다."""
    rows = (
        await db.execute(
            select(MarketplaceReview.rating, MarketplaceReview.manner_tags).where(
                MarketplaceReview.target_id == user_id
            )
        )
    ).all()
    tag_counter: dict[str, int] = {}
    for _rating, tags in rows:
        for tag in tags or []:
            tag_counter[tag] = tag_counter.get(tag, 0) + 1
    avg = round(sum(r for r, _ in rows) / len(rows), 1) if rows else None
    tag_counts = [
        ReviewTagCount(tag=tag, count=cnt) for tag, cnt in sorted(tag_counter.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    return len(rows), avg, tag_counts


async def _review_items(db: AsyncSession, reviews: list[MarketplaceReview]) -> list[ReviewItemOut]:
    """후기 행 → 응답 항목. 작성자·매물은 배치 조회(N+1 없음)."""
    if not reviews:
        return []
    reviewers = {
        u.id: u for u in (await db.execute(select(User).where(User.id.in_({r.reviewer_id for r in reviews})))).scalars()
    }
    listing_ids = {r.listing_id for r in reviews if r.listing_id}
    seller_by_listing: dict[uuid.UUID, uuid.UUID] = {}
    if listing_ids:
        seller_by_listing = dict(
            (
                await db.execute(
                    select(MarketplaceListing.id, MarketplaceListing.seller_id).where(
                        MarketplaceListing.id.in_(listing_ids)
                    )
                )
            ).all()
        )
    items = []
    for r in reviews:
        reviewer = reviewers[r.reviewer_id]
        seller_id = seller_by_listing.get(r.listing_id) if r.listing_id else None
        role = None if seller_id is None else ("SELLER" if seller_id == r.reviewer_id else "BUYER")
        items.append(
            ReviewItemOut(
                id=r.id,
                rating=r.rating,
                text=(r.comment or "").strip() or None,
                tags=list(r.manner_tags or []),
                reviewer=ReviewerOut(
                    id=reviewer.id, nickname=reviewer.nickname, avatar_url=resolve_avatar_url(reviewer)
                ),
                reviewer_role=role,
                created_at=r.created_at,
            )
        )
    return items


@router.get("/{user_id}/reviews", response_model=UserReviewPage, summary="타유저가 받은 후기 전체 (모든 별점, 최신순)")
async def get_user_reviews(
    user_id: uuid.UUID,
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
    viewer_id: uuid.UUID = Depends(verify_user_session),
):
    if (await _get_user_or_404(user_id, db)).deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")
    await _assert_not_blocked(db, viewer_id, user_id)
    page = max(page, 1)
    size = min(max(size, 1), 50)
    count, avg, tag_counts = await _review_aggregate(db, user_id)
    reviews = (
        (
            await db.execute(
                select(MarketplaceReview)
                .where(MarketplaceReview.target_id == user_id)
                .order_by(MarketplaceReview.created_at.desc(), MarketplaceReview.id.desc())
                .offset((page - 1) * size)
                .limit(size)
            )
        )
        .scalars()
        .all()
    )
    return UserReviewPage(
        items=await _review_items(db, list(reviews)),
        total=count,
        page=page,
        size=size,
        avg_rating=avg,
        tag_counts=tag_counts,
    )


@router.get("/{user_id}/profile", response_model=UserProfileOut, summary="타유저 공개 프로필 조회")
async def get_user_profile(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    viewer_id: uuid.UUID = Depends(verify_user_session),
):
    result = await db.execute(
        select(User).options(selectinload(User.rider_type)).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    await _assert_not_blocked(db, viewer_id, user_id)

    follower_count = (
        await db.execute(select(func.count()).select_from(UserFollow).where(UserFollow.following_id == user_id))
    ).scalar_one()
    following_count = (
        await db.execute(select(func.count()).select_from(UserFollow).where(UserFollow.follower_id == user_id))
    ).scalar_one()

    is_following = False
    is_friend = False
    if viewer_id and viewer_id != user_id:
        existing = await db.get(UserFollow, {"follower_id": viewer_id, "following_id": user_id})
        is_following = existing is not None
        if is_following:
            # P4-4: 맞팔 여부 — 상대도 나를 팔로우하면 친구 (신규 테이블 0개, UserFollow 재사용)
            reverse = await db.get(UserFollow, {"follower_id": user_id, "following_id": viewer_id})
            is_friend = reverse is not None

    rider_style = user.rider_type.code if user.rider_type else None
    review_count, avg_rating, tag_counts = await _review_aggregate(db, user_id)
    recent_rows = (
        (
            await db.execute(
                select(MarketplaceReview)
                .where(
                    MarketplaceReview.target_id == user_id,
                    MarketplaceReview.rating >= 3,
                    func.length(func.trim(func.coalesce(MarketplaceReview.comment, ""))) > 0,
                )
                .order_by(MarketplaceReview.created_at.desc(), MarketplaceReview.id.desc())
                .limit(2)
            )
        )
        .scalars()
        .all()
    )
    sold_count = (
        await db.execute(
            select(func.count(func.distinct(MarketplaceAppointment.listing_id)))
            .select_from(MarketplaceAppointment)
            .join(MarketplaceListing, MarketplaceListing.id == MarketplaceAppointment.listing_id)
            .where(MarketplaceListing.seller_id == user_id, MarketplaceAppointment.status == "COMPLETED")
        )
    ).scalar_one()

    return UserProfileOut(
        id=user.id,
        nickname=user.nickname,
        avatar_url=resolve_avatar_url(user),
        level=user.level,
        rider_style=rider_style,
        follower_count=follower_count,
        following_count=following_count,
        is_following=is_following,
        is_friend=is_friend,
        is_phone_verified=user.phone_verified_at is not None,
        phone_masked=mask_phone(user.phone) if user.phone_verified_at is not None else None,
        member_since=user.created_at,
        marketplace_sold_count=sold_count,
        marketplace_review_count=review_count,
        marketplace_avg_rating=avg_rating,
        trust_tier=_get_trust_tier(user.manner_temp),
        review_summary=ReviewSummaryOut(
            count=review_count,
            avg_rating=avg_rating,
            top_tags=tag_counts[:3],
            recent=await _review_items(db, list(recent_rows)),
        ),
    )


@router.get("/search", response_model=list[FollowUserOut], summary="유저 검색 (닉네임 또는 전화번호)")
async def search_users(
    query: str,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    if not query or len(query.strip()) < 2:
        return []

    query = query.strip()
    result = await db.execute(
        select(User)
        .where(
            User.deleted_at.is_(None),
            (User.nickname.ilike(f"%{query}%")) | (User.phone == query),
        )
        .limit(20)
    )
    rows = result.scalars().all()

    return [
        FollowUserOut(
            id=u.id,
            nickname=u.nickname,
            avatar_url=resolve_avatar_url(u),
            level=u.level,
        )
        for u in rows
    ]


_USER_REPORT_REASONS = {"ABUSE", "FRAUD", "INAPPROPRIATE_PROFILE", "SPAM", "OTHER"}


@router.post("/{user_id}/report", status_code=201, summary="유저 신고")
async def report_user(
    user_id: uuid.UUID,
    body: ReportCreateRequest,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    if body.reason not in _USER_REPORT_REASONS:
        raise HTTPException(status_code=400, detail="invalid reason")
    if user_id == session_uid:
        raise HTTPException(status_code=400, detail="cannot report yourself")
    await _get_user_or_404(user_id, db)

    # 중복 판정 — reports 부분 유니크(uq_reports_user_once: reported_user_id x reporter_id WHERE USER)와 동일 조건
    await guard_duplicate_report(
        db,
        Report.target_type == "USER",
        Report.reported_user_id == user_id,
        Report.reporter_id == session_uid,
    )

    db.add(
        Report(
            target_type="USER",
            reporter_id=session_uid,
            reported_user_id=user_id,
            reason=body.reason,
            note=(body.note or None),
        )
    )
    await db.commit()
    return {"ok": True}
