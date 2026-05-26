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
                if resp.status_code >= 400:
                    log.warning(
                        "[quest_completed] BFF returned %d for card=%s body=%s",
                        resp.status_code, card_id, resp.text[:200],
                    )
                else:
                    log.info("[quest_completed] BFF notified card=%s user_quest=%s",
                             card_id, user_quest_id)
        except Exception:
            log.exception("[quest_completed] BFF callback failed card=%s", card_id)
