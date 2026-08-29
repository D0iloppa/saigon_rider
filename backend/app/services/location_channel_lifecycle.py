"""실시간 위치공유 채널 자동종료 판정 — 순수함수.

SoT: ai-docs/task/active/260829_live_location_channel_task.md §7-2, API 계약 문단.
DB·시각 조회에 의존하지 않고 인자로 받은 상태만으로 판정해 단위테스트가 쉽다.
"""

from datetime import datetime, timedelta

# 전원 도착 후 자동종료까지의 유예 (§7-2).
ALL_ARRIVED_GRACE = timedelta(minutes=15)

# 채널 생성 직후 "창설자 혼자, 첫 join 대기 중"인 창 — 이 창 안에서는 활성 멤버 1명이어도 종료하지 않는다.
JOIN_GRACE_WINDOW = timedelta(minutes=10)


def resolve_end_reason(channel, active_members, now: datetime) -> str | None:
    """자동종료 3케이스를 판정한다.

    Args:
        channel: `expires_at`, `created_at`, `created_by` 를 가진 채널 객체.
        active_members: 활성(left_at IS NULL) 멤버 객체 목록 — 각 `user_id`, `arrived_at` 보유.
        now: 판정 시각(timezone-aware).

    Returns:
        None | 'ttl' | 'all_arrived' | 'members_left'
    """
    if now >= channel.expires_at:
        return "ttl"

    if active_members and all(m.arrived_at is not None for m in active_members):
        latest_arrival = max(m.arrived_at for m in active_members)
        if now >= latest_arrival + ALL_ARRIVED_GRACE:
            return "all_arrived"

    if len(active_members) <= 1:
        if (
            len(active_members) == 1
            and active_members[0].user_id == channel.created_by
            and (now - channel.created_at) < JOIN_GRACE_WINDOW
        ):
            return None
        return "members_left"

    return None
