import json
import logging
import math
from datetime import datetime, timedelta, timezone

from app.services.mileage import process_gps_event
from app.workers.base import BaseAgent

log = logging.getLogger(__name__)

_MAX_FUTURE_SKEW = timedelta(minutes=5)
_MAX_EVENT_AGE = timedelta(hours=24)


def _parse_measured_at(value: object, now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    if isinstance(value, (int, float)):
        seconds = float(value) / 1000 if float(value) > 10_000_000_000 else float(value)
        measured_at = datetime.fromtimestamp(seconds, timezone.utc)
    elif isinstance(value, str):
        try:
            numeric = float(value)
        except ValueError:
            measured_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
        else:
            seconds = numeric / 1000 if numeric > 10_000_000_000 else numeric
            measured_at = datetime.fromtimestamp(seconds, timezone.utc)
    else:
        raise ValueError("GPS measured_at is required")
    if measured_at.tzinfo is None:
        raise ValueError("GPS measured_at must be timezone-aware")
    measured_at = measured_at.astimezone(timezone.utc)
    if measured_at > current + _MAX_FUTURE_SKEW:
        raise ValueError("GPS measured_at is too far in the future")
    if measured_at < current - _MAX_EVENT_AGE:
        raise ValueError("GPS measured_at is too old")
    return measured_at


class GpsAgent(BaseAgent):
    message_types = {"gps"}

    async def handle(self, msg_id: str, fields: dict) -> None:
        device_uuid = fields.get("uuid", "?")
        raw = fields.get("message", "{}")
        try:
            o = json.loads(raw)
            lat, lng, d = float(o.get("y", 0)), float(o.get("x", 0)), float(o.get("d", 0))
            if not all(math.isfinite(value) for value in (lat, lng, d)):
                raise ValueError("GPS values must be finite")
            if not -90 <= lat <= 90 or not -180 <= lng <= 180 or d < 0:
                raise ValueError("GPS values out of range")
            measured_at = _parse_measured_at(o.get("t") or o.get("measured_at"))
        except (json.JSONDecodeError, AttributeError, TypeError, ValueError) as exc:
            raise ValueError("Invalid GPS payload") from exc

        user_id, new_total, completed, duplicate = await process_gps_event(
            msg_id=msg_id,
            device_uuid=device_uuid,
            latitude=lat,
            longitude=lng,
            distance_m=d,
            measured_at=measured_at,
        )
        if user_id is None:
            log.debug("[GPS] unmapped device — skipped")
            return
        if duplicate:
            log.info("[GPS] duplicate msg=%s — skipped", msg_id)
            return
        if d > 0:
            log.info("[GPS] distance accepted: +%dm → %dm", int(d), new_total or 0)
        else:
            log.debug("[GPS] sample produced no distance")

        if completed:
            log.info("[GPS] user=%d quest cards completed: %s", user_id, completed)
