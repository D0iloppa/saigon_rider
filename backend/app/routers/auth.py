import logging
import os
import re
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Form, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .. import sms_client
from ..database import get_db
from ..deps import enforce_account_active, verify_user_session
from ..engine_client import engine_client
from ..models import AppConfig, User, UserOAuthIdentity, UserOtp
from ..schemas import (
    LoginResponse,
    OAuthLoginRequest,
    OAuthLoginResponse,
    OtpRequestIn,
    OtpRequestOut,
    OtpVerifyIn,
    OtpVerifyOut,
    SessionVerifyRequest,
    UserOut,
)
from ..services.oauth import (
    ZaloProfileFetchError,
    ZaloTokenExchangeError,
    exchange_apple_code,
    exchange_google_code,
    exchange_zalo_code,
    verify_facebook_token,
    verify_google_token,
)
from ..utils import generate_random_nickname

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["인증 (Auth)"])

pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
SESSION_TTL = timedelta(days=180)


def _hash(passcode: str) -> str:
    return pwd_ctx.hash(passcode)


def _verify(passcode: str, hashed: str) -> bool:
    return pwd_ctx.verify(passcode, hashed)


class DeviceMapRequest(BaseModel):
    device_uuid: str
    fcm_token: str | None = None


@router.post("/device-map", summary="단말-유저 매핑 등록", response_description="매핑 결과")
async def register_device_map(
    body: DeviceMapRequest,
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """로그인 후 단말 UUID와 유저를 매핑. Engine device_user_map UPSERT."""
    try:
        result = await engine_client.upsert_device_map(body.device_uuid, str(session_uid), body.fcm_token)
        return result
    except Exception as e:
        log.exception("device-map upsert failed")
        raise HTTPException(status_code=502, detail="Engine device-map unavailable") from e


@router.delete("/device-map/{device_uuid}", summary="단말-유저 매핑 해제", response_description="해제 결과")
async def unregister_device_map(
    device_uuid: str,
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """로그아웃 시 현재 세션 사용자 소유의 단말 매핑만 해제한다."""
    try:
        return await engine_client.delete_device_map(device_uuid, str(session_uid))
    except Exception as e:
        log.exception("device-map delete failed")
        raise HTTPException(status_code=502, detail="Engine device-map unavailable") from e


@router.get("/me", response_model=LoginResponse, summary="유저 조회", response_description="유저 정보")
async def get_me_by_phone(
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """검증된 세션 사용자의 최신 정보 조회."""
    user = await db.get(User, session_uid)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return LoginResponse(user=UserOut.model_validate(user))


@router.get("/me/by-id", response_model=LoginResponse, summary="UUID로 유저 조회")
async def get_me_by_id(
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """검증된 세션 사용자의 최신 정보 조회."""
    user = await db.get(User, session_uid)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return LoginResponse(user=UserOut.model_validate(user))


async def _load_oauth_config(db: AsyncSession) -> dict[str, str]:
    """app_config group_name='oauth' 키-값 맵 반환."""
    rows = (await db.execute(select(AppConfig).where(AppConfig.group_name == "oauth"))).scalars().all()
    return {r.key: r.value for r in rows}


@router.post("/oauth/login", response_model=OAuthLoginResponse, summary="OAuth 로그인 / 가입")
async def oauth_login(body: OAuthLoginRequest, db: AsyncSession = Depends(get_db)):
    """
    provider 별 토큰 검증 후 find-or-create 로그인.
    - 최초 방문 시 users + user_oauth_identities 행 생성 (is_new=True)
    - 기존 유저면 세션 토큰만 갱신 (is_new=False)
    - 세션 토큰 = uuid4 hex, pbkdf2 해시로 users.passcode_hash 저장
    """
    cfg = await _load_oauth_config(db)

    provider = body.provider.lower()
    try:
        if provider == "google":
            client_id = cfg.get("google_client_id_web", "")
            if not client_id or client_id == "CHANGE_ME":
                raise ValueError(
                    "Google client_id not configured — run: UPDATE app_config SET value='...' WHERE group_name='oauth' AND key='google_client_id_web'"
                )
            profile = await verify_google_token(body.token, client_id)

        elif provider == "facebook":
            app_id = cfg.get("facebook_app_id", "")
            app_secret = cfg.get("facebook_app_secret", "")
            if not app_id or app_id == "CHANGE_ME" or not app_secret or app_secret == "CHANGE_ME":
                raise ValueError("Facebook app credentials not configured")
            profile = await verify_facebook_token(body.token, app_id, app_secret)

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    except Exception as e:
        log.exception("OAuth token verification failed")
        raise HTTPException(status_code=401, detail="Token verification failed") from e

    # find-or-create
    identity_row = (
        await db.execute(
            select(UserOAuthIdentity).where(
                UserOAuthIdentity.provider == profile.provider,
                UserOAuthIdentity.provider_user_id == profile.provider_user_id,
            )
        )
    ).scalar_one_or_none()

    is_new = False
    if identity_row is None:
        nick = await generate_random_nickname(db)
        user = User(phone=None, passcode_hash=None, nickname=nick)
        db.add(user)
        await db.flush()  # user.id 확정
        identity_row = UserOAuthIdentity(
            user_id=user.id,
            provider=profile.provider,
            provider_user_id=profile.provider_user_id,
            email=profile.email,
            raw_profile=profile.raw,
        )
        db.add(identity_row)
        is_new = True
    else:
        user = (
            await db.execute(select(User).where(User.id == identity_row.user_id, User.deleted_at.is_(None)))
        ).scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=404, detail="User account deleted")
        if user.status == "BANNED":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "account_banned"})

    # 세션 토큰 발급 (passcode 메커니즘 재사용)
    raw_token = str(uuid.uuid4()).replace("-", "")
    user.passcode_hash = _hash(raw_token)
    user.session_expires_at = datetime.now(UTC) + SESSION_TTL

    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)

    await db.commit()

    user = (await db.execute(select(User).where(User.id == user.id, User.deleted_at.is_(None)))).scalar_one()

    return OAuthLoginResponse(
        user=UserOut.model_validate(user),
        session_token=raw_token,
        is_new=is_new,
    )


@router.post("/session/verify", response_model=LoginResponse, summary="세션 토큰 검증")
async def verify_session(body: SessionVerifyRequest, db: AsyncSession = Depends(get_db)):
    """
    쿠키 {userId, sessionToken}을 검증하고 유저 정보를 반환한다.
    앱 재기동 시 자동 로그인 bootstrap에서 호출.
    실패 시 401 → 프론트는 세션 삭제 후 OAuthLogin 화면으로.
    """
    result = await db.execute(select(User).where(User.id == body.user_id, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if user is None or user.passcode_hash is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalid")

    now = datetime.now(UTC)
    if (
        not _verify(body.session_token, user.passcode_hash)
        or user.session_expires_at is None
        or user.session_expires_at <= now
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalid")

    # 제재 계정 차단 (BANNED 403 / SUSPENDED 403 or 만료 시 lazy-lift) — deps.verify_user_session 과 동일 규칙
    if enforce_account_active(user, now):
        await db.commit()

    return LoginResponse(user=UserOut.model_validate(user))


# ── 휴대폰 OTP 인증 (판매자 온보딩) ──────────────────────────────
# OAuth 로그인 위에 얹는 레이어 — 인증 완료 시 users.phone 바인딩 + phone_verified_at 기록.
# OTP 평문은 발송(sms_client) 외 어디에도 저장·응답·로그하지 않는다 (DB 는 pbkdf2 해시만).

_OTP_TTL_SEC = 300  # 코드 유효 5분
_OTP_RESEND_COOLDOWN_SEC = 60  # 재전송 최소 간격
_OTP_MAX_SENDS_PER_HOUR = 5  # 유저·폰 단위 시간당 발송 상한
_OTP_MAX_ATTEMPTS = 5  # 코드당 오입력 허용 횟수

# VN 모바일: (+84 | 84 | 0) + 3/5/7/8/9 로 시작하는 9자리
_VN_MOBILE_RE = re.compile(r"^(?:\+?84|0)([35789]\d{8})$", re.ASCII)


def _normalize_vn_phone(raw: str) -> str | None:
    """공백·구분자 제거 후 VN 모바일 검증, E.164(+84…) 정규형 반환. 비VN이면 None."""
    compact = re.sub(r"[ \-.()]", "", raw.strip())
    m = _VN_MOBILE_RE.match(compact)
    return f"+84{m.group(1)}" if m else None


@router.post("/otp/request", response_model=OtpRequestOut, summary="휴대폰 OTP 발송")
async def request_otp(
    body: OtpRequestIn,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """세션 유저의 휴대폰 인증 코드 발송. 응답에 코드는 절대 포함되지 않는다."""
    phone = _normalize_vn_phone(body.phone)
    if phone is None:
        raise HTTPException(status_code=400, detail="Invalid Vietnamese mobile number")

    now = datetime.now(UTC)

    # 재전송 쿨다운 — 유저 또는 폰 기준 최근 발송 60s 이내 거부
    cooldown_from = now - timedelta(seconds=_OTP_RESEND_COOLDOWN_SEC)
    recent = (
        await db.execute(
            select(func.count())
            .select_from(UserOtp)
            .where(
                or_(UserOtp.user_id == session_uid, UserOtp.phone == phone),
                UserOtp.last_sent_at > cooldown_from,
            )
        )
    ).scalar_one()
    if recent:
        raise HTTPException(status_code=429, detail="Please wait before requesting another code")

    # 시간당 발송 상한 — 유저 또는 폰 기준
    hour_from = now - timedelta(hours=1)
    hourly = (
        await db.execute(
            select(func.count())
            .select_from(UserOtp)
            .where(
                or_(UserOtp.user_id == session_uid, UserOtp.phone == phone),
                UserOtp.created_at > hour_from,
            )
        )
    ).scalar_one()
    if hourly >= _OTP_MAX_SENDS_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many OTP requests — try again later")

    code = f"{secrets.randbelow(10**6):06d}"
    db.add(
        UserOtp(
            user_id=session_uid,
            phone=phone,
            otp_hash=_hash(code),
            attempt_count=0,
            expires_at=now + timedelta(seconds=_OTP_TTL_SEC),
            last_sent_at=now,
        )
    )
    # 발송 실패와 무관하게 rate-limit 행은 남긴다 (SMS 펌핑 방지) — 커밋 먼저
    await db.commit()

    try:
        await sms_client.send_otp(phone, code)
    except Exception as e:
        log.exception("OTP SMS send failed")
        raise HTTPException(status_code=502, detail="SMS send failed") from e

    return OtpRequestOut(
        phone=phone,
        expires_in_sec=_OTP_TTL_SEC,
        resend_cooldown_sec=_OTP_RESEND_COOLDOWN_SEC,
    )


@router.post("/otp/verify", response_model=OtpVerifyOut, summary="휴대폰 OTP 검증 + 번호 바인딩")
async def verify_otp(
    body: OtpVerifyIn,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID = Depends(verify_user_session),
):
    """코드 검증 성공 시 users.phone + phone_verified_at 설정. 폰 1개 = 계정 1개 (UNIQUE 강제)."""
    phone = _normalize_vn_phone(body.phone)
    if phone is None:
        raise HTTPException(status_code=400, detail="Invalid Vietnamese mobile number")

    now = datetime.now(UTC)
    otp = (
        await db.execute(
            select(UserOtp)
            .where(UserOtp.user_id == session_uid, UserOtp.phone == phone, UserOtp.verified_at.is_(None))
            .order_by(UserOtp.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if otp is None or otp.otp_hash is None:
        raise HTTPException(status_code=400, detail="No OTP requested for this phone")
    if otp.expires_at < now:
        raise HTTPException(status_code=400, detail="OTP expired — request a new code")
    if otp.attempt_count >= _OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts — request a new code")

    if not _verify(body.code, otp.otp_hash):
        otp.attempt_count += 1
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid code")

    # 폰 1개 = 계정 1개 — 다른 활성 유저에게 이미 바인딩된 번호 거부
    other = (
        await db.execute(select(User.id).where(User.phone == phone, User.id != session_uid, User.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if other is not None:
        raise HTTPException(status_code=409, detail="Phone number already linked to another account")

    user = await db.get(User, session_uid)
    user.phone = phone
    user.phone_verified_at = now
    otp.verified_at = now
    try:
        await db.commit()
    except IntegrityError as e:
        # UNIQUE(users.phone) 레이스 / 탈퇴(soft-delete) 계정이 번호 점유 중인 경우
        await db.rollback()
        raise HTTPException(status_code=409, detail="Phone number already linked to another account") from e

    return OtpVerifyOut(phone=phone, phone_verified=True)


_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_CALLBACK_PATH = "/auth/oauth/google/callback"  # BFF_PUBLIC_URL 뒤에 붙는 경로
_APP_DEEP_LINK = "com.saigonrider.user://oauth/callback"
_STATE_TTL = 600  # 10분

# CSRF state 임시 저장소 (단일 프로세스 — BFF 재시작 시 진행 중인 인증은 실패)
# value: (expires_at, extra) — extra는 PKCE code_verifier 등 provider별 부가 데이터
_oauth_states: dict[str, tuple[float, str | None]] = {}


def _make_state(extra: str | None = None) -> str:
    token = secrets.token_urlsafe(32)
    _oauth_states[token] = (time.monotonic() + _STATE_TTL, extra)
    # 만료된 state 정리
    expired = [k for k, (exp, _) in _oauth_states.items() if time.monotonic() > exp]
    for k in expired:
        del _oauth_states[k]
    return token


def _consume_state(state: str) -> tuple[bool, str | None]:
    entry = _oauth_states.pop(state, None)
    if entry is None:
        return False, None
    exp, extra = entry
    return time.monotonic() <= exp, extra


def _bff_base_url() -> str:
    """BFF 공개 URL — 환경변수로 오버라이드 가능."""
    return os.getenv("BFF_PUBLIC_URL", "https://saigon.doil.me")


@router.get("/oauth/google/start", summary="Google OAuth 시작 (네이티브 redirect flow)")
async def oauth_google_start(db: AsyncSession = Depends(get_db)):
    """CSRF state를 생성하고 Google 인증 페이지로 리다이렉트한다."""
    cfg = await _load_oauth_config(db)
    client_id = cfg.get("google_client_id_web", "")
    if not client_id or client_id == "CHANGE_ME":
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    state = _make_state()
    redirect_uri = _bff_base_url() + _GOOGLE_CALLBACK_PATH
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
    }
    return RedirectResponse(url=f"{_GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)


@router.get("/oauth/google/callback", summary="Google OAuth 콜백 (네이티브 redirect flow)")
async def oauth_google_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Google 인증 결과를 처리하고 앱 딥링크로 리다이렉트한다.
    성공: com.saigonrider.user://oauth/callback?userId=...&sessionToken=...&isNew=1
    실패: com.saigonrider.user://oauth/callback?error=...
    """

    def deep_link_error(msg: str) -> RedirectResponse:
        return RedirectResponse(url=f"{_APP_DEEP_LINK}?error={msg}", status_code=302)

    if error or not code:
        return deep_link_error(error or "auth_cancelled")

    valid, _ = _consume_state(state) if state else (False, None)
    if not state or not valid:
        return deep_link_error("invalid_state")

    cfg = await _load_oauth_config(db)
    client_id = cfg.get("google_client_id_web", "")
    client_secret = cfg.get("google_client_secret_web", "")
    if not client_id or client_id == "CHANGE_ME" or not client_secret or client_secret == "CHANGE_ME":
        return deep_link_error("server_not_configured")

    redirect_uri = _bff_base_url() + _GOOGLE_CALLBACK_PATH
    try:
        profile = await exchange_google_code(code, client_id, client_secret, redirect_uri)
    except Exception:
        log.exception("Google code exchange failed")
        return deep_link_error("token_exchange_failed")

    # find-or-create
    identity_row = (
        await db.execute(
            select(UserOAuthIdentity).where(
                UserOAuthIdentity.provider == profile.provider,
                UserOAuthIdentity.provider_user_id == profile.provider_user_id,
            )
        )
    ).scalar_one_or_none()

    is_new = False
    if identity_row is None:
        nick = await generate_random_nickname(db)
        user = User(phone=None, passcode_hash=None, nickname=nick)
        db.add(user)
        await db.flush()
        identity_row = UserOAuthIdentity(
            user_id=user.id,
            provider=profile.provider,
            provider_user_id=profile.provider_user_id,
            email=profile.email,
            raw_profile=profile.raw,
        )
        db.add(identity_row)
        is_new = True
    else:
        user = (
            await db.execute(select(User).where(User.id == identity_row.user_id, User.deleted_at.is_(None)))
        ).scalar_one_or_none()
        if user is None:
            return deep_link_error("account_deleted")

    raw_token = str(uuid.uuid4()).replace("-", "")
    user.passcode_hash = _hash(raw_token)
    user.session_expires_at = datetime.now(UTC) + SESSION_TTL
    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)
    await db.commit()

    return RedirectResponse(
        url=f"{_APP_DEEP_LINK}?userId={user.id}&sessionToken={raw_token}&isNew={'1' if is_new else '0'}",
        status_code=302,
    )


_APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize"
_APPLE_CALLBACK_PATH = "/auth/oauth/apple/callback"


@router.get("/oauth/apple/start", summary="Apple Sign In 시작 (네이티브 redirect flow)")
async def oauth_apple_start(db: AsyncSession = Depends(get_db)):
    """CSRF state를 생성하고 Apple 인증 페이지로 리다이렉트한다."""
    cfg = await _load_oauth_config(db)
    client_id = cfg.get("apple_services_id", "")
    if not client_id or client_id == "CHANGE_ME":
        raise HTTPException(status_code=500, detail="Apple OAuth not configured")

    state = _make_state()
    redirect_uri = _bff_base_url() + _APPLE_CALLBACK_PATH
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "response_mode": "form_post",
        "scope": "name email",
        "state": state,
    }
    return RedirectResponse(url=f"{_APPLE_AUTH_URL}?{urlencode(params)}", status_code=302)


@router.post("/oauth/apple/callback", summary="Apple Sign In 콜백 (form_post)")
async def oauth_apple_callback(
    code: str | None = Form(default=None),
    state: str | None = Form(default=None),
    error: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Apple이 form POST로 전달하는 인증 결과를 처리하고 앱 딥링크로 리다이렉트한다.
    성공: com.saigonrider.user://oauth/callback?userId=...&sessionToken=...&isNew=1
    실패: com.saigonrider.user://oauth/callback?error=...
    """

    def deep_link_error(msg: str) -> RedirectResponse:
        return RedirectResponse(url=f"{_APP_DEEP_LINK}?error={msg}", status_code=302)

    if error or not code:
        return deep_link_error(error or "auth_cancelled")

    valid, _ = _consume_state(state) if state else (False, None)
    if not state or not valid:
        return deep_link_error("invalid_state")

    cfg = await _load_oauth_config(db)
    team_id = cfg.get("apple_team_id", "")
    services_id = cfg.get("apple_services_id", "")
    key_id = cfg.get("apple_key_id", "")
    private_key = cfg.get("apple_private_key", "")
    if not all([team_id, services_id, key_id, private_key]) or "CHANGE_ME" in (team_id, services_id, key_id):
        return deep_link_error("server_not_configured")

    redirect_uri = _bff_base_url() + _APPLE_CALLBACK_PATH
    try:
        profile = await exchange_apple_code(code, team_id, services_id, key_id, private_key, redirect_uri)
    except Exception:
        log.exception("Apple code exchange failed")
        return deep_link_error("token_exchange_failed")

    # find-or-create
    identity_row = (
        await db.execute(
            select(UserOAuthIdentity).where(
                UserOAuthIdentity.provider == profile.provider,
                UserOAuthIdentity.provider_user_id == profile.provider_user_id,
            )
        )
    ).scalar_one_or_none()

    is_new = False
    if identity_row is None:
        nick = await generate_random_nickname(db)
        user = User(phone=None, passcode_hash=None, nickname=nick)
        db.add(user)
        await db.flush()
        identity_row = UserOAuthIdentity(
            user_id=user.id,
            provider=profile.provider,
            provider_user_id=profile.provider_user_id,
            email=profile.email,
            raw_profile=profile.raw,
        )
        db.add(identity_row)
        is_new = True
    else:
        user = (
            await db.execute(select(User).where(User.id == identity_row.user_id, User.deleted_at.is_(None)))
        ).scalar_one_or_none()
        if user is None:
            return deep_link_error("account_deleted")

    raw_token = str(uuid.uuid4()).replace("-", "")
    user.passcode_hash = _hash(raw_token)
    user.session_expires_at = datetime.now(UTC) + SESSION_TTL
    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)
    await db.commit()

    return RedirectResponse(
        url=f"{_APP_DEEP_LINK}?userId={user.id}&sessionToken={raw_token}&isNew={'1' if is_new else '0'}",
        status_code=302,
    )


_ZALO_AUTH_URL = "https://oauth.zaloapp.com/v4/permission"
_ZALO_CALLBACK_PATH = "/auth/oauth/zalo/callback"
_WEB_OAUTH_RESULT_PATH = "/auth/oauth-result"  # 웹 플로우 결과 수신 SPA 라우트 (같은 origin)
_WEB_STATE_MARKER = ".w"  # web 플로우 state 문자열 접미사 — token_urlsafe 알파벳에 "."이 없어 충돌 불가


def _is_web_zalo_state(state: str | None) -> bool:
    """state 문자열 자체만으로 web 플랫폼 여부를 판별 — 공유 _oauth_states dict 조회 없음.

    _oauth_states는 다른 유저의 OAuth 시작 호출 시마다 lazy cleanup되는 프로세스 전역 dict라,
    dict 조회에 의존하면 콜백이 지연되는 사이 엔트리가 정리돼 platform 판별이 native로
    오폴백될 수 있었다. state 값 자체에 마커를 실어 이 의존을 제거한다.
    """
    return bool(state) and state.endswith(_WEB_STATE_MARKER)


def _strip_web_marker(state: str) -> str:
    """_oauth_states 조회용 원래 state 키로 복원 (마커 제거)."""
    return state[: -len(_WEB_STATE_MARKER)] if state.endswith(_WEB_STATE_MARKER) else state


def _make_pkce() -> tuple[str, str]:
    """code_verifier + code_challenge(S256) 쌍 생성."""
    import base64
    import hashlib

    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


@router.get("/oauth/zalo/start", summary="Zalo 로그인 시작 (PKCE redirect flow)")
async def oauth_zalo_start(
    platform: str = Query(default="native"),
    db: AsyncSession = Depends(get_db),
):
    """PKCE code_verifier를 생성해 state에 바인딩하고 Zalo 인증 페이지로 리다이렉트한다.

    platform=web 이면 콜백이 앱 딥링크 대신 SPA 결과 라우트(/auth/oauth-result)로 리다이렉트한다.
    """
    cfg = await _load_oauth_config(db)
    app_id = cfg.get("zalo_app_id", "")
    if not app_id or app_id == "CHANGE_ME":
        raise HTTPException(status_code=500, detail="Zalo OAuth not configured")

    platform = "web" if platform == "web" else "native"
    verifier, challenge = _make_pkce()
    state = _make_state(extra=verifier)
    if platform == "web":
        state += _WEB_STATE_MARKER  # Zalo가 state를 그대로 에코 — 콜백에서 dict 조회 없이 판별
    redirect_uri = _bff_base_url() + _ZALO_CALLBACK_PATH
    params = {
        "app_id": app_id,
        "redirect_uri": redirect_uri,
        "code_challenge": challenge,
        "state": state,
    }
    return RedirectResponse(url=f"{_ZALO_AUTH_URL}?{urlencode(params)}", status_code=302)


@router.get("/oauth/zalo/callback", summary="Zalo 로그인 콜백 (PKCE redirect flow)")
async def oauth_zalo_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Zalo 인증 결과를 처리하고 platform(native/web)에 맞는 목적지로 리다이렉트한다.
    native: com.saigonrider.user://oauth/callback?userId=...&sessionToken=...&isNew=1 (또는 ?error=...)
    web:    /auth/oauth-result?userId=...&sessionToken=...&isNew=1 (또는 ?error=...)
    """
    # platform은 state 문자열 자체의 마커로 결정 — dict 조회가 아니므로 만료/레이스 영향 없음.
    platform = "web" if _is_web_zalo_state(state) else "native"

    def result_redirect(
        *,
        error_code: str | None = None,
        user_id: str | None = None,
        session_token: str | None = None,
        is_new: bool = False,
    ) -> RedirectResponse:
        base = _WEB_OAUTH_RESULT_PATH if platform == "web" else _APP_DEEP_LINK
        if error_code:
            return RedirectResponse(url=f"{base}?error={error_code}", status_code=302)
        return RedirectResponse(
            url=f"{base}?userId={user_id}&sessionToken={session_token}&isNew={'1' if is_new else '0'}",
            status_code=302,
        )

    if error or not code:
        return result_redirect(error_code=error or "auth_cancelled")

    lookup_state = _strip_web_marker(state) if state else state
    valid, verifier = _consume_state(lookup_state) if lookup_state else (False, None)
    if not state or not valid or not verifier:
        return result_redirect(error_code="invalid_state")

    cfg = await _load_oauth_config(db)
    app_id = cfg.get("zalo_app_id", "")
    app_secret = cfg.get("zalo_app_secret", "")
    if not app_id or app_id == "CHANGE_ME" or not app_secret or app_secret == "CHANGE_ME":
        return result_redirect(error_code="server_not_configured")

    try:
        profile = await exchange_zalo_code(code, app_id, app_secret, verifier)
    except ZaloTokenExchangeError:
        log.exception("Zalo token exchange failed")
        return result_redirect(error_code="token_exchange_failed")
    except ZaloProfileFetchError:
        log.exception("Zalo profile fetch failed")
        return result_redirect(error_code="profile_fetch_failed")
    except Exception:
        log.exception("Zalo OAuth exchange failed (unexpected)")
        return result_redirect(error_code="token_exchange_failed")

    identity_row = (
        await db.execute(
            select(UserOAuthIdentity).where(
                UserOAuthIdentity.provider == profile.provider,
                UserOAuthIdentity.provider_user_id == profile.provider_user_id,
            )
        )
    ).scalar_one_or_none()

    is_new = False
    if identity_row is None:
        nick = await generate_random_nickname(db)
        user = User(phone=None, passcode_hash=None, nickname=nick)
        db.add(user)
        await db.flush()
        identity_row = UserOAuthIdentity(
            user_id=user.id,
            provider=profile.provider,
            provider_user_id=profile.provider_user_id,
            email=profile.email,
            raw_profile=profile.raw,
        )
        db.add(identity_row)
        is_new = True
    else:
        user = (
            await db.execute(select(User).where(User.id == identity_row.user_id, User.deleted_at.is_(None)))
        ).scalar_one_or_none()
        if user is None:
            return result_redirect(error_code="account_deleted")

    raw_token = str(uuid.uuid4()).replace("-", "")
    user.passcode_hash = _hash(raw_token)
    user.session_expires_at = datetime.now(UTC) + SESSION_TTL
    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)
    await db.commit()

    return result_redirect(user_id=str(user.id), session_token=raw_token, is_new=is_new)


# AUTH-10: 이전엔 "production/prod 가 아니면 dev 허용"(fail-open) — APP_ENV 미설정/오타 시
# 운영에서도 dev-login 이 열릴 수 있었다. 이제 명시적으로 알려진 dev 값일 때만 허용(fail-safe).
_DEV_ENV_VALUES = {"development", "dev", "local", "test"}
_DEV_MODE = os.getenv("APP_ENV", "").strip().lower() in _DEV_ENV_VALUES


class DevLoginRequest(BaseModel):
    phone: str | None = None


@router.post(
    "/dev-login", response_model=OAuthLoginResponse, include_in_schema=_DEV_MODE, summary="[DEV] 테스트 로그인"
)
async def dev_login(body: DevLoginRequest | None = None, db: AsyncSession = Depends(get_db)):
    """개발 환경 전용 — OAuth 없이 테스트 계정을 생성하거나 가져와 세션을 발급한다.

    phone 을 주면 번호별 테스트 계정을 생성/재사용한다 (동시 QM 세션이 서로의 토큰을 덮어쓰지 않도록).
    phone 이 없으면 기존 공유 계정(`__dev_test__`)을 사용한다.
    """
    if not _DEV_MODE:
        raise HTTPException(status_code=403, detail="Not available in production")

    req_phone = body.phone.strip() if body and body.phone and body.phone.strip() else None
    # User.phone 은 String(20) — 프리픽스 포함 20자로 잘라 컬럼 오버플로 방지
    dev_phone = f"__dev_{req_phone}"[:20] if req_phone else "__dev_test__"
    result = await db.execute(select(User).where(User.phone == dev_phone, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()

    if user is None:
        nick = await generate_random_nickname(db)
        user = User(phone=dev_phone, passcode_hash=None, nickname=nick)
        db.add(user)
        await db.flush()
        identity_row = UserOAuthIdentity(
            user_id=user.id,
            provider="dev",
            provider_user_id=dev_phone if req_phone else "dev_test_user",
            email="dev@test.local",
            raw_profile={"dev": True},
        )
        db.add(identity_row)
        is_new = True
    else:
        is_new = False

    raw_token = str(uuid.uuid4()).replace("-", "")
    user.passcode_hash = _hash(raw_token)
    user.session_expires_at = datetime.now(UTC) + SESSION_TTL
    await db.commit()

    user = (await db.execute(select(User).where(User.id == user.id))).scalar_one()

    return OAuthLoginResponse(
        user=UserOut.model_validate(user),
        session_token=raw_token,
        is_new=is_new,
    )
