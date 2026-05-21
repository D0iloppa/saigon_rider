from datetime import UTC, datetime

from fastmcp import FastMCP
from sqlalchemy import func, select

from .database import AsyncSessionLocal
from .models import DevContext, DevFeature, DevTodo

_VALID_FEATURE_STATUS = {"PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"}
_VALID_TODO_STATUS = {"TODO", "IN_PROGRESS", "DONE", "BLOCKED"}
_VALID_TODO_PRIORITY = {"LOW", "MEDIUM", "HIGH", "URGENT"}
_FEATURE_STATUS_CYCLE = ["PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"]
_TODO_STATUS_CYCLE = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    async def get_dev_summary() -> dict:
        """현재 개발 컨텍스트 전체 요약.
        sprint/focus/blocker 등 Context KV + Feature 진행 현황(IN_PROGRESS 목록 포함) + URGENT/HIGH Todo 목록을 반환한다.
        스레드 시작 시 첫 번째로 호출하여 현재 상태를 파악하는 용도."""
        async with AsyncSessionLocal() as db:
            ctx_rows = (await db.execute(select(DevContext).order_by(DevContext.key))).scalars().all()
            context = {r.key: {"value": r.value, "status": r.status} for r in ctx_rows}

            feature_counts: dict[str, int] = {}
            for st in _VALID_FEATURE_STATUS:
                feature_counts[st] = (await db.execute(select(func.count()).where(DevFeature.status == st))).scalar_one()

            ip_features = (
                (
                    await db.execute(
                        select(DevFeature)
                        .where(DevFeature.status == "IN_PROGRESS")
                        .order_by(DevFeature.category, DevFeature.sort_order)
                    )
                )
                .scalars()
                .all()
            )

            todo_counts: dict[str, int] = {}
            for st in _VALID_TODO_STATUS:
                todo_counts[st] = (await db.execute(select(func.count()).where(DevTodo.status == st))).scalar_one()

            urgent_todos = (
                (
                    await db.execute(
                        select(DevTodo)
                        .where(DevTodo.status.in_(["TODO", "IN_PROGRESS"]))
                        .where(DevTodo.priority.in_(["URGENT", "HIGH"]))
                        .order_by(DevTodo.priority.desc(), DevTodo.created_at)
                    )
                )
                .scalars()
                .all()
            )

        return {
            "context": context,
            "features": {
                "counts": feature_counts,
                "in_progress": [
                    {"id": f.id, "category": f.category, "name": f.name, "description": f.description}
                    for f in ip_features
                ],
            },
            "todos": {
                "counts": todo_counts,
                "urgent_high": [
                    {"id": t.id, "title": t.title, "priority": t.priority, "status": t.status, "feature_id": t.feature_id}
                    for t in urgent_todos
                ],
            },
        }

    @mcp.tool()
    async def upsert_context(key: str, value: str, status: str = "⏸") -> dict:
        """Dev context key-value 추가 또는 갱신.
        key: 식별자 (예: current_sprint, current_focus, blocker, next_milestone, last_deploy)
        value: 상태 설명 문자열
        status: 이모지 상태 — 🔧(진행중) | ✅(완료) | ⏸(대기/기본) | ❌(취소)
        작업 착수 시 🔧, 완료 후 ✅로 설정한다."""
        async with AsyncSessionLocal() as db:
            row = (await db.execute(select(DevContext).where(DevContext.key == key))).scalar_one_or_none()
            if row is None:
                row = DevContext(key=key, value=value, status=status)
                db.add(row)
            else:
                row.value = value
                row.status = status
                row.updated_at = datetime.now(UTC)
            await db.commit()
            await db.refresh(row)
            return {"id": row.id, "key": row.key, "value": row.value, "status": row.status}

    @mcp.tool()
    async def delete_context(key: str) -> dict:
        """Dev context key 삭제."""
        async with AsyncSessionLocal() as db:
            row = (await db.execute(select(DevContext).where(DevContext.key == key))).scalar_one_or_none()
            if row is None:
                return {"ok": False, "detail": "key not found"}
            await db.delete(row)
            await db.commit()
            return {"ok": True}

    @mcp.tool()
    async def list_features(category: str = "", status: str = "") -> list[dict]:
        """Feature 목록 조회.
        category: auth | home | quest | ride | feed | profile | settings | infra (빈 문자열이면 전체)
        status: PLANNED | IN_PROGRESS | DONE | DEFERRED (빈 문자열이면 전체)"""
        async with AsyncSessionLocal() as db:
            stmt = select(DevFeature)
            if category:
                stmt = stmt.where(DevFeature.category == category)
            if status and status in _VALID_FEATURE_STATUS:
                stmt = stmt.where(DevFeature.status == status)
            stmt = stmt.order_by(DevFeature.category, DevFeature.sort_order, DevFeature.id)
            rows = (await db.execute(stmt)).scalars().all()
            return [
                {
                    "id": f.id,
                    "category": f.category,
                    "name": f.name,
                    "description": f.description,
                    "status": f.status,
                    "sort_order": f.sort_order,
                }
                for f in rows
            ]

    @mcp.tool()
    async def create_feature(
        category: str,
        name: str,
        status: str = "PLANNED",
        description: str = "",
        sort_order: int = 0,
    ) -> dict:
        """신규 Feature 등록.
        category: auth | home | quest | ride | feed | profile | settings | infra
        status: PLANNED | IN_PROGRESS | DONE | DEFERRED"""
        if status not in _VALID_FEATURE_STATUS:
            return {"ok": False, "detail": f"Invalid status: {status}"}
        async with AsyncSessionLocal() as db:
            row = DevFeature(
                category=category,
                name=name,
                status=status,
                description=description or None,
                sort_order=sort_order,
            )
            db.add(row)
            await db.commit()
            await db.refresh(row)
            return {"id": row.id, "category": row.category, "name": row.name, "status": row.status}

    @mcp.tool()
    async def update_feature(
        feature_id: int,
        status: str = "",
        name: str = "",
        category: str = "",
        description: str = "",
    ) -> dict:
        """Feature 상태/이름/카테고리/설명 갱신. 빈 문자열 파라미터는 변경하지 않는다.
        status 전이: PLANNED → IN_PROGRESS → DONE (또는 DEFERRED)
        착수 시 IN_PROGRESS, 완료 후 DONE으로 설정."""
        async with AsyncSessionLocal() as db:
            row = await db.get(DevFeature, feature_id)
            if row is None:
                return {"ok": False, "detail": "Feature not found"}
            if status:
                if status not in _VALID_FEATURE_STATUS:
                    return {"ok": False, "detail": f"Invalid status: {status}"}
                row.status = status
            if name:
                row.name = name
            if category:
                row.category = category
            if description:
                row.description = description
            row.updated_at = datetime.now(UTC)
            await db.commit()
            await db.refresh(row)
            return {"id": row.id, "category": row.category, "name": row.name, "status": row.status}

    @mcp.tool()
    async def delete_feature(feature_id: int) -> dict:
        """Feature 삭제. 연결된 Todo의 feature_id는 NULL로 처리된다."""
        async with AsyncSessionLocal() as db:
            row = await db.get(DevFeature, feature_id)
            if row is None:
                return {"ok": False, "detail": "Feature not found"}
            await db.delete(row)
            await db.commit()
            return {"ok": True}

    @mcp.tool()
    async def list_todos(
        status: str = "",
        priority: str = "",
        feature_id: int = 0,
    ) -> list[dict]:
        """Todo 목록 조회.
        status: TODO | IN_PROGRESS | DONE | BLOCKED (빈 문자열이면 전체)
        priority: LOW | MEDIUM | HIGH | URGENT (빈 문자열이면 전체)
        feature_id: 연결된 feature ID로 필터 (0이면 전체)"""
        async with AsyncSessionLocal() as db:
            stmt = select(DevTodo)
            if status and status in _VALID_TODO_STATUS:
                stmt = stmt.where(DevTodo.status == status)
            if priority and priority in _VALID_TODO_PRIORITY:
                stmt = stmt.where(DevTodo.priority == priority)
            if feature_id:
                stmt = stmt.where(DevTodo.feature_id == feature_id)
            stmt = stmt.order_by(DevTodo.status, DevTodo.priority.desc(), DevTodo.created_at.desc())
            rows = (await db.execute(stmt)).scalars().all()
            return [
                {
                    "id": t.id,
                    "title": t.title,
                    "priority": t.priority,
                    "status": t.status,
                    "feature_id": t.feature_id,
                    "due_date": str(t.due_date) if t.due_date else None,
                    "description": t.description,
                }
                for t in rows
            ]

    @mcp.tool()
    async def create_todo(
        title: str,
        priority: str = "MEDIUM",
        status: str = "TODO",
        feature_id: int = 0,
        description: str = "",
    ) -> dict:
        """신규 Todo 등록.
        priority: LOW | MEDIUM | HIGH | URGENT
        status: TODO | IN_PROGRESS | DONE | BLOCKED
        feature_id: 연결할 Feature ID (0이면 미연결)"""
        if priority not in _VALID_TODO_PRIORITY:
            return {"ok": False, "detail": f"Invalid priority: {priority}"}
        if status not in _VALID_TODO_STATUS:
            return {"ok": False, "detail": f"Invalid status: {status}"}
        async with AsyncSessionLocal() as db:
            row = DevTodo(
                title=title,
                priority=priority,
                status=status,
                feature_id=feature_id or None,
                description=description or None,
            )
            db.add(row)
            await db.commit()
            await db.refresh(row)
            return {"id": row.id, "title": row.title, "priority": row.priority, "status": row.status}

    @mcp.tool()
    async def update_todo(
        todo_id: int,
        status: str = "",
        priority: str = "",
        title: str = "",
        description: str = "",
    ) -> dict:
        """Todo 상태/우선순위/제목/설명 갱신. 빈 문자열 파라미터는 변경하지 않는다.
        status 전이: TODO → IN_PROGRESS → DONE (또는 BLOCKED)"""
        async with AsyncSessionLocal() as db:
            row = await db.get(DevTodo, todo_id)
            if row is None:
                return {"ok": False, "detail": "Todo not found"}
            if status:
                if status not in _VALID_TODO_STATUS:
                    return {"ok": False, "detail": f"Invalid status: {status}"}
                row.status = status
            if priority:
                if priority not in _VALID_TODO_PRIORITY:
                    return {"ok": False, "detail": f"Invalid priority: {priority}"}
                row.priority = priority
            if title:
                row.title = title
            if description:
                row.description = description
            row.updated_at = datetime.now(UTC)
            await db.commit()
            await db.refresh(row)
            return {"id": row.id, "title": row.title, "priority": row.priority, "status": row.status}

    @mcp.tool()
    async def delete_todo(todo_id: int) -> dict:
        """Todo 삭제."""
        async with AsyncSessionLocal() as db:
            row = await db.get(DevTodo, todo_id)
            if row is None:
                return {"ok": False, "detail": "Todo not found"}
            await db.delete(row)
            await db.commit()
            return {"ok": True}
