import contextlib
import json as _json
import os
import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from html import escape as h
from pathlib import Path

import bcrypt
import jwt
from fastapi import APIRouter, Cookie, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..engine_client import engine_client
from ..models import (
    AdminAccount,
    AppConfig,
    AppVersion,
    Badge,
    Content,
    District,
    FeedPost,
    FeedPostImage,
    NicknameWord,
    Quest,
    RideSession,
    SupportReply,
    SupportTicket,
    User,
    UserBadge,
)
from ..utils import (
    APP_TZ,
    MOCK_IMG_ENDPOINT,
    build_imgproxy_url,
    default_avatar_url,
    resolve_avatar_url,
    resolve_feed_image_url,
)

router = APIRouter(prefix="/admin", tags=["관리자 (Admin)"])

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "admin"

_ADMIN_USER = os.getenv("ADMIN_USER", "admin")
_ADMIN_PASS_HASH = os.getenv("ADMIN_PASS_HASH", "")
_JWT_SECRET = os.getenv("ADMIN_JWT_SECRET", "dev_admin_jwt_secret")
_JWT_ALG = "HS256"
_JWT_EXP_HOURS = 8
_COOKIE = "admin_session"

# Wiki 링크 — nginx /wiki/ 프록시 (ENV 로 override 가능)
WIKI_BASE_PATH = os.getenv("WIKI_BASE_PATH", "/wiki/")

# 가상 admin user (database/init/015_admin_seed.sql 시드와 일치)
# 모든 관리자는 이 user_id 로 피드를 작성 (공통 'SaigonRider' 계정)
ADMIN_USER_ID = uuid.UUID(os.getenv("ADMIN_USER_ID", "00000000-0000-0000-0000-000000000001"))

CONTENTS_BASE_PATH = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))
ALLOWED_IMAGE_MIME = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
}

# role 별 사이드바 메뉴 노출
_NAV_KEYS = (
    "dashboard",
    "quests",
    "feed",
    "users",
    "admins",
    "badges",
    "sre",
    "items",
    "policies",
    "stream",
    "support",
    "dev",
    "settings",
)
_ROOT_ONLY_NAV = {"admins"}


def _render(name: str, **ctx: str) -> HTMLResponse:
    """Render a standalone admin page (used by login.html — no sidebar)."""
    html = (_TEMPLATE_DIR / name).read_text(encoding="utf-8")
    for k, v in ctx.items():
        html = html.replace(f"{{{{{k}}}}}", str(v))
    return HTMLResponse(html)


def _render_page(
    name: str,
    *,
    nav: str,
    page_title: str,
    session: "AdminSession | None" = None,
    **ctx: str,
) -> HTMLResponse:
    """Wrap a body partial with the shared admin sidebar layout."""
    body = (_TEMPLATE_DIR / name).read_text(encoding="utf-8")
    for k, v in ctx.items():
        body = body.replace(f"{{{{{k}}}}}", str(v))

    is_root = bool(session and session.role == "root")
    layout = (_TEMPLATE_DIR / "_layout.html").read_text(encoding="utf-8")
    layout = layout.replace("{{page_title}}", page_title)
    layout = layout.replace("{{body}}", body)
    layout = layout.replace("{{wiki_url}}", h(WIKI_BASE_PATH))
    layout = layout.replace("{{admin_username}}", h(session.username if session else ""))
    layout = layout.replace("{{admin_role}}", "ROOT" if is_root else "ADMIN")
    layout = layout.replace(
        "{{admins_menu}}",
        '<a href="/admin/admins" class="{{nav_admins}}"><span class="icon">◆</span> 관리자 계정</a>' if is_root else "",
    )
    for key in _NAV_KEYS:
        layout = layout.replace(f"{{{{nav_{key}}}}}", "active" if key == nav else "")
    return HTMLResponse(layout)


# ── JWT / 세션 ───────────────────────────────────────────────────


class AdminSession:
    """현재 로그인한 admin 의 컨텍스트."""

    def __init__(self, username: str, role: str, account_id: str | None = None):
        self.username = username
        self.role = role  # "root" | "admin"
        self.account_id = account_id

    @property
    def is_root(self) -> bool:
        return self.role == "root"


def _issue_token(*, username: str, role: str, account_id: str | None = None) -> str:
    payload: dict[str, object] = {
        "sub": username,
        "role": role,
        "exp": datetime.now(UTC) + timedelta(hours=_JWT_EXP_HOURS),
    }
    if account_id:
        payload["aid"] = account_id
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALG)


def _decode_token(token: str) -> AdminSession | None:
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALG])
    except jwt.PyJWTError:
        return None
    username = payload.get("sub") or ""
    role = payload.get("role") or "root"  # 기존 토큰 (role 없음) 호환 — root 로 간주
    account_id = payload.get("aid")
    return AdminSession(username=username, role=role, account_id=account_id)


async def verify_admin_session(admin_session: str | None = Cookie(default=None)) -> AdminSession:
    sess = _decode_token(admin_session) if admin_session else None
    if sess is None:
        raise HTTPException(status_code=302, headers={"Location": "/admin/login"})
    return sess


async def verify_root_session(session: AdminSession = Depends(verify_admin_session)) -> AdminSession:
    if not session.is_root:
        raise HTTPException(status_code=403, detail="Root admin only")
    return session


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def _verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


# ── Pages ────────────────────────────────────────────────────────


@router.get("/", include_in_schema=False)
async def admin_root():
    return RedirectResponse(url="/admin/login")


@router.get("/login", include_in_schema=False)
async def admin_login_page():
    return _render("login.html", wiki_url=h(WIKI_BASE_PATH))


# Admin-2
@router.post("/login", include_in_schema=False)
async def admin_login_post(
    username: str = Form(...),
    password: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    role: str | None = None
    account_id: str | None = None

    # 1) root (.env 정적 계정) 우선 매칭
    if username == _ADMIN_USER and _verify_password(password, _ADMIN_PASS_HASH):
        role = "root"
    else:
        # 2) DB 등록 admin_accounts 폴백
        account = (await db.execute(select(AdminAccount).where(AdminAccount.username == username))).scalar_one_or_none()
        if account and _verify_password(password, account.password_hash):
            role = "admin"
            account_id = str(account.id)

    if role is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = _issue_token(username=username, role=role, account_id=account_id)
    resp = RedirectResponse(url="/admin/dashboard", status_code=302)
    resp.set_cookie(
        _COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=_JWT_EXP_HOURS * 3600,
    )
    return resp


@router.post("/logout", include_in_schema=False)
async def admin_logout():
    resp = RedirectResponse(url="/admin/login", status_code=302)
    resp.delete_cookie(_COOKIE)
    return resp


# Admin-3
@router.get("/dashboard", include_in_schema=False)
async def admin_dashboard(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    seven_days_ago = datetime.now(UTC) - timedelta(days=7)
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    new_users_7d = (await db.execute(select(func.count()).where(User.created_at >= seven_days_ago))).scalar_one()
    active_quests = (await db.execute(select(func.count()).where(Quest.is_active.is_(True)))).scalar_one()
    rides_today = (await db.execute(select(func.count()).where(RideSession.created_at >= today_start))).scalar_one()
    total_feeds = (await db.execute(select(func.count()).select_from(FeedPost))).scalar_one()

    return _render_page(
        "dashboard.html",
        nav="dashboard",
        page_title="대시보드",
        session=session,
        total_users=str(total_users),
        new_users_7d=str(new_users_7d),
        active_quests=str(active_quests),
        rides_today=str(rides_today),
        total_feeds=str(total_feeds),
    )


# ── 공통 헬퍼 ────────────────────────────────────────────────────


def _resolve_thumb_url(quest: Quest) -> str:
    """퀘스트 썸네일 표시용 URL — quests.py `_to_out` 폴백 체인을 따른다.

    우선순위 (모두 contents 테이블 중개):
      1. 자체 등록 이미지 (quests.thumbnail_content_id)
      2. district 대표 이미지 (districts.image_content_id)
      3. mockup 이미지
    """
    if quest.thumbnail_content and quest.thumbnail_content.file_path:
        return build_imgproxy_url(quest.thumbnail_content.file_path, options="rs:fill:120:80:1")
    if quest.district and quest.district.image_content and quest.district.image_content.file_path:
        return build_imgproxy_url(quest.district.image_content.file_path, options="rs:fill:120:80:1")
    return f"{MOCK_IMG_ENDPOINT}?seed={quest.id}&w=120&h=80"


async def _save_uploaded_image(
    file: UploadFile,
    db: AsyncSession,
    *,
    owner_type: str = "system",
    owner_id: uuid.UUID | None = None,
) -> Content:
    """UploadFile 을 contents 디렉터리에 저장하고 contents row 를 반환."""
    if file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {file.content_type}")

    if owner_type == "user":
        now = datetime.now(UTC)
        rel_dir = f"user-contents/{now.year}/{now.month:02d}"
    else:
        rel_dir = "system"

    abs_dir = CONTENTS_BASE_PATH / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "file").suffix.lower() or ".bin"
    content_id = uuid.uuid4()
    filename = f"{content_id}{ext}"
    file_path = f"{rel_dir}/{filename}"

    data = await file.read()
    (abs_dir / filename).write_bytes(data)

    content = Content(
        id=content_id,
        owner_type=owner_type,
        owner_id=owner_id,
        file_path=file_path,
        mime_type=file.content_type,
        original_filename=file.filename,
        file_size=len(data),
    )
    db.add(content)
    await db.flush()
    return content


def _parse_dt_local(value: str | None) -> datetime | None:
    """`<input type=datetime-local>` value (`YYYY-MM-DDTHH:MM`) → tz-aware UTC."""
    if not value:
        return None
    try:
        naive = datetime.fromisoformat(value)
    except ValueError:
        return None
    return naive.replace(tzinfo=UTC)


def _dt_local_str(value: datetime | None) -> str:
    if value is None:
        return ""
    return value.strftime("%Y-%m-%dT%H:%M")


# ── 퀘스트 관리 ──────────────────────────────────────────────────


@router.get("/quests", include_in_schema=False)
async def admin_quests_list(
    q: str = "",
    period: str = "",
    active: str = "",
    page: int = 1,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    page = max(1, page)
    size = 20
    offset = (page - 1) * size

    stmt = select(Quest)
    count_stmt = select(func.count()).select_from(Quest)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Quest.title_ko.ilike(like))
        count_stmt = count_stmt.where(Quest.title_ko.ilike(like))
    if period in ("DAILY", "WEEKLY", "EVENT"):
        stmt = stmt.where(Quest.period == period)
        count_stmt = count_stmt.where(Quest.period == period)
    if active in ("0", "1"):
        flag = active == "1"
        stmt = stmt.where(Quest.is_active.is_(flag))
        count_stmt = count_stmt.where(Quest.is_active.is_(flag))

    total = (await db.execute(count_stmt)).scalar_one()
    quests = (await db.execute(stmt.order_by(Quest.created_at.desc()).offset(offset).limit(size))).scalars().all()

    rows_html = []
    for qu in quests:
        thumb = _resolve_thumb_url(qu)
        district_name = qu.district.name_ko if qu.district else "—"
        active_pill = '<span class="pill on">활성</span>' if qu.is_active else '<span class="pill off">비활성</span>'
        badge_pill = f'<span class="pill warn">{h(qu.badge)}</span>' if qu.badge else "—"
        rows_html.append(
            f"<tr>"
            f'<td><img class="thumb" src="{h(thumb)}" alt="" /></td>'
            f"<td>{h(qu.title_ko or '—')}</td>"
            f"<td>{h(qu.period)}</td>"
            f"<td>{h(district_name)}</td>"
            f"<td>{qu.target_distance_km} km</td>"
            f"<td>{qu.reward_exp}</td>"
            f"<td>{qu.reward_gold}</td>"
            f"<td>{h(qu.reward_item or '—')}</td>"
            f"<td>{badge_pill}</td>"
            f"<td>{active_pill}</td>"
            f'<td><a class="btn btn-ghost btn-sm" href="/admin/quests/{qu.id}/edit">수정</a></td>'
            f"</tr>"
        )
    if not rows_html:
        rows_html.append('<tr><td colspan="11" class="empty">조건에 맞는 퀘스트가 없습니다.</td></tr>')

    pagination = _build_pagination("/admin/quests", page, size, total, q=q, period=period, active=active)

    def sel(key, val, cur):
        return "selected" if cur == val else ""

    return _render_page(
        "quests_list.html",
        nav="quests",
        page_title="퀘스트 관리",
        session=session,
        rows="\n".join(rows_html),
        total=str(total),
        q=h(q),
        sel_period_DAILY=sel("period", "DAILY", period),
        sel_period_WEEKLY=sel("period", "WEEKLY", period),
        sel_period_EVENT=sel("period", "EVENT", period),
        sel_active_1=sel("active", "1", active),
        sel_active_0=sel("active", "0", active),
        pagination=pagination,
    )


def _build_pagination(base: str, page: int, size: int, total: int, **params: str) -> str:
    """Simple ?page=N pagination links."""
    total_pages = max(1, (total + size - 1) // size)
    if total_pages <= 1:
        return ""
    qs_base = "&".join(f"{k}={v}" for k, v in params.items() if v)
    parts = []
    for p in range(1, total_pages + 1):
        if p == page:
            parts.append(f'<span class="current">{p}</span>')
        else:
            sep = "&" if qs_base else ""
            parts.append(f'<a href="{base}?page={p}{sep}{qs_base}">{p}</a>')
    return "".join(parts)


async def _districts_options(db: AsyncSession, selected: int | None) -> str:
    rows = (await db.execute(select(District).order_by(District.sort_order, District.id))).scalars().all()
    return "\n".join(
        f'<option value="{d.id}" {"selected" if selected == d.id else ""}>{h(d.name_ko)}</option>' for d in rows
    )


def _quest_form_ctx(quest: Quest | None) -> dict[str, str]:
    """폼 placeholder 치환 컨텍스트 (신규/수정 공용)."""

    def sel(v, cur):
        return "selected" if v == cur else ""

    period = quest.period if quest else "DAILY"
    badge = quest.badge if quest else ""
    is_active = "1" if (quest is None or quest.is_active) else "0"
    return {
        "title_ko": h(quest.title_ko or "") if quest else "",
        "title_vi": h(quest.title_vi or "") if quest else "",
        "title_en": h(quest.title_en or "") if quest else "",
        "required_level": str(quest.required_level if quest else 1),
        "target_distance_km": str(quest.target_distance_km if quest else "5.0"),
        "reward_exp": str(quest.reward_exp if quest else 100),
        "reward_gold": str(quest.reward_gold if quest else 50),
        "reward_item": h(quest.reward_item or "") if quest else "",
        "starts_at": _dt_local_str(quest.starts_at if quest else None),
        "ends_at": _dt_local_str(quest.ends_at if quest else None),
        "sel_p_DAILY": sel("DAILY", period),
        "sel_p_WEEKLY": sel("WEEKLY", period),
        "sel_p_EVENT": sel("EVENT", period),
        "sel_b_HOT": sel("HOT", badge),
        "sel_b_NEW": sel("NEW", badge),
        "sel_b_LIMITED": sel("LIMITED", badge),
        "sel_active_1": sel("1", is_active),
        "sel_active_0": sel("0", is_active),
    }


@router.get("/quests/new", include_in_schema=False)
async def admin_quest_new(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    ctx = _quest_form_ctx(None)
    ctx.update(
        mode_label="신규 퀘스트",
        form_sub="새 퀘스트를 등록합니다.",
        form_action="/admin/quests/new",
        submit_label="등록",
        delete_btn="",
        district_options=await _districts_options(db, None),
        current_thumb=f"{MOCK_IMG_ENDPOINT}?w=120&h=80",
    )
    return _render_page("quests_form.html", nav="quests", page_title="신규 퀘스트", session=session, **ctx)


def _parse_decimal(value: str, field: str) -> Decimal:
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError) as err:
        raise HTTPException(status_code=400, detail=f"Invalid {field}") from err


@router.post("/quests/new", include_in_schema=False)
async def admin_quest_create(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    title_ko: str = Form(...),
    title_vi: str = Form(""),
    title_en: str = Form(""),
    period: str = Form("DAILY"),
    district_id: str = Form(""),
    required_level: int = Form(1),
    target_distance_km: str = Form(...),
    badge: str = Form(""),
    is_active: str = Form("1"),
    reward_exp: int = Form(0),
    reward_gold: int = Form(0),
    reward_item: str = Form(""),
    starts_at: str = Form(""),
    ends_at: str = Form(""),
    thumbnail: UploadFile | None = File(None),
):
    if period not in ("DAILY", "WEEKLY", "EVENT"):
        raise HTTPException(status_code=400, detail="Invalid period")

    quest = Quest(
        title_ko=title_ko.strip() or None,
        title_vi=(title_vi.strip() or None),
        title_en=(title_en.strip() or None),
        period=period,
        district_id=int(district_id) if district_id else None,
        required_level=required_level,
        target_distance_km=_parse_decimal(target_distance_km, "target_distance_km"),
        badge=(badge or None) if badge in ("HOT", "NEW", "LIMITED") else None,
        is_active=(is_active == "1"),
        reward_exp=reward_exp,
        reward_gold=reward_gold,
        reward_item=(reward_item.strip() or None),
        starts_at=_parse_dt_local(starts_at),
        ends_at=_parse_dt_local(ends_at),
    )

    if thumbnail and thumbnail.filename:
        content = await _save_uploaded_image(thumbnail, db, owner_type="system")
        quest.thumbnail_content_id = content.id

    db.add(quest)
    await db.commit()
    return RedirectResponse(url="/admin/quests", status_code=302)


@router.get("/quests/{quest_id}/edit", include_in_schema=False)
async def admin_quest_edit(
    quest_id: uuid.UUID,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    quest = (await db.execute(select(Quest).where(Quest.id == quest_id))).scalar_one_or_none()
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")

    ctx = _quest_form_ctx(quest)
    ctx.update(
        mode_label="퀘스트 수정",
        form_sub=h(quest.title_ko or str(quest.id)),
        form_action=f"/admin/quests/{quest.id}/edit",
        submit_label="저장",
        delete_btn=(
            '<form method="post" action="/admin/quests/' + str(quest.id) + '/delete" '
            'onsubmit="return confirm(&#39;정말 삭제하시겠습니까?&#39;);">'
            '<button type="submit" class="btn btn-danger">삭제</button></form>'
        ),
        district_options=await _districts_options(db, quest.district_id),
        current_thumb=h(_resolve_thumb_url(quest)),
    )
    return _render_page("quests_form.html", nav="quests", page_title="퀘스트 수정", session=session, **ctx)


@router.post("/quests/{quest_id}/edit", include_in_schema=False)
async def admin_quest_update(
    quest_id: uuid.UUID,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    title_ko: str = Form(...),
    title_vi: str = Form(""),
    title_en: str = Form(""),
    period: str = Form("DAILY"),
    district_id: str = Form(""),
    required_level: int = Form(1),
    target_distance_km: str = Form(...),
    badge: str = Form(""),
    is_active: str = Form("1"),
    reward_exp: int = Form(0),
    reward_gold: int = Form(0),
    reward_item: str = Form(""),
    starts_at: str = Form(""),
    ends_at: str = Form(""),
    thumbnail: UploadFile | None = File(None),
):
    quest = (await db.execute(select(Quest).where(Quest.id == quest_id))).scalar_one_or_none()
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")
    if period not in ("DAILY", "WEEKLY", "EVENT"):
        raise HTTPException(status_code=400, detail="Invalid period")

    quest.title_ko = title_ko.strip() or None
    quest.title_vi = title_vi.strip() or None
    quest.title_en = title_en.strip() or None
    quest.period = period
    quest.district_id = int(district_id) if district_id else None
    quest.required_level = required_level
    quest.target_distance_km = _parse_decimal(target_distance_km, "target_distance_km")
    quest.badge = (badge or None) if badge in ("HOT", "NEW", "LIMITED") else None
    quest.is_active = is_active == "1"
    quest.reward_exp = reward_exp
    quest.reward_gold = reward_gold
    quest.reward_item = reward_item.strip() or None
    quest.starts_at = _parse_dt_local(starts_at)
    quest.ends_at = _parse_dt_local(ends_at)

    if thumbnail and thumbnail.filename:
        content = await _save_uploaded_image(thumbnail, db, owner_type="system")
        quest.thumbnail_content_id = content.id

    await db.commit()
    return RedirectResponse(url="/admin/quests", status_code=302)


@router.post("/quests/{quest_id}/delete", include_in_schema=False)
async def admin_quest_delete(
    quest_id: uuid.UUID,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    quest = (await db.execute(select(Quest).where(Quest.id == quest_id))).scalar_one_or_none()
    if quest is None:
        raise HTTPException(status_code=404, detail="Quest not found")
    await db.delete(quest)
    await db.commit()
    return RedirectResponse(url="/admin/quests", status_code=302)


# ── 피드 관리 ────────────────────────────────────────────────────

# 해시태그 토큰: 공백·구두점 전까지. 한글/영문/숫자 모두 허용.
_HASHTAG_RE = re.compile(r"#[^\s#.,!?]+")


def _render_caption(text: str | None) -> str:
    """피드 본문 HTML 렌더 — 해시태그 하이라이트 + 줄바꿈 보존."""
    if not text:
        return '<span style="color:rgba(255,255,255,.3);">(텍스트 없음)</span>'
    escaped = h(text).replace("\n", "<br/>")
    return _HASHTAG_RE.sub(lambda m: f'<span class="hashtag">{m.group(0)}</span>', escaped)


def _resolve_feed_image_urls_admin(post: FeedPost) -> list[str]:
    urls = []
    for img in post.images or []:
        if img.content and img.content.file_path:
            urls.append(build_imgproxy_url(img.content.file_path))
    if not urls:
        legacy = resolve_feed_image_url(post)
        if legacy:
            urls.append(legacy)
    return urls


@router.get("/feed", include_in_schema=False)
async def admin_feed_list(
    page: int = 1,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    page = max(1, page)
    size = 12
    offset = (page - 1) * size

    total = (await db.execute(select(func.count()).select_from(FeedPost))).scalar_one()
    rows = (
        await db.execute(
            select(FeedPost, User)
            .outerjoin(User, FeedPost.user_id == User.id)
            .order_by(FeedPost.created_at.desc())
            .offset(offset)
            .limit(size)
        )
    ).all()

    cards_html = []
    for post, user in rows:
        nickname = user.nickname if user and user.nickname else "—"
        avatar = resolve_avatar_url(user) if user else default_avatar_url()
        img_urls = _resolve_feed_image_urls_admin(post)
        if len(img_urls) > 1:
            imgs = "".join(f'<img src="{h(u)}" alt="" />' for u in img_urls)
            img_block = (
                f'<div class="feed-img feed-img-multi">{imgs}'
                f'<span class="feed-img-count">{len(img_urls)}장</span></div>'
            )
        elif img_urls:
            img_block = f'<div class="feed-img"><img src="{h(img_urls[0])}" alt="" /></div>'
        else:
            img_block = ""
        story_pill = '<span class="pill warn">STORY</span>' if post.is_story else ""
        confirm_attr = "return confirm('정말 삭제하시겠습니까?');"
        cards_html.append(
            f'<article class="feed-card">'
            f'<header class="feed-head">'
            f'<img class="feed-avatar" src="{h(avatar)}" alt="" />'
            f'<div class="feed-meta">'
            f'<span class="feed-nick">{h(nickname)}</span>'
            f'<span class="feed-date">{post.created_at.strftime("%Y-%m-%d %H:%M")}</span>'
            f"</div>{story_pill}"
            f"</header>"
            f"{img_block}"
            f'<div class="feed-caption">{_render_caption(post.content)}</div>'
            f'<footer class="feed-foot">'
            f'<span class="feed-stat">&#9829; {post.like_count}</span>'
            f'<span class="feed-stat">&#128172; {post.comment_count}</span>'
            f'<span class="feed-actions">'
            f'<a class="btn btn-ghost btn-sm" href="/admin/feed/{post.id}/edit">수정</a>'
            f'<form method="post" action="/admin/feed/{post.id}/delete" style="display:inline;" '
            f'onsubmit="{confirm_attr}">'
            f'<button type="submit" class="btn btn-danger btn-sm">삭제</button></form>'
            f"</span>"
            f"</footer>"
            f"</article>"
        )
    cards = (
        "\n".join(cards_html)
        if cards_html
        else ('<div class="empty" style="grid-column:1/-1;">등록된 피드가 없습니다.</div>')
    )

    pagination = _build_pagination("/admin/feed", page, size, total)
    return _render_page(
        "feed_list.html",
        nav="feed",
        page_title="피드 관리",
        session=session,
        cards=cards,
        total=str(total),
        pagination=pagination,
    )


def _feed_form_ctx(post: FeedPost | None) -> dict[str, str]:
    """피드 폼 치환 컨텍스트 (신규/수정 공용)."""
    if post is None:
        return {
            "mode_label": "관리자 피드 게시",
            "form_sub": "공통 계정 SaigonRider 로 새 피드를 게시합니다.",
            "form_action": "/admin/feed/new",
            "submit_label": "게시",
            "content": "",
            "is_story_checked": "",
            "current_image": "",
            "delete_btn": "",
        }
    img_urls = _resolve_feed_image_urls_admin(post)
    if img_urls:
        imgs_html = ""
        for _i, (img_row, url) in enumerate(zip(post.images or [], img_urls, strict=False)):
            cid = str(img_row.content_id)
            imgs_html += (
                f'<div style="display:inline-block;position:relative;margin:0 8px 8px 0;">'
                f'<img src="{h(url)}" alt="" style="width:120px;height:120px;object-fit:cover;'
                f'border-radius:10px;border:1px solid rgba(255,255,255,.1);display:block;" />'
                f'<label style="display:flex;gap:4px;align-items:center;font-size:11px;'
                f'color:rgba(255,255,255,.6);margin-top:4px;">'
                f'<input type="checkbox" name="remove_image_ids" value="{cid}" /> 삭제'
                f"</label></div>"
            )
        if not imgs_html and img_urls:
            legacy_url = img_urls[0]
            imgs_html = (
                f'<div><img src="{h(legacy_url)}" alt="" style="max-width:280px;border-radius:10px;'
                f'border:1px solid rgba(255,255,255,.1);" /></div>'
            )
        current_image = (
            f'<div class="field"><label class="field-label">현재 이미지 ({len(img_urls)}장)</label>'
            f"<div>{imgs_html}</div></div>"
        )
    else:
        current_image = ""
    delete_btn = (
        '<form method="post" action="/admin/feed/' + str(post.id) + '/delete" '
        'onsubmit="return confirm(&#39;정말 삭제하시겠습니까?&#39;);">'
        '<button type="submit" class="btn btn-danger">삭제</button></form>'
    )
    return {
        "mode_label": "피드 수정",
        "form_sub": post.created_at.strftime("%Y-%m-%d %H:%M") + " 게시물",
        "form_action": f"/admin/feed/{post.id}/edit",
        "submit_label": "저장",
        "content": h(post.content or ""),
        "is_story_checked": "checked" if post.is_story else "",
        "current_image": current_image,
        "delete_btn": delete_btn,
    }


@router.get("/feed/new", include_in_schema=False)
async def admin_feed_new(session: AdminSession = Depends(verify_admin_session)):
    return _render_page(
        "feed_form.html",
        nav="feed",
        page_title="관리자 피드 게시",
        session=session,
        **_feed_form_ctx(None),
    )


@router.post("/feed/new", include_in_schema=False)
async def admin_feed_create(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    content: str = Form(""),
    is_story: str = Form(""),
    images: list[UploadFile] = File([]),
):
    text_body = content.strip() or None
    content_ids: list[uuid.UUID] = []

    for img in images:
        if img and img.filename:
            saved = await _save_uploaded_image(img, db, owner_type="user", owner_id=ADMIN_USER_ID)
            content_ids.append(saved.id)

    if not text_body and not content_ids:
        raise HTTPException(status_code=400, detail="content or image is required")

    now = datetime.now(UTC)
    post = FeedPost(
        user_id=ADMIN_USER_ID,
        content=text_body,
        image_content_id=content_ids[0] if content_ids else None,
        is_story=(is_story == "1"),
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    await db.flush()

    for idx, cid in enumerate(content_ids):
        db.add(FeedPostImage(post_id=post.id, content_id=cid, sort_order=idx))

    await db.commit()
    return RedirectResponse(url="/admin/feed", status_code=302)


@router.get("/feed/{post_id}/edit", include_in_schema=False)
async def admin_feed_edit(
    post_id: uuid.UUID,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    post = (await db.execute(select(FeedPost).where(FeedPost.id == post_id))).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Feed post not found")
    return _render_page(
        "feed_form.html",
        nav="feed",
        page_title="피드 수정",
        session=session,
        **_feed_form_ctx(post),
    )


@router.post("/feed/{post_id}/edit", include_in_schema=False)
async def admin_feed_update(
    request: Request,
    post_id: uuid.UUID,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    form = await request.form()
    content_val = form.get("content", "")
    is_story_val = form.get("is_story", "")
    remove_ids_raw = form.getlist("remove_image_ids")
    new_images = form.getlist("images")

    post = (await db.execute(select(FeedPost).where(FeedPost.id == post_id))).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Feed post not found")

    text_body = str(content_val).strip() or None

    remove_ids = set()
    for rid in remove_ids_raw:
        with contextlib.suppress(ValueError):
            remove_ids.add(uuid.UUID(str(rid)))

    if remove_ids:
        await db.execute(
            FeedPostImage.__table__.delete().where(
                FeedPostImage.post_id == post_id,
                FeedPostImage.content_id.in_(remove_ids),
            )
        )

    max_order_result = await db.execute(
        select(func.coalesce(func.max(FeedPostImage.sort_order), -1)).where(FeedPostImage.post_id == post_id)
    )
    next_order = max_order_result.scalar_one() + 1

    new_content_ids: list[uuid.UUID] = []
    for img in new_images:
        if hasattr(img, "filename") and img.filename:
            saved = await _save_uploaded_image(img, db, owner_type="user", owner_id=ADMIN_USER_ID)
            new_content_ids.append(saved.id)
            db.add(FeedPostImage(post_id=post_id, content_id=saved.id, sort_order=next_order))
            next_order += 1

    remaining = await db.execute(
        select(FeedPostImage.content_id).where(FeedPostImage.post_id == post_id).order_by(FeedPostImage.sort_order)
    )
    remaining_ids = [r[0] for r in remaining.all()]
    post.image_content_id = remaining_ids[0] if remaining_ids else None

    if not text_body and not remaining_ids:
        raise HTTPException(status_code=400, detail="content or image is required")

    post.content = text_body
    post.is_story = str(is_story_val) == "1"
    post.updated_at = datetime.now(UTC)
    await db.commit()
    return RedirectResponse(url="/admin/feed", status_code=302)


@router.post("/feed/{post_id}/delete", include_in_schema=False)
async def admin_feed_delete(
    post_id: uuid.UUID,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    post = (await db.execute(select(FeedPost).where(FeedPost.id == post_id))).scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=404, detail="Feed post not found")
    await db.delete(post)
    await db.commit()
    return RedirectResponse(url="/admin/feed", status_code=302)


# ── 유저 관리 ────────────────────────────────────────────────────


@router.get("/users", include_in_schema=False)
async def admin_users_list(
    q: str = "",
    page: int = 1,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    page = max(1, page)
    size = 30
    offset = (page - 1) * size

    stmt = select(User)
    count_stmt = select(func.count()).select_from(User)
    if q:
        like = f"%{q}%"
        cond = (User.nickname.ilike(like)) | (User.phone.ilike(like))
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    total = (await db.execute(count_stmt)).scalar_one()
    users = (await db.execute(stmt.order_by(User.created_at.desc()).offset(offset).limit(size))).scalars().all()

    rows_html = []
    for u in users:
        avatar = resolve_avatar_url(u)
        rider_type_name = u.rider_type.name_ko if u.rider_type else "—"
        nickname = u.nickname or "(미설정)"
        admin_pill = '<span class="pill warn" style="margin-left:6px;">ADMIN</span>' if u.id == ADMIN_USER_ID else ""
        rows_html.append(
            f"<tr>"
            f'<td><img class="avatar" src="{h(avatar)}" alt="" /></td>'
            f"<td>{h(nickname)}{admin_pill}</td>"
            f'<td style="font-family:monospace;font-size:12px;">{h(u.phone)}</td>'
            f"<td>{u.level}</td>"
            f"<td>{u.exp}</td>"
            f"<td>{u.gold}</td>"
            f"<td>{h(rider_type_name)}</td>"
            f'<td style="font-size:12px;color:rgba(255,255,255,.5);">{u.created_at.strftime("%Y-%m-%d %H:%M")}</td>'
            f"</tr>"
        )
    if not rows_html:
        rows_html.append('<tr><td colspan="8" class="empty">조건에 맞는 유저가 없습니다.</td></tr>')

    pagination = _build_pagination("/admin/users", page, size, total, q=q)
    return _render_page(
        "users_list.html",
        nav="users",
        page_title="유저 관리",
        session=session,
        rows="\n".join(rows_html),
        total=str(total),
        q=h(q),
        pagination=pagination,
    )


# ── 설정 ─────────────────────────────────────────────────────────


async def _get_admin_user(db: AsyncSession) -> User:
    user = await db.get(User, ADMIN_USER_ID)
    if user is None:
        raise HTTPException(
            status_code=500,
            detail="Admin user seed not found. Run database/init/015_admin_seed.sql.",
        )
    return user


def _admin_avatar_url(user: User) -> str:
    """관리자 공통 계정 프로필 이미지 — contents 중개 우선, 없으면 프론트 default 이미지."""
    return resolve_avatar_url(user)


_SETTINGS_FLASHES = {
    "avatar": ("프로필 이미지가 변경되었습니다.", True),
    "nickname": ("닉네임이 변경되었습니다.", True),
    "nickname_empty": ("닉네임을 입력하세요.", False),
    "nickname_long": ("닉네임은 30자 이하여야 합니다.", False),
    "nickname_dup": ("이미 다른 유저가 사용 중인 닉네임입니다.", False),
    "word_added": ("단어가 추가되었습니다.", True),
    "word_deleted": ("단어가 삭제되었습니다.", True),
    "word_empty": ("단어를 입력하세요.", False),
    "word_dup": ("이미 등록된 단어입니다.", False),
    "ver_added": ("버전이 등록되었습니다.", True),
    "ver_updated": ("버전이 수정되었습니다.", True),
    "ver_deleted": ("버전이 삭제되었습니다.", True),
    "ver_error": ("버전 처리 중 오류가 발생했습니다.", False),
    "config_saved": ("서비스 설정이 저장되었습니다.", True),
    "config_error": ("설정값이 올바르지 않습니다.", False),
}


@router.get("/settings", include_in_schema=False)
async def admin_settings(
    flash: str = "",
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_admin_user(db)
    flash_html = ""
    if flash in _SETTINGS_FLASHES:
        msg, ok = _SETTINGS_FLASHES[flash]
        flash_html = _flash_card(msg, ok=ok)

    words = (await db.execute(select(NicknameWord).order_by(NicknameWord.word_type, NicknameWord.word))).scalars().all()
    import json as _json

    adj_json = _json.dumps([{"id": w.id, "word": w.word} for w in words if w.word_type == "adjective"])
    noun_json = _json.dumps([{"id": w.id, "word": w.word} for w in words if w.word_type == "noun"])
    adj_count = sum(1 for w in words if w.word_type == "adjective")
    noun_count = sum(1 for w in words if w.word_type == "noun")

    recommend_max_row = (
        await db.execute(
            select(AppConfig).where(AppConfig.group_name == "quest", AppConfig.key == "recommend_max_count")
        )
    ).scalar_one_or_none()
    recommend_max_count = recommend_max_row.value if recommend_max_row else "3"

    dm_poll_row = (
        await db.execute(select(AppConfig).where(AppConfig.group_name == "dm", AppConfig.key == "unread_poll_interval"))
    ).scalar_one_or_none()
    dm_poll_interval = dm_poll_row.value if dm_poll_row else "30"

    primary_versions = (
        (
            await db.execute(
                select(AppVersion)
                .where(AppVersion.platform == "primary")
                .order_by(AppVersion.released_at.desc().nullslast(), AppVersion.id.desc())
            )
        )
        .scalars()
        .all()
    )

    child_versions = (
        (
            (
                await db.execute(
                    select(AppVersion).where(
                        AppVersion.parent_id.in_([pv.id for pv in primary_versions]),
                        AppVersion.platform != "primary",
                    )
                )
            )
            .scalars()
            .all()
        )
        if primary_versions
        else []
    )
    children_by_parent: dict[int, list] = {}
    for cv in child_versions:
        children_by_parent.setdefault(cv.parent_id, []).append(cv)

    version_rows = ""
    for pv in primary_versions:
        pv_children = children_by_parent.get(pv.id, [])
        ios_v = next((c for c in pv_children if c.platform == "ios"), None)
        android_v = next((c for c in pv_children if c.platform == "android"), None)
        active_badge = '<span style="color:#48bb78;">●</span>' if pv.is_active else '<span style="color:#666;">○</span>'
        force_badge = ' <span style="color:#fc8181;font-size:11px;">[강제]</span>' if pv.is_force_update else ""
        released = pv.released_at.strftime("%Y-%m-%d") if pv.released_at else "미배포"
        ios_info = f"{ios_v.version} (build {h(ios_v.build_number or '-')})" if ios_v else "-"
        android_info = f"{android_v.version} (build {h(android_v.build_number or '-')})" if android_v else "-"
        note_preview = h((pv.release_note or "")[:60])
        version_rows += (
            f"<tr>"
            f"<td>{active_badge} {h(pv.version)}{force_badge}</td>"
            f"<td>{ios_info}</td>"
            f"<td>{android_info}</td>"
            f'<td style="color:#aaa;font-size:12px;">{note_preview}</td>'
            f"<td>{released}</td>"
            f"<td>"
            f'<form method="post" action="/admin/settings/version/delete" style="display:inline;margin:0;">'
            f'<input type="hidden" name="version_id" value="{pv.id}"/>'
            f'<button type="submit" class="btn btn-sm" style="background:rgba(239,59,59,.25);color:#fc8181;padding:2px 10px;font-size:11px;">삭제</button>'
            f"</form></td></tr>"
        )

    return _render_page(
        "settings.html",
        nav="settings",
        page_title="설정",
        session=session,
        username=h(session.username),
        role_label=("ROOT (정적)" if session.is_root else "ADMIN (DB)"),
        admin_user_id=h(str(ADMIN_USER_ID)),
        nickname=h(user.nickname or ""),
        avatar_url=h(_admin_avatar_url(user)),
        flash=flash_html,
        adj_json=adj_json,
        noun_json=noun_json,
        adj_count=str(adj_count),
        noun_count=str(noun_count),
        version_rows=version_rows,
        version_count=str(len(primary_versions)),
        recommend_max_count=h(recommend_max_count),
        dm_poll_interval=h(dm_poll_interval),
    )


@router.post("/settings/nickname", include_in_schema=False)
async def admin_settings_nickname(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    nickname: str = Form(...),
):
    user = await _get_admin_user(db)
    nickname = nickname.strip()
    if not nickname:
        return RedirectResponse(url="/admin/settings?flash=nickname_empty", status_code=302)
    if len(nickname) > 30:
        return RedirectResponse(url="/admin/settings?flash=nickname_long", status_code=302)

    dup = (await db.execute(select(User).where(User.nickname == nickname, User.id != user.id))).scalar_one_or_none()
    if dup is not None:
        return RedirectResponse(url="/admin/settings?flash=nickname_dup", status_code=302)

    user.nickname = nickname
    await db.commit()
    return RedirectResponse(url="/admin/settings?flash=nickname", status_code=302)


# ── 관리자 계정 관리 (root 전용) ─────────────────────────────────

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,50}$")


def _flash_card(msg: str, *, ok: bool = True) -> str:
    color = "rgba(72,187,120,.35)" if ok else "rgba(239,59,59,.35)"
    bg = "rgba(72,187,120,.06)" if ok else "rgba(239,59,59,.06)"
    text = "#9ae6b4" if ok else "#fc8181"
    icon = "✓" if ok else "✗"
    return (
        f'<div class="card" style="margin-bottom:18px;border-color:{color};'
        f'background:{bg};color:{text};font-size:13px;">{icon} {h(msg)}</div>'
    )


_ADMIN_FLASHES = {
    "created": ("관리자가 추가되었습니다.", True),
    "updated": ("관리자 정보가 수정되었습니다.", True),
    "deleted": ("관리자가 삭제되었습니다.", True),
    "duplicate": ("이미 사용 중인 아이디입니다.", False),
    "invalid_username": ("아이디 형식이 올바르지 않습니다 (영문/숫자/._- 3~50자).", False),
    "weak_password": ("비밀번호는 6자 이상이어야 합니다.", False),
    "root_collision": ("root 관리자(.env)와 동일한 아이디는 사용할 수 없습니다.", False),
}


@router.get("/admins", include_in_schema=False)
async def admin_admins_list(
    flash: str = "",
    session: AdminSession = Depends(verify_root_session),
    db: AsyncSession = Depends(get_db),
):
    accounts = (await db.execute(select(AdminAccount).order_by(AdminAccount.created_at.desc()))).scalars().all()

    rows_html = []
    for a in accounts:
        confirm_attr = "return confirm('정말 삭제하시겠습니까?');"
        rows_html.append(
            "<tr>"
            f'<td style="font-family:monospace;color:#fff;">{h(a.username)}</td>'
            f"<td>{h(a.note or '—')}</td>"
            f'<td style="font-size:12px;color:rgba(255,255,255,.5);">{a.created_at.strftime("%Y-%m-%d %H:%M")}</td>'
            f'<td style="font-size:12px;color:rgba(255,255,255,.5);">{a.updated_at.strftime("%Y-%m-%d %H:%M")}</td>'
            "<td>"
            f'<a class="btn btn-ghost btn-sm" href="/admin/admins/{a.id}/edit">수정</a> '
            f'<form method="post" action="/admin/admins/{a.id}/delete" style="display:inline;" '
            f'onsubmit="{confirm_attr}">'
            f'<button type="submit" class="btn btn-danger btn-sm">삭제</button></form>'
            "</td>"
            "</tr>"
        )
    if not rows_html:
        rows_html.append('<tr><td colspan="5" class="empty">등록된 관리자가 없습니다. (root 만 있음)</td></tr>')

    flash_html = ""
    if flash in _ADMIN_FLASHES:
        msg, ok = _ADMIN_FLASHES[flash]
        flash_html = _flash_card(msg, ok=ok)

    return _render_page(
        "admins_list.html",
        nav="admins",
        page_title="관리자 계정",
        session=session,
        rows="\n".join(rows_html),
        total=str(len(accounts)),
        root_username=h(_ADMIN_USER),
        flash=flash_html,
    )


def _validate_username(username: str) -> str | None:
    if not _USERNAME_RE.match(username):
        return "invalid_username"
    if username == _ADMIN_USER:
        return "root_collision"
    return None


@router.get("/admins/new", include_in_schema=False)
async def admin_admin_new(
    session: AdminSession = Depends(verify_root_session),
):
    return _render_page(
        "admins_form.html",
        nav="admins",
        page_title="관리자 추가",
        session=session,
        mode_label="관리자 추가",
        form_sub="DB 등록 관리자 계정을 새로 만듭니다.",
        form_action="/admin/admins/new",
        submit_label="등록",
        username="",
        username_readonly="",
        note="",
        password_required_label="*",
        password_required="required",
        password_hint="6자 이상. 등록 후에는 해시만 저장되며 평문 확인 불가.",
    )


@router.post("/admins/new", include_in_schema=False)
async def admin_admin_create(
    session: AdminSession = Depends(verify_root_session),
    db: AsyncSession = Depends(get_db),
    username: str = Form(...),
    password: str = Form(...),
    note: str = Form(""),
):
    username = username.strip()
    err = _validate_username(username)
    if err:
        return RedirectResponse(url=f"/admin/admins?flash={err}", status_code=302)
    if len(password) < 6:
        return RedirectResponse(url="/admin/admins?flash=weak_password", status_code=302)

    exists = (await db.execute(select(AdminAccount).where(AdminAccount.username == username))).scalar_one_or_none()
    if exists is not None:
        return RedirectResponse(url="/admin/admins?flash=duplicate", status_code=302)

    db.add(
        AdminAccount(
            username=username,
            password_hash=_hash_password(password),
            note=(note.strip() or None),
        )
    )
    await db.commit()
    return RedirectResponse(url="/admin/admins?flash=created", status_code=302)


@router.get("/admins/{account_id}/edit", include_in_schema=False)
async def admin_admin_edit(
    account_id: uuid.UUID,
    session: AdminSession = Depends(verify_root_session),
    db: AsyncSession = Depends(get_db),
):
    account = await db.get(AdminAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Admin account not found")
    return _render_page(
        "admins_form.html",
        nav="admins",
        page_title="관리자 수정",
        session=session,
        mode_label="관리자 수정",
        form_sub=h(account.username),
        form_action=f"/admin/admins/{account.id}/edit",
        submit_label="저장",
        username=h(account.username),
        username_readonly="readonly",
        note=h(account.note or ""),
        password_required_label="(변경 시에만 입력)",
        password_required="",
        password_hint="비워두면 비밀번호 변경 없이 메모만 갱신됩니다.",
    )


@router.post("/admins/{account_id}/edit", include_in_schema=False)
async def admin_admin_update(
    account_id: uuid.UUID,
    session: AdminSession = Depends(verify_root_session),
    db: AsyncSession = Depends(get_db),
    username: str = Form(...),
    password: str = Form(""),
    note: str = Form(""),
):
    account = await db.get(AdminAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Admin account not found")

    # username 은 form readonly 이지만 클라이언트 위변조 방지
    account.note = note.strip() or None
    if password:
        if len(password) < 6:
            return RedirectResponse(url="/admin/admins?flash=weak_password", status_code=302)
        account.password_hash = _hash_password(password)
    await db.commit()
    return RedirectResponse(url="/admin/admins?flash=updated", status_code=302)


@router.post("/admins/{account_id}/delete", include_in_schema=False)
async def admin_admin_delete(
    account_id: uuid.UUID,
    session: AdminSession = Depends(verify_root_session),
    db: AsyncSession = Depends(get_db),
):
    account = await db.get(AdminAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Admin account not found")
    await db.delete(account)
    await db.commit()
    return RedirectResponse(url="/admin/admins?flash=deleted", status_code=302)


@router.post("/settings/nickname-word", include_in_schema=False)
async def admin_add_nickname_word(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    word: str = Form(...),
    word_type: str = Form(...),
):
    word = word.strip()
    if not word:
        return RedirectResponse(url="/admin/settings?flash=word_empty", status_code=302)
    if word_type not in ("adjective", "noun"):
        raise HTTPException(status_code=400, detail="Invalid word_type")
    dup = (
        await db.execute(select(NicknameWord).where(NicknameWord.word == word, NicknameWord.word_type == word_type))
    ).scalar_one_or_none()
    if dup:
        return RedirectResponse(url="/admin/settings?flash=word_dup", status_code=302)
    db.add(NicknameWord(word=word, word_type=word_type))
    await db.commit()
    return RedirectResponse(url="/admin/settings?flash=word_added", status_code=302)


@router.post("/settings/nickname-word/delete", include_in_schema=False)
async def admin_delete_nickname_word(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    word_id: int = Form(...),
):
    row = (await db.execute(select(NicknameWord).where(NicknameWord.id == word_id))).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return RedirectResponse(url="/admin/settings?flash=word_deleted", status_code=302)


@router.post("/settings/nickname-word/api/add", include_in_schema=False)
async def api_add_nickname_word(
    request: Request,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    word = (body.get("word") or "").strip()
    word_type = body.get("word_type", "")
    if not word:
        return JSONResponse({"ok": False, "error": "empty"}, status_code=400)
    if word_type not in ("adjective", "noun"):
        return JSONResponse({"ok": False, "error": "invalid_type"}, status_code=400)
    dup = (
        await db.execute(select(NicknameWord).where(NicknameWord.word == word, NicknameWord.word_type == word_type))
    ).scalar_one_or_none()
    if dup:
        return JSONResponse({"ok": False, "error": "duplicate"}, status_code=409)
    row = NicknameWord(word=word, word_type=word_type)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return JSONResponse({"ok": True, "id": row.id, "word": row.word})


@router.post("/settings/nickname-word/api/delete", include_in_schema=False)
async def api_delete_nickname_word(
    request: Request,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    word_id = body.get("word_id")
    row = (await db.execute(select(NicknameWord).where(NicknameWord.id == word_id))).scalar_one_or_none()
    if not row:
        return JSONResponse({"ok": False, "error": "not_found"}, status_code=404)
    await db.delete(row)
    await db.commit()
    return JSONResponse({"ok": True})


@router.post("/settings/version", include_in_schema=False)
async def admin_settings_version_add(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    version: str = Form(...),
    ios_build: str = Form(""),
    android_build: str = Form(""),
    release_note: str = Form(""),
    is_force_update: bool = Form(False),
    is_active: bool = Form(False),
):
    version = version.strip()
    if not version:
        return RedirectResponse(url="/admin/settings?flash=ver_error", status_code=302)

    if is_active:
        await db.execute(select(AppVersion).where(AppVersion.is_active == True))
        for old in (await db.execute(select(AppVersion).where(AppVersion.is_active == True))).scalars().all():
            old.is_active = False

    primary = AppVersion(
        version=version,
        platform="primary",
        release_note=release_note or None,
        is_force_update=is_force_update,
        is_active=is_active,
        released_at=datetime.now(UTC) if is_active else None,
    )
    db.add(primary)
    await db.flush()

    ios = AppVersion(
        version=version,
        platform="ios",
        parent_id=primary.id,
        build_number=ios_build.strip() or None,
        release_note=release_note or None,
        is_force_update=is_force_update,
        is_active=is_active,
        released_at=primary.released_at,
    )
    android = AppVersion(
        version=version,
        platform="android",
        parent_id=primary.id,
        build_number=android_build.strip() or None,
        release_note=release_note or None,
        is_force_update=is_force_update,
        is_active=is_active,
        released_at=primary.released_at,
    )
    db.add_all([ios, android])
    await db.commit()
    return RedirectResponse(url="/admin/settings?flash=ver_added", status_code=302)


@router.post("/settings/version/delete", include_in_schema=False)
async def admin_settings_version_delete(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    version_id: int = Form(...),
):
    v = await db.get(AppVersion, version_id)
    if v:
        await db.delete(v)
        await db.commit()
    return RedirectResponse(url="/admin/settings?flash=ver_deleted", status_code=302)


@router.post("/settings/avatar", include_in_schema=False)
async def admin_settings_avatar(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    avatar: UploadFile = File(...),
):
    user = await _get_admin_user(db)
    saved = await _save_uploaded_image(avatar, db, owner_type="user", owner_id=user.id)
    # 프로필 사진은 contents 테이블로 중개 — content_id 만 저장 (URL 직접 저장 금지)
    user.avatar_content_id = saved.id
    await db.commit()
    return RedirectResponse(url="/admin/settings?flash=avatar", status_code=302)


# ── SRE 관리자 콘솔 ──────────────────────────────────────────────


@router.get("/sre", include_in_schema=False)
async def admin_sre_root():
    return RedirectResponse(url="/admin/sre/ops")


@router.get("/sre/ops", include_in_schema=False)
async def admin_sre_ops(
    session: AdminSession = Depends(verify_admin_session),
):
    try:
        daily_net = await engine_client.admin_ops_daily_net()
    except Exception:
        daily_net = []
    try:
        gacha_roi = await engine_client.admin_ops_gacha_roi()
    except Exception:
        gacha_roi = []
    try:
        channel_ratio = await engine_client.admin_ops_channel_ratio()
    except Exception:
        channel_ratio = []
    try:
        pity_dist = await engine_client.admin_ops_pity_distribution()
    except Exception:
        pity_dist = []

    # 일일 발행/소모 테이블
    def _net_row(r: dict) -> str:
        net = r.get("net", 0)
        color = "#68d391" if net >= 0 else "#fc8181"
        return (
            f"<tr><td>{h(r.get('day', ''))}</td><td>{h(r.get('currency', ''))}</td>"
            f"<td>{r.get('earned', 0):,}</td><td>{r.get('spent', 0):,}</td>"
            f"<td style='color:{color};'>{net:+,}</td></tr>"
        )

    net_rows = "".join(_net_row(r) for r in daily_net) or '<tr><td colspan="5" class="empty">데이터 없음</td></tr>'

    # 가챠 ROI 테이블
    def _roi_row(r: dict) -> str:
        dup = r.get("dup_rate_pct", 0)
        color = "#fc8181" if dup >= 60 else "inherit"
        return (
            f"<tr><td>{h(r.get('gacha_code', ''))}</td><td>{r.get('pulls', 0):,}</td>"
            f"<td>{r.get('unique_users', 0):,}</td><td>{r.get('avg_rarity_score', 0):.2f}</td>"
            f"<td>{r.get('pity_hits', 0):,}</td>"
            f"<td style='color:{color};'>{dup:.1f}%</td></tr>"
        )

    roi_rows = "".join(_roi_row(r) for r in gacha_roi) or '<tr><td colspan="6" class="empty">데이터 없음</td></tr>'

    # 채널 비율 테이블
    ratio_rows = (
        "".join(
            f"<tr><td>{h(r.get('source', ''))}</td><td>{r.get('purchases', 0):,}</td>"
            f"<td>{r.get('users', 0):,}</td></tr>"
            for r in channel_ratio
        )
        or '<tr><td colspan="3" class="empty">데이터 없음</td></tr>'
    )

    # 천장 분포 테이블 (상위 20행)
    pity_rows = (
        "".join(
            f"<tr><td>{h(r.get('gacha_code', ''))}</td><td>{r.get('pity_count', 0)}</td>"
            f"<td>{r.get('users', 0):,}</td></tr>"
            for r in pity_dist[:20]
        )
        or '<tr><td colspan="3" class="empty">데이터 없음</td></tr>'
    )

    return _render_page(
        "sre_ops.html",
        nav="sre",
        page_title="SRE 운영 대시보드",
        session=session,
        net_rows=net_rows,
        roi_rows=roi_rows,
        ratio_rows=ratio_rows,
        pity_rows=pity_rows,
    )


@router.get("/sre/gacha", include_in_schema=False)
async def admin_sre_gacha_list(
    session: AdminSession = Depends(verify_admin_session),
):
    try:
        gacha_list = await engine_client.admin_get_gacha_definitions()
    except Exception:
        gacha_list = []

    def _gacha_row(g: dict) -> str:
        code = h(g.get("gacha_code", ""))
        pill = '<span class="pill on">노출</span>' if g.get("is_listed") else '<span class="pill off">숨김</span>'
        return (
            f"<tr>"
            f"<td style='font-family:monospace;font-size:12px;'>{code}</td>"
            f"<td>{h(g.get('display_name', ''))}</td>"
            f"<td>{h(g.get('cost_currency', ''))} {g.get('cost_per_pull', 0):,} / {g.get('cost_per_10_pull', 0):,}</td>"
            f"<td>{h(str(g.get('pity_threshold') or '—'))}</td>"
            f"<td>{pill}</td>"
            f"<td>{h(g.get('status', ''))}</td>"
            f'<td><a class="btn btn-ghost btn-sm" href="/admin/sre/gacha/{code}/edit">수정</a></td>'
            f"</tr>"
        )

    rows = (
        "".join(_gacha_row(g) for g in gacha_list)
        or '<tr><td colspan="7" class="empty">가챠 정의 없음 (Engine DB 마이그레이션 필요)</td></tr>'
    )

    return _render_page(
        "sre_gacha_list.html",
        nav="sre",
        page_title="가챠 관리",
        session=session,
        rows=rows,
        total=str(len(gacha_list)),
    )


@router.get("/sre/gacha/{gacha_code}/edit", include_in_schema=False)
async def admin_sre_gacha_edit(
    gacha_code: str,
    flash: str = "",
    session: AdminSession = Depends(verify_admin_session),
):
    try:
        gacha_list = await engine_client.admin_get_gacha_definitions()
        g = next((x for x in gacha_list if x["gacha_code"] == gacha_code), None)
    except Exception:
        g = None

    if g is None:
        raise HTTPException(status_code=404, detail="Gacha not found")

    flash_html = ""
    if flash == "saved":
        flash_html = _flash_card("저장되었습니다.", ok=True)

    drop_table_json = _json.dumps(g.get("drop_table") or {}, ensure_ascii=False, indent=2)

    def sel(v, cur):
        return "selected" if str(v) == str(cur) else ""

    return _render_page(
        "sre_gacha_edit.html",
        nav="sre",
        page_title=f"가챠 수정 — {gacha_code}",
        session=session,
        gacha_code=h(gacha_code),
        display_name=h(g.get("display_name", "")),
        description=h(g.get("description") or ""),
        cost_currency=h(g.get("cost_currency", "")),
        cost_per_pull=str(g.get("cost_per_pull", 0)),
        cost_per_10_pull=str(g.get("cost_per_10_pull", 0)),
        pity_threshold=str(g.get("pity_threshold") or ""),
        drop_table_json=h(drop_table_json),
        sel_status_ACTIVE=sel("ACTIVE", g.get("status", "")),
        sel_status_INACTIVE=sel("INACTIVE", g.get("status", "")),
        sel_status_SCHEDULED=sel("SCHEDULED", g.get("status", "")),
        is_listed_checked="checked" if g.get("is_listed") else "",
        sort_order=str(g.get("sort_order") or ""),
        flash=flash_html,
    )


@router.post("/sre/gacha/{gacha_code}/edit", include_in_schema=False)
async def admin_sre_gacha_update(
    gacha_code: str,
    session: AdminSession = Depends(verify_admin_session),
    display_name: str = Form(...),
    description: str = Form(""),
    cost_per_pull: int = Form(...),
    cost_per_10_pull: int = Form(...),
    pity_threshold: str = Form(""),
    drop_table_json: str = Form("{}"),
    status_val: str = Form("ACTIVE"),
    is_listed: str = Form(""),
    sort_order: str = Form(""),
):
    try:
        drop_table = _json.loads(drop_table_json)
    except _json.JSONDecodeError as err:
        raise HTTPException(status_code=400, detail="drop_table JSON이 올바르지 않습니다") from err

    data = {
        "display_name": display_name.strip(),
        "description": description.strip() or None,
        "cost_per_pull": cost_per_pull,
        "cost_per_10_pull": cost_per_10_pull,
        "drop_table": drop_table,
        "pity_threshold": int(pity_threshold) if pity_threshold.strip() else None,
        "status": status_val,
        "is_listed": is_listed == "1",
        "sort_order": int(sort_order) if sort_order.strip() else None,
    }
    try:
        await engine_client.admin_update_gacha_definition(gacha_code, data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Engine 오류: {e}") from e

    return RedirectResponse(url=f"/admin/sre/gacha/{gacha_code}/edit?flash=saved", status_code=302)


@router.get("/sre/shop", include_in_schema=False)
async def admin_sre_shop_list(
    q: str = "",
    rarity: str = "",
    collection: str = "",
    visible: str = "",
    session: AdminSession = Depends(verify_admin_session),
):
    try:
        items = await engine_client.admin_get_shop_items()
    except Exception:
        items = []

    if q:
        items = [
            x
            for x in items
            if q.lower() in x.get("item_code", "").lower() or q.lower() in x.get("display_name", "").lower()
        ]
    if rarity:
        items = [x for x in items if x.get("rarity") == rarity]
    if collection:
        items = [x for x in items if x.get("collection_code") == collection]
    if visible in ("0", "1"):
        flag = visible == "1"
        items = [x for x in items if x.get("is_shop_visible") is flag]

    def _shop_row(i: dict) -> str:
        code = h(i.get("item_code", ""))
        vis = i.get("is_shop_visible", True)
        locked = i.get("season_lock", False)
        vis_pill = '<span class="pill on">노출</span>' if vis else '<span class="pill off">숨김</span>'
        lock_pill = '<span class="pill warn">시즌잠금</span>' if locked else "—"
        vis_sel_1 = "selected" if vis else ""
        vis_sel_0 = "" if vis else "selected"
        gp = i.get("shop_price_gp") or ""
        gc = i.get("shop_price_gc") or ""
        return (
            f"<tr>"
            f"<td style='font-size:11px;font-family:monospace;'>{code}</td>"
            f"<td>{h(i.get('display_name', ''))}</td>"
            f"<td>{h(i.get('rarity', ''))}</td>"
            f"<td>{h(i.get('collection_code', ''))}</td>"
            f"<td>{gp or '—'} / {gc or '—'}</td>"
            f"<td>{vis_pill}</td>"
            f"<td>{lock_pill}</td>"
            f"<td>"
            f'<form method="post" action="/admin/sre/shop/{code}/edit" style="display:flex;gap:6px;align-items:center;">'
            f'<input type="hidden" name="shop_price_gp" value="{gp}" />'
            f'<input type="hidden" name="shop_price_gc" value="{gc}" />'
            f'<select name="is_shop_visible" style="padding:4px 8px;font-size:12px;">'
            f'<option value="1" {vis_sel_1}>노출</option>'
            f'<option value="0" {vis_sel_0}>숨김</option>'
            f"</select>"
            f'<button type="submit" class="btn btn-ghost btn-sm">저장</button>'
            f"</form>"
            f"</td>"
            f"</tr>"
        )

    rows = (
        "".join(_shop_row(i) for i in items)
        or '<tr><td colspan="8" class="empty">아이템 없음 (Engine DB 마이그레이션 필요)</td></tr>'
    )

    return _render_page(
        "sre_shop_list.html",
        nav="sre",
        page_title="상점 관리",
        session=session,
        rows=rows,
        total=str(len(items)),
        q=h(q),
        rarity=h(rarity),
        collection=h(collection),
        sel_visible_1="selected" if visible == "1" else "",
        sel_visible_0="selected" if visible == "0" else "",
    )


@router.post("/sre/shop/{item_code}/edit", include_in_schema=False)
async def admin_sre_shop_item_update(
    item_code: str,
    session: AdminSession = Depends(verify_admin_session),
    shop_price_gp: str = Form(""),
    shop_price_gc: str = Form(""),
    is_shop_visible: str = Form("1"),
    season_lock: str = Form("0"),
    required_season_code: str = Form(""),
):
    data = {
        "shop_price_gp": int(shop_price_gp) if shop_price_gp.strip() else None,
        "shop_price_gc": int(shop_price_gc) if shop_price_gc.strip() else None,
        "is_shop_visible": is_shop_visible == "1",
        "season_lock": season_lock == "1",
        "required_season_code": required_season_code.strip() or None,
    }
    try:
        await engine_client.admin_update_shop_item(item_code, data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Engine 오류: {e}") from e
    return RedirectResponse(url="/admin/sre/shop", status_code=302)


@router.get("/sre/daily-featured", include_in_schema=False)
async def admin_sre_daily_featured(
    flash: str = "",
    session: AdminSession = Depends(verify_admin_session),
):
    history, shop_items = [], []
    with contextlib.suppress(Exception):
        history = await engine_client.admin_get_daily_featured_history()
    with contextlib.suppress(Exception):
        shop_items = await engine_client.admin_get_shop_items()

    rows = (
        "".join(
            f"<tr>"
            f"<td>{h(r.get('featured_date', ''))}</td>"
            f"<td style='font-size:12px;font-family:monospace;'>{h(r.get('item_code', ''))}</td>"
            f"<td>{h(r.get('item_name', ''))}</td>"
            f"<td>{r.get('discount_pct', 0)}%</td>"
            f"<td>{r.get('sort_order', 0)}</td>"
            f"<td><button type='button' onclick=\"reuseItem('{h(r.get('item_code', ''))}')\" "
            f"style='font-size:11px;padding:2px 8px;background:rgba(255,128,85,.2);border:1px solid rgba(255,128,85,.4);border-radius:4px;color:#ff8055;cursor:pointer;'>재등록</button></td>"
            f"</tr>"
            for r in history
        )
        or '<tr><td colspan="6" class="empty">이력 없음</td></tr>'
    )

    rarity_order = {"C": 0, "R": 1, "E": 2, "L": 3, "M": 4}
    shop_items_sorted = sorted(
        shop_items,
        key=lambda x: (x.get("slot", ""), rarity_order.get(x.get("rarity", "C"), 0)),
    )
    item_options = "".join(
        f'<option value="{h(i.get("item_code", ""))}">'
        f"[{h(i.get('rarity', ''))}] {h(i.get('display_name') or i.get('item_name', ''))} "
        f"({h(i.get('slot', ''))}) — {i.get('shop_price_gp') or i.get('price_gp', '?')} GOLD"
        f"</option>"
        for i in shop_items_sorted
    )

    flash_html = ""
    if flash == "refreshed":
        flash_html = _flash_card("일일 추천이 갱신되었습니다.", ok=True)

    from datetime import date as _date

    today_str = str(_date.today())

    return _render_page(
        "sre_daily_featured.html",
        nav="sre",
        page_title="일일 추천 관리",
        session=session,
        rows=rows,
        flash=flash_html,
        today=today_str,
        item_options=item_options,
    )


@router.post("/sre/daily-featured/refresh", include_in_schema=False)
async def admin_sre_daily_featured_refresh(
    session: AdminSession = Depends(verify_admin_session),
    refresh_date: str = Form(...),
    item_codes: str = Form(""),
    discount_pct: int = Form(30),
):
    codes = [c.strip() for c in item_codes.split(",") if c.strip()]
    items = [{"item_code": code, "discount_pct": discount_pct, "sort_order": idx} for idx, code in enumerate(codes)]
    try:
        await engine_client.admin_refresh_daily_featured(refresh_date, items)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Engine 오류: {e}") from e
    return RedirectResponse(url="/admin/sre/daily-featured?flash=refreshed", status_code=302)


@router.post("/settings/service-config", include_in_schema=False)
async def admin_settings_service_config(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
    recommend_max_count: str = Form("3"),
    dm_poll_interval: str = Form("30"),
):
    try:
        quest_val = int(recommend_max_count)
        if not 1 <= quest_val <= 5:
            raise ValueError
    except ValueError:
        return RedirectResponse(url="/admin/settings?flash=config_error", status_code=302)

    try:
        dm_val = int(dm_poll_interval)
        if not 10 <= dm_val <= 300:
            raise ValueError
    except ValueError:
        return RedirectResponse(url="/admin/settings?flash=config_error", status_code=302)

    row = (
        await db.execute(
            select(AppConfig).where(AppConfig.group_name == "quest", AppConfig.key == "recommend_max_count")
        )
    ).scalar_one_or_none()
    if row:
        row.value = str(quest_val)
    else:
        db.add(
            AppConfig(
                group_name="quest",
                key="recommend_max_count",
                value=str(quest_val),
                description="월드맵 추천 퀘스트 최대 표시 개수",
            )
        )

    dm_row = (
        await db.execute(select(AppConfig).where(AppConfig.group_name == "dm", AppConfig.key == "unread_poll_interval"))
    ).scalar_one_or_none()
    if dm_row:
        dm_row.value = str(dm_val)
    else:
        db.add(
            AppConfig(
                group_name="dm",
                key="unread_poll_interval",
                value=str(dm_val),
                description="DM 미읽음 폴링 주기 (초, 10~300)",
            )
        )

    await db.commit()
    return RedirectResponse(url="/admin/settings?flash=config_saved", status_code=302)


# ── SRE: 아이템 정의 관리 ────────────────────────────────────────────

_ITEM_SLOTS = [
    "MOTORCYCLE_BODY",
    "SEAT",
    "STICKER",
    "RANK_CARD",
    "HANDLEBAR",
    "TAIL_LIGHT",
    "ENGINE_COVER",
    "HEADLIGHT",
    "MIRROR",
    "NUMBER",
    "GLOVES",
    "BOOTS",
    "EYEWEAR",
    "NAMEPLATE",
    "FRAME",
    "BACKDROP",
    "TITLE",
    "TRAIL",
    "HORN",
    "START_ANIM",
    "EMOTE",
    "BANNER",
    "PET",
]
_ITEM_RARITIES = ["C", "R", "E", "L", "M"]
_RARITY_LABEL = {"C": "Common", "R": "Rare", "E": "Epic", "L": "Legendary", "M": "Mythic"}


@router.get("/sre/items", include_in_schema=False)
async def admin_sre_items_list(
    q: str = "",
    slot: str = "",
    rarity: str = "",
    collection: str = "",
    session: AdminSession = Depends(verify_admin_session),
):
    try:
        items = await engine_client.admin_get_items()
    except Exception:
        items = []

    if q:
        ql = q.lower()
        items = [x for x in items if ql in x.get("item_code", "").lower() or ql in x.get("display_name", "").lower()]
    if slot:
        items = [x for x in items if x.get("slot") == slot]
    if rarity:
        items = [x for x in items if x.get("rarity") == rarity]
    if collection:
        items = [x for x in items if x.get("collection_code") == collection]

    def _rarity_pill(r: str) -> str:
        colors = {"C": "#94a3b8", "R": "#60a5fa", "E": "#a78bfa", "L": "#fbbf24", "M": "#f87171"}
        label = _RARITY_LABEL.get(r, r)
        color = colors.get(r, "#fff")
        return f'<span style="font-size:11px;font-weight:700;color:{color};">{label}</span>'

    def _row(i: dict) -> str:
        code = h(i.get("item_code", ""))
        vis = i.get("is_shop_visible", False)
        gp = i.get("shop_price_gp") or "—"
        gc = i.get("shop_price_gc") or "—"
        vis_pill = '<span class="pill on">노출</span>' if vis else '<span class="pill off">숨김</span>'
        return (
            f"<tr>"
            f"<td style='font-size:11px;font-family:monospace;'>{code}</td>"
            f"<td>{h(i.get('display_name', ''))}</td>"
            f"<td>{_rarity_pill(i.get('rarity', ''))}</td>"
            f"<td>{h(i.get('slot', ''))}</td>"
            f"<td style='font-size:11px;'>{h(i.get('collection_code', '') or '—')}</td>"
            f"<td>{gp} / {gc}</td>"
            f"<td>{vis_pill}</td>"
            f"<td style='white-space:nowrap;'>"
            f"<a href='/admin/sre/items/{code}/edit' class='btn btn-ghost btn-sm'>수정</a>"
            f"&nbsp;"
            f"<form method='post' action='/admin/sre/items/{code}/delete' style='display:inline;' "
            f"onsubmit=\"return confirm('아이템 [{code}]을 삭제할까요?\\n보유 유저가 있으면 삭제되지 않습니다.')\">"
            f"<button type='submit' class='btn btn-danger btn-sm'>삭제</button>"
            f"</form>"
            f"</td>"
            f"</tr>"
        )

    slot_options = "".join(f'<option value="{s}" {"selected" if slot == s else ""}>{s}</option>' for s in _ITEM_SLOTS)
    rarity_options = "".join(
        f'<option value="{r}" {"selected" if rarity == r else ""}>{_RARITY_LABEL[r]} ({r})</option>'
        for r in _ITEM_RARITIES
    )
    rows = "".join(_row(i) for i in items) or '<tr><td colspan="8" class="empty">아이템 없음</td></tr>'

    return _render_page(
        "sre_items_list.html",
        nav="items",
        page_title="아이템 관리",
        session=session,
        rows=rows,
        total=str(len(items)),
        q=h(q),
        slot_options=slot_options,
        rarity_options=rarity_options,
        collection=h(collection),
    )


def _item_form_html(*, item: dict | None = None, error: str = "") -> str:
    """신규/수정 공용 폼 HTML 조각."""
    is_edit = item is not None
    i = item or {}
    code = h(i.get("item_code", ""))
    name = h(i.get("display_name", ""))
    curr_slot = i.get("slot", "")
    curr_rarity = i.get("rarity", "C")
    coll = h(i.get("collection_code", "") or "")
    asset = h(i.get("asset_uri", "") or "")
    gp = i.get("shop_price_gp", "") or ""
    gc = i.get("shop_price_gc", "") or ""
    vis_yes = "selected" if i.get("is_shop_visible") else ""
    vis_no = "" if i.get("is_shop_visible") else "selected"
    lock_yes = "selected" if i.get("season_lock") else ""
    lock_no = "" if i.get("season_lock") else "selected"
    season_code = h(i.get("required_season_code", "") or "")

    slot_opts = "".join(f'<option value="{s}" {"selected" if s == curr_slot else ""}>{s}</option>' for s in _ITEM_SLOTS)
    rarity_opts = "".join(
        f'<option value="{r}" {"selected" if r == curr_rarity else ""}>{_RARITY_LABEL[r]} ({r})</option>'
        for r in _ITEM_RARITIES
    )
    error_html = (
        f'<div style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:12px 16px;margin-bottom:20px;color:#fc8181;">{h(error)}</div>'
        if error
        else ""
    )
    code_field = (
        f'<div class="field"><label class="field-label">아이템 코드</label>'
        f'<div style="font-family:monospace;font-size:15px;color:#fff;padding:10px 0;">{code}</div>'
        f'<input type="hidden" name="item_code" value="{code}" /></div>'
        if is_edit
        else f'<div class="field"><label class="field-label">아이템 코드 <span style="color:#f87171;">*</span></label>'
        f'<input type="text" name="item_code" value="{code}" placeholder="MOTORCYCLE_BODY_STREET_CLASSIC_C_01" required style="width:100%;font-family:monospace;" /></div>'
    )
    action = f"/admin/sre/items/{code}/edit" if is_edit else "/admin/sre/items/new"
    submit_label = "저장" if is_edit else "아이템 등록"

    return f"""
{error_html}
<form method="post" action="{action}">
  {code_field}
  <div class="field">
    <label class="field-label">표시 이름 <span style="color:#f87171;">*</span></label>
    <input type="text" name="display_name" value="{name}" placeholder="Matte Street Helmet" required style="width:100%;" />
  </div>
  <div class="field-row">
    <div class="field">
      <label class="field-label">슬롯</label>
      <select name="slot" style="width:100%;">{slot_opts}</select>
    </div>
    <div class="field">
      <label class="field-label">등급 (Rarity)</label>
      <select name="rarity" style="width:100%;">{rarity_opts}</select>
    </div>
  </div>
  <div class="field-row">
    <div class="field">
      <label class="field-label">컬렉션 코드</label>
      <input type="text" name="collection_code" value="{coll}" placeholder="STREET_CLASSICS" style="width:100%;font-family:monospace;" />
    </div>
    <div class="field">
      <label class="field-label">Asset URI</label>
      <input type="text" name="asset_uri" value="{asset}" placeholder="items/helmet_street_classic_c_01.svg" style="width:100%;" />
    </div>
  </div>
  <div class="field-row">
    <div class="field">
      <label class="field-label">GOLD 가격</label>
      <input type="number" name="shop_price_gp" value="{gp}" placeholder="0" min="0" style="width:100%;" />
    </div>
    <div class="field">
      <label class="field-label">XP 가격</label>
      <input type="number" name="shop_price_gc" value="{gc}" placeholder="0" min="0" style="width:100%;" />
    </div>
  </div>
  <div class="field-row">
    <div class="field">
      <label class="field-label">상점 노출</label>
      <select name="is_shop_visible" style="width:100%;">
        <option value="1" {vis_yes}>노출</option>
        <option value="0" {vis_no}>숨김</option>
      </select>
    </div>
    <div class="field">
      <label class="field-label">시즌 잠금</label>
      <select name="season_lock" style="width:100%;">
        <option value="0" {lock_no}>없음</option>
        <option value="1" {lock_yes}>시즌 잠금</option>
      </select>
    </div>
  </div>
  <div class="field">
    <label class="field-label">시즌 코드 (시즌 잠금 시)</label>
    <input type="text" name="required_season_code" value="{season_code}" placeholder="SEASON_2026_Q2" style="width:100%;font-family:monospace;" />
  </div>
  <div style="display:flex;gap:12px;margin-top:8px;">
    <button type="submit" class="btn">{submit_label}</button>
    <a href="/admin/sre/items" class="btn btn-ghost">취소</a>
  </div>
</form>
"""


@router.get("/sre/items/new", include_in_schema=False)
async def admin_sre_items_new_form(session: AdminSession = Depends(verify_admin_session)):
    return _render_page(
        "sre_items_form.html",
        nav="items",
        page_title="아이템 등록",
        session=session,
        breadcrumb_label="아이템 관리",
        form_title="새 아이템 등록",
        form_html=_item_form_html(),
    )


@router.post("/sre/items/new", include_in_schema=False)
async def admin_sre_items_create(
    session: AdminSession = Depends(verify_admin_session),
    item_code: str = Form(...),
    display_name: str = Form(...),
    slot: str = Form(...),
    rarity: str = Form("C"),
    collection_code: str = Form(""),
    asset_uri: str = Form(""),
    shop_price_gp: str = Form(""),
    shop_price_gc: str = Form(""),
    is_shop_visible: str = Form("0"),
    season_lock: str = Form("0"),
    required_season_code: str = Form(""),
):
    data = {
        "item_code": item_code.strip(),
        "display_name": display_name.strip(),
        "slot": slot,
        "rarity": rarity,
        "collection_code": collection_code.strip() or None,
        "asset_uri": asset_uri.strip() or None,
        "shop_price_gp": int(shop_price_gp) if shop_price_gp.strip() else None,
        "shop_price_gc": int(shop_price_gc) if shop_price_gc.strip() else None,
        "is_shop_visible": is_shop_visible == "1",
        "season_lock": season_lock == "1",
        "required_season_code": required_season_code.strip() or None,
    }
    try:
        await engine_client.admin_create_item(data)
    except Exception as e:
        error_msg = str(e)
        if "409" in error_msg or "already exists" in error_msg.lower():
            error_msg = f"아이템 코드 [{item_code}] 이미 존재합니다."
        form_html = _item_form_html(
            item={"item_code": item_code, "display_name": display_name, **data}, error=error_msg
        )
        return _render_page(
            "sre_items_form.html",
            nav="items",
            page_title="아이템 등록",
            session=session,
            breadcrumb_label="아이템 관리",
            form_title="새 아이템 등록",
            form_html=form_html,
        )
    return RedirectResponse(url="/admin/sre/items", status_code=302)


@router.get("/sre/items/{item_code}/edit", include_in_schema=False)
async def admin_sre_items_edit_form(
    item_code: str,
    session: AdminSession = Depends(verify_admin_session),
):
    try:
        item = await engine_client.admin_get_item(item_code)
    except Exception as err:
        raise HTTPException(status_code=404, detail="Item not found") from err
    return _render_page(
        "sre_items_form.html",
        nav="items",
        page_title="아이템 수정",
        session=session,
        breadcrumb_label="아이템 관리",
        form_title=f"수정 — {h(item.get('display_name', item_code))}",
        form_html=_item_form_html(item=item),
    )


@router.post("/sre/items/{item_code}/edit", include_in_schema=False)
async def admin_sre_items_update(
    item_code: str,
    session: AdminSession = Depends(verify_admin_session),
    display_name: str = Form(...),
    slot: str = Form(...),
    rarity: str = Form("C"),
    collection_code: str = Form(""),
    asset_uri: str = Form(""),
    shop_price_gp: str = Form(""),
    shop_price_gc: str = Form(""),
    is_shop_visible: str = Form("0"),
    season_lock: str = Form("0"),
    required_season_code: str = Form(""),
):
    data = {
        "display_name": display_name.strip(),
        "slot": slot,
        "rarity": rarity,
        "collection_code": collection_code.strip() or None,
        "asset_uri": asset_uri.strip() or None,
        "shop_price_gp": int(shop_price_gp) if shop_price_gp.strip() else None,
        "shop_price_gc": int(shop_price_gc) if shop_price_gc.strip() else None,
        "is_shop_visible": is_shop_visible == "1",
        "season_lock": season_lock == "1",
        "required_season_code": required_season_code.strip() or None,
    }
    try:
        await engine_client.admin_update_item(item_code, data)
    except Exception as e:
        item = {"item_code": item_code, "display_name": display_name, **data}
        form_html = _item_form_html(item=item, error=str(e))
        return _render_page(
            "sre_items_form.html",
            nav="items",
            page_title="아이템 수정",
            session=session,
            breadcrumb_label="아이템 관리",
            form_title=f"수정 — {h(display_name)}",
            form_html=form_html,
        )
    return RedirectResponse(url="/admin/sre/items", status_code=302)


@router.post("/sre/items/{item_code}/delete", include_in_schema=False)
async def admin_sre_items_delete(
    item_code: str,
    session: AdminSession = Depends(verify_admin_session),
):
    try:
        await engine_client.admin_delete_item(item_code)
    except Exception as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return RedirectResponse(url="/admin/sre/items", status_code=302)


# ══════════════════════════════════════════════════════════════════
# 배지 관리
# ══════════════════════════════════════════════════════════════════

_BADGE_METRICS = [
    ("QUEST_CLEAR_COUNT", "퀘스트 클리어 횟수"),
    ("DISTANCE_TOTAL_KM", "누적 주행 거리 (km)"),
    ("STREAK_DAYS", "연속 라이딩 일수"),
    ("SAFETY_GRADE_A_COUNT", "안전등급 A 횟수"),
    ("LEVEL", "유저 레벨"),
    ("RIDE_COUNT", "총 라이딩 횟수"),
]

_BADGE_OPS = [">=", ">", "==", "<=", "<"]


def _badge_table_rows(badges: list) -> str:
    if not badges:
        return '<tr><td colspan="6" class="empty">등록된 배지가 없습니다</td></tr>'
    rows = []
    for b in badges:
        icon = ""
        if b.icon_content and b.icon_content.file_path:
            icon = f'<img src="{h(build_imgproxy_url(b.icon_content.file_path, w=48, h=48))}" class="avatar" alt="">'
        elif b.icon_url:
            icon = f'<span style="font-size:24px">{h(b.icon_url)}</span>'
        name = h(b.name_ko or b.name or "")
        cond = ""
        if b.condition_rule:
            parts = []
            for c in b.condition_rule.get("conditions", []):
                parts.append(f"{c.get('metric', '')} {c.get('op', '>=')} {c.get('value', '')}")
            op = b.condition_rule.get("operator", "AND")
            cond = f' <span style="color:rgba(255,255,255,.3)">{op}</span> '.join(parts)
        elif b.condition_type:
            cond = f"{b.condition_type} ≥ {b.condition_value or 0}"
        active = '<span class="pill on">ON</span>' if b.is_active else '<span class="pill off">OFF</span>'
        rows.append(
            f"<tr>"
            f"<td>{icon}</td>"
            f"<td>{name}</td>"
            f'<td style="font-size:11px;color:rgba(255,255,255,.5)">{cond}</td>'
            f"<td>{active}</td>"
            f"<td>{b.created_at.strftime('%Y-%m-%d') if b.created_at else ''}</td>"
            f'<td><a href="/admin/badges/{b.id}/edit" class="btn btn-ghost btn-sm">수정</a></td>'
            f"</tr>"
        )
    return "\n".join(rows)


def _badge_form_html(badge: dict | None = None, error: str = "") -> str:
    b = badge or {}
    bid = b.get("id", "")
    err_html = f'<div style="color:#fc8181;margin-bottom:16px;font-size:13px">{h(error)}</div>' if error else ""

    conditions_json = "[]"
    rule = b.get("condition_rule")
    if rule and isinstance(rule, dict):
        import json

        conditions_json = json.dumps(rule.get("conditions", []))
    rule_operator = (rule or {}).get("operator", "AND") if isinstance(rule, dict) else "AND"

    return f"""
    {err_html}
    <input type="hidden" name="badge_id" value="{h(str(bid))}">
    <div class="field">
      <label class="field-label">이름 (기본)</label>
      <input type="text" name="name" value="{h(b.get("name", ""))}" style="width:100%" required>
    </div>
    <div class="field-row">
      <div class="field"><label class="field-label">이름 (KO)</label><input type="text" name="name_ko" value="{h(b.get("name_ko", ""))}" style="width:100%"></div>
      <div class="field"><label class="field-label">이름 (VI)</label><input type="text" name="name_vi" value="{h(b.get("name_vi", ""))}" style="width:100%"></div>
    </div>
    <div class="field">
      <label class="field-label">이름 (EN)</label>
      <input type="text" name="name_en" value="{h(b.get("name_en", ""))}" style="width:100%">
    </div>
    <div class="field">
      <label class="field-label">설명 (KO)</label>
      <textarea name="description_ko" style="width:100%">{h(b.get("description_ko", ""))}</textarea>
    </div>
    <div class="field-row">
      <div class="field"><label class="field-label">설명 (VI)</label><textarea name="description_vi" style="width:100%">{h(b.get("description_vi", ""))}</textarea></div>
      <div class="field"><label class="field-label">설명 (EN)</label><textarea name="description_en" style="width:100%">{h(b.get("description_en", ""))}</textarea></div>
    </div>
    <div class="field">
      <label class="field-label">아이콘 (이모지 또는 URL)</label>
      <input type="text" name="icon_url" value="{h(b.get("icon_url", ""))}" style="width:100%" placeholder="🏍 또는 https://...">
    </div>
    <div class="field">
      <label class="field-label">활성 상태</label>
      <select name="is_active" style="width:100%">
        <option value="1" {"selected" if b.get("is_active", True) else ""}>활성 (ON)</option>
        <option value="0" {"selected" if not b.get("is_active", True) else ""}>비활성 (OFF)</option>
      </select>
    </div>
    <div class="field" style="border-top:1px solid rgba(255,255,255,.08);padding-top:18px;margin-top:8px">
      <label class="field-label">습득 조건 (Condition Rule Builder)</label>
      <div style="margin-bottom:10px">
        <label style="font-size:12px;color:rgba(255,255,255,.5)">조건 결합</label>
        <select name="rule_operator" id="ruleOp" style="margin-left:8px">
          <option value="AND" {"selected" if rule_operator == "AND" else ""}>AND (모두 충족)</option>
          <option value="OR" {"selected" if rule_operator == "OR" else ""}>OR (하나라도 충족)</option>
        </select>
      </div>
      <div id="condList"></div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="addCond()" style="margin-top:8px">+ 조건 추가</button>
      <input type="hidden" name="condition_rule_json" id="condRuleJson">
    </div>
    <script>
    const metrics = [{",".join(f'["{code}","{label}"]' for code, label in _BADGE_METRICS)}];
    const ops = {_BADGE_OPS};
    let conds = {conditions_json};
    function renderConds() {{
      const el = document.getElementById('condList');
      el.innerHTML = '';
      conds.forEach((c, i) => {{
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px';
        row.innerHTML = `
          <select onchange="conds[${{i}}].metric=this.value;syncRule()" style="flex:2">
            ${{metrics.map(([k,l])=>`<option value="${{k}}" ${{c.metric===k?'selected':''}}>${{l}}</option>`).join('')}}
          </select>
          <select onchange="conds[${{i}}].op=this.value;syncRule()" style="width:60px">
            ${{ops.map(o=>`<option value="${{o}}" ${{c.op===o?'selected':''}}>${{o}}</option>`).join('')}}
          </select>
          <input type="number" value="${{c.value||0}}" onchange="conds[${{i}}].value=+this.value;syncRule()" style="width:80px">
          <button type="button" onclick="conds.splice(${{i}},1);renderConds();syncRule()" style="background:none;color:#fc8181;font-size:18px;cursor:pointer">&times;</button>
        `;
        el.appendChild(row);
      }});
      syncRule();
    }}
    function addCond() {{
      conds.push({{metric:metrics[0][0],op:'>=',value:1}});
      renderConds();
    }}
    function syncRule() {{
      const op = document.getElementById('ruleOp').value;
      document.getElementById('condRuleJson').value = JSON.stringify({{operator:op,conditions:conds}});
    }}
    document.getElementById('ruleOp').addEventListener('change', syncRule);
    renderConds();
    </script>
    """


@router.get("/badges", include_in_schema=False)
async def admin_badge_list(
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Badge).order_by(Badge.created_at.desc()))
    badges = result.scalars().all()
    earned_counts: dict[uuid.UUID, int] = {}
    for b in badges:
        cnt_result = await db.execute(select(func.count()).where(UserBadge.badge_id == b.id))
        earned_counts[b.id] = cnt_result.scalar_one()
    return _render_page(
        "admin_badges_list.html",
        nav="badges",
        page_title="배지 관리",
        session=session,
        table_rows=_badge_table_rows(badges),
        total_count=str(len(badges)),
    )


@router.get("/badges/new", include_in_schema=False)
async def admin_badge_new(session: AdminSession = Depends(verify_admin_session)):
    return _render_page(
        "admin_badges_form.html",
        nav="badges",
        page_title="배지 등록",
        session=session,
        breadcrumb_label="배지 관리",
        form_title="새 배지 등록",
        form_html=_badge_form_html(),
    )


@router.post("/badges/new", include_in_schema=False)
async def admin_badge_create(
    session: AdminSession = Depends(verify_admin_session),
    name: str = Form(...),
    name_ko: str = Form(""),
    name_vi: str = Form(""),
    name_en: str = Form(""),
    description_ko: str = Form(""),
    description_vi: str = Form(""),
    description_en: str = Form(""),
    icon_url: str = Form(""),
    is_active: str = Form("1"),
    condition_rule_json: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    import json

    rule = None
    if condition_rule_json.strip():
        with contextlib.suppress(json.JSONDecodeError):
            parsed = json.loads(condition_rule_json)
            if parsed.get("conditions"):
                rule = parsed

    badge = Badge(
        name=name.strip(),
        name_ko=name_ko.strip() or None,
        name_vi=name_vi.strip() or None,
        name_en=name_en.strip() or None,
        description_ko=description_ko.strip() or None,
        description_vi=description_vi.strip() or None,
        description_en=description_en.strip() or None,
        icon_url=icon_url.strip() or None,
        is_active=is_active == "1",
        condition_rule=rule,
    )
    db.add(badge)
    await db.commit()
    return RedirectResponse(url="/admin/badges", status_code=302)


@router.get("/badges/{badge_id}/edit", include_in_schema=False)
async def admin_badge_edit(
    badge_id: uuid.UUID,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    badge = await db.get(Badge, badge_id)
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    data = {
        "id": badge.id,
        "name": badge.name,
        "name_ko": badge.name_ko or "",
        "name_vi": badge.name_vi or "",
        "name_en": badge.name_en or "",
        "description_ko": badge.description_ko or "",
        "description_vi": badge.description_vi or "",
        "description_en": badge.description_en or "",
        "icon_url": badge.icon_url or "",
        "is_active": badge.is_active,
        "condition_rule": badge.condition_rule,
    }
    return _render_page(
        "admin_badges_form.html",
        nav="badges",
        page_title="배지 수정",
        session=session,
        breadcrumb_label="배지 관리",
        form_title=f"수정 — {h(badge.name_ko or badge.name)}",
        form_html=_badge_form_html(data),
    )


@router.post("/badges/{badge_id}/edit", include_in_schema=False)
async def admin_badge_update(
    badge_id: uuid.UUID,
    session: AdminSession = Depends(verify_admin_session),
    name: str = Form(...),
    name_ko: str = Form(""),
    name_vi: str = Form(""),
    name_en: str = Form(""),
    description_ko: str = Form(""),
    description_vi: str = Form(""),
    description_en: str = Form(""),
    icon_url: str = Form(""),
    is_active: str = Form("1"),
    condition_rule_json: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    import json

    badge = await db.get(Badge, badge_id)
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")

    rule = None
    if condition_rule_json.strip():
        with contextlib.suppress(json.JSONDecodeError):
            parsed = json.loads(condition_rule_json)
            if parsed.get("conditions"):
                rule = parsed

    badge.name = name.strip()
    badge.name_ko = name_ko.strip() or None
    badge.name_vi = name_vi.strip() or None
    badge.name_en = name_en.strip() or None
    badge.description_ko = description_ko.strip() or None
    badge.description_vi = description_vi.strip() or None
    badge.description_en = description_en.strip() or None
    badge.icon_url = icon_url.strip() or None
    badge.is_active = is_active == "1"
    badge.condition_rule = rule
    await db.commit()
    return RedirectResponse(url="/admin/badges", status_code=302)


@router.post("/badges/{badge_id}/delete", include_in_schema=False)
async def admin_badge_delete(
    badge_id: uuid.UUID,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    badge = await db.get(Badge, badge_id)
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    await db.delete(badge)
    await db.commit()
    return RedirectResponse(url="/admin/badges", status_code=302)


# ── 메시지 스트림 모니터 ────────────────────────────────────────


@router.get("/stream", include_in_schema=False)
async def admin_stream_page(
    request: Request,
    type: str | None = None,
    uuid_q: str | None = None,
    count: int = 50,
    session: AdminSession = Depends(verify_admin_session),
):
    uuid_q = request.query_params.get("uuid", None)

    try:
        info = await engine_client.admin_stream_info()
        messages = await engine_client.admin_stream_messages(
            count=count,
            type_filter=type,
            uuid_filter=uuid_q,
        )
    except Exception:
        info = {"length": 0, "groups": [], "exists": False}
        messages = []

    stream_length = info.get("length", 0)
    groups = info.get("groups", [])
    group_count = len(groups)
    pending_count = sum(g.get("pending", 0) for g in groups)
    consumer_count = sum(g.get("consumers", 0) for g in groups)
    pending_color = "#fc8181" if pending_count > 100 else "#68d391"

    rows_html = ""
    for msg in messages:
        msg_type = msg.get("type", "gps")
        ts_raw = msg.get("ts", "")
        try:
            ts_dt = datetime.fromtimestamp(float(ts_raw), tz=UTC).astimezone(APP_TZ)
            ts_str = ts_dt.strftime("%Y-%m-%d %H:%M:%S")
        except (ValueError, OSError):
            ts_str = ts_raw

        rows_html += (
            f"<tr>"
            f'<td class="stream-id">{h(msg.get("id", ""))}</td>'
            f'<td><span class="pill type-{msg_type}">{h(msg_type)}</span></td>'
            f'<td class="uuid-cell" title="{h(msg.get("uuid", ""))}">{h(msg.get("uuid", ""))}</td>'
            f'<td class="msg-cell" data-type="{h(msg_type)}" data-raw="{h(msg.get("message", ""))}">{h(msg.get("message", ""))}</td>'
            f'<td style="font-size:12px; color:rgba(255,255,255,.5);">{h(ts_str)}</td>'
            f"</tr>"
        )

    empty_state = ""
    if not messages:
        empty_state = '<div class="empty">스트림에 메시지가 없습니다.</div>'

    return _render_page(
        "stream.html",
        nav="stream",
        page_title="메시지 스트림",
        session=session,
        stream_length=str(stream_length),
        group_count=str(group_count),
        pending_count=str(pending_count),
        pending_color=pending_color,
        consumer_count=str(consumer_count),
        rows=rows_html,
        empty_state=empty_state,
        filter_uuid=h(uuid_q or ""),
        sel_gps="selected" if type == "gps" else "",
        sel_heartbeat="selected" if type == "heartbeat" else "",
        sel_event="selected" if type == "event" else "",
        sel_50="selected" if count == 50 else "",
        sel_100="selected" if count == 100 else "",
        sel_200="selected" if count == 200 else "",
        sel_500="selected" if count == 500 else "",
    )


@router.get("/stream/gps-trace", include_in_schema=False)
async def admin_gps_trace_popup(
    request: Request,
    uuid_q: str = "",
    start: str = "",
    end: str = "",
    platform: str = "all",
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    uuid_q = request.query_params.get("uuid", "")
    if not uuid_q or not start or not end:
        return HTMLResponse("<h2>필수 파라미터 누락 (uuid, start, end)</h2>", status_code=400)

    start_dt = datetime.fromisoformat(start).replace(tzinfo=APP_TZ)
    end_dt = datetime.fromisoformat(end).replace(tzinfo=APP_TZ)
    start_ts = start_dt.timestamp()
    end_ts = end_dt.timestamp()

    row = (
        await db.execute(select(AppConfig.value).where(AppConfig.group_name == "google", AppConfig.key == "map"))
    ).scalar_one_or_none()
    gmap_key = row or ""

    try:
        messages = await engine_client.admin_stream_messages(
            count=500,
            type_filter="gps",
            uuid_filter=uuid_q,
            start_ts=start_ts,
            end_ts=end_ts,
        )
    except Exception:
        messages = []

    points_js = []
    total_distance = 0.0
    for msg in reversed(messages):
        raw = msg.get("message", "")
        try:
            obj = _json.loads(raw)
            lat = float(obj.get("y", 0))
            lng = float(obj.get("x", 0))
            d = float(obj.get("d", 0))
            ts = float(msg.get("ts", 0))
            points_js.append(f"{{lat:{lat},lng:{lng},d:{d},ts:{ts}}}")
            total_distance += d
        except (ValueError, KeyError, TypeError):
            continue

    tpl = (_TEMPLATE_DIR / "gps_trace.html").read_text("utf-8")
    html = (
        tpl.replace("{{gmap_key}}", h(gmap_key))
        .replace("{{points}}", "[" + ",".join(points_js) + "]")
        .replace("{{uuid}}", h(uuid_q))
        .replace("{{platform}}", h(platform))
        .replace("{{start}}", h(start))
        .replace("{{end}}", h(end))
        .replace("{{total_distance}}", f"{total_distance:.0f}")
        .replace("{{point_count}}", str(len(points_js)))
    )
    return HTMLResponse(html)


# ── SRE: 보상 정책 관리 ────────────────────────────────────────


@router.get("/sre/policies", include_in_schema=False)
async def admin_sre_policies_page(session: AdminSession = Depends(verify_admin_session)):
    return _render_page(
        "policies.html",
        nav="policies",
        page_title="보상 정책 관리",
        session=session,
    )


@router.get("/api/sre/policies", include_in_schema=False)
async def admin_api_policy_list(session: AdminSession = Depends(verify_admin_session)):
    try:
        policies = await engine_client.admin_get_policies()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return JSONResponse(policies)


@router.get("/api/sre/policies/{policy_id}", include_in_schema=False)
async def admin_api_policy_get(policy_id: int, session: AdminSession = Depends(verify_admin_session)):
    try:
        policy = await engine_client.admin_get_policy(policy_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return JSONResponse(policy)


@router.post("/api/sre/policies", include_in_schema=False)
async def admin_api_policy_create(request: Request, session: AdminSession = Depends(verify_admin_session)):
    data = await request.json()
    try:
        result = await engine_client.admin_create_policy(data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return JSONResponse(result, status_code=201)


@router.put("/api/sre/policies/{policy_id}", include_in_schema=False)
async def admin_api_policy_update(
    policy_id: int, request: Request, session: AdminSession = Depends(verify_admin_session)
):
    data = await request.json()
    try:
        result = await engine_client.admin_update_policy(policy_id, data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return JSONResponse(result)


@router.delete("/api/sre/policies/{policy_id}", include_in_schema=False)
async def admin_api_policy_delete(policy_id: int, session: AdminSession = Depends(verify_admin_session)):
    try:
        result = await engine_client.admin_delete_policy(policy_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return JSONResponse(result)


# ── 고객센터 ─────────────────────────────────────────────────────

_SUPPORT_STATUS_LABEL = {"OPEN": "접수", "IN_PROGRESS": "처리중", "RESOLVED": "해결"}
_SUPPORT_STATUS_CLASS = {"OPEN": "warn", "IN_PROGRESS": "info", "RESOLVED": "ok"}

_SUPPORT_FLASHES = {
    "replied": ("답변이 등록되었습니다.", True),
    "status_updated": ("상태가 변경되었습니다.", True),
    "reply_empty": ("답변 내용을 입력하세요.", False),
}


@router.get("/support", include_in_schema=False)
async def admin_support_list(
    status: str = "",
    page: int = 1,
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    page = max(1, page)
    size = 30
    offset = (page - 1) * size

    stmt = select(SupportTicket)
    count_stmt = select(func.count()).select_from(SupportTicket)
    if status:
        stmt = stmt.where(SupportTicket.status == status)
        count_stmt = count_stmt.where(SupportTicket.status == status)

    total = (await db.execute(count_stmt)).scalar_one()
    tickets = (
        (await db.execute(stmt.order_by(SupportTicket.created_at.desc()).offset(offset).limit(size))).scalars().all()
    )

    rows_html = []
    for t in tickets:
        st = t.status
        pill = f'<span class="pill {_SUPPORT_STATUS_CLASS.get(st, "")}">{_SUPPORT_STATUS_LABEL.get(st, st)}</span>'
        unread = '<span class="pill warn">NEW</span>' if t.has_unread_reply else ""
        rows_html.append(
            f"<tr onclick=\"location.href='/admin/support/{t.id}'\" style='cursor:pointer'>"
            f"<td>{h(str(t.id)[:8])}…</td>"
            f"<td>{h(t.title)}</td>"
            f"<td>{pill}</td>"
            f"<td>{unread}</td>"
            f'<td style="font-size:12px;color:rgba(255,255,255,.5);">{t.created_at.strftime("%Y-%m-%d %H:%M")}</td>'
            f"</tr>"
        )
    if not rows_html:
        rows_html.append('<tr><td colspan="5" class="empty">문의가 없습니다.</td></tr>')

    pagination = _build_pagination("/admin/support", page, size, total, status=status)

    status_tabs = ""
    for val, label in [("", "전체"), ("OPEN", "접수"), ("IN_PROGRESS", "처리중"), ("RESOLVED", "해결")]:
        active = "active" if status == val else ""
        status_tabs += f'<a href="/admin/support?status={val}" class="tab {active}">{label}</a>'

    return _render_page(
        "support_list.html",
        nav="support",
        page_title="고객센터",
        session=session,
        rows="\n".join(rows_html),
        total=str(total),
        status_tabs=status_tabs,
        pagination=pagination,
    )


@router.get("/support/{ticket_id}", include_in_schema=False)
async def admin_support_detail(
    ticket_id: uuid.UUID,
    flash: str = "",
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.replies), selectinload(SupportTicket.user))
        .where(SupportTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    replies_html = ""
    for r in ticket.replies:
        side = "admin" if r.author_type == "admin" else "user"
        replies_html += (
            f'<div class="reply-item reply-{side}">'
            f'<div class="reply-meta">{h("관리자" if side == "admin" else "유저")} '
            f"<span>{r.created_at.strftime('%Y-%m-%d %H:%M')}</span></div>"
            f'<div class="reply-body">{h(r.body)}</div>'
            f"</div>"
        )
    if not replies_html:
        replies_html = '<p class="empty">아직 답변이 없습니다.</p>'

    st = ticket.status
    status_options = ""
    for val, label in [("OPEN", "접수"), ("IN_PROGRESS", "처리중"), ("RESOLVED", "해결")]:
        sel = "selected" if val == st else ""
        status_options += f'<option value="{val}" {sel}>{label}</option>'

    flash_html = ""
    if flash and flash in _SUPPORT_FLASHES:
        msg, ok = _SUPPORT_FLASHES[flash]
        cls = "ok" if ok else "warn"
        flash_html = f'<div class="flash {cls}">{msg}</div>'

    user_nick = h(ticket.user.nickname or str(ticket.user_id)) if ticket.user else h(str(ticket.user_id))

    return _render_page(
        "support_detail.html",
        nav="support",
        page_title="문의 상세",
        session=session,
        ticket_id=h(str(ticket.id)),
        ticket_title=h(ticket.title),
        ticket_body=h(ticket.body),
        ticket_status=h(st),
        ticket_created=ticket.created_at.strftime("%Y-%m-%d %H:%M"),
        user_nick=user_nick,
        status_options=status_options,
        replies_html=replies_html,
        flash_html=flash_html,
    )


@router.post("/support/{ticket_id}/reply", include_in_schema=False)
async def admin_support_reply(
    ticket_id: uuid.UUID,
    reply_body: str = Form(""),
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    body = reply_body.strip()
    if not body:
        return RedirectResponse(f"/admin/support/{ticket_id}?flash=reply_empty", status_code=303)

    reply = SupportReply(ticket_id=ticket_id, author_type="admin", body=body)
    db.add(reply)
    ticket.has_unread_reply = True
    if ticket.status == "OPEN":
        ticket.status = "IN_PROGRESS"
    await db.commit()
    return RedirectResponse(f"/admin/support/{ticket_id}?flash=replied", status_code=303)


@router.post("/support/{ticket_id}/status", include_in_schema=False)
async def admin_support_status(
    ticket_id: uuid.UUID,
    new_status: str = Form(""),
    session: AdminSession = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if new_status in ("OPEN", "IN_PROGRESS", "RESOLVED"):
        ticket.status = new_status
        await db.commit()
    return RedirectResponse(f"/admin/support/{ticket_id}?flash=status_updated", status_code=303)
