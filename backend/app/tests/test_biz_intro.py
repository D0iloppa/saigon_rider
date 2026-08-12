"""업체소개(intro) 필드 신설 + 검색 blob 확장 회귀 테스트 (대표 결정 ①②, 260801 설계 §7-②).

수정 전 FAIL 실증:
  - `BusinessProfileOut`/`BusinessPublicProfileOut` 에 `intro` 가 없던 시점에는
    `biz._out()`/`get_public_profile()` 이 `p.intro` 접근 시 AttributeError 로 실패했다
    (test_biz_verification_content_ownership.py 의 `_profile()` fixture 가 실제로 이 방식으로
    깨졌음을 이번 세션에 실측 확인 — pytest 1 failed 재현 후 fixture 에 intro=None 추가로 해결).
  - `search_index._TEXT_FIELDS["biz"]` 가 `[row.name]` 뿐이던 시점에는 address/intro 가 blob 에
    안 들어가 아래 `test_biz_text_fields_include_address_and_intro` 가 실패했다.
"""

import unittest
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from pydantic import ValidationError

from app.routers import biz
from app.schemas import BusinessProfileApplyRequest, BusinessProfileUpdateRequest
from app.services import search_index


def _count_result(n: int):
    result = MagicMock()
    result.scalar_one.return_value = n
    return result


class IntroSchemaLengthTests(unittest.TestCase):
    """계약: intro 는 optional, 최대 500자 (Pydantic max_length)."""

    def test_apply_request_accepts_missing_intro(self):
        req = BusinessProfileApplyRequest(name="Shop", address="HCMC", latitude=1, longitude=1, phone="0900")
        self.assertIsNone(req.intro)

    def test_apply_request_rejects_over_500_chars(self):
        with self.assertRaises(ValidationError):
            BusinessProfileApplyRequest(
                name="Shop", address="HCMC", latitude=1, longitude=1, phone="0900", intro="x" * 501
            )

    def test_update_request_rejects_over_500_chars(self):
        with self.assertRaises(ValidationError):
            BusinessProfileUpdateRequest(
                name="Shop", address="HCMC", latitude=1, longitude=1, phone="0900", intro="x" * 501
            )


class ApplyIntroWiringTests(unittest.IsolatedAsyncioTestCase):
    """apply() — intro 를 저장하고, 즉시 blob 에 반영하고, 재색인 이벤트에 실어 보낸다."""

    async def test_intro_flows_into_profile_blob_and_reindex_event(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_count_result(0))
        db.get = AsyncMock(return_value=None)
        added = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        async def _fake_refresh(obj):
            # 실 DB 없이는 SQLAlchemy 컬럼 default(id/verification_status)가 채워지지 않는다 —
            # commit 이후 refresh 가 그 값을 메꾸는 것을 흉내낸다(테스트 하네스 한계, 로직과 무관).
            if obj.id is None:
                obj.id = uuid.uuid4()
            if getattr(obj, "verification_status", None) is None:
                obj.verification_status = "pending"

        db.refresh = AsyncMock(side_effect=_fake_refresh)

        body = BusinessProfileApplyRequest(
            name="Shop",
            address="123 Nguyen Trai",
            latitude=1,
            longitude=1,
            phone="0900",
            intro="Bán xe đạp và phụ tùng",
        )
        result = await biz.apply(body, background=MagicMock(), db=db, session_uid=uuid.uuid4())

        self.assertEqual(result.intro, "Bán xe đạp và phụ tùng")
        profile = next(o for o in added if isinstance(o, biz.BusinessProfile))
        self.assertIn("ban xe dap va phu tung", profile.search_blob)
        self.assertIn("123 nguyen trai", profile.search_blob)
        outbox = next(o for o in added if not isinstance(o, biz.BusinessProfile))
        self.assertIn("Bán xe đạp và phụ tùng", outbox.payload["texts"])

    async def test_missing_intro_still_succeeds_and_blob_has_no_none(self):
        """fail-open: intro 가 없어도 등록 자체는 막히지 않고 blob 은 원문(name/address)만으로 채워진다."""
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_count_result(0))
        db.get = AsyncMock(return_value=None)
        added = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        async def _fake_refresh(obj):
            # 실 DB 없이는 SQLAlchemy 컬럼 default(id/verification_status)가 채워지지 않는다 —
            # commit 이후 refresh 가 그 값을 메꾸는 것을 흉내낸다(테스트 하네스 한계, 로직과 무관).
            if obj.id is None:
                obj.id = uuid.uuid4()
            if getattr(obj, "verification_status", None) is None:
                obj.verification_status = "pending"

        db.refresh = AsyncMock(side_effect=_fake_refresh)

        body = BusinessProfileApplyRequest(name="Shop", address="HCMC", latitude=1, longitude=1, phone="0900")
        result = await biz.apply(body, background=MagicMock(), db=db, session_uid=uuid.uuid4())

        self.assertIsNone(result.intro)
        profile = next(o for o in added if isinstance(o, biz.BusinessProfile))
        self.assertNotIn("none", profile.search_blob)


class ApplyPhoneAutoClaimTests(unittest.IsolatedAsyncioTestCase):
    """apply() — 인증된 세션 계정 전화번호만 CSV 프로필 자동 귀속 권한으로 사용한다."""

    _VALID_PHONE = "+84 901 234 567"  # _normalize_vn_phone → "+84901234567"

    def _count_result(self, n: int):
        result = MagicMock()
        result.scalar_one.return_value = n
        return result

    def _candidates_result(self, rows: list):
        result = MagicMock()
        result.scalars.return_value.all.return_value = rows
        return result

    def _locked_result(self, row):
        result = MagicMock()
        result.scalar_one_or_none.return_value = row
        return result

    def _user(self, phone: str, *, verified: bool = True):
        return SimpleNamespace(
            phone=phone,
            phone_verified_at=datetime(2026, 8, 12, tzinfo=UTC) if verified else None,
        )

    def _unclaimed_approved_profile(self, phone: str, user_id=None):
        return SimpleNamespace(
            id=uuid.uuid4(),
            user_id=user_id,
            name="CSV Shop",
            category="wash",
            address="170 Dien Bien Phu",
            intro=None,
            latitude=1,
            longitude=1,
            phone=phone,
            photo_content_id=None,
            photo_content=None,
            status="APPROVED",
            reject_reason=None,
            verification_status="pending",
            biz_license_content_id=None,
            signboard_content_id=None,
            rep_name=None,
            verified_at=None,
            verification_reject_reason=None,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            updated_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

    @staticmethod
    def _set_pending_refresh(db):
        async def _fake_refresh(obj):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if getattr(obj, "verification_status", None) is None:
                obj.verification_status = "pending"

        db.refresh = AsyncMock(side_effect=_fake_refresh)

    async def test_verified_account_phone_match_claims_locked_existing_row(self):
        candidate = self._unclaimed_approved_profile(phone="+84901234567")
        db = AsyncMock()
        db.get = AsyncMock(return_value=self._user(self._VALID_PHONE))
        db.execute = AsyncMock(
            side_effect=[
                self._count_result(0),
                self._candidates_result([candidate]),
                self._locked_result(candidate),
            ]
        )
        added = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        body = BusinessProfileApplyRequest(
            name="My Shop", address="123 Nguyen Trai", latitude=1, longitude=1, phone="+84987654321"
        )
        session_uid = uuid.uuid4()
        result = await biz.apply(body, background=MagicMock(), db=db, session_uid=session_uid)

        self.assertEqual(result.id, candidate.id)
        self.assertEqual(result.status, "APPROVED")
        self.assertEqual(candidate.user_id, session_uid)
        self.assertFalse(any(isinstance(o, biz.BusinessProfile) for o in added))
        db.commit.assert_awaited()
        lock_statement = db.execute.await_args_list[2].args[0]
        self.assertIn("FOR UPDATE", str(lock_statement))

    async def test_unverified_account_cannot_claim_matching_body_phone(self):
        candidate = self._unclaimed_approved_profile(phone="+84901234567")
        db = AsyncMock()
        db.get = AsyncMock(return_value=self._user(self._VALID_PHONE, verified=False))
        db.execute = AsyncMock(return_value=self._count_result(0))
        added = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))
        self._set_pending_refresh(db)

        body = BusinessProfileApplyRequest(
            name="My Shop", address="123 Nguyen Trai", latitude=1, longitude=1, phone=self._VALID_PHONE
        )
        result = await biz.apply(body, background=MagicMock(), db=db, session_uid=uuid.uuid4())

        self.assertEqual(result.status, "PENDING")
        self.assertIsNone(candidate.user_id)
        self.assertEqual(db.execute.await_count, 1)  # 후보 존재 여부를 조회하지 않아 응답으로 노출하지 않는다.

    async def test_body_phone_matching_candidate_does_not_override_verified_account_phone(self):
        candidate = self._unclaimed_approved_profile(phone="+84987654321")
        db = AsyncMock()
        db.get = AsyncMock(return_value=self._user(self._VALID_PHONE))
        db.execute = AsyncMock(side_effect=[self._count_result(0), self._candidates_result([candidate])])
        added = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))
        self._set_pending_refresh(db)

        body = BusinessProfileApplyRequest(
            name="My Shop", address="123 Nguyen Trai", latitude=1, longitude=1, phone="+84987654321"
        )
        result = await biz.apply(body, background=MagicMock(), db=db, session_uid=uuid.uuid4())

        self.assertEqual(result.status, "PENDING")
        self.assertIsNone(candidate.user_id)

    async def test_no_phone_match_creates_new_pending_profile_as_before(self):
        db = AsyncMock()
        db.get = AsyncMock(return_value=self._user(self._VALID_PHONE))
        db.execute = AsyncMock(side_effect=[self._count_result(0), self._candidates_result([])])
        added = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        async def _fake_refresh(obj):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if getattr(obj, "verification_status", None) is None:
                obj.verification_status = "pending"

        db.refresh = AsyncMock(side_effect=_fake_refresh)

        body = BusinessProfileApplyRequest(
            name="My Shop", address="123 Nguyen Trai", latitude=1, longitude=1, phone=self._VALID_PHONE
        )
        result = await biz.apply(body, background=MagicMock(), db=db, session_uid=uuid.uuid4())

        self.assertEqual(result.status, "PENDING")
        profile = next(o for o in added if isinstance(o, biz.BusinessProfile))
        self.assertEqual(profile.status, "PENDING")

    async def test_second_claim_loses_after_locked_row_recheck(self):
        """후보 조회 뒤 다른 요청이 먼저 귀속해도 잠금 재조회 결과를 기준으로 PENDING 처리한다."""
        original_owner = uuid.uuid4()
        stale_candidate = self._unclaimed_approved_profile(phone="+84901234567")
        locked_claimed = self._unclaimed_approved_profile(phone="+84901234567", user_id=original_owner)
        locked_claimed.id = stale_candidate.id
        db = AsyncMock()
        db.get = AsyncMock(return_value=self._user(self._VALID_PHONE))
        db.execute = AsyncMock(
            side_effect=[
                self._count_result(0),
                self._candidates_result([stale_candidate]),
                self._locked_result(locked_claimed),
            ]
        )
        added = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        async def _fake_refresh(obj):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if getattr(obj, "verification_status", None) is None:
                obj.verification_status = "pending"

        db.refresh = AsyncMock(side_effect=_fake_refresh)

        body = BusinessProfileApplyRequest(
            name="My Shop", address="123 Nguyen Trai", latitude=1, longitude=1, phone=self._VALID_PHONE
        )
        result = await biz.apply(body, background=MagicMock(), db=db, session_uid=uuid.uuid4())

        self.assertEqual(result.status, "PENDING")
        profile = next(o for o in added if isinstance(o, biz.BusinessProfile))
        self.assertEqual(profile.status, "PENDING")
        self.assertIsNone(stale_candidate.user_id)
        self.assertEqual(locked_claimed.user_id, original_owner)
        lock_statement = db.execute.await_args_list[2].args[0]
        self.assertIn("FOR UPDATE", str(lock_statement))


class UpdateProfileIntroWiringTests(unittest.IsolatedAsyncioTestCase):
    async def test_update_sets_intro_and_recomputes_blob(self):
        owner_id = uuid.uuid4()
        profile = SimpleNamespace(
            id=uuid.uuid4(),
            user_id=owner_id,
            status="APPROVED",
            name="old",
            address="old addr",
            intro="old intro",
            category=None,
            latitude=None,
            longitude=None,
            phone=None,
            photo_content_id=None,
            photo_content=None,
            search_blob=None,
            reject_reason=None,
            reviewed_at=None,
            verification_status="verified",
            biz_license_content_id=None,
            signboard_content_id=None,
            rep_name=None,
            verified_at=None,
            verification_reject_reason=None,
            created_at=datetime(2026, 7, 1, tzinfo=UTC),
            updated_at=datetime(2026, 7, 1, tzinfo=UTC),
        )
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        added = []
        db.add = MagicMock(side_effect=lambda obj: added.append(obj))

        body = BusinessProfileUpdateRequest(
            name="Shop Mới",
            address="456 Le Loi",
            latitude=1,
            longitude=1,
            phone="0900",
            intro="Sửa xe máy chuyên nghiệp",
        )
        result = await biz.update_profile(profile.id, body, background=MagicMock(), db=db, session_uid=owner_id)

        self.assertEqual(result.intro, "Sửa xe máy chuyên nghiệp")
        self.assertIn("sua xe may chuyen nghiep", profile.search_blob)
        self.assertIn("456 le loi", profile.search_blob)


class PublicProfileIntroExposureTests(unittest.IsolatedAsyncioTestCase):
    @patch.object(biz.AdsApplication, "profile_public_ads", new_callable=AsyncMock, return_value=[])
    async def test_public_detail_exposes_intro(self, _mock_ads):
        profile = SimpleNamespace(
            id=uuid.uuid4(),
            name="Shop",
            category=None,
            address=None,
            intro="Chúng tôi bán xe đạp",
            latitude=None,
            longitude=None,
            phone=None,
            photo_content=None,
            status="APPROVED",
            user_id=uuid.uuid4(),
        )
        db = AsyncMock()
        db.get = AsyncMock(side_effect=[profile, None])
        result_mock = MagicMock()
        result_mock.scalar_one.return_value = 0
        db.execute = AsyncMock(return_value=result_mock)

        result = await biz.get_public_profile(profile.id, db=db, session_uid=None)

        self.assertEqual(result.intro, "Chúng tôi bán xe đạp")


class SearchIndexBizFieldsTests(unittest.IsolatedAsyncioTestCase):
    """search_index._TEXT_FIELDS['biz'] — name 뿐 아니라 address/intro 도 검색 대상이어야 한다."""

    async def test_biz_text_fields_include_address_and_intro(self):
        row = SimpleNamespace(name="Shop", address="Quận 1", intro="Bán xe máy", search_blob=None)
        db = AsyncMock()
        db.get = AsyncMock(return_value=row)
        with patch.object(search_index, "lookup_lang_batch", AsyncMock(side_effect=lambda texts, lang, db: texts)):
            await search_index.reindex_entity(db, "biz", uuid.uuid4())
        self.assertIn("quan 1", row.search_blob)
        self.assertIn("ban xe may", row.search_blob)

    async def test_null_intro_does_not_drop_row_from_blob(self):
        """fail-open: intro NULL(기존 업체)이어도 blob 계산이 깨지거나 name 이 사라지면 안 된다."""
        row = SimpleNamespace(name="Old Shop", address="Old Addr", intro=None, search_blob=None)
        db = AsyncMock()
        db.get = AsyncMock(return_value=row)
        with patch.object(search_index, "lookup_lang_batch", AsyncMock(side_effect=lambda texts, lang, db: texts)):
            await search_index.reindex_entity(db, "biz", uuid.uuid4())
        self.assertIn("old shop", row.search_blob)
        self.assertIn("old addr", row.search_blob)


class PriceTranslationWiringTests(unittest.IsolatedAsyncioTestCase):
    """create_price — BusinessPrice.name 도 번역 대상(대표 결정 ③)에 들어가야 한다."""

    async def test_create_price_schedules_translation_warm(self):
        owner_id = uuid.uuid4()
        profile = SimpleNamespace(id=uuid.uuid4(), user_id=owner_id)
        db = AsyncMock()
        db.get = AsyncMock(return_value=profile)
        db.execute = AsyncMock(return_value=_count_result(0))
        db.add = MagicMock(side_effect=lambda obj: setattr(obj, "id", uuid.uuid4()))
        background = MagicMock()

        from app.schemas import BusinessPriceCreateRequest

        body = BusinessPriceCreateRequest(profile_id=profile.id, name="Thay nhớt", price_vnd=150000)
        await biz.create_price(body, background=background, db=db, session_uid=owner_id)

        background.add_task.assert_called_once_with(biz.warm_translations, ["Thay nhớt"])


if __name__ == "__main__":
    unittest.main()
