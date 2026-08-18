"""유입 귀속 first-touch 불변식 회귀 테스트 (016 §6-2 #30, init/188).

routers/auth.py:oauth_login() 의 find-or-create 분기를 검증한다 — mock db 로 (test_account_restore.py
와 동일한 스타일, 실 DB 불필요):
1) 신규가입(identity_row is None)은 ref 를 users.acquisition_source 로 고정한다.
2) 기존 유저 재로그인(identity_row 존재)은 다른 ref 로 재진입해도 acquisition_source 를
   절대 덮어쓰지 않는다 — 이게 불변식의 전부다(소급 불가능한 값이라 한 번 잘못 덮어쓰면
   원래 유입처를 영구히 잃는다).
"""

import unittest
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from app.models import User
from app.routers import auth
from app.schemas import OAuthLoginRequest


def _make_user(**overrides) -> User:
    now = datetime.now(UTC)
    fields = dict(
        id=uuid.uuid4(),
        phone=None,
        phone_verified_at=None,
        nickname=f"u_{uuid.uuid4().hex[:12]}",
        level=1,
        exp=0,
        xp=0,
        gold=0,
        skill_pt=0,
        skill_distance_rider=0,
        skill_gold_hunter=0,
        skill_quest_slot=0,
        skill_cost_discount=0,
        skill_mileage_rate=0,
        avatar_url=None,
        manner_temp=Decimal("36.5"),
        passcode_hash=None,
        session_expires_at=None,
        status="ACTIVE",
        created_at=now,
        deleted_at=None,
        consent_agreed_at=now,
        acquisition_source=None,
    )
    fields.update(overrides)
    return User(**fields)


def _scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    return result


def _scalars_all_result(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


class AcquisitionSourceFirstTouchTest(unittest.IsolatedAsyncioTestCase):
    async def test_new_signup_stamps_ref_as_acquisition_source(self):
        """identity_row is None(신규가입) — ref 가 정규화돼 acquisition_source 로 고정된다."""
        cfg_row = MagicMock(key="google_client_id_web", value="cid")
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _scalars_all_result([cfg_row]),  # _load_oauth_config
                _scalar_result(None),  # identity find → 신규
            ]
        )
        db.commit = AsyncMock()

        body = OAuthLoginRequest(provider="google", token="tok", ref="agent:field01")
        profile = MagicMock(provider="google", provider_user_id="g-new", email="a@b.c", raw={})

        created_user_holder: dict[str, User] = {}

        def _capture_add(obj):
            if isinstance(obj, User):
                created_user_holder["user"] = obj

        db.add = MagicMock(side_effect=_capture_add)

        def _fake_flush():
            # 실 flush 는 여기서 id/기본값을 확정한다 — mock 세션이라 대신 채워준다.
            user = created_user_holder["user"]
            user.id = uuid.uuid4()
            for field, value in (
                ("level", 1),
                ("exp", 0),
                ("xp", 0),
                ("gold", 0),
                ("skill_pt", 0),
                ("skill_distance_rider", 0),
                ("skill_gold_hunter", 0),
                ("skill_quest_slot", 0),
                ("skill_cost_discount", 0),
                ("skill_mileage_rate", 0),
                ("manner_temp", Decimal("36.5")),
                ("created_at", datetime.now(UTC)),
            ):
                setattr(user, field, value)

        db.flush = AsyncMock(side_effect=_fake_flush)

        # 최종 refetch(3번째 db.execute 호출)는 방금 만든 user 를 그대로 돌려준다 — db.add() 로
        # 캡처된 user 는 이 시점에야 확정되므로 side_effect 를 함수로 지연 평가한다.
        async def _execute_side_effect(*args, **kwargs):
            call_no = _execute_side_effect.calls
            _execute_side_effect.calls += 1
            if call_no == 0:
                return _scalars_all_result([cfg_row])  # _load_oauth_config
            if call_no == 1:
                return _scalar_result(None)  # identity find → 신규
            return _scalar_result(created_user_holder.get("user"))  # 최종 refetch

        _execute_side_effect.calls = 0
        db.execute = AsyncMock(side_effect=_execute_side_effect)

        with (
            patch.object(auth, "verify_google_token", AsyncMock(return_value=profile)),
            patch.object(auth, "generate_random_nickname", AsyncMock(return_value="nick_1")),
            patch.object(auth.funnel_events, "record", AsyncMock()) as record_mock,
        ):
            result = await auth.oauth_login(body, db)

        new_user = created_user_holder["user"]
        self.assertEqual(new_user.acquisition_source, "agent:field01")
        self.assertEqual(result.user.id, new_user.id)
        # SIGNUP 계측에도 같은 값이 스탬프됐는지(§6-2 "이후 모든 이벤트에 acq_source 스탬프").
        record_mock.assert_awaited_once()
        self.assertEqual(record_mock.await_args.kwargs.get("acq_source"), "agent:field01")

    async def test_existing_user_relogin_does_not_overwrite_acquisition_source(self):
        """identity_row 존재(재로그인) — 다른 ref 로 재진입해도 acquisition_source 불변."""
        existing_user = _make_user(acquisition_source="organic")
        identity_row = MagicMock(user_id=existing_user.id)
        cfg_row = MagicMock(key="google_client_id_web", value="cid")

        async def _execute_side_effect(*args, **kwargs):
            call_no = _execute_side_effect.calls
            _execute_side_effect.calls += 1
            if call_no == 0:
                return _scalars_all_result([cfg_row])  # _load_oauth_config
            if call_no == 1:
                return _scalar_result(identity_row)  # identity find → 기존
            if call_no == 2:
                return _scalar_result(existing_user)  # 기존 user 조회
            return _scalar_result(existing_user)  # 최종 refetch

        _execute_side_effect.calls = 0
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=_execute_side_effect)
        db.commit = AsyncMock()

        # 완전히 다른(어뷰징성) ref 로 재진입 — 신규가입이 아니므로 절대 반영되면 안 된다.
        body = OAuthLoginRequest(provider="google", token="tok", ref="agent:hijack")
        profile = MagicMock(provider="google", provider_user_id="g-existing", email="a@b.c", raw={})

        with (
            patch.object(auth, "verify_google_token", AsyncMock(return_value=profile)),
            patch.object(auth.funnel_events, "record", AsyncMock()),
        ):
            result = await auth.oauth_login(body, db)

        self.assertEqual(existing_user.acquisition_source, "organic")
        self.assertEqual(result.user.id, existing_user.id)


if __name__ == "__main__":
    unittest.main()
