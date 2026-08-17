import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import BannedKeyword

# 금칙어 모듈 레벨 캐시 (사전 수십 건 규모 — 60초 TTL 재조회로 충분, Redis 불필요)
_BANNED_KEYWORDS_TTL_SEC = 60.0
_banned_keywords_cache: tuple[float, list[str]] = (0.0, [])


async def banned_keywords(db: AsyncSession) -> list[str]:
    global _banned_keywords_cache
    loaded_at, keywords = _banned_keywords_cache
    now = time.monotonic()
    if now - loaded_at < _BANNED_KEYWORDS_TTL_SEC and loaded_at > 0:
        return keywords
    rows = (await db.execute(select(BannedKeyword.keyword))).scalars().all()
    keywords = [k.lower() for k in rows if k and k.strip()]
    _banned_keywords_cache = (now, keywords)
    return keywords
