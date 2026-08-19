"""업체 소식 사진 content_id 노출 + PATCH 교체/유지 계약 (W2 T4).

W1(PATCH /biz/news)이 남긴 구멍: 목록 조회 응답이 photo 의 content_id 를 안 내려줘서 프론트가
기존 사진 집합을 재제출할 수 없었다. get_public_news/update_news 응답에 photo_content_ids
(photos 와 같은 순서의 병렬 배열)를 추가했는지 고정한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.routers import biz
from app.schemas import BusinessNewsUpdateRequest


def _photo(content_id, file_path="a.jpg"):
    return SimpleNamespace(content_id=content_id, content=SimpleNamespace(file_path=file_path))


class PublicNewsListPhotoContentIdTest(unittest.IsolatedAsyncioTestCase):
    async def test_photo_content_ids_parallel_to_photos(self):
        owner_id = uuid.uuid4()
        profile_id = uuid.uuid4()
        cid1, cid2 = uuid.uuid4(), uuid.uuid4()
        news = SimpleNamespace(
            id=uuid.uuid4(),
            title="t",
            body="b",
            created_at=datetime.now(UTC),
            photos=[_photo(cid1), _photo(cid2)],
        )
        profile = SimpleNamespace(id=profile_id, status="APPROVED", user_id=owner_id)

        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        result = MagicMock()
        result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[news])))
        db.execute = AsyncMock(return_value=result)

        # F1-3: photo_content_ids 는 오너 조회일 때만 채워진다 — 오너 세션으로 조회.
        out = await biz.get_public_news(profile_id, limit=10, offset=0, db=db, session_uid=owner_id)

        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].photo_content_ids, [cid1, cid2])
        self.assertEqual(len(out[0].photos), 2)

    async def test_photo_missing_file_path_excluded_from_both_lists(self):
        """photos 필터(content.file_path 없으면 제외)와 photo_content_ids 가 어긋나지 않아야 한다."""
        owner_id = uuid.uuid4()
        profile_id = uuid.uuid4()
        cid_ok, cid_broken = uuid.uuid4(), uuid.uuid4()
        news = SimpleNamespace(
            id=uuid.uuid4(),
            title="t",
            body=None,
            created_at=datetime.now(UTC),
            photos=[_photo(cid_ok), _photo(cid_broken, file_path=None)],
        )
        profile = SimpleNamespace(id=profile_id, status="APPROVED", user_id=owner_id)

        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        result = MagicMock()
        result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[news])))
        db.execute = AsyncMock(return_value=result)

        out = await biz.get_public_news(profile_id, limit=10, offset=0, db=db, session_uid=owner_id)

        self.assertEqual(out[0].photo_content_ids, [cid_ok])
        self.assertEqual(len(out[0].photos), 1)

    async def test_photo_content_ids_hidden_from_anonymous_caller(self):
        """F1-3: 익명(session_uid=None) 조회 시 raw content UUID 를 노출하지 않는다 — 타 업체 content 도용 방지."""
        owner_id = uuid.uuid4()
        profile_id = uuid.uuid4()
        cid1 = uuid.uuid4()
        news = SimpleNamespace(
            id=uuid.uuid4(),
            title="t",
            body="b",
            created_at=datetime.now(UTC),
            photos=[_photo(cid1)],
        )
        profile = SimpleNamespace(id=profile_id, status="APPROVED", user_id=owner_id)

        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        result = MagicMock()
        result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[news])))
        db.execute = AsyncMock(return_value=result)

        out = await biz.get_public_news(profile_id, limit=10, offset=0, db=db, session_uid=None)

        self.assertEqual(out[0].photo_content_ids, [])
        self.assertEqual(len(out[0].photos), 1)  # photos(imgproxy URL)는 여전히 노출

    async def test_photo_content_ids_hidden_from_non_owner_caller(self):
        """F1-3: 로그인은 했지만 오너가 아닌 사용자에게도 노출하지 않는다."""
        owner_id = uuid.uuid4()
        other_user_id = uuid.uuid4()
        profile_id = uuid.uuid4()
        cid1 = uuid.uuid4()
        news = SimpleNamespace(
            id=uuid.uuid4(),
            title="t",
            body="b",
            created_at=datetime.now(UTC),
            photos=[_photo(cid1)],
        )
        profile = SimpleNamespace(id=profile_id, status="APPROVED", user_id=owner_id)

        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        result = MagicMock()
        result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[news])))
        db.execute = AsyncMock(return_value=result)

        out = await biz.get_public_news(profile_id, limit=10, offset=0, db=db, session_uid=other_user_id)

        self.assertEqual(out[0].photo_content_ids, [])


class UpdateNewsPhotoReplaceTest(unittest.IsolatedAsyncioTestCase):
    async def test_omitting_photo_content_ids_keeps_existing(self):
        owner_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id, status="APPROVED")
        cid = uuid.uuid4()
        news = SimpleNamespace(
            id=uuid.uuid4(),
            profile_id=profile.id,
            title="옛 제목",
            body="옛 본문",
            created_at=datetime.now(UTC),
            search_blob=None,
            photos=[_photo(cid)],
        )

        db = AsyncMock()

        async def fake_get(model, item_id):
            return news if model is biz.BusinessNews else profile

        db.get = AsyncMock(side_effect=fake_get)

        body = BusinessNewsUpdateRequest(title="새 제목")  # photo_content_ids 생략
        result = await biz.update_news(news.id, body, background=MagicMock(), db=db, session_uid=owner_id)

        self.assertEqual(result.photo_content_ids, [cid])
        db.execute.assert_not_awaited()  # 사진 교체 delete 문이 실행되지 않았어야 함

    async def test_providing_photo_content_ids_replaces_set(self):
        owner_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id, status="APPROVED")
        old_cid = uuid.uuid4()
        new_cid = uuid.uuid4()
        news = SimpleNamespace(
            id=uuid.uuid4(),
            profile_id=profile.id,
            title="옛 제목",
            body="옛 본문",
            created_at=datetime.now(UTC),
            search_blob=None,
            photos=[_photo(old_cid)],
        )
        content = SimpleNamespace(id=new_cid, file_path="new.jpg", owner_type="user", owner_id=owner_id)

        db = AsyncMock()

        async def fake_get(model, item_id):
            if model is biz.BusinessNews:
                return news
            if model is biz.Content:
                return content
            return profile

        db.get = AsyncMock(side_effect=fake_get)
        db.execute = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        body = BusinessNewsUpdateRequest(title="새 제목", photo_content_ids=[new_cid])
        result = await biz.update_news(news.id, body, background=MagicMock(), db=db, session_uid=owner_id)

        self.assertEqual(result.photo_content_ids, [new_cid])
        self.assertEqual(len(result.photos), 1)

    async def test_providing_empty_photo_content_ids_clears_photos(self):
        owner_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id, status="APPROVED")
        old_cid = uuid.uuid4()
        news = SimpleNamespace(
            id=uuid.uuid4(),
            profile_id=profile.id,
            title="옛 제목",
            body="옛 본문",
            created_at=datetime.now(UTC),
            search_blob=None,
            photos=[_photo(old_cid)],
        )

        db = AsyncMock()

        async def fake_get(model, item_id):
            return news if model is biz.BusinessNews else profile

        db.get = AsyncMock(side_effect=fake_get)
        db.execute = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        body = BusinessNewsUpdateRequest(title="새 제목", photo_content_ids=[])
        result = await biz.update_news(news.id, body, background=MagicMock(), db=db, session_uid=owner_id)

        self.assertEqual(result.photo_content_ids, [])
        self.assertEqual(result.photos, [])
        db.execute.assert_awaited()  # delete(BusinessNewsPhoto...) 는 여전히 실행됨


if __name__ == "__main__":
    unittest.main()
