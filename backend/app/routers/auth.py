import logging
import os
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .. import sms_client
from ..database import get_db
from ..deps import enforce_account_active, verify_user_session
from ..engine_client import engine_client
from ..jobs.purge_deleted_accounts import RETENTION_DAYS
from ..models import AppConfig, User, UserOAuthIdentity, UserOtp, WithdrawnMemberArchive
from ..schemas import (
    FunnelEventType,
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
from ..services import funnel_events
from ..services.oauth import (
    ZaloProfileFetchError,
    ZaloTokenExchangeError,
    exchange_apple_code,
    exchange_google_code,
    exchange_zalo_code,
    verify_facebook_token,
    verify_google_token,
)
from ..services.oauth_flow import (
    consume_oauth_exchange,
    consume_oauth_state,
    issue_oauth_exchange,
    issue_oauth_state,
)
from ..utils import generate_random_nickname

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["인증 (Auth)"])

pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
SESSION_TTL = timedelta(days=180)
# 탈퇴 계정 복구(restore) 토큰 TTL — OAuth 본인확인 성공 직후에만 발급되는 1회성 토큰.
RESTORE_TOKEN_TTL = timedelta(minutes=10)


def _hash(passcode: str) -> str:
    return pwd_ctx.hash(passcode)


def _verify(passcode: str, hashed: str) -> bool:
    return pwd_ctx.verify(passcode, hashed)


class DeviceMapRequest(BaseModel):
    device_uuid: str
    fcm_token: str | None = None


class OAuthExchangeRequest(BaseModel):
    code: str


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


# ── 탈퇴 계정 복구 (restore) ─────────────────────────────────────
# OAuth 본인확인이 성공했는데 연결된 user 가 soft-delete(deleted_at)인 경우에만 복구 자격이
# 생긴다(무조건 복구 금지 — 대표 요구 §1). 실제 복구는 사용자가 안내 화면에서 명시적으로
# 확인한 뒤 POST /auth/account/restore 를 호출했을 때만 수행한다(대표 요구 §2).


async def _issue_restore_grant(db: AsyncSession, user_id: uuid.UUID) -> dict[str, str] | None:
    """soft-delete 유저의 복구 토큰(restore grant) 발급 — 유예기간(RETENTION_DAYS) 내이고
    BANNED 가 아닐 때만. BANNED 는 탈퇴→복구로 제재를 세탁하지 못하게 복구 대상에서
    제외한다. None 이면 호출부는 기존 동작(404 "User account deleted")을 유지한다.

    토큰은 세션 토큰과 동급이므로 **HTTPS POST 응답 본문(409)으로만** 내려간다 —
    리다이렉트 URL 쿼리에 싣지 않는다(access log·브라우저 히스토리 노출). 콜백 redirect
    경로는 성공 경로와 완전히 동일하게 1회용 교환코드만 URL 에 노출하고
    (_redirect_with_exchange), 복구 여부 판단·토큰 발급은 POST /auth/oauth/exchange
    (및 JSON 로그인 /auth/oauth/login)의 409 응답에서만 한다.

    토큰은 새 저장소 없이 기존 세션 장치(passcode_hash + session_expires_at)를 재사용한다.
    deleted_at 이 남아 있는 한 deps.verify_user_session(deps.py)과 /auth/session/verify 가
    무조건 거부하므로, 이 해시는 일반 세션으로는 절대 통하지 않는다 — 오직
    POST /auth/account/restore 만 소비할 수 있다. 토큰 앞 32자는 user id hex 로,
    restore 엔드포인트가 대상 행을 찾는 용도일 뿐 검증은 항상 전체 토큰 해시 비교로 한다.
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or user.deleted_at is None:
        return None
    now = datetime.now(UTC)
    if user.status == "BANNED" or user.deleted_at + timedelta(days=RETENTION_DAYS) <= now:
        return None
    raw_token = user.id.hex + uuid.uuid4().hex
    user.passcode_hash = _hash(raw_token)
    user.session_expires_at = now + RESTORE_TOKEN_TTL
    await db.commit()
    return {
        "deleted_at": user.deleted_at.isoformat(),
        "restorable_until": (user.deleted_at + timedelta(days=RETENTION_DAYS)).isoformat(),
        "restore_token": raw_token,
    }


class AccountRestoreRequest(BaseModel):
    restore_token: str


@router.post("/account/restore", response_model=OAuthLoginResponse, summary="탈퇴 계정 복구")
async def restore_account(body: AccountRestoreRequest, db: AsyncSession = Depends(get_db)):
    """로그인 409(account_deleted) 응답의 restore_token 을 소비해 계정을 복구한다.

    - 401 restore_token_invalid: 형식·해시 불일치, 이미 사용된 토큰
    - 401 restore_token_expired: 토큰 TTL(10분) 경과 — 로그인부터 다시
    - 409 account_banned / account_not_deleted / restore_window_expired
    성공 시 deleted_at 해제 + 새 닉네임 발급 + 정상 세션 발급(OAuthLoginResponse).
    """
    token = body.restore_token
    try:
        uid = uuid.UUID(hex=token[:32])
    except ValueError:
        raise HTTPException(status_code=401, detail={"code": "restore_token_invalid"}) from None

    # 동시 요청 경합 방지 — market.py WITHDRAWN 전환과 같은 근거로 행 잠금.
    # 같은 토큰의 두 번째 요청은 첫 요청이 passcode_hash 를 새 세션으로 교체한 뒤라 401.
    user = (await db.execute(select(User).where(User.id == uid).with_for_update())).scalar_one_or_none()
    now = datetime.now(UTC)
    if user is None or not user.passcode_hash or not _verify(token, user.passcode_hash):
        raise HTTPException(status_code=401, detail={"code": "restore_token_invalid"})
    if user.session_expires_at is None or user.session_expires_at <= now:
        raise HTTPException(status_code=401, detail={"code": "restore_token_expired"})
    # BANNED 차단이 복구보다 먼저 — grant 발급 시에도 배제하지만 이중 방어.
    if user.status == "BANNED":
        raise HTTPException(status_code=409, detail={"code": "account_banned"})
    if user.deleted_at is None:
        raise HTTPException(status_code=409, detail={"code": "account_not_deleted"})
    if user.deleted_at + timedelta(days=RETENTION_DAYS) <= now:
        raise HTTPException(status_code=409, detail={"code": "restore_window_expired"})

    user.deleted_at = None
    # 기존 닉네임은 탈퇴 시 이미 파기(del_*) — 새로 발급. 전화번호는 파기된 채 유지(재인증 필요).
    user.nickname = await generate_random_nickname(db)
    raw_token = uuid.uuid4().hex
    user.passcode_hash = _hash(raw_token)  # restore 토큰은 여기서 소멸 (1회성)
    user.session_expires_at = now + SESSION_TTL
    # 탈퇴 식별자 해시 아카이브(170) 제거 — 복구한 회원이 "탈퇴 이력 있음"으로 영구히
    # 남으면 안 된다. deleted_at 해제와 같은 트랜잭션으로 커밋한다.
    await db.execute(delete(WithdrawnMemberArchive).where(WithdrawnMemberArchive.user_id == user.id))
    await db.commit()

    return OAuthLoginResponse(
        user=UserOut.model_validate(user),
        session_token=raw_token,
        is_new=False,
    )


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

    ref = body.ref

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
        # first-touch 귀속(016 §6-2 #30) — 신규가입 분기에서만 쓴다. 기존 유저 로그인(else
        # 분기)은 이 필드를 절대 건드리지 않는 게 불변식의 전부 — 재로그인·재유입으로 값이
        # 덮어써지지 않는다(소급 불가능한 값이라 여기서 한 번 잘못 쓰면 영구히 잃는다).
        user = User(phone=None, passcode_hash=None, nickname=nick, acquisition_source=_normalize_acq_source(ref))
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
            # soft-delete 계정 — 유예기간 내면 409 + 복구 grant, 지났으면 기존 404 유지.
            grant = await _issue_restore_grant(db, identity_row.user_id)
            if grant is not None:
                raise HTTPException(status_code=409, detail={"code": "account_deleted", **grant})
            raise HTTPException(status_code=404, detail="User account deleted")
        if user.status == "BANNED":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "account_banned"})

    # 세션 토큰 발급 (passcode 메커니즘 재사용)
    raw_token = str(uuid.uuid4()).replace("-", "")
    user.passcode_hash = _hash(raw_token)
    user.session_expires_at = datetime.now(UTC) + SESSION_TTL

    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)

    if is_new:
        # acq_source 를 명시적으로 넘긴다 — record() 의 자동조회는 별도 세션에서 users 를
        # 읽으므로, 아직 커밋 전인 신규가입 행(user.acquisition_source)은 안 보인다.
        await funnel_events.record(db, FunnelEventType.SIGNUP, user_id=user.id, acq_source=user.acquisition_source)

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
# 우회 완화 경로에서도 국가코드 접두는 정식 경로와 동일하게 벗겨낸 뒤 로컬부만 정규화한다
# (안 벗기면 "+84"+"00000" 같은 입력이 84 중복(+848400000)으로 정규화되는 버그가 남는다).
_VN_PREFIX_RE = re.compile(r"^(?:\+?84|0)")


def _normalize_vn_phone(raw: str) -> str | None:
    """공백·구분자 제거 후 VN 모바일 검증, E.164(+84…) 정규형 반환. 비VN이면 None.

    __DEV OTP 우회(_otp_bypass_enabled()) 활성 시에만: 정식 VN 형식이 아니어도 국가코드 접두를
    벗겨낸 로컬부만 숫자로 추출해 4자리 이상이면 +84 접두로 정규화한다(운영에서는 이 완화 분기
    자체가 평가되지 않음). request/verify 양쪽 엔드포인트가 이 함수 하나만 호출하므로 정규화
    결과는 항상 동일하다.
    """
    compact = re.sub(r"[ \-.()]", "", raw.strip())
    m = _VN_MOBILE_RE.match(compact)
    if m:
        return f"+84{m.group(1)}"
    if _otp_bypass_enabled():
        local = _VN_PREFIX_RE.sub("", compact, count=1)
        digits = re.sub(r"\D", "", local)
        if len(digits) < 4:
            return None
        log.warning("[__DEV OTP BYPASS] non-VN phone format accepted: %s", digits)
        return f"+84{digits}"
    return None


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
    bypass = _otp_bypass_enabled()

    if not bypass:
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

    if bypass:
        # __DEV 전용 우회 — 실 SMS 발송(및 쿨다운·시간당 상한)을 건너뛴다. sms_client.py 는
        # 건드리지 않는다: 운영 fail-safe 는 그대로 두고 호출부에서만 분기한다.
        log.warning("[__DEV OTP BYPASS] SMS send + rate limit skipped for phone=%s", phone)
    else:
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

    bypass = _otp_bypass_enabled()
    if bypass:
        # __DEV 전용 우회 — 형식만 검증(6자리 숫자), 해시 비교·시도횟수 검사는 건너뛴다.
        if not re.fullmatch(r"\d{6}", body.code):
            raise HTTPException(status_code=401, detail="Invalid code")
        log.warning("[__DEV OTP BYPASS] user=%s phone=%s — OTP hash check skipped", session_uid, phone)
    else:
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


async def _make_state(extra: str | None = None, ref: str | None = None) -> str:
    try:
        return await issue_oauth_state(extra, ref)
    except Exception as e:
        log.exception("OAuth state storage unavailable")
        raise HTTPException(status_code=503, detail="OAuth temporarily unavailable") from e


async def _consume_state(state: str) -> tuple[bool, str | None, str | None]:
    try:
        return await consume_oauth_state(state)
    except Exception:
        log.exception("OAuth state storage unavailable")
        return False, None, None


_REF_PATTERN = re.compile(r"^[A-Za-z0-9_:.-]{1,64}$")


def _normalize_acq_source(ref: str | None) -> str:
    """유입 귀속 코드 정규화(016 §6-2 #30). `ref` 는 클라이언트가 URL 쿼리로 넘기는 자유
    입력이라 화이트리스트 문자·길이 밖은 전부 'organic' 으로 강제한다 — PII/자유 텍스트가
    users.acquisition_source(init/188)에 섞이는 걸 막는 유일한 방어선."""
    if not ref:
        return "organic"
    ref = ref.strip()
    if not ref or not _REF_PATTERN.fullmatch(ref):
        return "organic"
    return ref


def _bff_base_url() -> str:
    """BFF 공개 URL — 환경변수로 오버라이드 가능."""
    return os.getenv("BFF_PUBLIC_URL", "https://saigon.doil.me")


def _oauth_error_redirect(base: str, error_code: str) -> RedirectResponse:
    return RedirectResponse(url=f"{base}?{urlencode({'error': error_code})}", status_code=302)


async def _redirect_with_exchange(base: str, user_id: uuid.UUID, is_new: bool) -> RedirectResponse:
    try:
        code = await issue_oauth_exchange(str(user_id), is_new)
    except Exception:
        log.exception("OAuth exchange storage unavailable")
        return _oauth_error_redirect(base, "temporarily_unavailable")
    return RedirectResponse(url=f"{base}?code={code}", status_code=302)


@router.post("/oauth/exchange", response_model=OAuthLoginResponse, summary="OAuth 단회용 코드 교환")
async def oauth_exchange(body: OAuthExchangeRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = await consume_oauth_exchange(body.code)
    except Exception as e:
        log.exception("OAuth exchange storage unavailable")
        raise HTTPException(status_code=503, detail="OAuth temporarily unavailable") from e
    if payload is None:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth code")

    try:
        user_id = uuid.UUID(payload.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth code") from e
    user = (await db.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))).scalar_one_or_none()
    if user is None:
        # soft-delete 계정 — 유예기간 내면 409 + 복구 토큰, 아니면 404.
        # 토큰은 이 POST 응답 본문으로만 내려간다 (URL 노출 금지).
        grant = await _issue_restore_grant(db, user_id)
        if grant is not None:
            raise HTTPException(status_code=409, detail={"code": "account_deleted", **grant})
        raise HTTPException(status_code=404, detail="User account deleted")

    now = datetime.now(UTC)
    enforce_account_active(user, now)
    raw_token = uuid.uuid4().hex
    user.passcode_hash = _hash(raw_token)
    user.session_expires_at = now + SESSION_TTL
    await db.commit()

    return OAuthLoginResponse(
        user=UserOut.model_validate(user),
        session_token=raw_token,
        is_new=payload.is_new,
    )


@router.get("/oauth/google/start", summary="Google OAuth 시작 (네이티브 redirect flow)")
async def oauth_google_start(ref: str | None = Query(default=None), db: AsyncSession = Depends(get_db)):
    """CSRF state를 생성하고 Google 인증 페이지로 리다이렉트한다.

    ref = 유입 귀속 코드(016 §6-2 #30) — 여기선 요청 하나가 콜백까지 이어지지 않아
    state(Redis)에 실어 콜백에서 꺼낸다."""
    cfg = await _load_oauth_config(db)
    client_id = cfg.get("google_client_id_web", "")
    if not client_id or client_id == "CHANGE_ME":
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    state = await _make_state(ref=ref)
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
    성공: com.saigonrider.user://oauth/callback?code=... (2분 TTL, 단회용)
    실패: com.saigonrider.user://oauth/callback?error=...
    """

    def deep_link_error(msg: str) -> RedirectResponse:
        return _oauth_error_redirect(_APP_DEEP_LINK, msg)

    if error or not code:
        return deep_link_error(error or "auth_cancelled")

    valid, _, ref = await _consume_state(state) if state else (False, None, None)
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
        # first-touch 귀속(016 §6-2 #30) — 신규가입 분기에서만 쓴다. 기존 유저 로그인(else
        # 분기)은 이 필드를 절대 건드리지 않는 게 불변식의 전부 — 재로그인·재유입으로 값이
        # 덮어써지지 않는다(소급 불가능한 값이라 여기서 한 번 잘못 쓰면 영구히 잃는다).
        user = User(phone=None, passcode_hash=None, nickname=nick, acquisition_source=_normalize_acq_source(ref))
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
            # soft-delete — 성공 경로와 완전히 동일하게 1회용 교환코드만 URL 에 싣는다.
            # 복구 가능(409 + 토큰) / 파기 대상(404) 판단은 POST /auth/oauth/exchange 한 곳에서.
            return await _redirect_with_exchange(_APP_DEEP_LINK, identity_row.user_id, is_new)

    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)
    if is_new:
        # acq_source 를 명시적으로 넘긴다 — record() 의 자동조회는 별도 세션에서 users 를
        # 읽으므로, 아직 커밋 전인 신규가입 행(user.acquisition_source)은 안 보인다.
        await funnel_events.record(db, FunnelEventType.SIGNUP, user_id=user.id, acq_source=user.acquisition_source)
    await db.commit()

    return await _redirect_with_exchange(_APP_DEEP_LINK, user.id, is_new)


_APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize"
_APPLE_CALLBACK_PATH = "/auth/oauth/apple/callback"


@router.get("/oauth/apple/start", summary="Apple Sign In 시작 (네이티브 redirect flow)")
async def oauth_apple_start(ref: str | None = Query(default=None), db: AsyncSession = Depends(get_db)):
    """CSRF state를 생성하고 Apple 인증 페이지로 리다이렉트한다.

    ref = 유입 귀속 코드(016 §6-2 #30) — state(Redis)에 실어 콜백에서 꺼낸다."""
    cfg = await _load_oauth_config(db)
    client_id = cfg.get("apple_services_id", "")
    if not client_id or client_id == "CHANGE_ME":
        raise HTTPException(status_code=500, detail="Apple OAuth not configured")

    state = await _make_state(ref=ref)
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
    성공: com.saigonrider.user://oauth/callback?code=... (2분 TTL, 단회용)
    실패: com.saigonrider.user://oauth/callback?error=...
    """

    def deep_link_error(msg: str) -> RedirectResponse:
        return _oauth_error_redirect(_APP_DEEP_LINK, msg)

    if error or not code:
        return deep_link_error(error or "auth_cancelled")

    valid, _, ref = await _consume_state(state) if state else (False, None, None)
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
        # first-touch 귀속(016 §6-2 #30) — 신규가입 분기에서만 쓴다. 기존 유저 로그인(else
        # 분기)은 이 필드를 절대 건드리지 않는 게 불변식의 전부 — 재로그인·재유입으로 값이
        # 덮어써지지 않는다(소급 불가능한 값이라 여기서 한 번 잘못 쓰면 영구히 잃는다).
        user = User(phone=None, passcode_hash=None, nickname=nick, acquisition_source=_normalize_acq_source(ref))
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
            # soft-delete — 성공 경로와 완전히 동일하게 1회용 교환코드만 URL 에 싣는다.
            # 복구 가능(409 + 토큰) / 파기 대상(404) 판단은 POST /auth/oauth/exchange 한 곳에서.
            return await _redirect_with_exchange(_APP_DEEP_LINK, identity_row.user_id, is_new)

    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)
    if is_new:
        # acq_source 를 명시적으로 넘긴다 — record() 의 자동조회는 별도 세션에서 users 를
        # 읽으므로, 아직 커밋 전인 신규가입 행(user.acquisition_source)은 안 보인다.
        await funnel_events.record(db, FunnelEventType.SIGNUP, user_id=user.id, acq_source=user.acquisition_source)
    await db.commit()

    return await _redirect_with_exchange(_APP_DEEP_LINK, user.id, is_new)


_ZALO_AUTH_URL = "https://oauth.zaloapp.com/v4/permission"
_ZALO_CALLBACK_PATH = "/auth/oauth/zalo/callback"
_WEB_OAUTH_RESULT_PATH = "/auth/oauth-result"  # 웹 플로우 결과 수신 SPA 라우트 (같은 origin)
_WEB_STATE_MARKER = ".w"  # web 플로우 state 문자열 접미사 — token_urlsafe 알파벳에 "."이 없어 충돌 불가


def _is_web_zalo_state(state: str | None) -> bool:
    """Redis state 소비 전에 결과를 web/native 중 어디로 보낼지 판별한다."""
    return bool(state) and state.endswith(_WEB_STATE_MARKER)


def _strip_web_marker(state: str) -> str:
    """Redis 조회용 원래 state 키로 복원한다."""
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
    ref: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """PKCE code_verifier를 생성해 state에 바인딩하고 Zalo 인증 페이지로 리다이렉트한다.

    platform=web 이면 콜백이 앱 딥링크 대신 SPA 결과 라우트(/auth/oauth-result)로 리다이렉트한다.
    ref = 유입 귀속 코드(016 §6-2 #30) — PKCE verifier와 같은 state에 함께 실어 나른다."""
    cfg = await _load_oauth_config(db)
    app_id = cfg.get("zalo_app_id", "")
    if not app_id or app_id == "CHANGE_ME":
        raise HTTPException(status_code=500, detail="Zalo OAuth not configured")

    platform = "web" if platform == "web" else "native"
    verifier, challenge = _make_pkce()
    state = await _make_state(extra=verifier, ref=ref)
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
    native: com.saigonrider.user://oauth/callback?code=... (또는 ?error=...)
    web:    /auth/oauth-result?code=... (또는 ?error=...)
    """
    # platform은 state 문자열 자체의 마커로 결정 — dict 조회가 아니므로 만료/레이스 영향 없음.
    platform = "web" if _is_web_zalo_state(state) else "native"

    def result_redirect(
        *,
        error_code: str | None = None,
    ) -> RedirectResponse:
        base = _WEB_OAUTH_RESULT_PATH if platform == "web" else _APP_DEEP_LINK
        return _oauth_error_redirect(base, error_code or "invalid_response")

    if error or not code:
        return result_redirect(error_code=error or "auth_cancelled")

    lookup_state = _strip_web_marker(state) if state else state
    valid, verifier, ref = await _consume_state(lookup_state) if lookup_state else (False, None, None)
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
        # first-touch 귀속(016 §6-2 #30) — 신규가입 분기에서만 쓴다. 기존 유저 로그인(else
        # 분기)은 이 필드를 절대 건드리지 않는 게 불변식의 전부 — 재로그인·재유입으로 값이
        # 덮어써지지 않는다(소급 불가능한 값이라 여기서 한 번 잘못 쓰면 영구히 잃는다).
        user = User(phone=None, passcode_hash=None, nickname=nick, acquisition_source=_normalize_acq_source(ref))
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
            # soft-delete — 성공 경로와 완전히 동일하게 1회용 교환코드만 URL 에 싣는다.
            # 복구 가능(409 + 토큰) / 파기 대상(404) 판단은 POST /auth/oauth/exchange 한 곳에서.
            base = _WEB_OAUTH_RESULT_PATH if platform == "web" else _APP_DEEP_LINK
            return await _redirect_with_exchange(base, identity_row.user_id, is_new)

    if not (user.nickname and user.nickname.strip()):
        user.nickname = await generate_random_nickname(db)
    if is_new:
        # acq_source 를 명시적으로 넘긴다 — record() 의 자동조회는 별도 세션에서 users 를
        # 읽으므로, 아직 커밋 전인 신규가입 행(user.acquisition_source)은 안 보인다.
        await funnel_events.record(db, FunnelEventType.SIGNUP, user_id=user.id, acq_source=user.acquisition_source)
    await db.commit()

    base = _WEB_OAUTH_RESULT_PATH if platform == "web" else _APP_DEEP_LINK
    return await _redirect_with_exchange(base, user.id, is_new)


# AUTH-10: 이전엔 "production/prod 가 아니면 dev 허용"(fail-open) — APP_ENV 미설정/오타 시
# 운영에서도 dev-login 이 열릴 수 있었다. 이제 명시적으로 알려진 dev 값일 때만 허용(fail-safe).
_DEV_ENV_VALUES = {"development", "dev", "local", "test"}
_DEV_MODE = os.getenv("APP_ENV", "").strip().lower() in _DEV_ENV_VALUES

# OTP 우회(개발 서버 전용) — 이중게이트: ① _DEV_MODE(위 fail-safe 화이트리스트) AND ② 전용 플래그
# OTP_DEV_BYPASS 가 명시적으로 truthy 일 때만 활성. 운영(APP_ENV=production)에서는 플래그를 켜도 항상 False.
# 판정 로직은 이 함수 하나뿐 — verify_otp 는 이 함수만 호출한다(중복 분기 금지).
_OTP_BYPASS_TRUTHY = {"1", "true", "yes", "on"}


def _otp_bypass_enabled() -> bool:
    return _DEV_MODE and os.getenv("OTP_DEV_BYPASS", "").strip().lower() in _OTP_BYPASS_TRUTHY


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


# 지정 계정(uuid)으로 즉시 로그인 — 위 dev_login()과 달리 임의 테스트 계정을 만들지 않고,
# 이미 존재하는 계정(테스트용으로 seed된 유저/업체 계정 등)의 세션을 발급한다.
# _DEV_MODE(APP_ENV) 게이트에 더해, 요청 Host 가 DEV_HOST 와 정확히 일치할 때만 허용한다 —
# dev APP_ENV 값이 실수로 다른 도메인에 배포돼도 이 우회는 열리지 않는다.
_DEV_HOST = os.getenv("DEV_HOST", "").strip().lower()


def _dev_host_allowed(request: Request) -> bool:
    if not _DEV_HOST:
        return False
    host = (request.headers.get("host") or "").split(":")[0].strip().lower()
    return host == _DEV_HOST


class DevLoginAsRequest(BaseModel):
    user_id: uuid.UUID


@router.post(
    "/dev-login-as",
    response_model=OAuthLoginResponse,
    include_in_schema=_DEV_MODE,
    summary="[DEV] 지정 계정으로 로그인 (OAuth 우회)",
)
async def dev_login_as(body: DevLoginAsRequest, request: Request, db: AsyncSession = Depends(get_db)):
    if not _DEV_MODE or not _dev_host_allowed(request):
        raise HTTPException(status_code=403, detail="Not available in production")

    result = await db.execute(select(User).where(User.id == body.user_id, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    raw_token = str(uuid.uuid4()).replace("-", "")
    user.passcode_hash = _hash(raw_token)
    user.session_expires_at = datetime.now(UTC) + SESSION_TTL
    await db.commit()

    user = (await db.execute(select(User).where(User.id == user.id))).scalar_one()

    return OAuthLoginResponse(
        user=UserOut.model_validate(user),
        session_token=raw_token,
        is_new=False,
    )
