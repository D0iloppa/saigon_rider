from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Content
from ..utils import QUEST_CARD_IMGPROXY_OPTIONS, build_imgproxy_url

router = APIRouter(prefix="/quest-cards", tags=["quest-cards"])

_FILE_PATH_PREFIX = "system/quest-cards/card-"
_FILE_PATH_SUFFIX = ".png"


@router.get("/images")
async def list_quest_card_images(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """cardCode → imgproxy URL. contents 테이블에 시드된 카드만 포함. 미시드 카드는 키 없음 → 프론트가 sprite 폴백."""
    rows = (
        await db.execute(
            select(Content.file_path).where(
                Content.owner_type == "system",
                Content.file_path.like(f"{_FILE_PATH_PREFIX}%{_FILE_PATH_SUFFIX}"),
            )
        )
    ).all()

    out: dict[str, str] = {}
    for (file_path,) in rows:
        card_code = file_path[len(_FILE_PATH_PREFIX) : -len(_FILE_PATH_SUFFIX)]
        out[card_code] = build_imgproxy_url(file_path, options=QUEST_CARD_IMGPROXY_OPTIONS)
    return out
