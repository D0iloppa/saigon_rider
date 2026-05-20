import json
import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import verify_service_key
from app.redis_client import STREAM_KEY, get_redis

router = APIRouter(prefix="/v1/sreMessage", tags=["message"])
log = logging.getLogger(__name__)

VALID_TYPES = {"gps", "heartbeat", "event"}


@router.get("", dependencies=[Depends(verify_service_key)])
async def sre_message(
    uuid: str = Query(...),
    message: str = Query(...),
    type: str = Query("gps", description="Message type: gps | heartbeat | event"),
    _extra: Optional[str] = Query(
        None, description='JSON string. e.g. {"key":"value"}'
    ),
) -> dict:
    msg_type = type if type in VALID_TYPES else "gps"

    extra_val: dict[str, Any] = {}
    if _extra:
        extra_val = json.loads(_extra)

    fields = {
        "uuid": uuid,
        "type": msg_type,
        "message": message,
        "_extra": json.dumps(extra_val) if extra_val else "{}",
        "ts": str(time.time()),
    }

    try:
        r = await get_redis()
        msg_id = await r.xadd(STREAM_KEY, fields, maxlen=100_000, approximate=True)
        return {"status": "queued", "stream_id": msg_id}
    except Exception:
        log.exception("Redis unavailable — message dropped")
        raise HTTPException(status_code=503, detail="Message queue unavailable")
