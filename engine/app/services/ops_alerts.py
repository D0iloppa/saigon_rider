"""운영자 알림 웹훅 — F-18 미처리 예외 최소 경로 (backend/app/services/ops_alerts.py 미러).

Engine 은 별도 파이썬 패키지라 BFF 쪽 헬퍼를 import 할 수 없어 동일 로직을 복제한다.
OPS_ALERT_WEBHOOK_URL 미설정 시 로그만 남기고 무동작.
"""

from __future__ import annotations

import logging
import os
import time

import httpx

log = logging.getLogger(__name__)

_WEBHOOK_URL = os.getenv("OPS_ALERT_WEBHOOK_URL", "")
_last_sent: dict[str, float] = {}


async def send_ops_alert(text: str, *, key: str | None = None, cooldown_s: float = 60.0) -> None:
    if key is not None:
        now = time.monotonic()
        last = _last_sent.get(key)
        if last is not None and now - last < cooldown_s:
            return
        _last_sent[key] = now

    if not _WEBHOOK_URL:
        log.info("ops alert (OPS_ALERT_WEBHOOK_URL unset, logged only): %s", text)
        return

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(_WEBHOOK_URL, json={"text": text})
    except Exception:
        log.exception("ops alert webhook delivery failed")
