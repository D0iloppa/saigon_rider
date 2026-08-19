"""신고 생성 중복 판정 공통 헬퍼 (R-3, 260819 W3 — 신고 피드백 루프).

취소된 신고(CANCELLED)와 진행/종결된 신고(PENDING/REVIEWING/RESOLVED/REJECTED)는 재신고를
막는 이유가 다르므로 사용자에게 다른 코드·문구로 안내한다(대표 확정: 재신고 불가 정책 자체는
유지 — DB 부분 유니크 인덱스는 건드리지 않는다, 017 §12-B 결정③).

LISTING/USER/DM/POST/COMMENT 5개 target_type 생성 경로(market.py/dm.py/feed.py/users.py)가
공유한다. BIZ/REVIEW(biz.py)는 다른 워커가 동시 작업 중이라 이 헬퍼를 아직 적용하지 않았다.
"""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Report


async def guard_duplicate_report(db: AsyncSession, *conditions) -> None:
    """conditions: Report.target_type == ..., <fk column> == ..., Report.reporter_id == ... 3개."""
    existing_status = (await db.execute(select(Report.status).where(*conditions))).scalar_one_or_none()
    if existing_status is None:
        return
    if existing_status == "CANCELLED":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "report_already_cancelled",
                "message": "취소한 신고는 같은 대상에 다시 신고할 수 없습니다.",
            },
        )
    raise HTTPException(
        status_code=409,
        detail={
            "code": "report_already_pending",
            "message": "이미 접수되어 처리 중인 신고가 있습니다.",
        },
    )
