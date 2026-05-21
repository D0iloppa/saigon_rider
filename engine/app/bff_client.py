import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)


class BffClient:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.bff_base_url,
            headers={"X-Service-Key": settings.engine_service_key},
            timeout=10.0,
        )

    async def grant_exp(self, user_uuid: str, amount: int) -> dict:
        resp = await self._client.post(
            "/api/internal/grant-exp",
            json={"user_uuid": user_uuid, "amount": amount},
        )
        resp.raise_for_status()
        return resp.json()

    async def grant_gold(self, user_uuid: str, amount: int) -> dict:
        resp = await self._client.post(
            "/api/internal/grant-gold",
            json={"user_uuid": user_uuid, "amount": amount},
        )
        resp.raise_for_status()
        return resp.json()

    async def grant_badge(self, user_uuid: str, badge_id: str) -> dict:
        resp = await self._client.post(
            "/api/internal/grant-badge",
            json={"user_uuid": user_uuid, "badge_id": badge_id},
        )
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._client.aclose()


bff_client = BffClient()
