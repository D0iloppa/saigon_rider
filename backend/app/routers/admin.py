import contextlib
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
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import AdminAccount, Content, District, FeedPost, FeedPostImage, Quest, RideSession, User
from ..utils import (
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
_NAV_KEYS = ("dashboard", "quests", "feed", "users", "admins", "dev", "settings")
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
