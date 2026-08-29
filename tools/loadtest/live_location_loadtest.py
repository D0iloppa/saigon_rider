"""실시간 위치공유 채널(Live Location Channel) Phase 2 부하 테스트.

SoT: ai-docs/task/active/260829_live_location_channel_task.md §8 Phase 2 완료기준 5.
대상: 로컬 dev 스택(http://localhost:18090/api/bff)만. 운영 절대 금지.

시나리오:
  1. dev-login(POST /auth/dev-login)으로 사용자 20명 생성(phone 접두사 __dev_lcload).
  2. 사용자 0이 팔로우해야 그룹 생성이 가능하므로(require_invite_eligible), user_follows 를
     DB 로 직접 시드한다(측정 대상이 아닌 순수 테스트 셋업 — API 측정 경로가 아님).
  3. 그룹 대화 1개 생성(POST /dm/conversations/group) + 목적지 설정하며 채널 생성(사용자 0),
     나머지 19명 join.
  4. 목적지(벤탄시장 10.7769,106.7009) 반경 1~4km 무작위 시작좌표 → 매 10초 목적지 방향으로
     ~40m 이동한 좌표를 PUT .../location-channel/members/me/location (accuracy 15). 5분(30 tick).
  5. 측정: PUT 응답 p50/p95/max/오류, `eta` SSE 이벤트 수신 수(사용자 0 구독), routing_engine
     호출 수/레이턴시(bff 로그의 `location_eta engine call:` 라인 집계).
  6. 종료 후 dev 데이터 전부 삭제, count 0 확인.

Usage:
    python3 tools/loadtest/live_location_loadtest.py
"""

from __future__ import annotations

import asyncio
import json
import math
import random
import re
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone

UTC = timezone.utc

import httpx

BASE = "http://localhost:18090/api/bff"
N_USERS = 20
TICK_SEC = 10
N_TICKS = 30  # 5분
STEP_M = 40.0
DEST_LAT, DEST_LNG = 10.7769, 106.7009  # 벤탄시장
CONSENT_VERSION = "2026-08-29-v2"
PHONE_PREFIX = "lcload"  # __dev_lcload_N 으로 저장됨
_LAT_DEG_M = 111_320.0

DB_CONTAINER = "saigon_db"
DB_USER = "wellconn"
DB_NAME = "saigon_rider"
BFF_CONTAINER = "saigon_bff"
ROUTING_CONTAINER = "saigon_routing_engine"


def _psql(sql: str) -> str:
    result = subprocess.run(
        ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def _docker_stats(container: str) -> str:
    result = subprocess.run(
        ["docker", "stats", "--no-stream", "--format", "{{.MemUsage}}\t{{.CPUPerc}}", container],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def random_start(dest_lat: float, dest_lng: float, min_km: float, max_km: float) -> tuple[float, float]:
    bearing = random.uniform(0, 2 * math.pi)
    dist_m = random.uniform(min_km * 1000, max_km * 1000)
    dlat = dist_m * math.cos(bearing) / _LAT_DEG_M
    dlng = dist_m * math.sin(bearing) / (_LAT_DEG_M * max(math.cos(math.radians(dest_lat)), 0.01))
    return dest_lat + dlat, dest_lng + dlng


def move_towards(lat: float, lng: float, dest_lat: float, dest_lng: float, step_m: float) -> tuple[float, float]:
    dlat_m = (dest_lat - lat) * _LAT_DEG_M
    dlng_m = (dest_lng - lng) * _LAT_DEG_M * max(math.cos(math.radians(lat)), 0.01)
    dist = math.hypot(dlat_m, dlng_m)
    if dist <= step_m or dist == 0:
        return dest_lat, dest_lng
    frac = step_m / dist
    return lat + (dest_lat - lat) * frac, lng + (dest_lng - lng) * frac


class DevUser:
    def __init__(self, idx: int, user_id: str, session_token: str):
        self.idx = idx
        self.user_id = user_id
        self.session_token = session_token
        self.lat, self.lng = random_start(DEST_LAT, DEST_LNG, 1.0, 4.0)
        self.headers = {"X-User-Id": user_id, "X-Session-Token": session_token, "Content-Type": "application/json"}


async def dev_login(client: httpx.AsyncClient, phone: str) -> tuple[str, str]:
    resp = await client.post(f"{BASE}/auth/dev-login", json={"phone": phone})
    resp.raise_for_status()
    body = resp.json()
    return str(body["user"]["id"]), body["session_token"]


async def setup_users(client: httpx.AsyncClient) -> list[DevUser]:
    users: list[DevUser] = []
    for i in range(N_USERS):
        uid, token = await dev_login(client, f"{PHONE_PREFIX}_{i}")
        users.append(DevUser(i, uid, token))
    return users


def seed_follows(creator: DevUser, others: list[DevUser]) -> None:
    """그룹 생성 자격(require_invite_eligible)을 위해 creator→others 팔로우를 DB 로 직접 시드.

    측정 대상 API 경로가 아니라 순수 테스트 셋업이라 HTTP 대신 직접 SQL 로 처리한다.
    """
    values = ", ".join(f"('{creator.user_id}'::uuid, '{o.user_id}'::uuid, now())" for o in others)
    _psql(f"INSERT INTO user_follows (follower_id, following_id, created_at) VALUES {values} ON CONFLICT DO NOTHING;")


async def create_group_and_channel(client: httpx.AsyncClient, creator: DevUser, others: list[DevUser]) -> str:
    resp = await client.post(
        f"{BASE}/dm/conversations/group",
        json={"title": "부하테스트방", "member_ids": [o.user_id for o in others]},
        headers=creator.headers,
    )
    resp.raise_for_status()
    conv_id = resp.json()["id"]

    resp = await client.post(
        f"{BASE}/dm/conversations/{conv_id}/location-channel",
        json={
            "consent_version": CONSENT_VERSION,
            "dest": {"lat": DEST_LAT, "lng": DEST_LNG, "name": "벤탄시장(부하테스트)"},
        },
        headers=creator.headers,
    )
    resp.raise_for_status()

    for o in others:
        resp = await client.post(
            f"{BASE}/dm/conversations/{conv_id}/location-channel",
            json={"consent_version": CONSENT_VERSION},
            headers=o.headers,
        )
        resp.raise_for_status()
    return conv_id


async def ping_loop(
    client: httpx.AsyncClient, conv_id: str, user: DevUser, start_time: float, results: list[dict]
) -> None:
    url = f"{BASE}/dm/conversations/{conv_id}/location-channel/members/me/location"
    for tick in range(N_TICKS):
        target = start_time + tick * TICK_SEC
        now = time.monotonic()
        if target > now:
            await asyncio.sleep(target - now)
        user.lat, user.lng = move_towards(user.lat, user.lng, DEST_LAT, DEST_LNG, STEP_M)
        t0 = time.monotonic()
        try:
            resp = await client.put(
                url,
                json={"lat": user.lat, "lng": user.lng, "accuracy_m": 15},
                headers=user.headers,
            )
            elapsed = time.monotonic() - t0
            results.append({"user": user.idx, "tick": tick, "elapsed_s": elapsed, "status": resp.status_code})
        except Exception as exc:  # noqa: BLE001 - 부하테스트 측정 목적, 실패도 결과에 기록
            elapsed = time.monotonic() - t0
            results.append({"user": user.idx, "tick": tick, "elapsed_s": elapsed, "status": None, "error": str(exc)})


async def eta_event_counter(base_client_headers: dict, conv_id: str, stop_at: float, counts: dict) -> None:
    url = f"{BASE}/dm/conversations/{conv_id}/location-channel/events"
    counts["eta"] = 0
    counts["location"] = 0
    counts["other"] = 0
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("GET", url, headers=base_client_headers) as resp:
                async for line in resp.aiter_lines():
                    if time.monotonic() > stop_at:
                        break
                    if not line.startswith("data: "):
                        continue
                    try:
                        event = json.loads(line[len("data: ") :])
                    except json.JSONDecodeError:
                        continue
                    etype = event.get("type")
                    if etype == "eta":
                        counts["eta"] += 1
                    elif etype == "location":
                        counts["location"] += 1
                    else:
                        counts["other"] += 1
    except Exception as exc:  # noqa: BLE001
        counts["listener_error"] = str(exc)


async def leave_all(client: httpx.AsyncClient, conv_id: str, users: list[DevUser]) -> None:
    for u in users:
        try:
            await client.delete(f"{BASE}/dm/conversations/{conv_id}/location-channel/members/me", headers=u.headers)
        except Exception:  # noqa: BLE001
            pass


def cleanup_dev_data(conv_id: str) -> dict:
    _psql(f"DELETE FROM users WHERE phone LIKE '__dev_{PHONE_PREFIX}%';")
    _psql(f"DELETE FROM dm_conversations WHERE id = '{conv_id}'::uuid;")
    counts = {
        "users": _psql(f"SELECT count(*) FROM users WHERE phone LIKE '__dev_{PHONE_PREFIX}%';"),
        "dm_conversations": _psql(f"SELECT count(*) FROM dm_conversations WHERE id = '{conv_id}'::uuid;"),
        "location_channel_members": _psql(
            f"SELECT count(*) FROM location_channel_members lcm "
            f"JOIN location_channels lc ON lc.id = lcm.channel_id WHERE lc.conversation_id = '{conv_id}'::uuid;"
        ),
        "location_channels": _psql(f"SELECT count(*) FROM location_channels WHERE conversation_id = '{conv_id}'::uuid;"),
        "user_oauth_identities": _psql(
            f"SELECT count(*) FROM user_oauth_identities WHERE provider_user_id LIKE '__dev_{PHONE_PREFIX}%';"
        ),
    }
    return counts


def parse_bff_engine_logs(since_iso: str) -> list[dict]:
    result = subprocess.run(
        ["docker", "logs", "--since", since_iso, BFF_CONTAINER],
        capture_output=True,
        text=True,
    )
    pattern = re.compile(r"location_eta engine call: mode=(\w+) n=(\d+) elapsed_ms=([\d.]+)")
    calls = []
    for line in (result.stdout + result.stderr).splitlines():
        m = pattern.search(line)
        if m:
            calls.append({"mode": m.group(1), "n": int(m.group(2)), "elapsed_ms": float(m.group(3))})
    return calls


def percentile(data: list[float], p: float) -> float:
    if not data:
        return float("nan")
    s = sorted(data)
    k = (len(s) - 1) * p
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return s[int(k)]
    return s[f] + (s[c] - s[f]) * (k - f)


async def main() -> None:
    print(f"[{datetime.now(UTC).isoformat()}] 부하테스트 시작 — 참가자 {N_USERS}명 x {N_TICKS} ticks x {TICK_SEC}s")
    stats_before = _docker_stats(ROUTING_CONTAINER)
    since_iso = datetime.now(UTC).isoformat()

    async with httpx.AsyncClient(timeout=15.0) as client:
        users = await setup_users(client)
        creator, others = users[0], users[1:]
        seed_follows(creator, others)
        conv_id = await create_group_and_channel(client, creator, others)
        print(f"채널 준비 완료: conversation_id={conv_id}")

        ping_results: list[dict] = []
        eta_counts: dict = {}
        start_time = time.monotonic()
        stop_at = start_time + N_TICKS * TICK_SEC + 20

        eta_task = asyncio.create_task(eta_event_counter(creator.headers, conv_id, stop_at, eta_counts))
        ping_tasks = [
            asyncio.create_task(ping_loop(client, conv_id, u, start_time, ping_results)) for u in users
        ]
        await asyncio.gather(*ping_tasks)
        await asyncio.sleep(5)  # 마지막 tick 의 eta 백그라운드 계산이 방송될 시간
        eta_task.cancel()
        try:
            await eta_task
        except asyncio.CancelledError:
            pass

        await leave_all(client, conv_id, users)

    stats_after = _docker_stats(ROUTING_CONTAINER)
    engine_calls = parse_bff_engine_logs(since_iso)
    cleanup_counts = cleanup_dev_data(conv_id)

    elapsed_ok = [r["elapsed_s"] for r in ping_results if r["status"] == 200]
    errors = [r for r in ping_results if r["status"] != 200]

    summary = {
        "conversation_id": conv_id,
        "n_users": N_USERS,
        "n_ticks": N_TICKS,
        "tick_sec": TICK_SEC,
        "ping": {
            "count_total": len(ping_results),
            "count_ok": len(elapsed_ok),
            "count_error": len(errors),
            "p50_ms": round(percentile(elapsed_ok, 0.50) * 1000, 1) if elapsed_ok else None,
            "p95_ms": round(percentile(elapsed_ok, 0.95) * 1000, 1) if elapsed_ok else None,
            "max_ms": round(max(elapsed_ok) * 1000, 1) if elapsed_ok else None,
            "errors_sample": errors[:5],
        },
        "eta_events_received": eta_counts.get("eta"),
        "location_events_received": eta_counts.get("location"),
        "eta_listener_error": eta_counts.get("listener_error"),
        "routing_engine_calls": {
            "count": len(engine_calls),
            "expected_upper_bound": (N_TICKS * TICK_SEC) // 60 * 1 + 1,  # 채널당 60초 1회 이하 근사
            "by_mode": {
                mode: len([c for c in engine_calls if c["mode"] == mode]) for mode in {"matrix", "route"}
            },
            "elapsed_ms_p50": round(percentile([c["elapsed_ms"] for c in engine_calls], 0.50), 1)
            if engine_calls
            else None,
            "elapsed_ms_p95": round(percentile([c["elapsed_ms"] for c in engine_calls], 0.95), 1)
            if engine_calls
            else None,
            "elapsed_ms_max": round(max((c["elapsed_ms"] for c in engine_calls), default=0), 1),
        },
        "routing_engine_container_stats": {"before": stats_before, "after": stats_after},
        "cleanup_counts_expect_all_zero": cleanup_counts,
    }

    print(json.dumps(summary, ensure_ascii=False, indent=2))

    print("\n=== 사람이 읽는 요약 ===")
    print(f"PUT location: 총 {summary['ping']['count_total']}건, 성공 {summary['ping']['count_ok']}, 오류 {summary['ping']['count_error']}")
    print(f"  p50={summary['ping']['p50_ms']}ms p95={summary['ping']['p95_ms']}ms max={summary['ping']['max_ms']}ms")
    print(f"routing_engine 호출: {summary['routing_engine_calls']['count']}회 (기대 상한 근사 {summary['routing_engine_calls']['expected_upper_bound']})")
    print(f"eta 이벤트 수신: {summary['eta_events_received']}")
    print(f"routing_engine 컨테이너: before={stats_before} / after={stats_after}")
    print(f"정리 후 카운트(모두 0 기대): {cleanup_counts}")

    gate_p95_ok = summary["ping"]["p95_ms"] is not None and summary["ping"]["p95_ms"] < 1000
    gate_errors_ok = summary["ping"]["count_error"] == 0
    print(f"\n판정: p95<1000ms {'PASS' if gate_p95_ok else 'FAIL'} / 오류 0건 {'PASS' if gate_errors_ok else 'FAIL'}")


if __name__ == "__main__":
    asyncio.run(main())
