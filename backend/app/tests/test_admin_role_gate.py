"""#24 어드민 역할 2종(SUPER=root/admin, OPS=manager) 접근 제어 + actor 감사 회귀 테스트.

016_PLATFORM_MASTER_SUPPLEMENT.md §9 #24 완료 검증 조건:
  1) OPS(manager) 역할이 SUPER 전용 라우트(`verify_root_api`)에 접근하면 403
  2) 변경성 API가 개별 actor_id(admin_username)를 기록

라우터 의존성 함수를 직접 호출해 검증한다 (test_account_restore.py 스타일 — 실 DB 불필요).
"""

import unittest
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.admin_auth import AdminSession, verify_root_api
from app.routers.admin_api._audit import audit


class SuperOpsRoleGateTests(unittest.IsolatedAsyncioTestCase):
    async def test_manager_role_is_ops_and_gets_403_on_super_route(self):
        ops_session = AdminSession(
            username="ops_kim", role="manager", account_id="11111111-1111-1111-1111-111111111111"
        )
        with self.assertRaises(HTTPException) as raised:
            await verify_root_api(session=ops_session)
        self.assertEqual(raised.exception.status_code, 403)

    async def test_admin_role_is_super_and_passes_super_route(self):
        super_session = AdminSession(
            username="super_lee", role="admin", account_id="22222222-2222-2222-2222-222222222222"
        )
        result = await verify_root_api(session=super_session)
        self.assertIs(result, super_session)

    async def test_root_env_account_is_super_and_passes_super_route(self):
        root_session = AdminSession(username="root", role="root")
        result = await verify_root_api(session=root_session)
        self.assertIs(result, root_session)


class ActorAuditTests(unittest.IsolatedAsyncioTestCase):
    async def test_audit_records_individual_actor_username_and_role(self):
        db = MagicMock()
        db.add = MagicMock()
        request = MagicMock()
        request.headers = {}
        request.client.host = "10.0.0.7"

        session = AdminSession(username="ops_park", role="manager", account_id="33333333-3333-3333-3333-333333333333")
        await audit(db, session, request, "LISTING_MODERATE", "listing", "abc-1", {"result": "hide"})

        db.add.assert_called_once()
        row = db.add.call_args.args[0]
        # actor_id 는 공용 상수가 아니라 로그인한 개별 계정의 username 이어야 한다
        self.assertEqual(row.admin_username, "ops_park")
        self.assertEqual(row.admin_role, "manager")
        self.assertEqual(row.action, "LISTING_MODERATE")

    async def test_audit_distinguishes_different_actors_on_same_role(self):
        db1, db2 = MagicMock(), MagicMock()
        request = MagicMock()
        request.headers = {}
        request.client.host = "10.0.0.8"

        session_a = AdminSession(username="ops_park", role="manager")
        session_b = AdminSession(username="ops_kim", role="manager")
        await audit(db1, session_a, request, "REPORT_RESOLVE")
        await audit(db2, session_b, request, "REPORT_RESOLVE")

        row_a = db1.add.call_args.args[0]
        row_b = db2.add.call_args.args[0]
        self.assertNotEqual(row_a.admin_username, row_b.admin_username)


if __name__ == "__main__":
    unittest.main()
