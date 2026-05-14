import logging
import os
from datetime import datetime

import httpx

log = logging.getLogger(__name__)

ENGINE_BASE_URL = os.getenv("ENGINE_BASE_URL", "http://engine:8090")
ENGINE_SERVICE_KEY = os.getenv("ENGINE_SERVICE_KEY", "")


class EngineClient:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=ENGINE_BASE_URL,
            headers={"X-Service-Key": ENGINE_SERVICE_KEY},
            timeout=10.0,
        )

    async def post_event(
        self,
        *,
        user_uuid: str,
        action_code: str,
        occurred_at: datetime,
        payload: dict,
        idem_key: str,
    ) -> dict:
        resp = await self._client.post(
            "/v1/events",
            json={
                "user_id": user_uuid,
                "action_code": action_code,
                "occurred_at": occurred_at.isoformat(),
                "payload": payload,
                "idempotency_key": idem_key,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_balance(self, user_uuid: str) -> dict:
        resp = await self._client.get(f"/v1/users/{user_uuid}/balance")
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._client.aclose()


engine_client = EngineClient()
