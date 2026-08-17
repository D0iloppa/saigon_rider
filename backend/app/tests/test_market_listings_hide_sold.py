"""대표 지시 2026-08-07 — 마켓 리스트·지도에서 거래완료(SOLD) 매물 비노출 회귀 테스트.

이 파일이 고정하는 계약:
 1) SOLD 는 hide_sold 쿼리 파라미터 값과 무관하게 항상 조회에서 제외된다(list/q 와
    총계/count_q 양쪽) — 리스트·지도가 같은 엔드포인트를 쓰므로 지도도 자동으로 따라온다.
 2) RESERVED 는 계속 노출된다 — SOLD 만 걸어야 한다(대표 지시는 거래완료뿐).
 3) 판매자 본인이 seller_id 로 자기 매물(seller_id == session_uid)을 조회하는 "내 매물"
    경로에서는 예외로 SOLD 조건을 걸지 않는다.
 4) seller_id 가 있어도 session_uid 와 다르면(다른 사람 프로필 조회) 예외가 아니다 — SOLD 걸린다.
"""

import unittest
import uuid
from unittest.mock import MagicMock

from app.routers import market


class _CapturingDb:
    """db.execute 로 넘어온 SQLAlchemy 문장을 순서대로 붙잡아 둔다."""

    def __init__(self):
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        result = MagicMock()
        result.scalar_one = MagicMock(return_value=0)
        result.all = MagicMock(return_value=[])
        return result

    def compiled_sql(self):
        # literal_binds: status != :status_2 처럼 바인드 파라미터로 빠지는 값(SOLD 등)도
        # SQL 문자열에 그대로 새겨야 assertIn("SOLD", ...) 로 검증할 수 있다.
        return [str(s.compile(compile_kwargs={"literal_binds": True})) for s in self.statements]


async def _call(**kwargs):
    db = _CapturingDb()
    params = {
        "category": None,
        "category_id": None,
        "keyword": None,
        "sort": "recent",
        "hide_sold": False,
        "price_min": None,
        "price_max": None,
        "lat": None,
        "lng": None,
        "radius_km": None,
        "min_lat": None,
        "max_lat": None,
        "min_lng": None,
        "max_lng": None,
        "district_id": None,
        "ward_id": None,
        "seller_id": None,
        "business_profile_id": None,
        "viewer_id": None,
        "lang": None,
        "page": 1,
        "size": 20,
        "db": db,
        "session_uid": None,
    }
    params.update(kwargs)
    await market.get_listings(**params)
    return db


class SoldAlwaysExcludedTest(unittest.IsolatedAsyncioTestCase):
    async def test_sold_excluded_even_when_hide_sold_false(self):
        """hide_sold=False(옛 토글 기본값)로 와도 SOLD 는 걸려야 한다."""
        db = await _call(hide_sold=False)
        count_sql, page_sql = db.compiled_sql()[0], db.compiled_sql()[1]
        self.assertIn("SOLD", count_sql)
        self.assertIn("SOLD", page_sql)

    async def test_sold_excluded_on_both_count_and_page_queries(self):
        db = await _call(hide_sold=True)
        count_sql, page_sql = db.compiled_sql()[0], db.compiled_sql()[1]
        self.assertIn("SOLD", count_sql, "총계 쿼리에도 SOLD 제외가 걸려야 total 이 어긋나지 않는다")
        self.assertIn("SOLD", page_sql)

    async def test_reserved_not_filtered(self):
        """RESERVED 는 걸리지 않는다 — 대표 지시는 거래완료(SOLD)뿐이다."""
        db = await _call()
        for sql in db.compiled_sql():
            self.assertNotIn("RESERVED", sql)


class OwnListingsSeeSoldTest(unittest.IsolatedAsyncioTestCase):
    async def test_seller_viewing_own_listings_keeps_sold(self):
        """seller_id == session_uid(내 매물) 이면 SOLD 를 계속 보여준다."""
        uid = uuid.uuid4()
        db = await _call(seller_id=uid, session_uid=uid, hide_sold=False)
        count_sql, page_sql = db.compiled_sql()[0], db.compiled_sql()[1]
        self.assertNotIn("SOLD", count_sql)
        self.assertNotIn("SOLD", page_sql)

    async def test_viewing_someone_elses_listings_still_hides_sold(self):
        """seller_id 가 있어도 조회자 본인 것이 아니면 SOLD 는 계속 걸린다."""
        db = await _call(seller_id=uuid.uuid4(), session_uid=uuid.uuid4())
        count_sql, page_sql = db.compiled_sql()[0], db.compiled_sql()[1]
        self.assertIn("SOLD", count_sql)
        self.assertIn("SOLD", page_sql)

    async def test_seller_id_without_session_still_hides_sold(self):
        """세션 없이(비로그인) seller_id 만 온 경우도 예외로 삼지 않는다."""
        db = await _call(seller_id=uuid.uuid4(), session_uid=None)
        page_sql = db.compiled_sql()[1]
        self.assertIn("SOLD", page_sql)


class OwnListingsSeeWithdrawnTest(unittest.IsolatedAsyncioTestCase):
    """대표 지시 2026-08-08 — 철회(WITHDRAWN)는 삭제가 아니라 상태. 내 매물 목록에서 빠지면 안 된다."""

    async def test_seller_viewing_own_listings_keeps_withdrawn(self):
        uid = uuid.uuid4()
        db = await _call(seller_id=uid, session_uid=uid)
        for sql in db.compiled_sql()[:2]:
            self.assertNotIn("WITHDRAWN", sql)

    async def test_public_list_still_hides_withdrawn(self):
        db = await _call()
        for sql in db.compiled_sql()[:2]:
            self.assertIn("WITHDRAWN", sql)

    async def test_own_listings_show_moderated(self):
        """Q-3(감사 260817): 모더레이션(HIDDEN/REMOVED)도 판매자 본인 "내 매물" 목록에는 노출된다
        — 조치 사실을 확인하고 대응할 수 있어야 한다."""
        uid = uuid.uuid4()
        db = await _call(seller_id=uid, session_uid=uid)
        for sql in db.compiled_sql()[:2]:
            self.assertNotIn("HIDDEN", sql)
            self.assertNotIn("REMOVED", sql)

    async def test_other_users_listings_still_hide_moderated(self):
        """비소유자 조회(다른 사람 프로필)에서는 HIDDEN/REMOVED 가 여전히 걸린다 — 회귀 금지."""
        db = await _call(seller_id=uuid.uuid4(), session_uid=uuid.uuid4())
        for sql in db.compiled_sql()[:2]:
            self.assertIn("HIDDEN", sql)
            self.assertIn("REMOVED", sql)


if __name__ == "__main__":
    unittest.main()
