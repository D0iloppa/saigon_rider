"""admin JSON API — 유저 관리 + 제재 (WARN/SUSPEND/BAN/LIFT).

제재 부수효과(user_sanctions insert + users.status + 인앱 MODERATION 알림 + 감사로그)는
단일 트랜잭션으로 커밋한다. FCM 푸시는 발송하지 않는다(인앱만).
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...engine_client import engine_client
from ...models import (
    MarketplaceListing,
    Notification,
    Report,
    User,
    UserOAuthIdentity,
    UserSanction,
    WithdrawnMemberArchive,
)
from ...schemas import Page
from ...services.withdrawn_archive import hash_identifier
from ..auth import _normalize_vn_phone
from ._audit import audit

router = APIRouter(prefix="/users")
_log = logging.getLogger(__name__)

_USER_STATUSES = {"ACTIVE", "SUSPENDED", "BANNED"}
_SANCTION_TYPES = {"WARN", "SUSPEND", "BAN"}


class AdminUserRow(BaseModel):
    id: uuid.UUID
    nickname: str | None
    phone: str | None
    level: int
    manner_temp: float
    status: str
    suspended_until: datetime | None
    phone_verified: bool
    created_at: datetime
    last_seen_at: datetime | None
    report_count: int
    listing_count: int


class SanctionCreateRequest(BaseModel):
    type: str
    reason: str
    days: int | None = None
    report_id: uuid.UUID | None = None


class SanctionLiftRequest(BaseModel):
    reason: str


async def _get_user_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _row(user: User, report_count: int, listing_count: int) -> AdminUserRow:
    return AdminUserRow(
        id=user.id,
        nickname=user.nickname,
        phone=user.phone,  # NULL 안전 — OAuth 유저는 phone 미보유 (legacy h(u.phone) 500 버그 미러 금지)
        level=user.level,
        manner_temp=float(user.manner_temp),
        status=user.status,
        suspended_until=user.suspended_until,
        phone_verified=user.phone_verified_at is not None,
        created_at=user.created_at,
        last_seen_at=user.last_seen_at,
        report_count=report_count,
        listing_count=listing_count,
    )


async def _user_detail(db: AsyncSession, user: User) -> dict:
    report_count = (
        await db.execute(select(func.count()).select_from(Report).where(Report.reported_user_id == user.id))
    ).scalar_one()
    listing_count = (
        await db.execute(
            select(func.count()).select_from(MarketplaceListing).where(MarketplaceListing.seller_id == user.id)
        )
    ).scalar_one()

    sanctions = (
        (
            await db.execute(
                select(UserSanction).where(UserSanction.user_id == user.id).order_by(UserSanction.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    recent_reports = (
        (
            await db.execute(
                select(Report).where(Report.reported_user_id == user.id).order_by(Report.created_at.desc()).limit(10)
            )
        )
        .scalars()
        .all()
    )
    providers = (
        (await db.execute(select(UserOAuthIdentity.provider).where(UserOAuthIdentity.user_id == user.id)))
        .scalars()
        .all()
    )

    return {
        **_row(user, report_count, listing_count).model_dump(),
        "phone_verified_at": user.phone_verified_at,
        "sanctions": [
            {
                "id": s.id,
                "type": s.type,
                "reason": s.reason,
                "report_id": s.report_id,
                "ends_at": s.ends_at,
                "admin_username": s.admin_username,
                "created_at": s.created_at,
            }
            for s in sanctions
        ],
        "recent_reports": [
            {
                "id": r.id,
                "target_type": r.target_type,
                "reason": r.reason,
                "status": r.status,
                "created_at": r.created_at,
            }
            for r in recent_reports
        ],
        "oauth_providers": list(providers),
    }


@router.get("", response_model=Page[AdminUserRow])
async def list_users(
    q: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User)
    count_stmt = select(func.count()).select_from(User)
    if q:
        like = f"%{q}%"
        cond = (User.nickname.ilike(like)) | (User.phone.ilike(like))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    if status:
        if status not in _USER_STATUSES:
            raise HTTPException(status_code=400, detail="invalid status")
        stmt = stmt.where(User.status == status)
        count_stmt = count_stmt.where(User.status == status)

    total = (await db.execute(count_stmt)).scalar_one()
    users = (
        (await db.execute(stmt.order_by(User.created_at.desc()).offset((page - 1) * size).limit(size))).scalars().all()
    )

    user_ids = [u.id for u in users]
    report_counts: dict[uuid.UUID, int] = {}
    listing_counts: dict[uuid.UUID, int] = {}
    if user_ids:
        report_rows = (
            await db.execute(
                select(Report.reported_user_id, func.count())
                .where(Report.reported_user_id.in_(user_ids))
                .group_by(Report.reported_user_id)
            )
        ).all()
        report_counts = {uid: cnt for uid, cnt in report_rows}
        listing_rows = (
            await db.execute(
                select(MarketplaceListing.seller_id, func.count())
                .where(MarketplaceListing.seller_id.in_(user_ids))
                .group_by(MarketplaceListing.seller_id)
            )
        ).all()
        listing_counts = {uid: cnt for uid, cnt in listing_rows}

    items = [_row(u, report_counts.get(u.id, 0), listing_counts.get(u.id, 0)) for u in users]
    return Page(items=items, total=total, page=page, size=size)


@router.get("/withdrawn-check")
async def withdrawn_check(
    request: Request,
    phone: str | None = Query(None),
    provider: str | None = Query(None),
    provider_user_id: str | None = Query(None),
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """탈퇴회원 식별자 해시 아카이브(170) 조회 — 재가입·제재회피 추적용.

    아카이브에는 HMAC 해시만 있어 운영자가 SQL 로 직접 대조할 수 없다(pepper 필요).
    서버가 입력을 같은 방식으로 해시해 매칭 여부를 돌려준다. 원본·해시값은 응답에
    싣지 않되 user_id 는 포함한다 — 매칭 여부만으로는 추적(익명화된 계정의 제재
    이력·신고 내역 확인)이 불가능하고, user_id 가 가리키는 users 행은 이미 익명화돼
    있어 그 자체로 개인 식별정보가 아니다.
    """
    if phone is not None:
        if provider or provider_user_id:
            raise HTTPException(status_code=400, detail="pass either phone or provider+provider_user_id")
        normalized = _normalize_vn_phone(phone)  # 아카이브는 저장 정규형(E.164 +84…)으로 해시돼 있다
        if normalized is None:
            raise HTTPException(status_code=400, detail="invalid Vietnamese mobile number")
        kind, prov, value = "phone", None, normalized
    elif provider and provider_user_id:
        kind, prov, value = "oauth", provider.lower(), provider_user_id
    else:
        raise HTTPException(status_code=400, detail="pass either phone or provider+provider_user_id")

    value_hash = hash_identifier(value)
    if value_hash is None:
        raise HTTPException(status_code=503, detail="WITHDRAWN_HASH_PEPPER not configured")

    stmt = select(WithdrawnMemberArchive).where(
        WithdrawnMemberArchive.kind == kind, WithdrawnMemberArchive.value_hash == value_hash
    )
    if prov is not None:
        stmt = stmt.where(WithdrawnMemberArchive.provider == prov)
    rows = (await db.execute(stmt.order_by(WithdrawnMemberArchive.deleted_at.desc()))).scalars().all()

    # 감사로그에는 조회 종류만 남기고 조회한 식별자 원본(전화번호 등)은 남기지 않는다.
    await audit(db, session, request, "USER_WITHDRAWN_CHECK", detail={"kind": kind, "provider": prov})
    await db.commit()

    return {
        "matched": bool(rows),
        "matches": [{"user_id": r.user_id, "deleted_at": r.deleted_at} for r in rows],
    }


@router.get("/{user_id}")
async def get_user(
    user_id: uuid.UUID,
    request: Request,
    reason: str = Query(..., description="PII(전화번호 등) 열람 사유 — 필수, 감사로그에 기록"),
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if not reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    user = await _get_user_or_404(db, user_id)
    await audit(db, session, request, "USER_DETAIL_VIEW", "user", str(user_id), {"reason": reason.strip()})
    await db.commit()
    return await _user_detail(db, user)


@router.get("/{user_id}/device")
async def get_user_device(
    user_id: uuid.UUID,
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(db, user_id)
    try:
        info = await engine_client.lookup_device_map(str(user_id))
    except Exception:
        _log.exception("device-map lookup failed for user %s", user_id)
        info = {}
    return {
        "device_uuid": info.get("device_uuid") or None,
        "fcm_token": info.get("fcm_token") or None,
        "logged_in_at": info.get("logged_in_at") or None,
    }


@router.post("/{user_id}/sanctions")
async def create_sanction(
    user_id: uuid.UUID,
    body: SanctionCreateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if body.type not in _SANCTION_TYPES:
        raise HTTPException(status_code=400, detail="invalid sanction type")
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    if body.type == "SUSPEND" and (body.days is None or not 1 <= body.days <= 365):
        raise HTTPException(status_code=400, detail="days must be between 1 and 365")
    if body.report_id is not None and await db.get(Report, body.report_id) is None:
        raise HTTPException(status_code=400, detail="report not found")

    user = await _get_user_or_404(db, user_id)
    now = datetime.now(UTC)
    reason = body.reason.strip()

    ends_at: datetime | None = None
    if body.type == "WARN":
        noti_title = "커뮤니티 경고 안내"
        noti_body = f"운영정책 위반으로 경고가 부여되었습니다. 사유: {reason}"
    elif body.type == "SUSPEND":
        ends_at = now + timedelta(days=body.days)
        user.status = "SUSPENDED"
        user.suspended_until = ends_at
        noti_title = "이용 정지 안내"
        noti_body = (
            f"운영정책 위반으로 {body.days}일간 이용이 정지되었습니다"
            f" (해제 예정: {ends_at.strftime('%Y-%m-%d %H:%M')} UTC). 사유: {reason}"
        )
    else:  # BAN
        user.status = "BANNED"
        user.suspended_until = None
        noti_title = "영구 이용 정지 안내"
        noti_body = f"운영정책 위반으로 계정이 영구 정지되었습니다. 사유: {reason}"

    db.add(
        UserSanction(
            user_id=user_id,
            type=body.type,
            reason=reason,
            report_id=body.report_id,
            ends_at=ends_at,
            admin_username=session.username,
        )
    )
    db.add(
        Notification(user_id=user_id, type="MODERATION", title=noti_title, body=noti_body, link=None, created_at=now)
    )
    await audit(
        db,
        session,
        request,
        f"USER_{body.type}",
        "user",
        str(user_id),
        {"reason": reason, "days": body.days, "report_id": str(body.report_id) if body.report_id else None},
    )
    await db.commit()
    return await _user_detail(db, user)


@router.post("/{user_id}/sanctions/lift")
async def lift_sanction(
    user_id: uuid.UUID,
    body: SanctionLiftRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="reason is required")
    user = await _get_user_or_404(db, user_id)

    db.add(UserSanction(user_id=user_id, type="LIFT", reason=body.reason.strip(), admin_username=session.username))
    user.status = "ACTIVE"
    user.suspended_until = None
    await audit(db, session, request, "USER_LIFT", "user", str(user_id), {"reason": body.reason.strip()})
    await db.commit()
    return await _user_detail(db, user)


@router.post("/{user_id}/phone-verification/reset")
async def reset_phone_verification(
    user_id: uuid.UUID,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(db, user_id)
    # phone 자체는 유지 — 전화번호 기반 로그인 계정의 로그인 수단 박탈 방지. 인증 상태만 해제.
    user.phone_verified_at = None
    await audit(db, session, request, "USER_PHONE_RESET", "user", str(user_id))
    await db.commit()
    return await _user_detail(db, user)
