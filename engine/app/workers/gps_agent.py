import json

from app.workers.base import BaseAgent


class GpsAgent(BaseAgent):
    message_types = {"gps"}

    async def handle(self, msg_id: str, fields: dict) -> None:
        uuid = fields.get("uuid", "?")
        raw = fields.get("message", "{}")
        try:
            o = json.loads(raw)
            lat, lng, d = o.get("y", 0), o.get("x", 0), o.get("d", 0)
        except (json.JSONDecodeError, AttributeError):
            lat, lng, d = 0, 0, 0
        print(f"[GPS] {uuid} | lat={lat} lng={lng} d={d}m", flush=True)
