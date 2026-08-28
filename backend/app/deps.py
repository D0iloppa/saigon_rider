import os
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Header, HTTPException, Response, Security, status
from fastapi.security import APIKeyHeader
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .models import User

HTTP_419_SESSION_EXPIRED = 419

_BFF_SERVICE_KEY = os.getenv("ENGINE_SERVICE_KEY", "")
_service_key_header = APIKeyHeader(name="X-Service-Key", auto_error=False)
_session_pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

_LAST_SEEN_THROTTLE = timedelta(minutes=10)  # DAU 소스 — 쓰기 스로틀

# 익명ID(X-Anon-Id)/세션ID(X-Session-Id) 헤더명 — 사용자 트래킹 파이프라인(init/213).
# 로그인 세션(X-User-Id/X-Session-Token, 기존 관례)과 별개의 헤더쌍이다: 이 앱은 Capacitor
# WebView 하이브리드로 기존 인증도 쿠키가 아니라 커스텀 헤더로 주고받으므로(client.ts
# sessionHeaders()) 트래킹 ID 도 같은 방식을 따른다 — 쿠키를 새로 도입하지 않는다.
_ANON_ID_HEADER = "X-Anon-Id"
_SESSION_ID_HEADER = "X-Session-Id"


async def verify_service_key(key: str = Security(_service_key_header)) -> None:
    if not key or key != _BFF_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Service-Key",
        )


def enforce_account_active(user: User, now: datetime) -> bool:
    """제재 상태 차단 — BANNED/SUSPENDED 는 403 (419 는 프론트 로그아웃 처리라 사용 금지).

    만료된 정지는 lazy-lift(ACTIVE 복귀)하고 True 반환 — 커밋은 호출부 책임.
    """
    if user.status == "BANNED":
        raise HTTPException(status_code=403, detail={"code": "account_banned"})
    if user.status == "SUSPENDED":
        if user.suspended_until is not None and user.suspended_until <= now:
            user.status = "ACTIVE"
            user.suspended_until = None
            return True
        raise HTTPException(
            status_code=403,
            detail={
                "code": "account_suspended",
                "until": user.suspended_until.isoformat() if user.suspended_until else None,
            },
        )
    if user.status != "ACTIVE":
        raise HTTPException(status_code=403, detail={"code": "account_inactive"})
    return False


async def _resolve_session_user(
    x_user_id: str | None,
    x_session_token: str | None,
    db: AsyncSession,
) -> tuple[User, uuid.UUID, datetime]:
    """세션 토큰 검증 공통부 — 제재 상태(enforce_account_active) 판단은 호출부 책임."""
    if not x_user_id or not x_session_token:
        raise HTTPException(status_code=HTTP_419_SESSION_EXPIRED, detail="Session expired")
    try:
        uid = uuid.UUID(x_user_id)
    except ValueError:
        raise HTTPException(status_code=HTTP_419_SESSION_EXPIRED, detail="Session expired") from None
    user = await db.get(User, uid)
    try:
        token_valid = bool(user and user.passcode_hash and _session_pwd_ctx.verify(x_session_token, user.passcode_hash))
    except (TypeError, ValueError):
        token_valid = False
    now = datetime.now(UTC)
    if (
        not token_valid
        or user.deleted_at is not None
        or user.session_expires_at is None
        or user.session_expires_at <= now
    ):
        raise HTTPException(status_code=HTTP_419_SESSION_EXPIRED, detail="Session expired")
    return user, uid, now


async def verify_user_session(
    x_user_id: str | None = Header(None),
    x_session_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    user, uid, now = await _resolve_session_user(x_user_id, x_session_token, db)

    dirty = enforce_account_active(user, now)
    if user.last_seen_at is None or now - user.last_seen_at > _LAST_SEEN_THROTTLE:
        user.last_seen_at = now
        dirty = True
    if dirty:
        await db.commit()
    return uid


async def verify_user_session_allow_suspended(
    x_user_id: str | None = Header(None),
    x_session_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    """Q-4/D-22(감사 260817): 세션 인증은 그대로 요구하되 제재 상태(enforce_account_active) 는 통과시킨다.

    오신고 등으로 정지/차단된 사용자도 고객센터 티켓은 생성·열람할 수 있어야 한다는 감사 결함(Q-4, D-22) 대응.
    support.py 의 고객센터 라우트 전용 예외다 — 그 외 라우트에는 사용하지 말 것.
    """
    user, uid, now = await _resolve_session_user(x_user_id, x_session_token, db)
    dirty = False
    if user.status == "SUSPENDED" and user.suspended_until is not None and user.suspended_until <= now:
        # enforce_account_active 와 동일한 lazy-lift — allow_suspended 경로도 만료된 정지는 되돌린다.
        user.status = "ACTIVE"
        user.suspended_until = None
        dirty = True
    if user.status != "BANNED" and (user.last_seen_at is None or now - user.last_seen_at > _LAST_SEEN_THROTTLE):
        user.last_seen_at = now
        dirty = True
    if dirty:
        await db.commit()
    return uid


async def optional_user_session(
    x_user_id: str | None = Header(None),
    x_session_token: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID | None:
    """공개 API용 principal. 헤더가 모두 없을 때만 익명이며, 불완전·위조 세션은 거절한다."""
    if x_user_id is None and x_session_token is None:
        return None
    return await verify_user_session(x_user_id, x_session_token, db)


def _parse_uuid(raw: str | None) -> uuid.UUID | None:
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


async def resolve_tracking_ids(
    response: Response,
    x_anon_id: str | None = Header(None, alias=_ANON_ID_HEADER),
    x_session_id: str | None = Header(None, alias=_SESSION_ID_HEADER),
) -> tuple[uuid.UUID, uuid.UUID]:
    """사용자 트래킹 파이프라인(init/213, C3) — 익명ID/세션ID 발급·전파.

    클라이언트가 보낸 값을 신뢰하되(신원 인증이 아니라 순수 추적용 난수라 로그인 세션과
    위협 모델이 다르다), 없거나 형식이 잘못됐으면 새로 발급해 응답 헤더로 회신한다. 클라이언트는
    응답 헤더 값을 저장해 다음 요청에 그대로 되돌려보내야 한다(발급/회신 계약 — 세션 상태를
    서버가 들고 있지 않음).

    세션ID 의 "무활동 30분 만료·슬라이딩"은 이 함수가 아니라 **클라이언트가** last-activity
    타임스탬프로 판단한다: 마지막 활동으로부터 30분이 지났으면 클라이언트가 X-Session-Id 를
    보내지 않아 여기서 새 세션ID 가 발급되게 한다. 서버는 상태 없이 발급/회신만 한다(요청되지
    않은 서버측 세션 스토어를 새로 만들지 않는다 — 과설계 금지).
    """
    anon_id = _parse_uuid(x_anon_id) or uuid.uuid4()
    session_id = _parse_uuid(x_session_id) or uuid.uuid4()
    response.headers[_ANON_ID_HEADER] = str(anon_id)
    response.headers[_SESSION_ID_HEADER] = str(session_id)
    return anon_id, session_id


def unpack_tracking_ids(tracking_ids: object) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """`resolve_tracking_ids` 의 결과를 (anon_id, session_id) 로 안전하게 풀어낸다.

    라우터 함수가 FastAPI 요청 경로가 아니라 직접 호출될 때(예: test_funnel_events.py 처럼
    회귀 테스트가 엔드포인트 함수를 바로 부르는 경우) `Depends(...)` 가 해석되지 않은 채로
    남을 수 있다 — 그때는 값이 없는 것으로 보고 (None, None) 을 반환한다. 값이 없으면 NULL로
    두고 동작해야 한다는 요구(기존 이벤트 발화 지점 시그니처 보존)를 여기 한 곳에서 만족시킨다."""
    if isinstance(tracking_ids, tuple) and len(tracking_ids) == 2:
        return tracking_ids  # type: ignore[return-value]
    return None, None
