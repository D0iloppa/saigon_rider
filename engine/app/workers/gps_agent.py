import json
import logging

from app.services.mileage import resolve_user_id, update_mileage
from app.workers.base import BaseAgent

log = logging.getLogger(__name__)


class GpsAgent(BaseAgent):
    message_types = {"gps"}

    async def handle(self, msg_id: str, fields: dict) -> None:
        device_uuid = fields.get("uuid", "?")
        raw = fields.get("message", "{}")
        try:
            o = json.loads(raw)
            lat, lng, d = float(o.get("y", 0)), float(o.get("x", 0)), float(o.get("d", 0))
        except (json.JSONDecodeError, AttributeError, ValueError):
            lat, lng, d = 0.0, 0.0, 0.0

        user_id = await resolve_user_id(device_uuid)
        if user_id is None:
            log.debug("[GPS] unmapped device %s — skipped", device_uuid)
            return

        if d > 0:
            new_total = await update_mileage(user_id, d, device_uuid)
            log.info(
                "[GPS] user=%d dev=%s | lat=%.6f lng=%.6f +%dm → %dm",
                user_id, device_uuid, lat, lng, int(d), new_total,
            )
        else:
            log.debug("[GPS] user=%d dev=%s | lat=%.6f lng=%.6f d=0 — no distance", user_id, device_uuid, lat, lng)
