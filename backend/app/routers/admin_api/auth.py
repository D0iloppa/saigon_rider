"""admin JSON API — 인증 (login / logout / me).

legacy 콘솔과 동일한 `admin_session` 쿠키·JWT 계약(admin_auth.py)을 재사용해 SSO 성립.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import (
    COOKIE,
    JWT_EXP_HOURS,
    AdminSession,
    authenticate,
    issue_token,
    verify_admin_api,
)
from ...database import get_db
from ._audit import audit

router = APIRouter(prefix="/auth")


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def admin_api_login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    sess = await authenticate(db, body.username, body.password)
    if sess is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await audit(db, sess, request, "LOGIN")
    await db.commit()

    token = issue_token(username=sess.username, role=sess.role, account_id=sess.account_id)
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=JWT_EXP_HOURS * 3600,
    )
    return {"username": sess.username, "role": sess.role}


@router.post("/logout", status_code=204)
async def admin_api_logout(response: Response):
    response.delete_cookie(COOKIE)


@router.get("/me")
async def admin_api_me(session: AdminSession = Depends(verify_admin_api)):
    return {"username": session.username, "role": session.role}
