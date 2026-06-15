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

    async def get_mileage_skill_pct(self, user_uuid: str) -> int:
        """마일리지 보상 증폭 스킬 배율(%) 조회. 실패 시 0 (배율 미적용)."""
        try:
            resp = await self._client.get(
                "/api/internal/mileage-skill-pct",
                params={"user_uuid": user_uuid},
            )
            resp.raise_for_status()
            return int(resp.json().get("pct", 0))
        except httpx.HTTPError:
            log.warning("mileage-skill-pct fetch failed for %s; applying 0%%", user_uuid)
            return 0

    async def close(self) -> None:
        await self._client.aclose()


bff_client = BffClient()
