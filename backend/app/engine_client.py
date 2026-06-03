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

    # ── 쿠폰/기프티콘 (RP 교환) — SGR-213 P1 ──────────────────
    async def list_catalog(
        self, *, category: str | None = None, partner_code: str | None = None, limit: int = 20
    ) -> list[dict]:
        params: dict = {"limit": limit}
        if category:
            params["category"] = category
        if partner_code:
            params["partner_code"] = partner_code
        resp = await self._client.get("/v1/catalog", params=params)
        resp.raise_for_status()
        return resp.json()

    async def create_redemption(self, user_uuid: str, *, catalog_id: int, idempotency_key: str) -> dict:
        resp = await self._client.post(
            f"/v1/users/{user_uuid}/redemptions",
            json={"catalog_id": catalog_id, "idempotency_key": idempotency_key},
        )
        resp.raise_for_status()
        return resp.json()

    async def list_redemptions(self, user_uuid: str, *, status: str | None = None, limit: int = 20) -> list[dict]:
        params: dict = {"limit": limit}
        if status:
            params["status"] = status
        resp = await self._client.get(f"/v1/users/{user_uuid}/redemptions", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_mileage(self, user_uuid: str, since: str | None = None) -> dict:
        params = {"since": since} if since else None
        resp = await self._client.get(f"/v1/users/{user_uuid}/mileage", params=params)
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
        group: str | None = None,
        limit: int = 50,
        offset: int = 0,
        user_uuid: str | None = None,
    ) -> list[dict]:
        params: dict = {"limit": limit, "offset": offset}
        if collection:
            params["collection"] = collection
        if rarity:
            params["rarity"] = rarity
        if slot:
            params["slot"] = slot
        if group:
            params["group"] = group
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

    async def get_equip_effects(self, user_uuid: str) -> dict:
        resp = await self._client.get(f"/v1/inventory/{user_uuid}/equip-effects")
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
        start_ts: float | None = None,
        end_ts: float | None = None,
    ) -> list[dict]:
        params: dict = {"count": count}
        if type_filter:
            params["type"] = type_filter
        if uuid_filter:
            params["uuid"] = uuid_filter
        if start_ts is not None:
            params["start_ts"] = start_ts
        if end_ts is not None:
            params["end_ts"] = end_ts
        resp = await self._client.get("/v1/admin/stream/messages", params=params)
        resp.raise_for_status()
        return resp.json()

    async def admin_resolve_device_uuids(self, device_uuids: list[str]) -> dict[str, str | None]:
        if not device_uuids:
            return {}
        resp = await self._client.post(
            "/v1/admin/stream/resolve-uuids",
            json={"device_uuids": device_uuids},
        )
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

    # ── 보상 정책 관리 ────────────────────────────────────────────

    async def admin_get_policies(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/policies")
        resp.raise_for_status()
        return resp.json()

    async def admin_get_policy(self, policy_id: int) -> dict:
        resp = await self._client.get(f"/v1/admin/policies/{policy_id}")
        resp.raise_for_status()
        return resp.json()

    async def admin_create_policy(self, data: dict) -> dict:
        resp = await self._client.post("/v1/admin/policies", json=data)
        resp.raise_for_status()
        return resp.json()

    async def admin_update_policy(self, policy_id: int, data: dict) -> dict:
        resp = await self._client.put(f"/v1/admin/policies/{policy_id}", json=data)
        resp.raise_for_status()
        return resp.json()

    async def admin_delete_policy(self, policy_id: int) -> dict:
        resp = await self._client.delete(f"/v1/admin/policies/{policy_id}")
        resp.raise_for_status()
        return resp.json()

    async def upsert_device_map(
        self,
        device_uuid: str,
        external_user_uuid: str,
        fcm_token: str | None = None,
    ) -> dict:
        payload: dict = {"device_uuid": device_uuid, "external_user_uuid": external_user_uuid}
        if fcm_token:
            payload["fcm_token"] = fcm_token
        resp = await self._client.post("/v1/device-map", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def lookup_device_map(self, external_user_uuid: str) -> dict:
        resp = await self._client.get(
            "/v1/device-map/lookup",
            params={"external_user_uuid": external_user_uuid},
        )
        resp.raise_for_status()
        return resp.json()

    # ── FCM Push ─────────────────────────────────────────────

    async def push_user_list(self, q: str = "") -> list[dict]:
        resp = await self._client.get("/v1/admin/push/users", params={"q": q})
        resp.raise_for_status()
        return resp.json()

    async def send_push(self, payload: dict) -> dict:
        resp = await self._client.post("/v1/admin/push/send", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def push_history(self, limit: int = 50) -> list[dict]:
        resp = await self._client.get("/v1/admin/push/history", params={"limit": limit})
        resp.raise_for_status()
        return resp.json()

    async def push_log_detail(self, message_id: str) -> dict:
        resp = await self._client.get(f"/v1/admin/push/log/{message_id}")
        resp.raise_for_status()
        return resp.json()

    async def push_badges(self) -> list[dict]:
        resp = await self._client.get("/v1/admin/push/badges")
        resp.raise_for_status()
        return resp.json()

    # ── Quest Cards ──────────────────────────────────────────

    async def create_quest_card(
        self,
        *,
        user_uuid: str,
        external_quest_id: str,
        user_quest_id: str,
        card_type: str,
        target_distance_m: int | None = None,
        target_lat: float | None = None,
        target_lng: float | None = None,
        expires_at: str | None = None,
    ) -> dict:
        resp = await self._client.post(
            "/v1/quest-cards",
            json={
                "user_uuid": user_uuid,
                "external_quest_id": external_quest_id,
                "user_quest_id": user_quest_id,
                "card_type": card_type,
                "target_distance_m": target_distance_m,
                "target_lat": target_lat,
                "target_lng": target_lng,
                "expires_at": expires_at,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_daily_quest_slots(self, user_id: int) -> dict:
        resp = await self._client.get(f"/v1/users/{user_id}/daily-quest-slots")
        resp.raise_for_status()
        return resp.json()

    async def get_daily_quest_slots_by_uuid(self, user_uuid: str) -> dict:
        resp = await self._client.get("/v1/quest-cards/daily-slots", params={"user_uuid": user_uuid})
        resp.raise_for_status()
        return resp.json()

    async def get_card_by_user_quest(self, user_quest_id: str) -> dict:
        resp = await self._client.get(
            "/v1/quest-cards/by-user-quest",
            params={"user_quest_id": user_quest_id},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_completed_quest_cards(self, user_id: int) -> list[dict]:
        resp = await self._client.get(f"/v1/users/{user_id}/quest-cards/completed")
        resp.raise_for_status()
        return resp.json()

    async def cancel_quest_card(self, card_id: int) -> None:
        resp = await self._client.post(f"/v1/quest-cards/{card_id}/cancel")
        resp.raise_for_status()

    # ── Ride policy / seed config ────────────────────────────

    async def get_ride_policy(self) -> dict:
        resp = await self._client.get("/v1/config/ride-policy")
        resp.raise_for_status()
        return resp.json()

    async def get_seed(self, seed_code: str) -> dict:
        resp = await self._client.get(f"/v1/config/seed/{seed_code}")
        resp.raise_for_status()
        return resp.json()

    async def update_seed(self, seed_code: str, value_text: str) -> dict:
        resp = await self._client.put(
            f"/v1/config/seed/{seed_code}",
            json={"value_text": value_text},
        )
        resp.raise_for_status()
        return resp.json()


engine_client = EngineClient()
