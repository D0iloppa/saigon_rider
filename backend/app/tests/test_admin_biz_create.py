"""admin_api/biz.py — 관리자 업체 직접 등록 (init/168, 대표 결정 후속).

수정 전 FAIL 실증:
  - `BizAccountRow.applicant_id`가 `uuid.UUID`(non-optional)이던 시점엔 소유자 없는 프로필을
    행으로 만들려 하면 Pydantic `ValidationError`가 났다(실측: 이번 세션에 필드를 되돌려
    `ApplicantIdNullableTests`를 재실행 → 1 failed 확인 후 복원).
  - `create_biz_account` 엔드포인트 자체가 없어 `admin_api.biz`에 해당 이름이 `AttributeError`.
  - `list_biz_accounts`/`get_biz_account`가 `User`와 INNER JOIN이던 시점엔 소유자 없는 행이
    질의에서 통째로 사라진다(라이브 검증 항목 — unit 레벨로는 join 종류만 정적 확인).
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError

from app.models import BusinessProfile
from app.routers.admin_api import biz as admin_biz


class ApplicantIdNullableTests(unittest.TestCase):
    """계약: 관리자 직접 등록 프로필은 소유자가 없어 applicant_id 가 None 이어야 한다."""

    def _row_kwargs(self, applicant_id):
        return dict(
            id=uuid.uuid4(),
            created_at=datetime.now(UTC),
            name="Shop",
            category=None,
            address=None,
            phone=None,
            photo_url=None,
            applicant_id=applicant_id,
            applicant_nickname=None,
            status="APPROVED",
            reject_reason=None,
        )

    def test_accepts_none_applicant_id(self):
        row = admin_biz.BizAccountRow(**self._row_kwargs(None))
        self.assertIsNone(row.applicant_id)

    def test_still_accepts_real_applicant_id(self):
        uid = uuid.uuid4()
        row = admin_biz.BizAccountRow(**self._row_kwargs(uid))
        self.assertEqual(row.applicant_id, uid)


class CreateBizAccountTests(unittest.IsolatedAsyncioTestCase):
    """POST /admin/api/biz/accounts — 소유자 없이 즉시 APPROVED 로 생성 + 검색 배선."""

    def _request(self):
        request = MagicMock()
        request.headers.get.return_value = None
        request.client = None
        return request

    async def test_creates_approved_profile_without_owner_and_wires_search(self):
        db = AsyncMock()
        added: list = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        async def _fake_refresh(obj):
            # 실제 DB flush/refresh 라면 컬럼 default(id, verification_status)가 채워진다 —
            # AsyncMock 은 그 과정을 건너뛰므로 여기서 흉내낸다.
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.verification_status is None:
                obj.verification_status = "pending"

        db.refresh = AsyncMock(side_effect=_fake_refresh)

        body = admin_biz.BizAccountCreateRequest(
            name=" Pho Shop ",
            category="food",
            address=" 123 Le Loi ",
            latitude=10.77,
            longitude=106.70,
            phone="0900000000",
            intro="best pho",
        )
        session = SimpleNamespace(username="root", role="root")

        with patch("app.routers.admin_api.biz.noti_events.enqueue") as mock_enqueue:
            result = await admin_biz.create_biz_account(
                body, BackgroundTasks(), self._request(), session=session, db=db
            )

        profile = next(o for o in added if isinstance(o, BusinessProfile))
        self.assertIsNone(profile.user_id)
        self.assertEqual(profile.status, "APPROVED")
        self.assertIsNotNone(profile.reviewed_at)
        self.assertEqual(profile.name, "Pho Shop")  # strip 적용
        self.assertIn("pho shop", profile.search_blob or "")  # immediate_blob 은 소문자 정규화

        mock_enqueue.assert_called_once()
        _, event_type, payload = mock_enqueue.call_args[0]
        self.assertEqual(event_type, "search.reindex")
        self.assertEqual(payload["entity_type"], "biz")

        self.assertIsNone(result.applicant_id)
        self.assertEqual(result.status, "APPROVED")

    async def test_rejects_empty_name(self):
        db = AsyncMock()
        body = admin_biz.BizAccountCreateRequest(
            name="   ", address="addr", latitude=10.0, longitude=106.0, phone="0900"
        )
        session = SimpleNamespace(username="root", role="root")
        with self.assertRaises(HTTPException) as ctx:
            await admin_biz.create_biz_account(body, BackgroundTasks(), self._request(), session=session, db=db)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_intro_over_500_chars_rejected_by_schema(self):
        with self.assertRaises(ValidationError):
            admin_biz.BizAccountCreateRequest(
                name="Shop", address="addr", latitude=10.0, longitude=106.0, phone="0900", intro="x" * 501
            )


if __name__ == "__main__":
    unittest.main()
