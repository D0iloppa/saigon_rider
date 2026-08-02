"""탈퇴회원 식별자 해시 아카이브(withdrawn_member_archive, 170) 회귀 테스트.

- 탈퇴 시 phone·OAuth 식별자가 HMAC 해시로 기록되고 원본 평문은 어디에도 남지 않는다
- pepper 가 실제로 해시에 반영된다 (평문 SHA256 회귀 방지)
- pepper 미설정이면 탈퇴는 성공하고 아카이브만 건너뛴다 (fail-open + 운영자 경보)
- 복구(restore_account) 성공 시 아카이브 행이 같은 트랜잭션에서 삭제된다
- 파기 배치: purge_after 경과분만 별도 단계로 삭제, 30일 개인데이터 파기와 불간섭
- 탈퇴→복구→재탈퇴 반복이 UNIQUE 위반 500 을 내지 않는다 (ON CONFLICT DO NOTHING)
- admin withdrawn-check: 일치/불일치/입력 검증/pepper 미설정/인증 의존성

라우터 함수를 직접 호출해 mock db 로 검증한다 (test_account_restore.py 스타일 — 실 DB 불필요).
"""

import hashlib
import hmac
import inspect
import os
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Delete, Insert

from app.admin_auth import verify_admin_api
from app.jobs import purge_deleted_accounts as job
from app.models import User, WithdrawnMemberArchive
from app.routers import auth, users
from app.routers.admin_api import users as admin_users
from app.routers.auth import AccountRestoreRequest
from app.services.withdrawn_archive import WITHDRAWN_ARCHIVE_RETENTION_DAYS, hash_identifier

_PEPPER = "test-pepper-0123456789abcdef"
_PHONE = "+84901234567"
_OAUTH_UID = "zalo-user-9999"


def _expected_hash(value: str, pepper: str = _PEPPER) -> str:
    return hmac.new(pepper.encode(), value.encode(), hashlib.sha256).hexdigest()


def _make_user(**overrides) -> User:
    now = datetime.now(UTC)
    fields = dict(
        id=uuid.uuid4(),
        phone=_PHONE,
        phone_verified_at=now,
        nickname="Test Rider",
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


def _compiled(stmt):
    return stmt.compile(dialect=postgresql.dialect())


class HashIdentifierTest(unittest.TestCase):
    def test_different_pepper_produces_different_hash(self):
        # pepper 가 실제로 키로 쓰임을 증명 — 평문 SHA256 회귀 방지.
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": "pepper-A"}):
            hash_a = hash_identifier(_PHONE)
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": "pepper-B"}):
            hash_b = hash_identifier(_PHONE)
        self.assertNotEqual(hash_a, hash_b)
        plain_sha256 = hashlib.sha256(_PHONE.encode()).hexdigest()
        self.assertNotIn(plain_sha256, (hash_a, hash_b))
        self.assertNotIn(_PHONE, (hash_a, hash_b))

    def test_unset_pepper_returns_none(self):
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": ""}):
            self.assertIsNone(hash_identifier(_PHONE))


class DeleteAccountArchiveTest(unittest.IsolatedAsyncioTestCase):
    """DELETE /users/me — 익명화 전에 식별자 해시가 아카이브 INSERT 로 잡히는지."""

    def _delete_db(self, user: User, identities: list) -> AsyncMock:
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _scalar_result(user),  # _get_user_or_404
                _scalars_all_result(identities),  # user_oauth_identities 조회
                MagicMock(),  # pg_insert
            ]
        )
        db.commit = AsyncMock()
        return db

    def _find_insert(self, db: AsyncMock):
        for call in db.execute.call_args_list:
            if isinstance(call.args[0], Insert):
                return call.args[0]
        return None

    async def test_phone_and_oauth_hashes_archived(self):
        user = _make_user()
        identity = MagicMock(provider="zalo", provider_user_id=_OAUTH_UID)
        db = self._delete_db(user, [identity])
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": _PEPPER}):
            await users.delete_account(user.id, db, user.id)

        stmt = self._find_insert(db)
        self.assertIsNotNone(stmt, "아카이브 INSERT 가 실행되지 않았다")
        self.assertEqual(stmt.table.name, "withdrawn_member_archive")
        params = _compiled(stmt).params
        values = [v for v in params.values()]
        self.assertIn(_expected_hash(_PHONE), values)
        self.assertIn(_expected_hash(_OAUTH_UID), values)
        self.assertIn("phone", values)
        self.assertIn("oauth", values)
        self.assertIn("zalo", values)
        # 탈퇴 자체도 정상 수행
        self.assertIsNotNone(user.deleted_at)
        self.assertTrue(user.phone.startswith("del_"))

    async def test_already_anonymized_phone_is_not_archived(self):
        """복구 후 재탈퇴 — phone 이 아직 del_* 익명화값이면 해시하지 않는다.

        복구(restore)는 전화번호를 되살리지 않으므로, 재인증 전에 재탈퇴하면 phone 이
        del_* 인 채로 들어온다. 그걸 해시해 남기면 영원히 매칭되지 않는 행만 쌓인다.
        """
        user = _make_user()
        user.phone = "del_0123456789abcdef"
        identity = MagicMock(provider="zalo", provider_user_id=_OAUTH_UID)
        db = self._delete_db(user, [identity])
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": _PEPPER}):
            await users.delete_account(user.id, db, user.id)

        stmt = self._find_insert(db)
        self.assertIsNotNone(stmt, "OAuth 식별자는 여전히 아카이브돼야 한다")
        values = list(_compiled(stmt).params.values())
        self.assertIn(_expected_hash(_OAUTH_UID), values)
        self.assertNotIn("phone", values)
        self.assertNotIn(_expected_hash("del_0123456789abcdef"), values)

    async def test_no_plaintext_identifier_in_insert(self):
        user = _make_user()
        identity = MagicMock(provider="zalo", provider_user_id=_OAUTH_UID)
        db = self._delete_db(user, [identity])
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": _PEPPER}):
            await users.delete_account(user.id, db, user.id)

        stmt = self._find_insert(db)
        dump = str(_compiled(stmt)) + repr(list(_compiled(stmt).params.values()))
        self.assertNotIn(_PHONE, dump)
        self.assertNotIn(_OAUTH_UID, dump)

    async def test_purge_after_is_retention_days_after_deletion(self):
        user = _make_user()
        db = self._delete_db(user, [])
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": _PEPPER}):
            await users.delete_account(user.id, db, user.id)

        params = _compiled(self._find_insert(db)).params
        deleted_at = next(v for k, v in params.items() if k.startswith("deleted_at"))
        purge_after = next(v for k, v in params.items() if k.startswith("purge_after"))
        self.assertEqual(purge_after - deleted_at, timedelta(days=WITHDRAWN_ARCHIVE_RETENTION_DAYS))

    async def test_insert_is_conflict_tolerant_for_redelete(self):
        # 탈퇴→복구→재탈퇴 반복 시 UNIQUE(user_id,kind,provider,value_hash) 위반으로
        # 500 이 나면 안 된다 — ON CONFLICT DO NOTHING 이 문장에 실제로 붙는지 고정.
        user = _make_user()
        db = self._delete_db(user, [])
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": _PEPPER}):
            await users.delete_account(user.id, db, user.id)

        sql = str(_compiled(self._find_insert(db)))
        self.assertIn("ON CONFLICT DO NOTHING", sql)

    async def test_pepper_unset_delete_succeeds_without_archive(self):
        user = _make_user()
        identity = MagicMock(provider="zalo", provider_user_id=_OAUTH_UID)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _scalar_result(user),  # _get_user_or_404
                _scalars_all_result([identity]),  # identities 조회 — insert 는 없다
            ]
        )
        db.commit = AsyncMock()
        alert = AsyncMock()
        with (
            patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": ""}),
            patch.object(users, "send_ops_alert", alert),
        ):
            await users.delete_account(user.id, db, user.id)

        # fail-open: 탈퇴는 성공, 아카이브 INSERT 없음, 운영자 경보만.
        self.assertIsNotNone(user.deleted_at)
        self.assertTrue(user.phone.startswith("del_"))
        self.assertEqual(db.execute.await_count, 2)
        alert.assert_awaited_once()


class RestoreRemovesArchiveTest(unittest.IsolatedAsyncioTestCase):
    async def test_restore_deletes_archive_rows_in_same_transaction(self):
        user = _make_user(deleted_at=datetime.now(UTC) - timedelta(days=5))
        grant_db = AsyncMock()
        grant_db.execute = AsyncMock(return_value=_scalar_result(user))
        grant_db.commit = AsyncMock()
        grant = await auth._issue_restore_grant(grant_db, user.id)
        self.assertIsNotNone(grant)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalar_result(user))
        db.commit = AsyncMock()
        with patch.object(auth, "generate_random_nickname", AsyncMock(return_value="New Rider 1")):
            await auth.restore_account(AccountRestoreRequest(restore_token=grant["restore_token"]), db)

        deletes = [
            call.args[0]
            for call in db.execute.call_args_list
            if isinstance(call.args[0], Delete) and call.args[0].table.name == "withdrawn_member_archive"
        ]
        self.assertEqual(len(deletes), 1, "복구 시 아카이브 삭제가 실행되지 않았다")
        params = _compiled(deletes[0]).params
        self.assertIn(user.id, list(params.values()))
        # deleted_at 해제와 같은 트랜잭션 — 커밋은 한 번.
        self.assertIsNone(user.deleted_at)
        db.commit.assert_awaited_once()


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class PurgeArchiveStepTest(unittest.IsolatedAsyncioTestCase):
    """파기 배치의 아카이브 단계 — 30일 개인데이터 파기와 별개로 동작."""

    def _run_with(self, execute_side_effects):
        session = MagicMock()
        session.execute = AsyncMock(side_effect=execute_side_effects)
        session.commit = AsyncMock()
        return session

    async def test_expired_archive_rows_deleted_with_own_count_key(self):
        candidates = MagicMock()
        candidates.all.return_value = []  # 30일 파기 대상 없음 — 아카이브 단계는 독립 실행
        delete_result = MagicMock(rowcount=3)
        session = self._run_with([candidates, delete_result])
        with patch.object(job, "AsyncSessionLocal", lambda: _SessionContext(session)):
            result = await job.purge_deleted_accounts()

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["archive_purged_count"], 3)
        self.assertEqual(result["purged_count"], 0)
        sql = str(session.execute.call_args_list[-1].args[0])
        self.assertIn("DELETE FROM withdrawn_member_archive", sql)
        # 경과분만: 조건은 행에 박힌 purge_after 하나 — 미경과분은 WHERE 로 걸러진다.
        self.assertIn("purge_after < :now", sql)

    async def test_dry_run_counts_without_deleting(self):
        candidates = MagicMock()
        candidates.all.return_value = []
        count_result = MagicMock()
        count_result.scalar_one.return_value = 2
        session = self._run_with([candidates, count_result])
        with patch.object(job, "AsyncSessionLocal", lambda: _SessionContext(session)):
            result = await job.purge_deleted_accounts(dry_run=True)

        self.assertEqual(result["archive_purged_count"], 2)
        executed = " ".join(str(call.args[0]) for call in session.execute.call_args_list)
        self.assertNotIn("DELETE FROM withdrawn_member_archive", executed)
        session.commit.assert_not_awaited()

    def test_archive_not_mixed_into_30day_own_data_tables(self):
        # 30일 개인데이터 파기(유저 단위)와 1년 아카이브 파기(행 단위)는 서로 간섭하지 않는다 —
        # 아카이브 테이블이 _OWN_DATA_TABLES 에 섞여 들어가면 탈퇴 30일 만에 지워져 버린다.
        self.assertNotIn(
            "withdrawn_member_archive",
            [table for table, _ in job._OWN_DATA_TABLES],
        )


class AdminWithdrawnCheckTest(unittest.IsolatedAsyncioTestCase):
    def _db(self, rows) -> AsyncMock:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_scalars_all_result(rows))
        db.add = MagicMock()
        db.commit = AsyncMock()
        return db

    def _session(self):
        return MagicMock(username="root", role="root")

    async def _check(self, db, **kwargs):
        params = dict(phone=None, provider=None, provider_user_id=None)
        params.update(kwargs)
        return await admin_users.withdrawn_check(request=MagicMock(), session=self._session(), db=db, **params)

    async def test_phone_match_normalizes_to_stored_e164_form(self):
        uid = uuid.uuid4()
        deleted_at = datetime.now(UTC) - timedelta(days=40)
        row = MagicMock(user_id=uid, deleted_at=deleted_at)
        db = self._db([row])
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": _PEPPER}):
            result = await self._check(db, phone="0901234567")  # 로컬 표기 입력

        self.assertTrue(result["matched"])
        self.assertEqual(result["matches"], [{"user_id": uid, "deleted_at": deleted_at}])
        # 조회 해시가 탈퇴 시 저장 형식(E.164 정규형)과 일치해야 매칭이 성립한다.
        params = _compiled(db.execute.call_args_list[0].args[0]).params
        self.assertIn(_expected_hash(_PHONE), list(params.values()))

    async def test_no_match_returns_empty(self):
        db = self._db([])
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": _PEPPER}):
            result = await self._check(db, provider="zalo", provider_user_id="nobody")
        self.assertFalse(result["matched"])
        self.assertEqual(result["matches"], [])

    async def test_invalid_or_missing_params_rejected(self):
        db = self._db([])
        with patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": _PEPPER}):
            for kwargs in (
                {},  # 아무 것도 없음
                {"phone": "12"},  # 비정상 전화번호
                {"phone": _PHONE, "provider": "zalo"},  # 둘 다 지정
                {"provider": "zalo"},  # provider_user_id 누락
            ):
                with self.assertRaises(HTTPException) as raised:
                    await self._check(db, **kwargs)
                self.assertEqual(raised.exception.status_code, 400)

    async def test_pepper_unset_returns_503(self):
        db = self._db([])
        with (
            patch.dict(os.environ, {"WITHDRAWN_HASH_PEPPER": ""}),
            self.assertRaises(HTTPException) as raised,
        ):
            await self._check(db, phone="0901234567")
        self.assertEqual(raised.exception.status_code, 503)

    def test_endpoint_requires_admin_auth(self):
        # 함수 시그니처의 Depends 가 verify_admin_api 인지 고정 — 인증 없는 호출은
        # FastAPI 레이어에서 verify_admin_api 가 거부한다.
        dep = inspect.signature(admin_users.withdrawn_check).parameters["session"].default
        self.assertIs(dep.dependency, verify_admin_api)


class ArchiveModelTest(unittest.TestCase):
    def test_unique_constraint_covers_redelete_tuple(self):
        cols = [
            tuple(c.name for c in constraint.columns)
            for constraint in WithdrawnMemberArchive.__table__.constraints
            if constraint.__class__.__name__ == "UniqueConstraint"
        ]
        self.assertIn(("user_id", "kind", "provider", "value_hash"), cols)
