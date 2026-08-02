"""탈퇴 계정 복구(재활성) 플로우 회귀 테스트.

- 로그인: soft-delete + 유예기간 내 → 409 + restore_token / 유예 경과 → 404 / BANNED → 복구 배제
- 콜백 redirect 경로: 복구 토큰이 리다이렉트 URL 에 절대 실리지 않는다 (교환코드만 노출)
- 교환코드 → POST /auth/oauth/exchange 409 → restore 성공까지의 경로
- restore_token 은 일반 세션으로 절대 통하지 않는다 (deps.verify_user_session 의 deleted_at 가드)
- POST /auth/account/restore: 성공·만료·재사용(1회성)·BANNED·유예 경과
- delete_account 익명화 값의 UNIQUE 충돌 방지 (같은 초 두 명 탈퇴)

라우터 함수를 직접 호출해 mock db 로 검증한다 (test_idor_p0_fixes.py 스타일 — 실 DB 불필요).
"""

import unittest
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app import deps
from app.models import User
from app.routers import auth, users
from app.routers.auth import AccountRestoreRequest
from app.schemas import OAuthLoginRequest
from app.services.oauth_flow import OAuthExchangePayload


def _make_user(**overrides) -> User:
    now = datetime.now(UTC)
    fields = dict(
        id=uuid.uuid4(),
        phone=f"del_{uuid.uuid4().hex[:16]}",
        phone_verified_at=None,
        nickname=f"del_{uuid.uuid4().hex[:16]}",
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
        deleted_at=now - timedelta(days=5),
        consent_agreed_at=now,
    )
    fields.update(overrides)
    return User(**fields)


def _scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _scalars_all_result(rows):
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


def _grant_db(user: User) -> AsyncMock:
    """_issue_restore_grant 용 mock 세션 — user 조회 1회 + commit."""
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_scalar_result(user))
    db.commit = AsyncMock()
    return db


async def _issue_token(user: User) -> str:
    grant = await auth._issue_restore_grant(_grant_db(user), user.id)
    assert grant is not None
    return grant["restore_token"]


class OAuthLoginDeletedAccountTest(unittest.IsolatedAsyncioTestCase):
    """POST /auth/oauth/login — 신원 행은 있는데 user 가 soft-delete 인 분기."""

    def _login_db(self, deleted_user: User) -> AsyncMock:
        cfg_row = MagicMock(key="google_client_id_web", value="cid")
        identity_row = MagicMock(user_id=deleted_user.id)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _scalars_all_result([cfg_row]),  # _load_oauth_config
                _scalar_result(identity_row),  # identity find
                _scalar_result(None),  # active user (deleted_at IS NULL) → 없음
                _scalar_result(deleted_user),  # _issue_restore_grant 의 user 조회
            ]
        )
        db.commit = AsyncMock()
        return db

    async def _login(self, deleted_user: User):
        body = OAuthLoginRequest(provider="google", token="tok")
        profile = MagicMock(provider="google", provider_user_id="g-1", email="a@b.c", raw={})
        with (
            patch.object(auth, "verify_google_token", AsyncMock(return_value=profile)),
            self.assertRaises(HTTPException) as raised,
        ):
            await auth.oauth_login(body, self._login_db(deleted_user))
        return raised.exception

    async def test_deleted_within_grace_returns_409_with_restore_token(self):
        user = _make_user()
        exc = await self._login(user)
        self.assertEqual(exc.status_code, 409)
        self.assertEqual(exc.detail["code"], "account_deleted")
        self.assertEqual(exc.detail["deleted_at"], user.deleted_at.isoformat())
        self.assertEqual(
            exc.detail["restorable_until"],
            (user.deleted_at + timedelta(days=auth.RETENTION_DAYS)).isoformat(),
        )
        token = exc.detail["restore_token"]
        self.assertTrue(token.startswith(user.id.hex))
        # 토큰은 기존 세션 장치에 해시로 저장되고 TTL 10분
        self.assertTrue(auth._verify(token, user.passcode_hash))
        remaining = user.session_expires_at - datetime.now(UTC)
        self.assertLessEqual(remaining, auth.RESTORE_TOKEN_TTL)
        self.assertGreater(remaining, auth.RESTORE_TOKEN_TTL - timedelta(minutes=1))

    async def test_grace_expired_returns_404(self):
        user = _make_user(deleted_at=datetime.now(UTC) - timedelta(days=auth.RETENTION_DAYS + 1))
        exc = await self._login(user)
        self.assertEqual(exc.status_code, 404)
        self.assertIsNone(user.passcode_hash)  # 토큰 미발급

    async def test_banned_deleted_gets_no_restore_token(self):
        # BANNED 체크가 복구보다 먼저 — 탈퇴→복구로 제재 세탁 금지.
        user = _make_user(status="BANNED")
        exc = await self._login(user)
        self.assertEqual(exc.status_code, 404)
        self.assertIsNone(user.passcode_hash)


class CallbackRedirectNeverCarriesRestoreTokenTest(unittest.IsolatedAsyncioTestCase):
    """[보안 회귀] 복구 토큰은 세션 토큰과 동급 — 리다이렉트 URL 쿼리에 절대 실리면 안 된다.

    콜백은 성공 경로와 완전히 동일하게 1회용 교환코드만 URL 에 노출해야 한다
    (nginx access log·브라우저 히스토리에 복구 토큰이 남는 결함의 재발 방지).
    복구 가능/파기 대상 판단은 POST /auth/oauth/exchange 한 곳에서만 한다.
    """

    def _callback_db(self, deleted_user: User) -> AsyncMock:
        cfg_rows = [
            MagicMock(key="google_client_id_web", value="cid"),
            MagicMock(key="google_client_secret_web", value="secret"),
        ]
        identity_row = MagicMock(user_id=deleted_user.id)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _scalars_all_result(cfg_rows),  # _load_oauth_config
                _scalar_result(identity_row),  # identity find
                _scalar_result(None),  # active user (deleted_at IS NULL) → 없음
            ]
        )
        db.commit = AsyncMock()
        return db

    async def _callback(self, deleted_user: User) -> str:
        profile = MagicMock(provider="google", provider_user_id="g-1", email="a@b.c", raw={})
        with (
            patch.object(auth, "consume_oauth_state", AsyncMock(return_value=(True, None))),
            patch.object(auth, "exchange_google_code", AsyncMock(return_value=profile)),
            patch.object(auth, "issue_oauth_exchange", AsyncMock(return_value="exch-code-1")) as issue_mock,
        ):
            response = await auth.oauth_google_callback(
                code="gcode", state="st", error=None, db=self._callback_db(deleted_user)
            )
        self._issue_mock = issue_mock
        return response.headers["location"]

    async def test_deleted_account_redirects_with_exchange_code_only(self):
        user = _make_user()
        location = await self._callback(user)
        self.assertEqual(location, f"{auth._APP_DEEP_LINK}?code=exch-code-1")
        # URL 어디에도 restore 토큰/파라미터가 없다
        self.assertNotIn("restore", location)
        self.assertNotIn(user.id.hex, location)
        # 콜백 단계에서는 복구 토큰을 발급하지 않는다 (발급은 exchange 409 응답에서)
        self.assertIsNone(user.passcode_hash)
        self._issue_mock.assert_awaited_once_with(str(user.id), False)

    async def test_grace_expired_deleted_account_also_carries_no_token(self):
        # 유예 경과 계정도 콜백은 동일 — 404 판단은 exchange 에서 (아래 ExchangeDeletedAccountTest).
        user = _make_user(deleted_at=datetime.now(UTC) - timedelta(days=auth.RETENTION_DAYS + 1))
        location = await self._callback(user)
        self.assertEqual(location, f"{auth._APP_DEEP_LINK}?code=exch-code-1")
        self.assertNotIn("restore", location)
        self.assertIsNone(user.passcode_hash)


class ExchangeDeletedAccountTest(unittest.IsolatedAsyncioTestCase):
    """교환코드 → POST /auth/oauth/exchange 409 → restore 성공까지의 경로."""

    async def test_exchange_returns_409_then_restore_succeeds(self):
        user = _make_user()
        payload = OAuthExchangePayload(user_id=str(user.id), is_new=False)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _scalar_result(None),  # active user (deleted_at IS NULL) → 없음
                _scalar_result(user),  # _issue_restore_grant 의 user 조회
            ]
        )
        db.commit = AsyncMock()
        with (
            patch.object(auth, "consume_oauth_exchange", AsyncMock(return_value=payload)),
            self.assertRaises(HTTPException) as raised,
        ):
            await auth.oauth_exchange(auth.OAuthExchangeRequest(code="exch-code-1"), db)
        exc = raised.exception
        self.assertEqual(exc.status_code, 409)
        self.assertEqual(exc.detail["code"], "account_deleted")
        token = exc.detail["restore_token"]

        # 409 본문의 토큰으로 실제 복구까지 통과한다
        restore_db = AsyncMock()
        restore_db.execute = AsyncMock(return_value=_scalar_result(user))
        restore_db.commit = AsyncMock()
        with patch.object(auth, "generate_random_nickname", AsyncMock(return_value="New Rider 123")):
            result = await auth.restore_account(AccountRestoreRequest(restore_token=token), restore_db)
        self.assertIsNone(user.deleted_at)
        self.assertFalse(result.is_new)

    async def test_exchange_grace_expired_returns_404(self):
        # 콜백은 무조건 교환코드로 보내므로, 파기 대상(유예 경과) 404 판단은 여기서 이뤄진다.
        user = _make_user(deleted_at=datetime.now(UTC) - timedelta(days=auth.RETENTION_DAYS + 1))
        payload = OAuthExchangePayload(user_id=str(user.id), is_new=False)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _scalar_result(None),  # active user (deleted_at IS NULL) → 없음
                _scalar_result(user),  # _issue_restore_grant 의 user 조회 → 유예 경과
            ]
        )
        db.commit = AsyncMock()
        with (
            patch.object(auth, "consume_oauth_exchange", AsyncMock(return_value=payload)),
            self.assertRaises(HTTPException) as raised,
        ):
            await auth.oauth_exchange(auth.OAuthExchangeRequest(code="exch-code-1"), db)
        self.assertEqual(raised.exception.status_code, 404)
        self.assertIsNone(user.passcode_hash)  # 토큰 미발급


class RestoreTokenIsNotASessionTest(unittest.IsolatedAsyncioTestCase):
    """restoreToken 을 일반 API 세션 헤더로 쓰면 deps 가드(deleted_at)가 실제로 막는지 증명."""

    async def test_restore_token_rejected_by_verify_user_session(self):
        user = _make_user()
        token = await _issue_token(user)
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)
        with self.assertRaises(HTTPException) as raised:
            await deps.verify_user_session(x_user_id=str(user.id), x_session_token=token, db=db)
        self.assertEqual(raised.exception.status_code, deps.HTTP_419_SESSION_EXPIRED)


class RestoreAccountEndpointTest(unittest.IsolatedAsyncioTestCase):
    def _restore_db(self, user: User | None) -> AsyncMock:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_result(user))
        db.commit = AsyncMock()
        return db

    async def _restore(self, user: User | None, token: str):
        with patch.object(auth, "generate_random_nickname", AsyncMock(return_value="New Rider 123")):
            return await auth.restore_account(AccountRestoreRequest(restore_token=token), self._restore_db(user))

    async def _restore_error(self, user: User | None, token: str) -> HTTPException:
        with self.assertRaises(HTTPException) as raised:
            await self._restore(user, token)
        return raised.exception

    async def test_restore_success_clears_deleted_and_issues_session(self):
        user = _make_user()
        token = await _issue_token(user)
        result = await self._restore(user, token)

        self.assertIsNone(user.deleted_at)
        self.assertEqual(user.nickname, "New Rider 123")
        self.assertFalse(result.is_new)
        self.assertNotEqual(result.session_token, token)
        # 새 세션은 정상 TTL 이고, 이후 일반 API(verify_user_session)를 통과한다.
        db = AsyncMock()
        db.get = AsyncMock(return_value=user)
        db.commit = AsyncMock()
        uid = await deps.verify_user_session(x_user_id=str(user.id), x_session_token=result.session_token, db=db)
        self.assertEqual(uid, user.id)

    async def test_expired_restore_token_rejected(self):
        user = _make_user()
        token = await _issue_token(user)
        user.session_expires_at = datetime.now(UTC) - timedelta(seconds=1)
        exc = await self._restore_error(user, token)
        self.assertEqual(exc.status_code, 401)
        self.assertEqual(exc.detail["code"], "restore_token_expired")
        self.assertIsNotNone(user.deleted_at)

    async def test_restore_token_is_single_use(self):
        user = _make_user()
        token = await _issue_token(user)
        await self._restore(user, token)
        exc = await self._restore_error(user, token)
        self.assertEqual(exc.status_code, 401)
        self.assertEqual(exc.detail["code"], "restore_token_invalid")

    async def test_banned_account_cannot_restore(self):
        user = _make_user()
        token = await _issue_token(user)
        user.status = "BANNED"  # grant 발급 후 제재가 확정된 경우에도 복구 차단
        exc = await self._restore_error(user, token)
        self.assertEqual(exc.status_code, 409)
        self.assertEqual(exc.detail["code"], "account_banned")
        self.assertIsNotNone(user.deleted_at)

    async def test_grace_window_expired_at_restore_time(self):
        user = _make_user()
        token = await _issue_token(user)
        user.deleted_at = datetime.now(UTC) - timedelta(days=auth.RETENTION_DAYS + 1)
        exc = await self._restore_error(user, token)
        self.assertEqual(exc.status_code, 409)
        self.assertEqual(exc.detail["code"], "restore_window_expired")

    async def test_malformed_token_rejected(self):
        exc = await self._restore_error(None, "not-a-token")
        self.assertEqual(exc.status_code, 401)
        self.assertEqual(exc.detail["code"], "restore_token_invalid")

    async def test_unknown_user_rejected(self):
        exc = await self._restore_error(None, uuid.uuid4().hex + uuid.uuid4().hex)
        self.assertEqual(exc.status_code, 401)
        self.assertEqual(exc.detail["code"], "restore_token_invalid")

    async def test_wrong_token_for_existing_user_rejected(self):
        user = _make_user()
        await _issue_token(user)
        forged = user.id.hex + uuid.uuid4().hex
        exc = await self._restore_error(user, forged)
        self.assertEqual(exc.status_code, 401)
        self.assertEqual(exc.detail["code"], "restore_token_invalid")


class DeleteAccountAnonymizeCollisionTest(unittest.IsolatedAsyncioTestCase):
    """같은 초에 두 계정이 탈퇴해도 phone/nickname UNIQUE 충돌이 없어야 한다."""

    async def _delete(self, user: User, frozen_now: datetime):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_result(user))
        db.commit = AsyncMock()
        with patch.object(users, "datetime") as dt:
            dt.now.return_value = frozen_now
            await users.delete_account(user_id=user.id, db=db, _session_uid=user.id)

    async def test_same_second_deletions_produce_distinct_anonymized_values(self):
        now = datetime(2026, 8, 1, 12, 0, 0, tzinfo=UTC)
        u1 = _make_user(deleted_at=None, phone="+84900000001", nickname="rider one")
        u2 = _make_user(deleted_at=None, phone="+84900000002", nickname="rider two")
        await self._delete(u1, now)
        await self._delete(u2, now)

        self.assertNotEqual(u1.phone, u2.phone)
        self.assertNotEqual(u1.nickname, u2.nickname)
        for u in (u1, u2):
            self.assertEqual(u.deleted_at, now)
            # purge 배치(_is_purge_eligible)의 익명화 흔적 판정("del_" 접두) 유지 + 컬럼 길이 한도
            self.assertTrue(u.phone.startswith("del_"))
            self.assertLessEqual(len(u.phone), 20)
            self.assertTrue(u.nickname.startswith("del_"))
            self.assertLessEqual(len(u.nickname), 30)
            self.assertIsNone(u.passcode_hash)
            self.assertIsNone(u.phone_verified_at)
