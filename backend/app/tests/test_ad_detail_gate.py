"""F-05 회귀 테스트 — 광고 상세 조회(public_ad)가 목록과 동일한 verified 게이트를 통과해야 한다.

수정 전: public_ad() 는 is_active + APPROVED 만 검사해, 미검증 업체의 승인 광고라도 UUID를
알면 목록 게이트(launching_ad_conditions, ad_gating.py)를 우회해 상세를 열 수 있었다
(application.py:232 이전).

test_biz_verification_gate.py 스타일 미러 — statement 를 실제 컴파일해 SQL 문자열로 게이트
포함 여부를 검증한다(로직 복제가 아니라 launching_ad_conditions 재사용 확인).
"""

import unittest
import uuid

from app.modules.ads.application import AdsApplication, AdsError


class _EmptyResult:
    def first(self):
        return None


class CompileCaptureSession:
    def __init__(self):
        self.compiled: list[str] = []

    async def execute(self, statement):
        self.compiled.append(str(statement.compile(compile_kwargs={"literal_binds": False})))
        return _EmptyResult()


class AdDetailGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_public_ad_query_reuses_verified_owner_gate(self):
        """상세 조회 쿼리도 소유 파트너 verified EXISTS 게이트를 포함해야 한다(ad_gating 재사용)."""
        db = CompileCaptureSession()
        with self.assertRaises(AdsError):
            # public_ad 는 404(AdsError) 를 raise 하지만, 우선 컴파일된 쿼리를 확인한다.
            await AdsApplication(db).public_ad(uuid.uuid4())

        self.assertEqual(len(db.compiled), 1)
        sql = db.compiled[0]
        self.assertIn("verification_status", sql)
        self.assertIn("owner_business_profile_id IS NULL", sql)
        # 기존 게이트도 여전히 포함.
        self.assertIn("review_status", sql)
        self.assertIn("is_active", sql)


if __name__ == "__main__":
    unittest.main()
