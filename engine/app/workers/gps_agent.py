import json
import logging
import time as _time

from app.services.mileage import resolve_user_id, update_mileage
from app.workers.base import BaseAgent

log = logging.getLogger(__name__)

_MIN_SPEED_MS = 3 * 1000 / 3600   # 3 km/h → m/s
_MAX_SPEED_MS = 150 * 1000 / 3600  # 150 km/h → m/s
_last_ts: dict[str, float] = {}


def _is_noise(device_uuid: str, distance_m: float) -> bool:
    now = _time.monotonic()
    prev = _last_ts.get(device_uuid)
    _last_ts[device_uuid] = now
    if prev is None or distance_m <= 0:
        return False
    dt = now - prev
    if dt <= 0:
        return False
    speed = distance_m / dt
    return speed < _MIN_SPEED_MS or speed > _MAX_SPEED_MS


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

        if d > 0 and _is_noise(device_uuid, d):
            log.debug("[GPS] user=%d dev=%s | noise filtered (d=%dm)", user_id, device_uuid, int(d))
            d = 0.0

        if d > 0:
            new_total = await update_mileage(user_id, d, device_uuid)
            log.info(
                "[GPS] user=%d dev=%s | lat=%.6f lng=%.6f +%dm → %dm",
                user_id, device_uuid, lat, lng, int(d), new_total,
            )
        else:
            log.debug("[GPS] user=%d dev=%s | lat=%.6f lng=%.6f d=0 — no distance", user_id, device_uuid, lat, lng)

        if d > 0 or (lat != 0 and lng != 0):
            try:
                from app.services.quest_tracker import update as quest_update
                completed = await quest_update(user_id, lat, lng, d)
                if completed:
                    log.info("[GPS] user=%d quest cards completed: %s", user_id, completed)
            except Exception:
                log.exception("[GPS] quest_tracker failed for user=%d", user_id)
