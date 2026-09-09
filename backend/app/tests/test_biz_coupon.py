"""가게 쿠폰(business_coupon) 회귀 테스트 — business_price CRUD 패턴 미러 (init/233, F061).

오너십 검증(_get_own_profile 이 모든 쿼리보다 먼저 호출됨), 미승인 업체의 발행 거부(create_ad
게이트 미러), 이중 사용 방지(claim_id PRIMARY KEY → IntegrityError → 409)를 실 DB 없이
Fake 세션으로 검증한다 (test_biz_price.py / test_biz_news_approved_gate.py 스타일)."""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.routers import biz
from app.schemas import BusinessCouponCreateRequest, BusinessCouponRedeemRequest


class CreateCouponOwnershipAndGateTests(unittest.IsolatedAsyncioTestCase):
    """타인 profile_id 는 거부, 미승인 업체는 거부, 승인된 오너는 성공한다."""

    async def test_rejects_non_owner(self):
        owner_id = uuid.uuid4()
        other_user_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id, status="APPROVED")
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)

        body = BusinessCouponCreateRequest(profile_id=profile.id, title="첫 방문 10% 할인")
        with self.assertRaises(HTTPException) as ctx:
            await biz.create_coupon(body, db=db, session_uid=other_user_id)
        self.assertEqual(ctx.exception.status_code, 404)
        db.execute.assert_not_called()  # 오너십 검증이 쿼리보다 먼저

    async def test_rejects_unapproved_profile(self):
        owner_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id, status="PENDING")
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)

        body = BusinessCouponCreateRequest(profile_id=profile.id, title="첫 방문 10% 할인")
        with self.assertRaises(HTTPException) as ctx:
            await biz.create_coupon(body, db=db, session_uid=owner_id)
        self.assertEqual(ctx.exception.status_code, 409)
        db.commit.assert_not_awaited()

    async def test_succeeds_for_approved_owner(self):
        owner_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id, status="APPROVED")
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        db.add = MagicMock(
            side_effect=lambda obj: (
                setattr(obj, "id", uuid.uuid4()),
                setattr(obj, "stopped_at", None),
                setattr(obj, "created_at", datetime(2026, 9, 9, tzinfo=UTC)),
            )
        )

        body = BusinessCouponCreateRequest(profile_id=profile.id, title="첫 방문 10% 할인")
        result = await biz.create_coupon(body, db=db, session_uid=owner_id)
        self.assertEqual(result.title, "첫 방문 10% 할인")
        self.assertEqual(result.claimed_count, 0)
        db.add.assert_called_once()
        db.commit.assert_awaited()


class StopCouponOwnershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_non_owner(self):
        owner_id = uuid.uuid4()
        other_user_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id, status="APPROVED")
        coupon = SimpleNamespace(id=uuid.uuid4(), profile_id=profile.id, stopped_at=None)

        db = AsyncMock()

        async def fake_get(model, item_id):
            if model is biz.BusinessCoupon:
                return coupon
            return profile

        db.get = AsyncMock(side_effect=fake_get)

        with self.assertRaises(HTTPException) as ctx:
            await biz.stop_coupon(coupon.id, db=db, session_uid=other_user_id)
        self.assertEqual(ctx.exception.status_code, 404)
        db.commit.assert_not_awaited()


class RedeemCouponTests(unittest.IsolatedAsyncioTestCase):
    """이중 사용 방지 — claim_id PRIMARY KEY(business_coupon_redemption) → IntegrityError → 409."""

    def _setup(self, *, owner_id, profile_status="APPROVED", expires_at=None):
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id, status=profile_status, name="사이공 세차장")
        coupon = SimpleNamespace(
            id=uuid.uuid4(), profile_id=profile.id, expires_at=expires_at, title="첫 방문 10% 할인", description=None
        )
        claim = SimpleNamespace(
            id=uuid.uuid4(), coupon_id=coupon.id, user_id=uuid.uuid4(), claimed_at=datetime(2026, 9, 1, tzinfo=UTC)
        )

        async def fake_get(model, item_id):
            if model is biz.BusinessCouponClaim:
                return claim
            if model is biz.BusinessCoupon:
                return coupon
            if model is biz.BusinessProfile:
                return profile
            return None

        return profile, coupon, claim, fake_get

    async def test_rejects_redeem_of_other_business_coupon(self):
        owner_id = uuid.uuid4()
        other_owner_id = uuid.uuid4()
        _, _coupon, claim, fake_get = self._setup(owner_id=owner_id)
        db = AsyncMock()
        db.get = AsyncMock(side_effect=fake_get)

        with self.assertRaises(HTTPException) as ctx:
            await biz.redeem_coupon(BusinessCouponRedeemRequest(claim_id=claim.id), db=db, session_uid=other_owner_id)
        self.assertEqual(ctx.exception.status_code, 404)
        db.commit.assert_not_awaited()

    async def test_rejects_double_redeem_via_integrity_error(self):
        owner_id = uuid.uuid4()
        _, _coupon, claim, fake_get = self._setup(owner_id=owner_id)
        db = AsyncMock()
        db.get = AsyncMock(side_effect=fake_get)
        db.add = MagicMock()
        db.commit = AsyncMock(side_effect=IntegrityError("stmt", {}, Exception("duplicate key")))
        db.rollback = AsyncMock()

        with self.assertRaises(HTTPException) as ctx:
            await biz.redeem_coupon(BusinessCouponRedeemRequest(claim_id=claim.id), db=db, session_uid=owner_id)
        self.assertEqual(ctx.exception.status_code, 409)
        db.rollback.assert_awaited()

    async def test_rejects_expired_coupon(self):
        owner_id = uuid.uuid4()
        past = datetime(2020, 1, 1, tzinfo=UTC)
        _, _coupon, claim, fake_get = self._setup(owner_id=owner_id, expires_at=past)
        db = AsyncMock()
        db.get = AsyncMock(side_effect=fake_get)

        with self.assertRaises(HTTPException) as ctx:
            await biz.redeem_coupon(BusinessCouponRedeemRequest(claim_id=claim.id), db=db, session_uid=owner_id)
        self.assertEqual(ctx.exception.status_code, 409)
        db.add.assert_not_called()

    async def test_succeeds_for_owner(self):
        owner_id = uuid.uuid4()
        _profile, _coupon, claim, fake_get = self._setup(owner_id=owner_id)

        async def fake_refresh(obj):
            obj.redeemed_at = datetime.now(UTC)

        db = AsyncMock()
        db.get = AsyncMock(side_effect=fake_get)
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock(side_effect=fake_refresh)

        result = await biz.redeem_coupon(BusinessCouponRedeemRequest(claim_id=claim.id), db=db, session_uid=owner_id)
        self.assertEqual(result.id, claim.id)
        self.assertIsNotNone(result.redeemed_at)
        db.add.assert_called_once()


class ClaimCouponTests(unittest.IsolatedAsyncioTestCase):
    async def test_hides_unapproved_profile_coupon(self):
        profile = SimpleNamespace(id=uuid.uuid4(), status="PENDING")
        coupon = SimpleNamespace(id=uuid.uuid4(), profile_id=profile.id, stopped_at=None, expires_at=None)

        async def fake_get(model, item_id):
            if model is biz.BusinessCoupon:
                return coupon
            return profile

        db = AsyncMock()
        db.get = AsyncMock(side_effect=fake_get)

        with self.assertRaises(HTTPException) as ctx:
            await biz.claim_coupon(coupon.id, db=db, session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_rejects_duplicate_claim_via_integrity_error(self):
        profile = SimpleNamespace(id=uuid.uuid4(), status="APPROVED", name="사이공 세차장")
        coupon = SimpleNamespace(id=uuid.uuid4(), profile_id=profile.id, stopped_at=None, expires_at=None)

        async def fake_get(model, item_id):
            if model is biz.BusinessCoupon:
                return coupon
            return profile

        db = AsyncMock()
        db.get = AsyncMock(side_effect=fake_get)
        db.add = MagicMock()
        db.commit = AsyncMock(side_effect=IntegrityError("stmt", {}, Exception("duplicate key")))
        db.rollback = AsyncMock()

        with self.assertRaises(HTTPException) as ctx:
            await biz.claim_coupon(coupon.id, db=db, session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 409)
        db.rollback.assert_awaited()


if __name__ == "__main__":
    unittest.main()
