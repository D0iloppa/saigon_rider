"""P3: search_index.py 단위 테스트 — immediate_blob(원문 즉시)/build_blob(캐시 번역 합류)/reindex_entity(멱등 UPDATE).

수정 전 FAIL 실증: `app.services.search_index` 모듈 자체가 이 세션 이전에는 존재하지 않아
`ModuleNotFoundError` 로 전부 실패했다.

핵심 불변식(ADR): 번역이 없어도(lookup_lang_batch 가 빈 리스트/원문만 반환해도) 원문은 항상
blob 에 들어가야 한다 — 번역 API 가 죽어 있는 지금(P0 미복구) 상태를 그대로 재현해 검증한다.
"""

import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from app.services import search_index


class ImmediateBlobTest(unittest.TestCase):
    def test_joins_normalized_nonempty_texts(self):
        self.assertEqual(search_index.immediate_blob(["Xe đạp", "자전거 팝니다"]), "xe dap 자전거 팝니다")

    def test_skips_none_and_blank(self):
        self.assertEqual(search_index.immediate_blob([None, "  ", "bike"]), "bike")

    def test_all_blank_returns_empty_string(self):
        self.assertEqual(search_index.immediate_blob([None, ""]), "")


class BuildBlobTest(unittest.IsolatedAsyncioTestCase):
    async def test_original_text_present_even_when_translation_unavailable(self):
        """번역 API 죽음(P0 미복구) 상황 재현: lookup_lang_batch 가 원문 그대로 반환(캐시 미스 폴백)."""
        with patch.object(search_index, "lookup_lang_batch", AsyncMock(side_effect=lambda texts, lang, db: texts)):
            blob = await search_index.build_blob(["Mũ bảo hiểm"], db=MagicMock())
        self.assertIn("mu bao hiem", blob)

    async def test_translations_appended_when_cached(self):
        async def fake_lookup(texts, lang, db):
            if lang == "en":
                return ["helmet"]
            return texts

        with patch.object(search_index, "lookup_lang_batch", AsyncMock(side_effect=fake_lookup)):
            blob = await search_index.build_blob(["Mũ bảo hiểm"], db=MagicMock())
        self.assertIn("mu bao hiem", blob)
        self.assertIn("helmet", blob)


class ReindexEntityTest(unittest.IsolatedAsyncioTestCase):
    async def test_updates_search_blob_on_row_and_is_idempotent(self):
        listing = MagicMock(title="helmet for sale", description=None, search_blob=None)
        db = MagicMock()
        db.get = AsyncMock(return_value=listing)
        entity_id = uuid.uuid4()

        with patch.object(search_index, "lookup_lang_batch", AsyncMock(side_effect=lambda texts, lang, db: texts)):
            await search_index.reindex_entity(db, "listing", entity_id)
            first = listing.search_blob
            await search_index.reindex_entity(db, "listing", entity_id)  # 재소비 시뮬레이션

        self.assertEqual(listing.search_blob, first)
        self.assertIn("helmet for sale", listing.search_blob)

    async def test_missing_row_is_noop(self):
        db = MagicMock()
        db.get = AsyncMock(return_value=None)
        await search_index.reindex_entity(db, "listing", uuid.uuid4())  # 예외 없이 조용히 반환

    async def test_unknown_entity_type_is_noop(self):
        db = MagicMock()
        db.get = AsyncMock()
        await search_index.reindex_entity(db, "unknown", uuid.uuid4())
        db.get.assert_not_called()


if __name__ == "__main__":
    unittest.main()
