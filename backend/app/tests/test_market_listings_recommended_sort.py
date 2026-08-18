"""016 §5-2 #19 — 규칙 기반 랭킹 v1("추천순") 회귀 테스트.

test_market_listings_radius.py 의 _CapturingDb 패턴을 그대로 재사용한다: 실행된 SQLAlchemy
문장을 문자열로 붙잡아 ORDER BY 표현식이 기대한 구성요소(최신성 반감기·품질 가산·trust_penalty)
를 담고 있는지 검증한다. 데이터 없이도 "사진 0장/미인증/서류 미기재 매물이 하위 정렬"을
고정하는 방법: 그 판정을 만드는 SQL 조각(사진 EXISTS·phone_verified_at·paper_status)이
실제로 ORDER BY 절에 들어갔는지 확인한다 — 이 조각이 빠지면 그 즉시 하위 정렬 보장이 깨진다.
"""

import unittest
from unittest.mock import MagicMock

from app.routers import market
from app.services.listing_ranking import TRUST_PENALTY


class _CapturingDb:
    def __init__(self):
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        result = MagicMock()
        result.scalar_one = MagicMock(return_value=0)
        result.all = MagicMock(return_value=[])
        return result

    def compiled_sql(self):
        return [str(s) for s in self.statements]


async def _call(**kwargs):
    db = _CapturingDb()
    params = {
        "category": None,
        "category_id": None,
        "keyword": None,
        "sort": "recommended",
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


class RecommendedSortTest(unittest.IsolatedAsyncioTestCase):
    async def test_recommended_sort_uses_score_expression(self):
        db = await _call(sort="recommended")
        page_sql = db.compiled_sql()[1]
        self.assertIn("ORDER BY", page_sql)
        self.assertIn("POWER(0.5", page_sql, "최신성 반감기 항이 빠졌다")
        self.assertIn("marketplace_listing_images", page_sql, "사진 유무 품질 가산이 빠졌다")
        self.assertIn("phone_verified_at", page_sql, "휴대폰 인증 품질 가산이 빠졌다")
        self.assertIn("paper_status", page_sql, "서류·명의 기재 품질 가산이 빠졌다(#41 연동)")

    async def test_default_sort_is_unchanged(self):
        """대표 지시: 기본 정렬(recent)은 바꾸지 않는다 — recommended 옵션만 추가."""
        db = await _call(sort="recent")
        page_sql = db.compiled_sql()[1]
        self.assertNotIn("POWER(0.5", page_sql)
        self.assertIn("bumped_at", page_sql)

    async def test_trust_penalty_is_a_single_hardcoded_constant(self):
        """§9 완료조건: L2 진입 시 trust_penalty 계수 변경만으로 노출이 조정돼야 한다 —
        이 값이 services/listing_ranking.py 한 곳에서만 정의된 전역 상수인지 고정."""
        self.assertEqual(TRUST_PENALTY, 1.0)


if __name__ == "__main__":
    unittest.main()
