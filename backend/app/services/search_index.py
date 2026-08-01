"""다국어 검색 blob 빌더 (260801_multilingual_search_design.md §4.2/§5 P3).

핵심 불변식: 번역이 없어도 원문은 항상 blob 에 들어가야 한다 — 번역 API 가 죽어 있어도
(현재 3주째 403) 검색에서 행이 사라지면 안 된다(ADR "fail-open 이 필요한 곳" — 검색).

두 단계로 채운다:
  1) ``immediate_blob`` — 등록/수정 트랜잭션에서 원문만으로 즉시 세팅(외부 API 호출 없음, 검색 즉시 가능).
  2) ``reindex_entity`` — 아웃박스 이벤트(search.reindex) 소비 후 번역을 얹어 재계산.
     ``lookup_lang_batch``(translate.py, 캐시 전용)만 쓴다 — 재색인 경로에도 외부 API 호출 0.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import BusinessNews, BusinessProfile, FeedPost, MarketplaceAd, MarketplaceListing
from .search_norm import norm
from .translate import lookup_lang_batch

_ENTITY_MODELS = {
    "listing": MarketplaceListing,
    "biz": BusinessProfile,
    "news": BusinessNews,
    "feed": FeedPost,
    "ad": MarketplaceAd,
}

# 엔티티 타입 → 검색 대상 원문 필드 추출
_TEXT_FIELDS = {
    "listing": lambda row: [row.title, row.description],
    "biz": lambda row: [row.name, row.address, row.intro],
    "news": lambda row: [row.title, row.body],
    "feed": lambda row: [row.content],
    "ad": lambda row: [row.title, row.body],
}


def immediate_blob(texts: list[str | None]) -> str:
    """등록/수정 트랜잭션에서 즉시 세팅하는 원문 전용 blob(번역 대기 없이 검색 가능)."""
    return " ".join(dict.fromkeys(norm(t) for t in texts if t and t.strip()))


async def build_blob(texts: list[str | None], db: AsyncSession) -> str:
    """원문 리스트 → 3언어 정규화 blob. translations 캐시만 조회(API 미호출)."""
    clean = [t for t in texts if t and t.strip()]
    parts = [norm(t) for t in clean]
    for lang in ("ko", "en", "vi"):
        parts += [norm(v) for v in await lookup_lang_batch(clean, lang, db)]
    return " ".join(dict.fromkeys(p for p in parts if p))


async def reindex_entity(db: AsyncSession, entity_type: str, entity_id) -> None:
    """엔티티 1건의 search_blob 재계산 + UPDATE. 멱등(같은 이벤트 재소비해도 결과 동일)."""
    model = _ENTITY_MODELS.get(entity_type)
    if model is None:
        return
    row = await db.get(model, entity_id)
    if row is None:
        return
    texts = _TEXT_FIELDS[entity_type](row)
    row.search_blob = await build_blob(texts, db)
