"""APNs 직접 전송 — iOS Live Activity 원격 갱신 (ai-docs/task/active/260829_live_activity_task.md Phase 3).

왜 FCM 이 아닌가: ActivityKit 은 Activity 마다 **별도 푸시토큰**을 발급하고, 갱신은 `apns-push-type: liveactivity`
로 그 토큰에 보내야 한다. FCM v1 은 기기 등록토큰만 받으므로 이 경로는 .p8(ES256 JWT) 로 APNs HTTP/2 에 직접 붙는다.
일반 알림은 여전히 `fcm_push.py`(FCM 경유) — 두 경로를 섞지 않는다.

에러 분류는 fcm_push 와 같은 예외 계층을 재사용한다(호출부 device_map 이 HTTP 상태로 변환).
"""

import logging
import time
from typing import Any

import httpx
import jwt

from app.config import settings
from app.services.fcm_push import InvalidPushTokenError, PermanentPushError, RetryablePushError

log = logging.getLogger(__name__)

_JWT_TTL_S = 50 * 60  # APNs 는 20~60분 내 재발급 요구. 50분마다 갱신.
_jwt_cache: dict[str, Any] = {"token": None, "iat": 0}
_key_cache: dict[str, str] = {}
# APNs 는 영속 HTTP/2 연결을 기대한다 — 전송마다 TCP+TLS 를 새로 여는 대신 모듈 단위로 하나를 재사용(bff_client 패턴).
_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        # h2 미설치(이미지 미재빌드)면 여기서 ImportError — 호출부가 PermanentPushError 로 감싼다.
        _client = httpx.AsyncClient(http2=True, timeout=10.0)
    return _client


def apns_configured() -> bool:
    return bool(settings.apns_key_id and settings.apns_team_id)


def _private_key() -> str:
    path = settings.apns_key_path
    if path not in _key_cache:
        with open(path, encoding="utf-8") as f:
            _key_cache[path] = f.read()
    return _key_cache[path]


def _provider_token() -> str:
    now = int(time.time())
    if _jwt_cache["token"] and now - _jwt_cache["iat"] < _JWT_TTL_S:
        return _jwt_cache["token"]
    token = jwt.encode(
        {"iss": settings.apns_team_id, "iat": now},
        _private_key(),
        algorithm="ES256",
        headers={"kid": settings.apns_key_id},
    )
    _jwt_cache.update(token=token, iat=now)
    return token


def _host() -> str:
    return "https://api.sandbox.push.apple.com" if settings.apns_use_sandbox else "https://api.push.apple.com"


async def send_live_activity(
    *,
    push_token: str,
    event: str,
    content_state: dict[str, Any],
    dismissal_date: int | None = None,
    stale_date: int | None = None,
) -> None:
    """`event` 는 'update' | 'end'. content_state 는 위젯 ContentState 와 키·타입이 정확히 같아야 한다
    (`native/ios/Shared/LiveActivityAttributes.swift`) — 불일치 시 iOS 가 조용히 무시한다."""
    if event not in ("update", "end"):
        raise PermanentPushError(f"invalid live activity event: {event}")
    if not apns_configured():
        raise PermanentPushError("APNs not configured (APNS_KEY_ID/APNS_TEAM_ID)")
    try:
        provider_token = _provider_token()
    except (OSError, ValueError) as exc:
        raise PermanentPushError(f"APNs key unavailable: {exc}") from exc

    aps: dict[str, Any] = {"timestamp": int(time.time()), "event": event, "content-state": content_state}
    if dismissal_date is not None:
        aps["dismissal-date"] = dismissal_date
    if stale_date is not None:
        aps["stale-date"] = stale_date
    headers = {
        "authorization": f"bearer {provider_token}",
        "apns-topic": f"{settings.apns_bundle_id}.push-type.liveactivity",
        "apns-push-type": "liveactivity",
        "apns-priority": "10",
        "apns-expiration": "0",
    }
    try:
        resp = await _http().post(f"{_host()}/3/device/{push_token}", headers=headers, json={"aps": aps})
    except httpx.TransportError as exc:
        raise RetryablePushError(str(exc)) from exc
    except Exception as exc:  # ImportError(h2 미설치) 등 — 계약(410/503/502) 밖 500 으로 새지 않게 영구 실패로.
        raise PermanentPushError(f"APNs client error: {exc}") from exc

    if resp.status_code == 200:
        return
    reason = ""
    try:
        reason = resp.json().get("reason", "")
    except ValueError:
        pass
    log.warning("APNs live activity failed: %d %s", resp.status_code, reason or resp.text[:200])
    if resp.status_code == 410 or reason in {"BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"}:
        raise InvalidPushTokenError(f"APNs token rejected: {reason or resp.status_code}")
    if resp.status_code == 403 and reason in {"ExpiredProviderToken", "InvalidProviderToken"}:
        # 토큰 캐시가 낡았을 수 있다 — 비우고 재시도 가능으로 분류.
        _jwt_cache.update(token=None, iat=0)
        raise RetryablePushError(f"APNs provider token: {reason}")
    if resp.status_code in (429, 500, 503):
        raise RetryablePushError(f"APNs HTTP {resp.status_code} {reason}")
    raise PermanentPushError(f"APNs HTTP {resp.status_code} {reason}")
