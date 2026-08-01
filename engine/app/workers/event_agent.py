import logging

from app.workers.base import BaseAgent

log = logging.getLogger(__name__)


class EventAgent(BaseAgent):
    message_types = {"event", "heartbeat"}

    async def handle(self, msg_id: str, fields: dict) -> None:
        # TODO: event processing, heartbeat tracking, online status
        log.debug("event | %s | %s", fields.get("uuid", "?"), msg_id)
