"""admin JSON API — 메시지 스트림 모니터 (Redis Streams, 읽기 전용).

`admin_legacy.py`의 `/admin-legacy/stream` + `/admin-legacy/stream/gps-trace`
(2811-2978)를 JSON 응답으로 이관한 것 — 스트림 정보/최근 메시지/디바이스→유저
해석을 기존 engine_client.admin_stream_info/admin_stream_messages/
admin_resolve_device_uuids 그대로 재사용해 프록시한다 (Engine 무변경). GPS
이동경로는 위치 PII 라 `verify_admin_session`(manager 포함)보다 좁힌
`verify_root_api`(root/admin만)로 게이트를 강화했다 — 순수 읽기 전용이라
감사 로그 없음. 구 `/admin-legacy/stream` 라우트는 손대지 않고 병행 유지한다.

GPS 이동경로 렌더링은 legacy 가 Google Maps JS 폴리라인을 그렸으나, 이번 SPA
이식 범위에서는 새 지도 라이브러리를 들이지 않고 포인트 목록 + 요약 통계로
단순화했다 (parity gap, 지도 시각화 제외).
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_root_api
from ...database import get_db
from ...engine_client import engine_client
from ...models import User
from ...utils import APP_TZ

router = APIRouter(prefix="/stream")


@router.get("/info", summary="Redis Stream 상태 (적재/그룹/pending/consumer)")
async def get_stream_info(_session: AdminSession = Depends(verify_root_api)):
    try:
        return await engine_client.admin_stream_info()
    except Exception:
        return {"length": 0, "groups": [], "exists": False}


@router.get("/messages", summary="최근 메시지 조회 (type/uuid 필터, 디바이스→유저 phone 해석)")
async def get_stream_messages(
    count: int = Query(50, ge=1, le=500),
    type: str | None = Query(None),
    uuid: str | None = Query(None),
    _session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        messages = await engine_client.admin_stream_messages(count=count, type_filter=type, uuid_filter=uuid)
    except Exception:
        return []

    device_uuids = list({m.get("uuid") for m in messages if m.get("uuid")})
    device_to_external: dict[str, str | None] = {}
    external_to_phone: dict[str, str] = {}
    if device_uuids:
        try:
            device_to_external = await engine_client.admin_resolve_device_uuids(device_uuids)
        except Exception:
            device_to_external = {}
        ext_ids = []
        for ext in device_to_external.values():
            if ext:
                ext_ids.append(ext)
        if ext_ids:
            rows = (await db.execute(select(User.id, User.phone).where(User.id.in_(ext_ids)))).all()
            external_to_phone = {str(uid): phone for uid, phone in rows}

    for msg in messages:
        external = device_to_external.get(msg.get("uuid"))
        msg["phone"] = external_to_phone.get(external) if external else None

    return messages


@router.get("/gps-trace", summary="GPS 이동경로 조회 (기간·디바이스UUID 지정)")
async def get_gps_trace(
    uuid: str = Query(...),
    start: str = Query(...),
    end: str = Query(...),
    platform: str = Query("all"),
    _session: AdminSession = Depends(verify_root_api),
):
    try:
        start_dt = datetime.fromisoformat(start).replace(tzinfo=APP_TZ)
        end_dt = datetime.fromisoformat(end).replace(tzinfo=APP_TZ)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="잘못된 시간 형식") from e

    try:
        messages = await engine_client.admin_stream_messages(
            count=500,
            type_filter="gps",
            uuid_filter=uuid,
            start_ts=start_dt.timestamp(),
            end_ts=end_dt.timestamp(),
        )
    except Exception:
        messages = []

    points = []
    total_distance = 0.0
    for msg in reversed(messages):
        try:
            obj = json.loads(msg.get("message", ""))
            lat = float(obj.get("y", 0))
            lng = float(obj.get("x", 0))
            d = float(obj.get("d", 0))
            ts = float(msg.get("ts", 0))
            points.append({"lat": lat, "lng": lng, "d": d, "ts": ts})
            total_distance += d
        except (ValueError, KeyError, TypeError):
            continue

    return {
        "uuid": uuid,
        "platform": platform,
        "start": start,
        "end": end,
        "point_count": len(points),
        "total_distance": total_distance,
        "points": points,
    }
