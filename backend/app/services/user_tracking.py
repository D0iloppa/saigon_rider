"""사용자 트래킹 파이프라인 — 익명→회원 소급 연결(C5) + first-touch 유입 어트리뷰션(C6).

init/213 이 추가한 두 테이블(user_identity_links, user_first_touch_attribution)의 유일한
쓰기 경로. 둘 다 로그인/등록 흐름 안에서 호출되므로 **호출부가 이미 열어둔 세션(`db`)을
그대로 쓴다** — funnel_events.record() 와 달리 별도 세션으로 격리하지 않는다: 이 두 표는
"occasional 유실이 저비용"인 집계 지표가 아니라, 익명↔회원 연결이라는 정합성이 중요한
데이터라 호출부의 로그인 트랜잭션과 원자적으로 같이 커밋/롤백돼야 한다(listing_state.py
의 log_transition() 과 같은 판단).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import UserFirstTouchAttribution, UserIdentityLink


async def link_identity(
    db: AsyncSession,
    *,
    anon_id: uuid.UUID,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> None:
    """로그인 시점에 (anon_id, user_id, session_id) 링크 1행을 남긴다.

    PK 가 세 컬럼 전부라 이미 같은 조합이 있으면 조용히 무시한다(멱등) — 같은 세션 안에서
    로그인 API가 재호출돼도 중복 행이 쌓이지 않는다. **반드시 같은 세션 범위로만** 연결한다는
    불변식은 이 함수가 아니라 호출부가 지킨다: 호출부는 이 요청의 X-Session-Id 를 그대로
    넘겨야 하며, 과거 세션의 익명 활동을 여기서 소급 조회해 얹지 않는다.
    """
    stmt = (
        pg_insert(UserIdentityLink)
        .values(anon_id=anon_id, user_id=user_id, session_id=session_id, linked_at=datetime.now(UTC))
        .on_conflict_do_nothing(index_elements=["anon_id", "user_id", "session_id"])
    )
    await db.execute(stmt)


async def record_first_touch(
    db: AsyncSession,
    *,
    anon_id: uuid.UUID,
    utm_source: str | None = None,
    utm_medium: str | None = None,
    utm_campaign: str | None = None,
    utm_content: str | None = None,
    utm_term: str | None = None,
) -> None:
    """익명ID 의 first-touch 유입채널을 1회만 기록한다.

    PK=anon_id + ON CONFLICT DO NOTHING — 이미 행이 있으면 이번 호출의 UTM 값은 버려진다.
    UPDATE 경로가 코드에 존재하지 않는다(이 함수가 유일한 쓰기 경로이고 DO NOTHING 뿐이므로
    나중에 누군가 실수로 덮어쓰는 사고가 구조적으로 불가능하다).
    """
    stmt = (
        pg_insert(UserFirstTouchAttribution)
        .values(
            anon_id=anon_id,
            utm_source=utm_source,
            utm_medium=utm_medium,
            utm_campaign=utm_campaign,
            utm_content=utm_content,
            utm_term=utm_term,
            first_seen_at=datetime.now(UTC),
        )
        .on_conflict_do_nothing(index_elements=["anon_id"])
    )
    await db.execute(stmt)
