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

    async def get_wallet(self, user_uuid: str) -> dict:
        resp = await self._client.get(f"/v1/users/{user_uuid}/wallet")
        resp.raise_for_status()
        return resp.json()

    # ── 가챠 ────────────────────────────────────────────────────

    async def get_gacha_list(self) -> list[dict]:
        resp = await self._client.get("/v1/gacha/list")
        resp.raise_for_status()
        return resp.json()

    async def get_gacha_pity(self, user_uuid: str, gacha_code: str) -> dict:
        resp = await self._client.get(
            f"/v1/gacha/pity/{gacha_code}",
            params={"user_uuid": user_uuid},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_gacha_pull_log(
        self,
        user_uuid: str,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        resp = await self._client.get(
            f"/v1/gacha/log/{user_uuid}",
            params={"limit": limit, "offset": offset},
        )
        resp.raise_for_status()
        return resp.json()

    async def check_gacha_eligibility(self, user_uuid: str, gacha_code: str) -> dict:
        resp = await self._client.get(
            f"/v1/gacha/eligibility/{gacha_code}",
            params={"user_uuid": user_uuid},
        )
        resp.raise_for_status()
        return resp.json()

    async def pull_gacha(
        self,
        *,
        user_uuid: str,
        gacha_code: str,
        is_10_pull: bool = False,
    ) -> dict:
        resp = await self._client.post(
            "/v1/gacha/pull",
            json={
                "user_uuid": user_uuid,
                "gacha_code": gacha_code,
                "is_10_pull": is_10_pull,
            },
        )
        resp.raise_for_status()
        return resp.json()

    # ── 상점 ────────────────────────────────────────────────────

    @staticmethod
    def _map_shop_item(raw: dict) -> dict:
        """Engine 필드명 → 프론트 ShopItem 인터페이스로 변환."""
        return {
            "item_code": raw.get("item_code"),
            "item_name": raw.get("display_name") or raw.get("item_name"),
            "item_slot": raw.get("slot") or raw.get("item_slot"),
            "rarity": raw.get("rarity"),
            "collection_code": raw.get("collection_code"),
            "price_gold": raw.get("shop_price_gp") or raw.get("price_gp"),
            "price_xp": raw.get("shop_price_gc") or raw.get("price_gc"),
            "is_owned": raw.get("is_owned", False),
            "is_limited": raw.get("is_limited", False),
            "limited_label": raw.get("limited_label"),
            "expires_at": raw.get("expires_at"),
        }

    async def get_shop_items(
        self,
        *,
        collection: str | None = None,
        rarity: str | None = None,
        slot: str | None = None,
        limit: int = 50,
        user_uuid: str | None = None,
    ) -> list[dict]:
        params: dict = {"limit": limit}
        if collection:
            params["collection"] = collection
        if rarity:
            params["rarity"] = rarity
        if slot:
            params["slot"] = slot
        if user_uuid:
            params["user_uuid"] = user_uuid
        resp = await self._client.get("/v1/shop/items", params=params)
        resp.raise_for_status()
        return [self._map_shop_item(item) for item in resp.json()]

    async def get_daily_featured(self) -> dict | None:
        resp = await self._client.get("/v1/shop/daily-featured")
        resp.raise_for_status()
        items = resp.json()
        if not items:
            return None
        raw = items[0]
        mapped = self._map_shop_item(raw)
        mapped["original_price_gp"] = raw.get("original_price_gp")
        mapped["discount_percent"] = raw.get("discount_percent", 0)
        mapped["featured_until"] = raw.get("featured_until") or raw.get("expires_at")
        return mapped

    async def purchase_shop_item(
        self,
        *,
        user_uuid: str,
        item_code: str,
        currency: str,
    ) -> dict:
        resp = await self._client.post(
            "/v1/shop/purchase",
            json={
                "user_uuid": user_uuid,
                "item_code": item_code,
                "currency": currency,
            },
        )
        resp.raise_for_status()
        return resp.json()

    # ── 인벤토리 ────────────────────────────────────────────────

    async def get_inventory(self, user_uuid: str) -> list[dict]:
        resp = await self._client.get(f"/v1/inventory/{user_uuid}/items")
        resp.raise_for_status()
        return resp.json()

    async def get_equipment(self, user_uuid: str) -> list[dict]:
        resp = await self._client.get(f"/v1/inventory/{user_uuid}/equipment")
        resp.raise_for_status()
        return resp.json()

    async def equip_item(self, user_uuid: str, item_code: str) -> dict:
        resp = await self._client.put(
            f"/v1/inventory/{user_uuid}/equip",
            json={"item_code": item_code},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_collection_progress(self, user_uuid: str) -> list[dict]:
        resp = await self._client.get(f"/v1/inventory/{user_uuid}/collection-progress")
        resp.raise_for_status()
        return resp.json()

    async def unequip_slot(self, user_uuid: str, slot: str) -> None:
        resp = await self._client.delete(f"/v1/inventory/{user_uuid}/equip/{slot}")
        resp.raise_for_status()

    # ── 시즌 ────────────────────────────────────────────────────

    async def get_season_current(self) -> dict:
        resp = await self._client.get("/v1/season/current")
        resp.raise_for_status()
        return resp.json()

    async def get_season_pass(self, user_uuid: str) -> dict:
        resp = await self._client.get(f"/v1/season/{user_uuid}/pass")
        resp.raise_for_status()
        return resp.json()

    async def get_season_levels(self, season_code: str, user_uuid: str | None = None) -> list[dict]:
        params = {}
        if user_uuid:
            params["user_uuid"] = user_uuid
        resp = await self._client.get(f"/v1/season/levels/{season_code}", params=params)
        resp.raise_for_status()
        return resp.json()

    async def claim_season_reward(self, user_uuid: str, level: int, track: str) -> dict:
        resp = await self._client.post(
            f"/v1/season/{user_uuid}/claim",
            json={"level": level, "track": track},
        )
        resp.raise_for_status()
        return resp.json()

    # ── 메시지 스트림 모니터 ───────────────────────────────────────

    async def admin_stream_info(self) -> dict:
        resp = await self._client.get("/v1/admin/stream/info")
        resp.raise_for_status()
        return resp.json()

    async def admin_stream_messages(
        self,
        *,
        count: int = 50,
        type_filter: str | None = None,
        uuid_filter: str | None = None,
    ) -> list[dict]:
        params: dict = {"count": count}
        if type_filter:
            params["type"] = type_filter
        if uuid_filter:
            params["uuid"] = uuid_filter
        resp = await self._client.get("/v1/admin/stream/messages", params=params)
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._client.aclose()

    # ── Admin: 가챠 관리 ────────────────────────────────────────────

    async def admin_get_gacha_definitions(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/gacha/definitions")
        resp.raise_for_status()
        return resp.json()

    async def admin_update_gacha_definition(self, gacha_code: str, data: dict) -> dict:
        resp = await self._client.put(f"/v1/admin/gacha/definitions/{gacha_code}", json=data)
        resp.raise_for_status()
        return resp.json()

    # ── Admin: 아이템 정의 CRUD ─────────────────────────────────────

    async def admin_get_items(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/items")
        resp.raise_for_status()
        return resp.json()

    async def admin_get_item(self, item_code: str) -> dict:
        resp = await self._client.get(f"/v1/admin/items/{item_code}")
        resp.raise_for_status()
        return resp.json()

    async def admin_create_item(self, data: dict) -> dict:
        resp = await self._client.post("/v1/admin/items", json=data)
        resp.raise_for_status()
        return resp.json()

    async def admin_update_item(self, item_code: str, data: dict) -> dict:
        resp = await self._client.put(f"/v1/admin/items/{item_code}", json=data)
        resp.raise_for_status()
        return resp.json()

    async def admin_delete_item(self, item_code: str) -> dict:
        resp = await self._client.delete(f"/v1/admin/items/{item_code}")
        resp.raise_for_status()
        return resp.json()

    # ── Admin: 상점 관리 ────────────────────────────────────────────

    async def admin_get_shop_items(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/shop/items")
        resp.raise_for_status()
        return resp.json()

    async def admin_update_shop_item(self, item_code: str, data: dict) -> dict:
        resp = await self._client.put(f"/v1/admin/shop/items/{item_code}", json=data)
        resp.raise_for_status()
        return resp.json()

    # ── Admin: 일일 추천 ────────────────────────────────────────────

    async def admin_get_daily_featured_history(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/shop/daily-featured")
        resp.raise_for_status()
        return resp.json()

    async def admin_refresh_daily_featured(self, date_str: str, items: list[dict]) -> dict:
        resp = await self._client.post(
            "/v1/admin/shop/daily-featured/refresh",
            json={"date": date_str, "items": items},
        )
        resp.raise_for_status()
        return resp.json()

    # ── Admin: 운영 대시보드 쿼리 ───────────────────────────────────

    async def admin_ops_daily_net(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/ops/daily-net")
        resp.raise_for_status()
        return resp.json()

    async def admin_ops_gacha_roi(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/ops/gacha-roi")
        resp.raise_for_status()
        return resp.json()

    async def admin_ops_channel_ratio(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/ops/channel-ratio")
        resp.raise_for_status()
        return resp.json()

    async def admin_ops_pity_distribution(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/ops/pity-distribution")
        resp.raise_for_status()
        return resp.json()


engine_client = EngineClient()
