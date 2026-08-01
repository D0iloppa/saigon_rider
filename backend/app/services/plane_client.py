"""Plane CE API client — dev_context 단일 SoT."""

from __future__ import annotations

import logging
import os
import re
import time

import httpx

logger = logging.getLogger(__name__)

_PLANE_URL = os.getenv("PLANE_URL", "https://plane.doil.me")
_PLANE_API_KEY = os.getenv("PLANE_API_KEY", "")
_PLANE_WORKSPACE = os.getenv("PLANE_WORKSPACE", "doil")
_PLANE_PROJECT_ID = os.getenv("PLANE_PROJECT_ID", "")

_BASE = f"{_PLANE_URL}/api/v1/workspaces/{_PLANE_WORKSPACE}/projects/{_PLANE_PROJECT_ID}"

# ── State mapping ──────────────────────────────────────────────

STATE_IDS: dict[str, str] = {
    "DONE": "683135f5-6fb2-4996-8275-8bad611e12fa",
    "IN_PROGRESS": "0d15841e-63b3-434f-b088-ba63ee9b1127",
    "PLANNED": "449a54e9-ad3e-421f-a3e1-6e46fd5d59e7",
    "TODO": "824cd235-9fa2-4807-be99-017ee6171b96",
    "DEFERRED": "d8d2f3de-af23-492d-9efa-5ccfa54cc5ce",
    "BLOCKED": "824cd235-9fa2-4807-be99-017ee6171b96",
}

_STATE_ID_TO_NAME = {
    "683135f5-6fb2-4996-8275-8bad611e12fa": "DONE",
    "0d15841e-63b3-434f-b088-ba63ee9b1127": "IN_PROGRESS",
    "449a54e9-ad3e-421f-a3e1-6e46fd5d59e7": "PLANNED",
    "824cd235-9fa2-4807-be99-017ee6171b96": "TODO",
    "d8d2f3de-af23-492d-9efa-5ccfa54cc5ce": "DEFERRED",
}

# Context KV: 이모지 ↔ Plane State
_CTX_EMOJI_TO_STATE = {"🔧": "IN_PROGRESS", "✅": "DONE", "⏸": "PLANNED", "❌": "DEFERRED"}
_CTX_STATE_TO_EMOJI = {v: k for k, v in _CTX_EMOJI_TO_STATE.items()}

PRIORITY_MAP = {"urgent": "URGENT", "high": "HIGH", "medium": "MEDIUM", "low": "LOW", "none": "NONE"}
PRIORITY_MAP_REV = {v: k for k, v in PRIORITY_MAP.items()}

# label cache: populated on first call
_labels: dict[str, str] = {}  # id → name
_labels_rev: dict[str, str] = {}  # name → id


# ── TTL Cache ──────────────────────────────────────────────────

_CACHE_TTL = 30  # seconds

_cache: dict[str, tuple[float, object]] = {}


def _cache_get(key: str) -> object | None:
    entry = _cache.get(key)
    if entry and time.monotonic() - entry[0] < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, value: object) -> None:
    _cache[key] = (time.monotonic(), value)


def _cache_invalidate(prefix: str = "") -> None:
    if not prefix:
        _cache.clear()
    else:
        for k in [k for k in _cache if k.startswith(prefix)]:
            del _cache[k]


# ── Internal helpers ───────────────────────────────────────────


def _headers() -> dict[str, str]:
    return {"x-api-key": _PLANE_API_KEY, "Content-Type": "application/json"}


async def _ensure_labels(client: httpx.AsyncClient) -> None:
    if _labels:
        return
    resp = await client.get(f"{_BASE}/labels/", headers=_headers())
    resp.raise_for_status()
    for lbl in resp.json().get("results", []):
        _labels[lbl["id"]] = lbl["name"]
        _labels_rev[lbl["name"]] = lbl["id"]


_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(html: str) -> str | None:
    text = _TAG_RE.sub("", html).strip()
    return text or None


def _state_to_status(state_id: str) -> str:
    return _STATE_ID_TO_NAME.get(state_id, "TODO")


def _label_to_category(label_ids: list[str]) -> str:
    for lid in label_ids:
        name = _labels.get(lid)
        if name:
            return name
    return ""


def _issue_to_feature(issue: dict, idx: int = 0) -> dict:
    return {
        "id": issue["sequence_id"],
        "category": _label_to_category(issue.get("labels", [])),
        "name": issue["name"],
        "description": _strip_html(issue.get("description_html", "")),
        "status": _state_to_status(issue["state"]),
        "sort_order": int(issue.get("sort_order", 0) or idx),
        "meta": None,
        "created_at": issue["created_at"],
        "updated_at": issue["updated_at"],
        "_plane_id": issue["id"],
    }


def _issue_to_todo(issue: dict) -> dict:
    feat = _issue_to_feature(issue)
    return {
        "id": issue["sequence_id"],
        "title": issue["name"],
        "description": feat["description"],
        "priority": PRIORITY_MAP.get(issue.get("priority", "none"), "MEDIUM"),
        "status": feat["status"],
        "feature_id": None,
        "feature": {
            "id": feat["id"],
            "category": feat["category"],
            "name": feat["name"],
            "description": None,
            "status": feat["status"],
            "sort_order": 0,
            "meta": None,
            "created_at": feat["created_at"],
            "updated_at": feat["updated_at"],
        }
        if feat["category"]
        else None,
        "due_date": issue.get("target_date"),
        "meta": None,
        "created_at": issue["created_at"],
        "updated_at": issue["updated_at"],
        "_plane_id": issue["id"],
    }


def _issue_to_context(issue: dict) -> dict:
    state_name = _state_to_status(issue["state"])
    return {
        "key": issue["name"],
        "value": _strip_html(issue.get("description_html", "")) or "",
        "status": _CTX_STATE_TO_EMOJI.get(state_name, "⏸"),
        "updated_at": issue["updated_at"],
        "_plane_id": issue["id"],
    }


# ── Raw issues (cached) ───────────────────────────────────────


async def _fetch_all_issues(per_page: int = 200) -> list[dict]:
    cached = _cache_get("all_issues")
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=15) as client:
        await _ensure_labels(client)
        resp = await client.get(f"{_BASE}/issues/", headers=_headers(), params={"per_page": str(per_page)})
        resp.raise_for_status()
        issues = resp.json().get("results", [])

    _cache_set("all_issues", issues)
    return issues


def _split_issues(issues: list[dict]) -> tuple[list[dict], list[dict]]:
    """(non-ctx issues, ctx issues) 로 분리."""
    ctx_lid = _labels_rev.get("ctx")
    if not ctx_lid:
        return issues, []
    ctx = [i for i in issues if ctx_lid in i.get("labels", [])]
    rest = [i for i in issues if ctx_lid not in i.get("labels", [])]
    return rest, ctx


# ── Public API: Issues ─────────────────────────────────────────


async def list_issues(
    *,
    label: str | None = None,
    state: str | None = None,
    priority: str | None = None,
    per_page: int = 200,
) -> list[dict]:
    all_issues = await _fetch_all_issues(per_page)
    issues, _ = _split_issues(all_issues)

    if state and state in STATE_IDS:
        sid = STATE_IDS[state]
        issues = [i for i in issues if i["state"] == sid]
    if priority:
        p = PRIORITY_MAP_REV.get(priority, priority).lower()
        issues = [i for i in issues if i.get("priority") == p]
    if label and label in _labels_rev:
        lid = _labels_rev[label]
        issues = [i for i in issues if lid in i.get("labels", [])]

    return issues


# ── Public API: Context KV ─────────────────────────────────────


async def list_context() -> list[dict]:
    all_issues = await _fetch_all_issues()
    _, ctx_issues = _split_issues(all_issues)
    return [_issue_to_context(i) for i in sorted(ctx_issues, key=lambda i: i["name"])]


async def get_context(key: str) -> dict | None:
    items = await list_context()
    for c in items:
        if c["key"] == key:
            return c
    return None


async def upsert_context(key: str, value: str, status: str = "⏸") -> dict:
    plane_state = _CTX_EMOJI_TO_STATE.get(status, "PLANNED")

    all_issues = await _fetch_all_issues()
    _, ctx_issues = _split_issues(all_issues)
    existing = next((i for i in ctx_issues if i["name"] == key), None)

    if existing:
        result = await update_issue(existing["id"], name=key, description=value, status=plane_state)
        _cache_invalidate()
        return _issue_to_context(result)

    issue = await create_issue(key, description=value, state=plane_state, label="ctx")
    _cache_invalidate()
    return _issue_to_context(issue)


async def delete_context(key: str) -> bool:
    all_issues = await _fetch_all_issues()
    _, ctx_issues = _split_issues(all_issues)
    existing = next((i for i in ctx_issues if i["name"] == key), None)
    if not existing:
        return False
    await delete_issue(existing["id"])
    _cache_invalidate()
    return True


async def cycle_context_status(key: str) -> dict | None:
    cycle = ["🔧", "✅", "⏸", "❌"]
    ctx = await get_context(key)
    if not ctx:
        return None
    idx = cycle.index(ctx["status"]) if ctx["status"] in cycle else -1
    next_status = cycle[(idx + 1) % len(cycle)]
    return await upsert_context(key, ctx["value"], next_status)


# ── Public API: Features ───────────────────────────────────────


async def list_features(
    category: str = "",
    status: str = "",
    page: int = 1,
    size: int = 50,
) -> dict:
    issues = await list_issues(label=category or None, state=status or None, per_page=200)
    features = [_issue_to_feature(i, idx) for idx, i in enumerate(issues)]
    if category:
        features = [f for f in features if f["category"] == category]
    if status:
        features = [f for f in features if f["status"] == status]
    features.sort(key=lambda f: (f["category"], f["sort_order"]))
    total = len(features)
    start = (page - 1) * size
    return {"items": features[start : start + size], "total": total, "page": page, "size": size}


async def list_todos(
    status: str = "",
    priority: str = "",
    page: int = 1,
    size: int = 50,
) -> dict:
    issues = await list_issues(state=status or None, priority=priority or None, per_page=200)
    todos = [_issue_to_todo(i) for i in issues]
    if status:
        todos = [t for t in todos if t["status"] == status]
    if priority:
        todos = [t for t in todos if t["priority"] == priority]
    todos.sort(
        key=lambda t: (
            t["status"],
            -(
                ["LOW", "MEDIUM", "HIGH", "URGENT"].index(t["priority"])
                if t["priority"] in ["LOW", "MEDIUM", "HIGH", "URGENT"]
                else 0
            ),
        )
    )
    total = len(todos)
    start = (page - 1) * size
    return {"items": todos[start : start + size], "total": total, "page": page, "size": size}


async def get_summary() -> dict:
    issues = await list_issues(per_page=200)
    feature_counts: dict[str, int] = {}
    todo_counts: dict[str, int] = {}
    for i in issues:
        st = _state_to_status(i["state"])
        feature_counts[st] = feature_counts.get(st, 0) + 1
        todo_st = st if st != "PLANNED" else "TODO"
        if st == "DEFERRED":
            todo_st = "BLOCKED"
        todo_counts[todo_st] = todo_counts.get(todo_st, 0) + 1
    for s in ("PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"):
        feature_counts.setdefault(s, 0)
    for s in ("TODO", "IN_PROGRESS", "DONE", "BLOCKED"):
        todo_counts.setdefault(s, 0)
    return {"features": feature_counts, "todos": todo_counts}


# ── Public API: Issue CRUD ─────────────────────────────────────


async def create_issue(
    name: str,
    *,
    description: str | None = None,
    state: str = "TODO",
    priority: str = "MEDIUM",
    label: str | None = None,
    due_date: str | None = None,
    parent: str | None = None,
) -> dict:
    body: dict = {
        "name": name,
        "state": STATE_IDS.get(state, STATE_IDS["TODO"]),
        "priority": PRIORITY_MAP_REV.get(priority, "medium").lower(),
    }
    if description:
        body["description_html"] = f"<p>{description}</p>"
    if due_date:
        body["target_date"] = due_date
    if parent:
        body["parent"] = parent

    async with httpx.AsyncClient(timeout=15) as client:
        await _ensure_labels(client)
        if label and label in _labels_rev:
            body["labels"] = [_labels_rev[label]]
        resp = await client.post(f"{_BASE}/issues/", headers=_headers(), json=body)
        resp.raise_for_status()
        issue = resp.json()
    _cache_invalidate()
    return issue


async def update_issue(plane_id: str, **updates) -> dict:
    body: dict = {}
    if "name" in updates:
        body["name"] = updates["name"]
    if "description" in updates:
        body["description_html"] = f"<p>{updates['description']}</p>" if updates["description"] else ""
    if "status" in updates and updates["status"] in STATE_IDS:
        body["state"] = STATE_IDS[updates["status"]]
    if "priority" in updates:
        body["priority"] = PRIORITY_MAP_REV.get(updates["priority"], "medium").lower()
    if "category" in updates:
        async with httpx.AsyncClient(timeout=15) as client:
            await _ensure_labels(client)
        if updates["category"] in _labels_rev:
            body["labels"] = [_labels_rev[updates["category"]]]
    if "due_date" in updates:
        body["target_date"] = updates["due_date"]
    if not body:
        return {}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(f"{_BASE}/issues/{plane_id}/", headers=_headers(), json=body)
        resp.raise_for_status()
        _cache_invalidate()
        return resp.json()


async def delete_issue(plane_id: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(f"{_BASE}/issues/{plane_id}/", headers=_headers())
        resp.raise_for_status()
    _cache_invalidate()


async def get_issue_by_sequence_id(seq_id: int) -> dict | None:
    issues = await list_issues(per_page=200)
    for i in issues:
        if i.get("sequence_id") == seq_id:
            return i
    return None


async def get_categories() -> list[str]:
    async with httpx.AsyncClient(timeout=15) as client:
        await _ensure_labels(client)
    return sorted(v for v in _labels.values() if v != "ctx")


async def cycle_feature_status(plane_id: str, current_status: str) -> str:
    cycle = ["PLANNED", "IN_PROGRESS", "DONE", "DEFERRED"]
    idx = cycle.index(current_status) if current_status in cycle else 0
    next_status = cycle[(idx + 1) % len(cycle)]
    await update_issue(plane_id, status=next_status)
    return next_status


async def cycle_todo_status(plane_id: str, current_status: str) -> str:
    cycle = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]
    idx = cycle.index(current_status) if current_status in cycle else 0
    next_status = cycle[(idx + 1) % len(cycle)]
    await update_issue(plane_id, status=next_status)
    return next_status
