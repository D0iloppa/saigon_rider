import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

import bcrypt
import jwt
from fastapi import APIRouter, Cookie, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import RideSession, Quest, User, UserQuest

router = APIRouter(prefix="/admin", tags=["관리자 (Admin)"])

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "admin"

_ADMIN_USER = os.getenv("ADMIN_USER", "admin")
_ADMIN_PASS_HASH = os.getenv("ADMIN_PASS_HASH", "")
_JWT_SECRET = os.getenv("ADMIN_JWT_SECRET", "dev_admin_jwt_secret")
_JWT_ALG = "HS256"
_JWT_EXP_HOURS = 8
_COOKIE = "admin_session"


def _render(name: str, **ctx: str) -> HTMLResponse:
    html = (_TEMPLATE_DIR / name).read_text(encoding="utf-8")
    for k, v in ctx.items():
        html = html.replace(f"{{{{{k}}}}}", str(v))
    return HTMLResponse(html)


def _issue_token() -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=_JWT_EXP_HOURS)
    return jwt.encode({"sub": _ADMIN_USER, "exp": exp}, _JWT_SECRET, algorithm=_JWT_ALG)


def _verify_token(token: str) -> bool:
    try:
        jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALG])
        return True
    except jwt.PyJWTError:
        return False


async def verify_admin_session(admin_session: str | None = Cookie(default=None)):
    if not admin_session or not _verify_token(admin_session):
        raise HTTPException(status_code=302, headers={"Location": "/admin/login"})


# ── Pages ────────────────────────────────────────────────────────

@router.get("/", include_in_schema=False)
async def admin_root():
    return RedirectResponse(url="/admin/login")


@router.get("/login", include_in_schema=False)
async def admin_login_page():
    return _render("login.html")


# Admin-2
@router.post("/login", include_in_schema=False)
async def admin_login_post(
    username: str = Form(...),
    password: str = Form(...),
):
    valid = (
        username == _ADMIN_USER
        and bool(_ADMIN_PASS_HASH)
        and bcrypt.checkpw(password.encode(), _ADMIN_PASS_HASH.encode())
    )
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = _issue_token()
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
    _: None = Depends(verify_admin_session),
    db: AsyncSession = Depends(get_db),
):
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    new_users_7d = (await db.execute(
        select(func.count()).where(User.created_at >= seven_days_ago)
    )).scalar_one()
    active_quests = (await db.execute(
        select(func.count()).where(Quest.is_active.is_(True))
    )).scalar_one()
    rides_today = (await db.execute(
        select(func.count()).where(RideSession.created_at >= today_start)
    )).scalar_one()

    return _render(
        "dashboard.html",
        total_users=str(total_users),
        new_users_7d=str(new_users_7d),
        active_quests=str(active_quests),
        rides_today=str(rides_today),
    )
