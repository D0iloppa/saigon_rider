import logging

from fastmcp import FastMCP

from . import plane_client as plane

logger = logging.getLogger(__name__)

_VALID_FEATURE_STATUS = {"PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"}
_VALID_TODO_STATUS = {"TODO", "IN_PROGRESS", "DONE", "BLOCKED"}
_VALID_TODO_PRIORITY = {"LOW", "MEDIUM", "HIGH", "URGENT"}


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_dev_summary() -> dict:
        """현재 개발 컨텍스트 전체 요약 (Plane 단일 SoT).
        Context KV + Feature 진행 현황(IN_PROGRESS 목록 포함) + URGENT/HIGH Todo 목록을 반환한다.
        스레드 시작 시 첫 번째로 호출하여 현재 상태를 파악하는 용도."""
        context_list = await plane.list_context()
        context = {c["key"]: {"value": c["value"], "status": c["status"]} for c in context_list}

        summary = await plane.get_summary()
        ip_features = await plane.list_features(status="IN_PROGRESS", page=1, size=50)
        todos_result = await plane.list_todos(page=1, size=200)
        urgent_todos = [
            t for t in todos_result["items"]
            if t["status"] in ("TODO", "IN_PROGRESS") and t["priority"] in ("URGENT", "HIGH")
        ]

        return {
            "context": context,
            "features": {
                "counts": summary["features"],
                "in_progress": [
                    {"id": f["id"], "category": f["category"], "name": f["name"], "description": f.get("description")}
                    for f in ip_features["items"]
                ],
            },
            "todos": {
                "counts": summary["todos"],
                "urgent_high": [
                    {"id": t["id"], "title": t["title"], "priority": t["priority"], "status": t["status"]}
                    for t in urgent_todos
                ],
            },
        }

    @mcp.tool()
    async def upsert_context(key: str, value: str, status: str = "⏸") -> dict:
        """Dev context key-value 추가 또는 갱신 (Plane ctx 라벨 이슈로 저장).
        key: 식별자 (예: current_sprint, current_focus, blocker, next_milestone, last_deploy)
        value: 상태 설명 문자열
        status: 이모지 상태 — 🔧(진행중) | ✅(완료) | ⏸(대기/기본) | ❌(취소)
        작업 착수 시 🔧, 완료 후 ✅로 설정한다."""
        return await plane.upsert_context(key, value, status)

    @mcp.tool()
    async def delete_context(key: str) -> dict:
        """Dev context key 삭제."""
        ok = await plane.delete_context(key)
        return {"ok": ok, "detail": None if ok else "key not found"}

    @mcp.tool()
    async def list_features(category: str = "", status: str = "") -> list[dict]:
        """Feature 목록 조회 (Plane SoT).
        category: auth | home | quest | ride | feed | profile | settings | infra | engine | info (빈 문자열이면 전체)
        status: PLANNED | IN_PROGRESS | DONE | DEFERRED (빈 문자열이면 전체)"""
        result = await plane.list_features(category=category, status=status, page=1, size=200)
        return [
            {"id": f["id"], "category": f["category"], "name": f["name"],
             "description": f.get("description"), "status": f["status"], "sort_order": f.get("sort_order", 0)}
            for f in result["items"]
        ]

    @mcp.tool()
    async def create_feature(
        category: str, name: str, status: str = "PLANNED", description: str = "", sort_order: int = 0,
    ) -> dict:
        """신규 Feature 등록 (Plane SoT).
        category: auth | home | quest | ride | feed | profile | settings | infra | engine | info
        status: PLANNED | IN_PROGRESS | DONE | DEFERRED"""
        if status not in _VALID_FEATURE_STATUS:
            return {"ok": False, "detail": f"Invalid status: {status}"}
        issue = await plane.create_issue(name, description=description or None, state=status, label=category)
        f = plane._issue_to_feature(issue)
        return {"id": f["id"], "category": f["category"], "name": f["name"], "status": f["status"]}

    @mcp.tool()
    async def update_feature(feature_id: int, status: str = "", name: str = "", category: str = "", description: str = "") -> dict:
        """Feature 상태/이름/카테고리/설명 갱신 (Plane SoT).
        빈 문자열 파라미터는 변경하지 않는다."""
        updates = {}
        if status:
            if status not in _VALID_FEATURE_STATUS:
                return {"ok": False, "detail": f"Invalid status: {status}"}
            updates["status"] = status
        if name:
            updates["name"] = name
        if category:
            updates["category"] = category
        if description:
            updates["description"] = description

        issue = await plane.get_issue_by_sequence_id(feature_id)
        if not issue:
            return {"ok": False, "detail": "Feature not found"}
        result = await plane.update_issue(issue["id"], **updates)
        if result:
            f = plane._issue_to_feature(result)
            return {"id": f["id"], "category": f["category"], "name": f["name"], "status": f["status"]}
        return {"ok": False, "detail": "No updates applied"}

    @mcp.tool()
    async def delete_feature(feature_id: int) -> dict:
        """Feature 삭제 (Plane SoT)."""
        issue = await plane.get_issue_by_sequence_id(feature_id)
        if not issue:
            return {"ok": False, "detail": "Feature not found"}
        await plane.delete_issue(issue["id"])
        return {"ok": True}

    @mcp.tool()
    async def list_todos(status: str = "", priority: str = "", feature_id: int = 0) -> list[dict]:
        """Todo 목록 조회 (Plane SoT).
        status: TODO | IN_PROGRESS | DONE | BLOCKED (빈 문자열이면 전체)
        priority: LOW | MEDIUM | HIGH | URGENT (빈 문자열이면 전체)"""
        result = await plane.list_todos(status=status, priority=priority, page=1, size=200)
        return [
            {"id": t["id"], "title": t["title"], "priority": t["priority"],
             "status": t["status"], "feature_id": t.get("feature_id"),
             "due_date": t.get("due_date"), "description": t.get("description")}
            for t in result["items"]
        ]

    @mcp.tool()
    async def create_todo(title: str, priority: str = "MEDIUM", status: str = "TODO", feature_id: int = 0, description: str = "") -> dict:
        """신규 Todo 등록 (Plane SoT).
        priority: LOW | MEDIUM | HIGH | URGENT
        status: TODO | IN_PROGRESS | DONE | BLOCKED"""
        if priority not in _VALID_TODO_PRIORITY:
            return {"ok": False, "detail": f"Invalid priority: {priority}"}
        if status not in _VALID_TODO_STATUS:
            return {"ok": False, "detail": f"Invalid status: {status}"}
        issue = await plane.create_issue(title, description=description or None, state=status, priority=priority)
        t = plane._issue_to_todo(issue)
        return {"id": t["id"], "title": t["title"], "priority": t["priority"], "status": t["status"]}

    @mcp.tool()
    async def update_todo(todo_id: int, status: str = "", priority: str = "", title: str = "", description: str = "") -> dict:
        """Todo 상태/우선순위/제목/설명 갱신 (Plane SoT).
        빈 문자열 파라미터는 변경하지 않는다."""
        plane_updates = {}
        if status:
            if status not in _VALID_TODO_STATUS:
                return {"ok": False, "detail": f"Invalid status: {status}"}
            plane_updates["status"] = status
        if priority:
            if priority not in _VALID_TODO_PRIORITY:
                return {"ok": False, "detail": f"Invalid priority: {priority}"}
            plane_updates["priority"] = priority
        if title:
            plane_updates["name"] = title
        if description:
            plane_updates["description"] = description

        issue = await plane.get_issue_by_sequence_id(todo_id)
        if not issue:
            return {"ok": False, "detail": "Todo not found"}
        result = await plane.update_issue(issue["id"], **plane_updates)
        if result:
            t = plane._issue_to_todo(result)
            return {"id": t["id"], "title": t["title"], "priority": t["priority"], "status": t["status"]}
        return {"ok": False, "detail": "No updates applied"}

    @mcp.tool()
    async def delete_todo(todo_id: int) -> dict:
        """Todo 삭제 (Plane SoT)."""
        issue = await plane.get_issue_by_sequence_id(todo_id)
        if not issue:
            return {"ok": False, "detail": "Todo not found"}
        await plane.delete_issue(issue["id"])
        return {"ok": True}
