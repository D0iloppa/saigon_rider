import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import verify_service_key
from app.redis_client import STREAM_KEY, get_redis

router = APIRouter(prefix="/v1/sreMessage", tags=["message"])
log = logging.getLogger(__name__)

VALID_TYPES = {"gps", "heartbeat", "event"}


class SreMessageRequest(BaseModel):
    uuid: str
    message: str
    type: str = "gps"
    extra: dict[str, Any] = Field(default_factory=dict, alias="_extra")


@router.post("", dependencies=[Depends(verify_service_key)])
async def sre_message(
    body: SreMessageRequest,
) -> dict:
    msg_type = body.type if body.type in VALID_TYPES else "gps"

    fields = {
        "uuid": body.uuid,
        "type": msg_type,
        "message": body.message,
        "_extra": json.dumps(body.extra) if body.extra else "{}",
        "ts": str(time.time()),
    }

    try:
        r = await get_redis()
        msg_id = await r.xadd(STREAM_KEY, fields, maxlen=100_000, approximate=True)
        return {"status": "queued", "stream_id": msg_id}
    except Exception:
        log.exception("Redis unavailable — message dropped")
        raise HTTPException(status_code=503, detail="Message queue unavailable")
