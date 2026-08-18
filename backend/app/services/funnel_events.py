"""퍼널 계측 최소 스키마 — 자체 이벤트 테이블 적재 헬퍼 (정본 §5 #5, D-18(a)).

핵심 이벤트 8종(가입·매물조회·등록·문의·가격제안·약속·완료·후기)을 서버측 요청 처리 지점에서
직접 발화한다 — 프론트 재계측이 아니다(클라이언트 차단·네트워크 유실 없이 더 신뢰할 수 있고,
이미 그 지점들이 서버 요청으로 존재한다).

⚠️ 계측 실패가 본래 요청을 실패시키면 안 된다(계측은 부가 기능). FD-6 outbox(noti_events.enqueue)
는 Redis 릴레이·noti_worker 소비자가 있는 사용자 대면 알림용 인프라라 여기엔 과설계다 — 이
이벤트는 소비자가 매일 도는 롤업 배치 하나뿐이고, occasional 유실이 noti 유실보다 훨씬 저비용
이다(집계 지표라 한두 건 유실이 전체 판단을 바꾸지 않음).

호출부 세션(`db.begin_nested()`)에 얹는 방식은 폐기했다 — SQLAlchemy 1.4+ 에서 nested
transaction 커밋(SAVEPOINT RELEASE)이 세션 전체를 flush 하므로, 호출부가 `record()` 이전에
`db.add()` 해둔 도메인 객체까지 같은 SAVEPOINT 안에서 INSERT 되고, 그 flush 가 실패하면
`ROLLBACK TO SAVEPOINT` 가 도메인 쓰기까지 폐기한 채 여기서 예외를 삼켜 호출부는 성공한 줄
안다(코드리뷰 HIGH #1). 대신 **독립된 세션/트랜잭션**으로 적재해 도메인 트랜잭션과 완전히
분리한다 — 원자성(이벤트와 도메인 변경이 같이 커밋/롤백)은 포기하지만 위 docstring이 이미
인정한 "occasional 유실은 저비용" 전제와 정합하고, 호출부 자신의 flush 실패를 계측이 삼키는
일도 구조적으로 없앤다."""

import logging
import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..models import FunnelEvent, User
from ..schemas import FunnelEventType

log = logging.getLogger(__name__)

_VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


async def record(
    db: object,
    event_type: FunnelEventType,
    *,
    user_id: uuid.UUID | None = None,
    entity_id: uuid.UUID | None = None,
    subject_type: str | None = None,
    props: dict | None = None,
    anon_id: uuid.UUID | None = None,
    surface: str | None = None,
    session_id: uuid.UUID | None = None,
    acq_source: str | None = None,
) -> None:
    """호출부 세션(`db`)은 더 이상 건드리지 않는다 — 호환을 위해 인자로는 받지만 사용하지
    않는다(호출부 8곳의 시그니처를 유지하기 위함). 별도 세션으로 즉시 커밋한다. 이벤트 insert
    실패는 로그로 흡수하고 예외를 올리지 않는다(호출 흐름 차단 금지) — 단 이 실패는 호출부의
    세션/트랜잭션과 무관하므로 호출부 자신의 flush 실패를 가리지 않는다.

    subject_type/props 는 016 §3-2(#16 상호작용 로그 확장, init/183) 로 추가된 선택 인자다 —
    기존 8곳 호출부는 지정하지 않아도 그대로 동작한다(하위호환). props 는 PII 를 담지 않는다
    (init/183 주석 참조 — IP·UA·전화번호·자유 텍스트 원문 금지, 집계용 값만).

    anon_id/surface/session_id/acq_source 는 016 §6-2 #30 으로 추가된 선택 인자다. acq_source 를
    호출부가 명시하지 않고 user_id 가 있으면 users.acquisition_source 를 자동 조회해 스탬프한다 —
    §6-2 "이후 모든 이벤트에 acq_source 스탬프" 요구를, market.py 등 기존 8곳 호출부를 전혀
    건드리지 않고 이 한 곳에서만 만족시키기 위한 설계다(추가 SELECT 1회, 파일럿 규모에서 무시
    가능한 비용 — 실시간 요구가 없어 지연도 문제되지 않는다)."""
    del db
    now = datetime.now(UTC)
    try:
        async with AsyncSessionLocal() as event_db:
            resolved_acq_source = acq_source
            if resolved_acq_source is None and user_id is not None:
                resolved_acq_source = (
                    await event_db.execute(select(User.acquisition_source).where(User.id == user_id))
                ).scalar_one_or_none()
            event_db.add(
                FunnelEvent(
                    event_type=event_type.value,
                    user_id=user_id,
                    entity_id=entity_id,
                    subject_type=subject_type,
                    props=props or {},
                    occurred_at=now,
                    stat_date=now.astimezone(_VN_TZ).date(),
                    anon_id=anon_id,
                    surface=surface,
                    session_id=session_id,
                    acq_source=resolved_acq_source,
                )
            )
            await event_db.commit()
    except Exception:
        log.exception("funnel event insert failed: event_type=%s", event_type.value)
