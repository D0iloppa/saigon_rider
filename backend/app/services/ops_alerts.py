"""운영자 알림 웹훅 — F-17(신고 접수)·F-18(미처리 예외) 최소 경로.

운영자는 Notification 테이블의 수신자(user_id)가 아니라 앱 내 알림 UI 대상이 아니다
(감사 문서 수용 기준: "운영자 채널 웹훅 수준이면 충분"). OPS_ALERT_WEBHOOK_URL 미설정 시
로그만 남기고 무동작 — 기존 ZALO_API_PROXY 관례("비우면 기존 동작과 동일")와 동일한 형태.

쓰로틀: 같은 key 로 cooldown_s 내 재호출은 무시한다 (알림 폭주 방지, 프로세스 로컬 — 다중
replica 간 공유 저장소는 두지 않는다. 복잡해지면 과설계이므로 report-only 범위로 한정).
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
