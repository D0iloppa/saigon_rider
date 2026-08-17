"""광고 노출/클릭 수집(POST /market/ads/events) code-review high #4/#5/#12 회귀 테스트.

- #5: 클라이언트가 준 business_profile_id 는 무시되고, 서버가 ad.owner_business_profile_id
  로부터 귀속을 유도한다(귀속 위조 방지).
- #4: 익명(session_uid=None) 노출은 anon_key 가 채워져 reach 중복제거가 가능해진다
  (pepper 미설정 시 이전과 동일하게 None).
- #12: occurred_at 이 48시간보다 오래된 이벤트는 적재를 거부한다(롤업 창 밖 → 조용한 유실 방지).

라우터 함수를 직접 호출하고 DB 는 MagicMock — 기존 test_biz_ad_stats_summary.py 스타일 미러.
"""

import os
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.models import MarketplaceAd
from app.routers import market
from app.schemas import AdEventIn, AdEventsIngestRequest, AdEventSurface, AdEventType


def _ad(owner_business_profile_id):
    return MarketplaceAd(
        id=uuid.uuid4(),
        partner_name="Shop",
        title="Ad",
        tier_id=uuid.uuid4(),
        owner_business_profile_id=owner_business_profile_id,
        review_status="APPROVED",
        subscription_status="active",
        is_active=True,
        is_ongoing=True,
        monthly_price_snapshot_vnd=199_000,
        created_at=datetime.now(UTC),
    )


def _db_with_ad(ad, owner_rows=()):
    """첫 execute → 광고 목록, 두번째 execute → 업체-유저 매핑(ad.owner_business_profile_id 가
    있으면 항상 조회되므로 owner_rows 가 비어도 결과 mock 은 필요)."""
    ads_result = MagicMock()
    ads_result.scalars.return_value.all.return_value = [ad]
    side_effect = [ads_result]
    if ad.owner_business_profile_id:
        owner_result = MagicMock()
        owner_result.all.return_value = owner_rows
        side_effect.append(owner_result)
    db = MagicMock()
    db.execute = AsyncMock(side_effect=side_effect)
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


def _request(ip="203.0.113.9", ua="test-agent"):
    request = MagicMock()
    headers = {"X-Real-IP": ip, "User-Agent": ua}
    request.headers.get.side_effect = lambda k, default=None: headers.get(k, default)
    request.client.host = ip
    return request


class AttributionCannotBeSpoofedTest(unittest.IsolatedAsyncioTestCase):
    async def test_client_supplied_business_profile_id_is_ignored(self):
        real_owner_profile_id = uuid.uuid4()
        ad = _ad(real_owner_profile_id)
        db = _db_with_ad(ad)
        body = AdEventsIngestRequest(
            events=[AdEventIn(ad_id=ad.id, event_type=AdEventType.IMPRESSION, surface=AdEventSurface.MARKET_FEED)]
        )

        await market.post_ad_events(_request(), body, db=db, session_uid=None)

        added = db.add.call_args.args[0]
        self.assertEqual(added.business_profile_id, real_owner_profile_id)


class AnonymousReachKeyTest(unittest.IsolatedAsyncioTestCase):
    async def test_anonymous_impression_gets_anon_key_when_pepper_set(self):
        ad = _ad(uuid.uuid4())
        db = _db_with_ad(ad)
        body = AdEventsIngestRequest(
            events=[AdEventIn(ad_id=ad.id, event_type=AdEventType.IMPRESSION, surface=AdEventSurface.MARKET_FEED)]
        )

        with patch.dict(os.environ, {"AD_ANON_KEY_PEPPER": "test-pepper"}):
            await market.post_ad_events(_request(), body, db=db, session_uid=None)

        added = db.add.call_args.args[0]
        self.assertIsNone(added.user_key)
        self.assertIsNotNone(added.anon_key)
        self.assertEqual(len(added.anon_key), 32)  # 컬럼이 CHAR(32) (database/init/153)

    async def test_anon_key_absent_without_pepper(self):
        """pepper 미설정이면 이전과 동일하게 익명 reach 는 0 으로 집계(fail-open, 회귀 아님)."""
        ad = _ad(uuid.uuid4())
        db = _db_with_ad(ad)
        body = AdEventsIngestRequest(
            events=[AdEventIn(ad_id=ad.id, event_type=AdEventType.IMPRESSION, surface=AdEventSurface.MARKET_FEED)]
        )

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AD_ANON_KEY_PEPPER", None)
            await market.post_ad_events(_request(), body, db=db, session_uid=None)

        added = db.add.call_args.args[0]
        self.assertIsNone(added.anon_key)

    async def test_logged_in_user_gets_user_key_not_anon_key(self):
        ad = _ad(uuid.uuid4())
        db = _db_with_ad(ad)
        session_uid = uuid.uuid4()
        body = AdEventsIngestRequest(
            events=[AdEventIn(ad_id=ad.id, event_type=AdEventType.IMPRESSION, surface=AdEventSurface.MARKET_FEED)]
        )

        with patch.dict(os.environ, {"AD_ANON_KEY_PEPPER": "test-pepper"}):
            await market.post_ad_events(_request(), body, db=db, session_uid=session_uid)

        added = db.add.call_args.args[0]
        self.assertEqual(added.user_key, session_uid)
        self.assertIsNone(added.anon_key)


class OccurredAtLowerBoundTest(unittest.IsolatedAsyncioTestCase):
    async def test_event_older_than_48h_is_rejected(self):
        ad = _ad(uuid.uuid4())
        db = _db_with_ad(ad)
        stale_at = datetime.now(UTC) - timedelta(hours=49)
        body = AdEventsIngestRequest(
            events=[
                AdEventIn(
                    ad_id=ad.id,
                    event_type=AdEventType.IMPRESSION,
                    surface=AdEventSurface.MARKET_FEED,
                    occurred_at=stale_at,
                )
            ]
        )

        await market.post_ad_events(_request(), body, db=db, session_uid=None)

        db.add.assert_not_called()  # 조용히 스킵 — 다른 정상 이벤트의 배치 처리를 막지 않음
        db.commit.assert_awaited()

    async def test_event_within_48h_is_accepted(self):
        ad = _ad(uuid.uuid4())
        db = _db_with_ad(ad)
        recent_at = datetime.now(UTC) - timedelta(hours=47)
        body = AdEventsIngestRequest(
            events=[
                AdEventIn(
                    ad_id=ad.id,
                    event_type=AdEventType.IMPRESSION,
                    surface=AdEventSurface.MARKET_FEED,
                    occurred_at=recent_at,
                )
            ]
        )

        await market.post_ad_events(_request(), body, db=db, session_uid=None)

        db.add.assert_called_once()


if __name__ == "__main__":
    unittest.main()
