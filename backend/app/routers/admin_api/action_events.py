"""admin JSON API — Engine 사용자 행동 이벤트(action_event) 조회 프록시.

Engine DB 에는 이미 풍부한 행동로그(action_event)가 쌓이고 있으나 BFF 는 Engine DB
테이블에 직접 접근할 수 없다 (CLAUDE.md 핵심 제약) — 오직 engine_client.py 의 HTTP
API 만 거친다. 여기서는 engine_client.get_user_action_events /
admin_action_events_aggregate 를 그대로 프록시한다 (Engine 무변경, 순수 읽기 전용).

Engine 이 죽어도 어드민 화면 전체가 깨지면 안 되므로 실패 시 빈 배열로 폴백하되,
"0 ≠ 미측정" 원칙에 따라 폴백 시 `engine_reachable: false` 를 응답에 실어 조용히
0으로 위장하지 않는다. (5종 metric-state 통합은 별도 워커가 진행 중 — 여기서는
최소 불리언 필드만 제공한다.)
"""

from fastapi import APIRouter, Depends, Query

from ...admin_auth import AdminSession, verify_admin_api
from ...engine_client import engine_client

router = APIRouter(prefix="/action-events")


@router.get("/users/{user_id}", summary="특정 유저의 행동 이벤트 타임라인 (최근 N건, 시간 역순)")
async def get_user_action_events(
    user_id: str,
    since: str | None = Query(None, description="ISO8601. 미지정 시 전체 기간에서 limit 만 적용"),
    until: str | None = Query(None, description="ISO8601"),
    limit: int = Query(50, ge=1, le=200),
    _session: AdminSession = Depends(verify_admin_api),
):
    try:
        events = await engine_client.get_user_action_events(user_id, since=since, until=until, limit=limit)
        return {"engine_reachable": True, "events": events}
    except Exception:
        return {"engine_reachable": False, "events": []}


@router.get("/aggregate", summary="기간 내 action_code 별 발생 건수 (대시보드용)")
async def get_action_events_aggregate(
    since: str = Query(..., description="ISO8601 (필수)"),
    until: str = Query(..., description="ISO8601 (필수)"),
    _session: AdminSession = Depends(verify_admin_api),
):
    try:
        items = await engine_client.admin_action_events_aggregate(since=since, until=until)
        return {"engine_reachable": True, "items": items}
    except Exception:
        return {"engine_reachable": False, "items": []}
