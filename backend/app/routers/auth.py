import logging
import os
import secrets
import time
import uuid
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Form, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..engine_client import engine_client
from ..models import AppConfig, User, UserOAuthIdentity
from ..schemas import (
    LoginRequest,
    LoginResponse,
    OAuthLoginRequest,
    OAuthLoginResponse,
    RegisterRequest,
    RegisterResponse,
    SessionVerifyRequest,
    UserOut,
)
from ..services.oauth import (
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


def _hash(passcode: str) -> str:
    return pwd_ctx.hash(passcode)


def _verify(passcode: str, hashed: str) -> bool:
    return pwd_ctx.verify(passcode, hashed)


@router.post(
    "/register",
    response_model=RegisterResponse,
    summary="회원가입 / passcode 재발급",
    response_description="발급된 passcode와 유저 정보",
)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    전화번호로 신규 가입.
    - 이미 가입된 번호면 `is_new=False` + 새 passcode 재발급 (분실 복구 용도)
    - passcode는 UUID 기반 32자 문자열로 발급되며 bcrypt 해시로 저장됨
    """
    phone = body.phone.strip()
    result = await db.execute(select(User).where(User.phone == phone, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()

    raw_passcode = str(uuid.uuid4()).replace("-", "")
    hashed = _hash(raw_passcode)

    if user is None:
        # 가입 시점에 랜덤 닉네임을 기본 부여 → ProfileSetup 미완료(앱 종료)여도 공백 닉네임 방지.
        # 사용자는 이후 ProfileSetup 에서 커스텀 지정하거나 건너뛰기(랜덤 유지)한다.
        nick = await generate_random_nickname(db)
        user = User(phone=phone, passcode_hash=hashed, nickname=nick)
        db.add(user)
        await db.commit()
        is_new = True
    else:
        user.passcode_hash = hashed
        # 구버전에서 닉네임 없이 생성된 기존 유저 보정(self-heal).
        if not (user.nickname and user.nickname.strip()):
            nick = await generate_random_nickname(db)
            if nick:
                user.nickname = nick
        await db.commit()
        is_new = False

    # avatar_content 관계 selectin 로드를 위해 재조회 (UserOut 직렬화 시 필요)
    user = (await db.execute(select(User).where(User.phone == phone, User.deleted_at.is_(None)))).scalar_one()

    return RegisterResponse(
        passcode=raw_passcode,
        is_new=is_new,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=LoginResponse, summary="로그인", response_description="유저 정보")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """전화번호 + passcode 검증 후 유저 정보 반환."""
    result = await db.execute(select(User).where(User.phone == body.phone.strip(), User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()

    if user is None or user.passcode_hash is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if not _verify(body.passcode, user.passcode_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid passcode")

    # 구버전에서 닉네임 없이 생성된 기존 유저 보정(self-heal) — 공백 닉네임 방지.
    if not (user.nickname and user.nickname.strip()):
        nick = await generate_random_nickname(db)
        if nick:
            user.nickname = nick
            await db.commit()
            user = (
                await db.execute(select(User).where(User.phone == body.phone.strip(), User.deleted_at.is_(None)))
            ).scalar_one()

    return LoginResponse(user=UserOut.model_validate(user))


class DeviceMapRequest(BaseModel):
    device_uuid: str
    user_id: str
    fcm_token: str | None = None


@router.post("/device-map", summary="단말-유저 매핑 등록", response_description="매핑 결과")
async def register_device_map(body: DeviceMapRequest):
    """로그인 후 단말 UUID와 유저를 매핑. Engine device_user_map UPSERT."""
    try:
        result = await engine_client.upsert_device_map(body.device_uuid, body.user_id, body.fcm_token)
        return result
    except Exception as e:
        log.exception("device-map upsert failed")
        raise HTTPException(status_code=502, detail="Engine device-map unavailable") from e


@router.get("/me", response_model=LoginResponse, summary="유저 조회", response_description="유저 정보")
async def get_me_by_phone(phone: str, db: AsyncSession = Depends(get_db)):
    """phone 쿼리 파라미터로 유저 조회. 프로필 설정 완료 후 최신 정보 갱신 용도."""
    result = await db.execute(select(User).where(User.phone == phone.strip(), User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return LoginResponse(user=UserOut.model_validate(user))


@router.get("/me/by-id", response_model=LoginResponse, summary="UUID로 유저 조회")
async def get_me_by_id(user_id: str, db: AsyncSession = Depends(get_db)):
    """user_id(UUID)로 유저 조회. OAuth 세션 검증 후 최신 정보 갱신 용도."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid user_id") from e
    result = await db.execute(select(User).where(User.id == uid, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
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

    # 세션 토큰 발급 (passcode 메커니즘 재사용)
    raw_token = str(uuid.uuid4()).replace("-", "")
    user.passcode_hash = _hash(raw_token)

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

    if not _verify(body.session_token, user.passcode_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalid")

    return LoginResponse(user=UserOut.model_validate(user))


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
    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)
    await db.commit()

    return RedirectResponse(
        url=f"{_APP_DEEP_LINK}?userId={user.id}&sessionToken={raw_token}&isNew={'1' if is_new else '0'}",
        status_code=302,
    )


_ZALO_AUTH_URL = "https://oauth.zaloapp.com/v4/permission"
_ZALO_CALLBACK_PATH = "/auth/oauth/zalo/callback"


def _make_pkce() -> tuple[str, str]:
    """code_verifier + code_challenge(S256) 쌍 생성."""
    import base64
    import hashlib

    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


@router.get("/oauth/zalo/start", summary="Zalo 로그인 시작 (PKCE redirect flow)")
async def oauth_zalo_start(db: AsyncSession = Depends(get_db)):
    """PKCE code_verifier를 생성해 state에 바인딩하고 Zalo 인증 페이지로 리다이렉트한다."""
    cfg = await _load_oauth_config(db)
    app_id = cfg.get("zalo_app_id", "")
    if not app_id or app_id == "CHANGE_ME":
        raise HTTPException(status_code=500, detail="Zalo OAuth not configured")

    verifier, challenge = _make_pkce()
    state = _make_state(extra=verifier)
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
    Zalo 인증 결과를 처리하고 앱 딥링크로 리다이렉트한다.
    성공: com.saigonrider.user://oauth/callback?userId=...&sessionToken=...&isNew=1
    실패: com.saigonrider.user://oauth/callback?error=...
    """

    def deep_link_error(msg: str) -> RedirectResponse:
        return RedirectResponse(url=f"{_APP_DEEP_LINK}?error={msg}", status_code=302)

    if error or not code:
        return deep_link_error(error or "auth_cancelled")

    valid, verifier = _consume_state(state) if state else (False, None)
    if not state or not valid or not verifier:
        return deep_link_error("invalid_state")

    cfg = await _load_oauth_config(db)
    app_id = cfg.get("zalo_app_id", "")
    app_secret = cfg.get("zalo_app_secret", "")
    if not app_id or app_id == "CHANGE_ME" or not app_secret or app_secret == "CHANGE_ME":
        return deep_link_error("server_not_configured")

    try:
        profile = await exchange_zalo_code(code, app_id, app_secret, verifier)
    except Exception:
        log.exception("Zalo code exchange failed")
        return deep_link_error("token_exchange_failed")

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
    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)
    await db.commit()

    return RedirectResponse(
        url=f"{_APP_DEEP_LINK}?userId={user.id}&sessionToken={raw_token}&isNew={'1' if is_new else '0'}",
        status_code=302,
    )


_DEV_MODE = os.getenv("APP_ENV", "development").lower() not in ("production", "prod")


@router.post(
    "/dev-login", response_model=OAuthLoginResponse, include_in_schema=_DEV_MODE, summary="[DEV] 테스트 로그인"
)
async def dev_login(db: AsyncSession = Depends(get_db)):
    """개발 환경 전용 — OAuth 없이 테스트 계정을 생성하거나 가져와 세션을 발급한다."""
    if not _DEV_MODE:
        raise HTTPException(status_code=403, detail="Not available in production")

    dev_phone = "__dev_test__"
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
            provider_user_id="dev_test_user",
            email="dev@test.local",
            raw_profile={"dev": True},
        )
        db.add(identity_row)
        is_new = True
    else:
        is_new = False

    raw_token = str(uuid.uuid4()).replace("-", "")
    user.passcode_hash = _hash(raw_token)
    await db.commit()

    user = (await db.execute(select(User).where(User.id == user.id))).scalar_one()

    return OAuthLoginResponse(
        user=UserOut.model_validate(user),
        session_token=raw_token,
        is_new=is_new,
    )
