"""Admin login brute-force throttle (ADM-6).

Redis 기반 escalating lockout 을 **username** 과 **client IP** 두 축으로 독립 적용한다.
- username 축: 특정 계정(root/admin)에 대한 무제한 password 추측을 차단(IP 로테이션 무력화).
- IP 축: 한 출처에서 여러 계정을 훑는 credential-stuffing 을 차단.

Redis 장애 시 **fail-open** — throttle 저장소 순단이 정상 관리자의 콘솔 로그인을 잠그면 안 된다
(자격증명은 여전히 요구된다). 순단은 경고 로깅만 하고 통과시킨다. (유료 외부 호출을 막는
translate rate-limit 의 fail-closed 와는 위험 성격이 달라 정책을 반대로 둔다.)
"""

from __future__ import annotations

import logging

from fastapi import HTTPException, Request

from .redis_cache import get_client

log = logging.getLogger(__name__)

MAX_FAILURES = 5  # 이 횟수 실패가 쌓이면 lockout
FAILURE_WINDOW_SEC = 900  # 실패 카운터 윈도우 (15분)
LOCKOUT_STEPS_SEC = (60, 300, 900, 3600)  # 반복 lockout 마다 escalating (1분→5분→15분→1시간)
LEVEL_TTL_SEC = 86400  # escalation 단계 기억 기간 (24시간)

_PREFIX = "saigon:admin:login:"


def client_ip(request: Request) -> str | None:
    """nginx 뒤 실제 클라이언트 IP.

    nginx 가 ``$proxy_add_x_forwarded_for`` 로 XFF 를 세팅하므로 **마지막 홉**이 nginx 가 관측한
    remote_addr(위조 불가)이고 앞쪽 엔트리는 클라이언트가 실은 위조 가능 값이다. 마지막 값을 취한다.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return request.client.host if request.client else None


def _identifiers(username: str, ip: str | None) -> list[tuple[str, str]]:
    ids: list[tuple[str, str]] = [("user", (username or "").strip().lower())]
    if ip:
        ids.append(("ip", ip))
    return [(scope, value) for scope, value in ids if value]


def _fail_key(scope: str, ident: str) -> str:
    return f"{_PREFIX}fail:{scope}:{ident}"


def _lock_key(scope: str, ident: str) -> str:
    return f"{_PREFIX}lock:{scope}:{ident}"


def _level_key(scope: str, ident: str) -> str:
    return f"{_PREFIX}level:{scope}:{ident}"


async def assert_not_locked(username: str, ip: str | None) -> None:
    """어느 한 축이라도 lockout 중이면 429(Retry-After) 를 던진다. Redis 장애 시 통과(fail-open)."""
    try:
        client = await get_client()
    except Exception as exc:  # noqa: BLE001 — fail-open
        log.warning("Admin login throttle unavailable; allowing attempt: %s", exc)
        return

    retry_after = 0
    for scope, ident in _identifiers(username, ip):
        try:
            ttl = await client.ttl(_lock_key(scope, ident))
        except Exception as exc:  # noqa: BLE001 — fail-open per identifier
            log.warning("Admin login throttle read failed; allowing attempt: %s", exc)
            continue
        if ttl and ttl > 0:
            retry_after = max(retry_after, ttl)

    if retry_after > 0:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )


async def register_failure(username: str, ip: str | None) -> None:
    """로그인 실패 1건을 각 축에 기록하고, 임계 도달 시 escalating lockout 을 건다. fail-open."""
    try:
        client = await get_client()
    except Exception as exc:  # noqa: BLE001 — fail-open
        log.warning("Admin login throttle unavailable; skipping failure record: %s", exc)
        return

    for scope, ident in _identifiers(username, ip):
        try:
            await _register_one(client, scope, ident)
        except Exception as exc:  # noqa: BLE001 — fail-open per identifier
            log.warning("Admin login throttle write failed: %s", exc)


async def _register_one(client, scope: str, ident: str) -> None:
    fail_key = _fail_key(scope, ident)
    pipe = client.pipeline(transaction=True)
    pipe.incr(fail_key)
    pipe.expire(fail_key, FAILURE_WINDOW_SEC, nx=True)
    count, _ = await pipe.execute()
    if count < MAX_FAILURES:
        return

    level = await client.incr(_level_key(scope, ident))
    await client.expire(_level_key(scope, ident), LEVEL_TTL_SEC)
    duration = LOCKOUT_STEPS_SEC[min(level - 1, len(LOCKOUT_STEPS_SEC) - 1)]
    await client.set(_lock_key(scope, ident), "1", ex=duration)
    await client.delete(fail_key)


async def clear_failures(username: str, ip: str | None) -> None:
    """로그인 성공 시 각 축의 실패/lockout/escalation 상태를 정리한다. 실패해도 무해(무시)."""
    try:
        client = await get_client()
    except Exception as exc:  # noqa: BLE001
        log.warning("Admin login throttle unavailable; skipping reset: %s", exc)
        return

    keys: list[str] = []
    for scope, ident in _identifiers(username, ip):
        keys += [_fail_key(scope, ident), _lock_key(scope, ident), _level_key(scope, ident)]
    if keys:
        try:
            await client.delete(*keys)
        except Exception as exc:  # noqa: BLE001
            log.warning("Admin login throttle reset failed: %s", exc)
