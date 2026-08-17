"""신고 큐 적체 경보 (정본 §5 #3, D-11) — PENDING 24시간 초과 신고가 있으면 기존
`OPS_ALERT_WEBHOOK_URL` 웹훅(services/ops_alerts.send_ops_alert)으로 1회 경보한다.

D-11 = 우선순위 상승만. 이 배치는 **읽기 전용 감시**다 — 어떤 신고/매물/유저 상태도
바꾸지 않는다(자동 숨김·자동 조치는 범위 밖, 오탐 시 정상 매물 차단 위험).

스팸 방지: 새 채널을 만들지 않고 send_ops_alert 의 기존 key+cooldown_s 쓰로틀을 그대로
재사용한다 — 같은 key("report_backlog")로 24시간 이내 재알림은 억제된다(적체 상황이
계속돼도 하루 1회 상한, 운영자가 알림을 무시하게 되는 것을 방지).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from ..database import AsyncSessionLocal
from ..models import Report
from ..services.ops_alerts import send_ops_alert

_BACKLOG_THRESHOLD_HOURS = 24
_ALERT_COOLDOWN_S = 24 * 60 * 60  # 하루 1회 상한


async def check_report_backlog() -> int:
    """PENDING 상태로 24시간 초과 대기 중인 신고 건수를 세어, 있으면 경보한다.

    반환값은 적체 건수(테스트/로그 확인용) — 이 함수는 Report 행을 전혀 write 하지 않는다.
    """
    cutoff = datetime.now(UTC) - timedelta(hours=_BACKLOG_THRESHOLD_HOURS)
    async with AsyncSessionLocal() as db:
        count = (
            await db.execute(
                select(func.count()).select_from(Report).where(Report.status == "PENDING", Report.created_at < cutoff)
            )
        ).scalar_one()

    if count > 0:
        await send_ops_alert(
            f"[신고 큐 적체] PENDING {_BACKLOG_THRESHOLD_HOURS}시간 초과 신고 {count}건",
            key="report_backlog",
            cooldown_s=_ALERT_COOLDOWN_S,
        )
    return count
