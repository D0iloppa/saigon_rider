"""_favorite_count_map (동네지도 업체 카드/핀 찜 수 집계) 테스트 — _follower_count_map 미러 검증."""

import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.routers import biz


def _mock_db(rows):
    result = MagicMock()
    result.all.return_value = rows
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    return db


class FavoriteCountMapTest(unittest.IsolatedAsyncioTestCase):
    async def test_counts_multiple_favorites_for_a_profile(self):
        pid = uuid.uuid4()
        db = _mock_db([(pid, 3)])

        result = await biz._favorite_count_map(db, [pid])

        self.assertEqual(result[pid], 3)

    async def test_profile_with_no_favorites_defaults_to_zero(self):
        pid = uuid.uuid4()
        db = _mock_db([])  # GROUP BY 결과에 행이 없음 — 찜 0건

        result = await biz._favorite_count_map(db, [pid])

        self.assertEqual(result.get(pid, 0), 0)

    async def test_counts_are_isolated_per_profile(self):
        pid_a, pid_b = uuid.uuid4(), uuid.uuid4()
        db = _mock_db([(pid_a, 2), (pid_b, 5)])

        result = await biz._favorite_count_map(db, [pid_a, pid_b])

        self.assertEqual(result[pid_a], 2)
        self.assertEqual(result[pid_b], 5)

    async def test_empty_profile_ids_skips_query(self):
        db = _mock_db([])

        result = await biz._favorite_count_map(db, [])

        self.assertEqual(result, {})
        db.execute.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
