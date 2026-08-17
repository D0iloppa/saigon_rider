"""퍼널 계측 최소 스키마 — 자체 이벤트 테이블 적재 헬퍼 (정본 §5 #5, D-18(a)).

핵심 이벤트 8종(가입·매물조회·등록·문의·가격제안·약속·완료·후기)을 서버측 요청 처리 지점에서
직접 발화한다 — 프론트 재계측이 아니다(클라이언트 차단·네트워크 유실 없이 더 신뢰할 수 있고,
이미 그 지점들이 서버 요청으로 존재한다).

⚠️ 계측 실패가 본래 요청을 실패시키면 안 된다(계측은 부가 기능). FD-6 outbox(noti_events.enqueue)
는 Redis 릴레이·noti_worker 소비자가 있는 사용자 대면 알림용 인프라라 여기엔 과설계다 — 이
이벤트는 소비자가 매일 도는 롤업 배치 하나뿐이고, occasional 유실이 noti 유실보다 훨씬 저비용
이다(집계 지표라 한두 건 유실이 전체 판단을 바꾸지 않음). 대신 SAVEPOINT(begin_nested)로 도메인
트랜잭션과 격리한다 — 이벤트 insert 가 실패해도 그 SAVEPOINT만 롤백되고 호출부의 나머지 변경/
커밋은 정상 진행된다(noti_events.publish() 의 "이미 커밋된 이벤트에 best-effort" 판단과 같은
계열이나, 여기선 커밋 전에 같은 트랜잭션에 태워야 도메인 insert 와 원자적으로 남는다는 점이
다르다 — 그래서 publish() 대신 SAVEPOINT 격리를 쓴다).
"""

import logging
import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import FunnelEvent
from ..schemas import FunnelEventType

log = logging.getLogger(__name__)

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


async def record(
    db: AsyncSession,
    event_type: FunnelEventType,
    *,
    user_id: uuid.UUID | None = None,
    entity_id: uuid.UUID | None = None,
) -> None:
    """호출부의 `await db.commit()` 이전에 호출한다 — 같은 트랜잭션에 실려야 도메인 변경과
    원자적으로 커밋된다. 이벤트 insert 실패는 SAVEPOINT 롤백 + 로그로 흡수하고 예외를 올리지
    않는다(호출 흐름 차단 금지)."""
    now = datetime.now(UTC)
    try:
        async with db.begin_nested():
            db.add(
                FunnelEvent(
                    event_type=event_type.value,
                    user_id=user_id,
                    entity_id=entity_id,
                    occurred_at=now,
                    stat_date=now.astimezone(_VN_TZ).date(),
                )
            )
    except Exception:
        log.exception("funnel event insert failed: event_type=%s", event_type.value)
