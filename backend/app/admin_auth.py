"""Admin 인증 공용 모듈 — legacy 콘솔(HTML)과 신규 admin JSON API 가 공유.

JWT(HS256, ADMIN_JWT_SECRET) + httpOnly 쿠키 ``admin_session`` 계약을 한 곳에서 관리한다.
양쪽이 동일 쿠키를 재사용하므로 legacy ↔ 신규 콘솔 간 SSO 가 성립한다.
쿠키명/시크릿/만료 등 계약 변경 금지 (변경 시 기존 세션 전부 무효화).
"""

import os
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AdminAccount

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS_HASH = os.getenv("ADMIN_PASS_HASH", "")
# 폴백 금지 — 공개 리포에 노출된 고정 문자열로 서명되면 admin JWT를 누구나 위조할 수 있다.
JWT_SECRET = os.getenv("ADMIN_JWT_SECRET", "")
if not JWT_SECRET:
    raise RuntimeError("ADMIN_JWT_SECRET is not set — refusing to start with a forgeable admin session secret")
JWT_ALG = "HS256"
JWT_EXP_HOURS = 8
COOKIE = "admin_session"


class AdminSession:
    """현재 로그인한 admin 의 컨텍스트."""

    def __init__(self, username: str, role: str, account_id: str | None = None):
        self.username = username
        self.role = role  # "root" | "admin"
        self.account_id = account_id

    @property
    def is_root(self) -> bool:
        return self.role == "root"


def issue_token(*, username: str, role: str, account_id: str | None = None) -> str:
    payload: dict[str, object] = {
        "sub": username,
        "role": role,
        "exp": datetime.now(UTC) + timedelta(hours=JWT_EXP_HOURS),
    }
    if account_id:
        payload["aid"] = account_id
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> AdminSession | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None
    username = payload.get("sub") or ""
    role = payload.get("role") or "admin"  # role 미포함/불명 토큰은 최소권한(admin)으로 강등 — root 상승 방지
    account_id = payload.get("aid")
    return AdminSession(username=username, role=role, account_id=account_id)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


async def authenticate(db: AsyncSession, username: str, password: str) -> AdminSession | None:
    """root(.env 정적 계정) 우선 매칭 → admin_accounts 폴백. 실패 시 None."""
    if username == ADMIN_USER and verify_password(password, ADMIN_PASS_HASH):
        return AdminSession(username=username, role="root")
    account = (await db.execute(select(AdminAccount).where(AdminAccount.username == username))).scalar_one_or_none()
    if account and verify_password(password, account.password_hash):
        return AdminSession(username=username, role="admin", account_id=str(account.id))
    return None


# ── FastAPI 의존성 ──────────────────────────────────────────────


async def verify_admin_page(admin_session: str | None = Cookie(default=None)) -> AdminSession:
    """legacy 페이지용 — 미인증 시 302 로그인 리다이렉트."""
    sess = decode_token(admin_session) if admin_session else None
    if sess is None:
        raise HTTPException(status_code=302, headers={"Location": "/admin-legacy/login"})
    return sess


async def verify_root_page(session: AdminSession = Depends(verify_admin_page)) -> AdminSession:
    if not session.is_root:
        raise HTTPException(status_code=403, detail="Root admin only")
    return session


async def verify_admin_api(admin_session: str | None = Cookie(default=None)) -> AdminSession:
    """신규 JSON API 용 — 미인증 시 401 JSON."""
    sess = decode_token(admin_session) if admin_session else None
    if sess is None:
        raise HTTPException(status_code=401, detail="unauthorized")
    return sess


async def verify_root_api(session: AdminSession = Depends(verify_admin_api)) -> AdminSession:
    if not session.is_root:
        raise HTTPException(status_code=403, detail="forbidden")
    return session
