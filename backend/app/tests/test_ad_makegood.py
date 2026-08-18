"""013/016 §8-5, D-29=(a) #28 — 광고 보전 처리. 기간 연장만(현금 환불 자동화 아님).

완료 검증 조건(016 §9 #28): 연장 시 감사 로그·광고주 알림이 함께 생성된다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.models import MarketplaceAd, Notification
from app.routers.admin_api import biz as biz_router


def _fake_session():
    session = MagicMock()
    session.username = "ops_admin"
    session.role = "OPS"
    return session


def _fake_ad(**overrides) -> MarketplaceAd:
    base = dict(
        id=uuid.uuid4(),
        partner_name="Test Partner",
        title="ad",
        owner_id=uuid.uuid4(),
        tier_id=uuid.uuid4(),
        monthly_price_snapshot_vnd=0,
        starts_at=datetime(2026, 8, 1, tzinfo=UTC),
        ends_at=datetime(2026, 9, 1, tzinfo=UTC),
    )
    base.update(overrides)
    return MarketplaceAd(**base)


class AdMakegoodTest(unittest.IsolatedAsyncioTestCase):
    async def test_extends_ends_at_and_notifies_owner_with_audit(self):
        ad = _fake_ad()
        db = AsyncMock()
        db.get = AsyncMock(return_value=ad)
        added = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        body = biz_router.AdMakegoodRequest(reason="플랫폼 노출 버그로 3일 미노출", extend_days=5)
        with patch.object(biz_router, "audit", new=AsyncMock()) as audit_mock:
            result = await biz_router.makegood_ad(ad.id, body, request=MagicMock(), session=_fake_session(), db=db)

        self.assertEqual(ad.ends_at, datetime(2026, 9, 6, tzinfo=UTC))
        self.assertEqual(result["ends_at"], ad.ends_at)
        audit_mock.assert_awaited_once()
        notis = [o for o in added if isinstance(o, Notification)]
        self.assertEqual(len(notis), 1)
        self.assertEqual(notis[0].user_id, ad.owner_id)
        self.assertEqual(notis[0].type, "BIZ")

    async def test_no_ends_at_is_400(self):
        ad = _fake_ad(ends_at=None)
        db = AsyncMock()
        db.get = AsyncMock(return_value=ad)

        body = biz_router.AdMakegoodRequest(reason="x", extend_days=3)
        with self.assertRaises(HTTPException) as ctx:
            await biz_router.makegood_ad(ad.id, body, request=MagicMock(), session=_fake_session(), db=db)
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
