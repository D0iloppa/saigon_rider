"""013/016 §8(L5 이슈) #27 — 업체 전용 이슈 채널 (016 §9 완료 검증 조건, 강제 제약 #3 최우선).

광고주가 BizDashboard 에서 "광고가 안 나옵니다"를 제출하면 계약ID·지면·기간이 자동 첨부되고
SEV2 로 통합 큐에 접수된다. own_ad() 로 소유권을 검증해 타 업체 계약 컨텍스트를 첨부할 수
없게 한다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.modules.ads.application import AdRead, AdsError
from app.routers import biz
from app.schemas import BizIssueCreateRequest, IssueCategory


def _fake_ad(**overrides) -> AdRead:
    base = dict(
        id=uuid.uuid4(),
        partner_name="Test Partner",
        title="ad title",
        body=None,
        image_url=None,
        image_file_path=None,
        link_url=None,
        phone=None,
        address=None,
        owner_id=uuid.uuid4(),
        owner_business_profile_id=uuid.uuid4(),
        district_id=7,
        category="cafe",
        rating=None,
        service_count=None,
        established_year=None,
        business_hours=None,
        is_active=True,
        review_status="APPROVED",
        reject_reason=None,
        is_ongoing=True,
        subscription_status="active",
        starts_at=datetime(2026, 8, 1, tzinfo=UTC),
        ends_at=datetime(2026, 9, 1, tzinfo=UTC),
        sort_order=0,
        ad_fee=1,
        tier_id=uuid.uuid4(),
        tier_name="premium",
        monthly_price_snapshot_vnd=500000,
        created_at=datetime(2026, 7, 1, tzinfo=UTC),
    )
    base.update(overrides)
    return AdRead(**base)


class BizIssueChannelTest(unittest.IsolatedAsyncioTestCase):
    async def test_creates_ticket_with_contract_context_and_sev2(self):
        ad = _fake_ad()
        session_uid = ad.owner_id
        body = BizIssueCreateRequest(
            ad_id=ad.id, category=IssueCategory.P_NOSERVE, title="광고가 안 나옵니다", body="지난주부터 노출이 0입니다"
        )
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        captured = {}

        async def _fake_refresh(obj):
            obj.id = uuid.uuid4()
            obj.created_at = datetime.now(UTC)
            obj.updated_at = datetime.now(UTC)
            captured["ticket"] = obj

        db.refresh = AsyncMock(side_effect=_fake_refresh)

        with patch.object(biz.AdsApplication, "own_ad", new=AsyncMock(return_value=(ad, MagicMock()))):
            out = await biz.create_biz_issue(body, db=db, session_uid=session_uid)

        ticket = captured["ticket"]
        self.assertEqual(ticket.source, "BIZ")
        self.assertEqual(ticket.persona, "BIZ")
        self.assertEqual(ticket.severity, "SEV2")
        self.assertEqual(ticket.category, "P-NOSERVE")
        self.assertEqual(ticket.contract_context["ad_id"], str(ad.id))
        self.assertEqual(ticket.contract_context["tier_name"], "premium")
        self.assertEqual(ticket.contract_context["district_id"], 7)
        self.assertEqual(ticket.contract_context["starts_at"], ad.starts_at.isoformat())
        self.assertEqual(ticket.contract_context["ends_at"], ad.ends_at.isoformat())
        self.assertEqual(out.severity, "SEV2")
        self.assertEqual(out.source, "BIZ")

    async def test_not_owner_is_rejected(self):
        """own_ad() 가 소유권 불일치를 AdsError 로 던지면 그대로 전파(타 업체 계약 도용 방지)."""
        body = BizIssueCreateRequest(ad_id=uuid.uuid4(), title="t", body="b")
        db = AsyncMock()

        with (
            patch.object(biz.AdsApplication, "own_ad", new=AsyncMock(side_effect=AdsError(404, "not found"))),
            self.assertRaises(HTTPException) as ctx,
        ):
            await biz.create_biz_issue(body, db=db, session_uid=uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
