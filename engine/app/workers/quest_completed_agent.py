"""quest_completed 스트림 메시지 소비 → BFF 콜백.

quest_tracker._complete_card 가 카드 완료 시 발행한 이벤트를 받아
BFF /internal/quest-card-completed 로 통지한다.
"""
from __future__ import annotations

import json
import logging
import os

import httpx

from app.workers.base import BaseAgent

log = logging.getLogger(__name__)

BFF_INTERNAL_URL = os.getenv("BFF_INTERNAL_URL", "http://bff:8080")
ENGINE_SERVICE_KEY = os.getenv("ENGINE_SERVICE_KEY", "")


class QuestCompletedAgent(BaseAgent):
    message_types = {"quest_completed"}

    async def handle(self, msg_id: str, fields: dict) -> None:
        raw = fields.get("message", "{}")
        try:
            o = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("[quest_completed] invalid payload msg_id=%s", msg_id)
            return

        user_quest_id = o.get("user_quest_id")
        card_id = o.get("card_id")
        if not user_quest_id:
            log.warning("[quest_completed] missing user_quest_id card=%s", card_id)
            return

        url = f"{BFF_INTERNAL_URL}/api/internal/quest-card-completed"
        # 전송 실패/5xx 는 삼키지 않고 올린다 — 디스패처(메시지 격리)가 재클레임으로
        # 재시도하고, MAX_DELIVERIES 초과 시 DLQ 격리. (과거: log 만 남기고 ack → 보상 조용히 유실)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    url,
                    headers={"X-Service-Key": ENGINE_SERVICE_KEY},
                    json={
                        "user_quest_id": user_quest_id,
                        "external_quest_id": o.get("external_quest_id"),
                        "card_id": card_id,
                        "card_type": o.get("card_type"),
                    },
                )
        except httpx.HTTPError:
            log.exception("[quest_completed] BFF callback transport failed card=%s — will retry", card_id)
            raise

        if resp.status_code >= 500 or resp.status_code in (401, 403):
            # 5xx = 일시 장애, 401/403 = 서비스키 설정 문제 — 둘 다 보상 증거를 버리면
            # 안 되므로 재시도(설정 교정 후 회복)하고 소진 시 DLQ 에 보존한다
            log.warning(
                "[quest_completed] BFF returned %d for card=%s body=%s — will retry",
                resp.status_code, card_id, resp.text[:200],
            )
            raise RuntimeError(f"BFF {resp.status_code} for quest card {card_id}")
        if resp.status_code >= 400:
            # 그 외 4xx = 영구 실패(멱등 중복/무효 카드) — 재시도 무의미, ack 로 종결
            log.warning(
                "[quest_completed] BFF returned %d for card=%s body=%s — permanent, not retried",
                resp.status_code, card_id, resp.text[:200],
            )
        else:
            log.info("[quest_completed] BFF notified card=%s user_quest=%s",
                     card_id, user_quest_id)
