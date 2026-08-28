"""사용자 트래킹 파이프라인 — 클라이언트 계약 엔드포인트 (init/213, C3/C6).

익명ID/세션ID 자체는 모든 요청에서 `deps.resolve_tracking_ids` 로 발급/회신되지만(요청 헤더
X-Anon-Id/X-Session-Id), first-touch 유입 어트리뷰션(C6)은 그 값을 채울 별도 신호(UTM 등)가
필요해 전용 엔드포인트로 둔다. 프론트 범용 트래커(화면진입 계측 등)는 이 작업의 범위가 아니다
— 후속 워커가 앱 최초 실행(딥링크 UTM 파싱) 시 이 엔드포인트를 1회 호출하는 방식으로 얹는다.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import resolve_tracking_ids
from ..services import user_tracking

router = APIRouter(prefix="/tracking", tags=["사용자 트래킹 (User Tracking)"])


class FirstTouchAttributionIn(BaseModel):
    """표준 UTM 5종만 받는다 — referrer/landing_path 같은 자유형 URL 필드는 PII 최소화
    원칙(init/182·213 주석)상 의도적으로 받지 않는다."""

    utm_source: str | None = Field(None, max_length=60)
    utm_medium: str | None = Field(None, max_length=60)
    utm_campaign: str | None = Field(None, max_length=60)
    utm_content: str | None = Field(None, max_length=60)
    utm_term: str | None = Field(None, max_length=60)


@router.post(
    "/first-touch",
    status_code=204,
    summary="익명ID first-touch 유입채널 기록 (최초 1회만 반영, 이후 호출은 무시됨)",
)
async def post_first_touch(
    body: FirstTouchAttributionIn,
    ids: tuple = Depends(resolve_tracking_ids),
    db: AsyncSession = Depends(get_db),
):
    anon_id, _session_id = ids
    await user_tracking.record_first_touch(
        db,
        anon_id=anon_id,
        utm_source=body.utm_source,
        utm_medium=body.utm_medium,
        utm_campaign=body.utm_campaign,
        utm_content=body.utm_content,
        utm_term=body.utm_term,
    )
    await db.commit()
