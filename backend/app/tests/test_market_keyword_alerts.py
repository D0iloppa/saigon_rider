"""M-9 키워드 알림 — 4개 엔드포인트(GET/POST/PATCH/DELETE) + 헬퍼 회귀 테스트.

W1 감사 보고서(`ai-docs/task/active/260817_keyword_alert_audit/W1_backend.md`) §⑤ "자동 테스트
추가 지점"에서 지목된 불변식을 고정한다. API 레벨 테스트가 이 세션 이전에는 0건이었다
(감사 §f). 프로덕션 코드는 이미 구현 완료 — 이 파일은 그 동작을 실증만 한다.

기존 관례 미러링: `test_market_completion_request.py`/`test_market_sold_terminal.py` 의
AsyncMock(db) + `db.execute = AsyncMock(side_effect=[...])` 순차 응답 패턴을 그대로 쓴다
(새 픽스처 프레임워크 발명 금지).
"""

import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers import market
from app.schemas import (
    MarketplaceKeywordAlertCreateRequest,
    MarketplaceKeywordAlertDeleteRequest,
    MarketplaceKeywordAlertUpdateRequest,
)


def _alert(user_id, keyword="helmet", keyword_norm="helmet", alert_id=None):
    return SimpleNamespace(
        id=alert_id or uuid.uuid4(),
        user_id=user_id,
        keyword=keyword,
        keyword_norm=keyword_norm,
        created_at=None,
    )


def _result(**kwargs):
    """execute() 반환값 목킹 — 필요한 접근자만 채운다(기존 테스트들의 `_exec_result` 패턴 미러)."""
    res = MagicMock()
    for name, value in kwargs.items():
        setattr(res, name, MagicMock(return_value=value))
    return res


class GetKeywordAlertsOwnershipTest(unittest.IsolatedAsyncioTestCase):
    async def test_forbidden_for_other_user(self):
        session_uid = uuid.uuid4()
        other_user_id = uuid.uuid4()
        db = AsyncMock()
        with self.assertRaises(HTTPException) as ctx:
            await market.get_keyword_alerts(user_id=other_user_id, db=db, session_uid=session_uid)
        self.assertEqual(ctx.exception.status_code, 403)
        db.execute.assert_not_awaited()


class AddKeywordAlertTest(unittest.IsolatedAsyncioTestCase):
    async def test_forbidden_when_user_mismatch(self):
        session_uid = uuid.uuid4()
        body = MarketplaceKeywordAlertCreateRequest(user_id=uuid.uuid4(), keyword="helmet")
        db = AsyncMock()
        with self.assertRaises(HTTPException) as ctx:
            await market.add_keyword_alert(body, db=db, session_uid=session_uid)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_too_short_keyword_rejected_before_any_db_call(self):
        session_uid = uuid.uuid4()
        body = MarketplaceKeywordAlertCreateRequest(user_id=session_uid, keyword="a")
        db = AsyncMock()
        with self.assertRaises(HTTPException) as ctx:
            await market.add_keyword_alert(body, db=db, session_uid=session_uid)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, {"code": "keyword_too_short", "min_length": 2})
        db.execute.assert_not_awaited()

    async def test_banned_keyword_rejected_after_normalization(self):
        """금칙어 비교도 norm() 통과 후 이뤄져 성조만 바꿔 우회할 수 없다(W1 §③-2)."""
        session_uid = uuid.uuid4()
        # 성조 다르게 입력해도 정규화되면 금칙어(norm 기준 "cam")를 포함.
        body = MarketplaceKeywordAlertCreateRequest(user_id=session_uid, keyword="cấm từ")
        db = AsyncMock()
        with (
            patch.object(market, "_banned_keywords_norm", AsyncMock(return_value=["cam"])),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.add_keyword_alert(body, db=db, session_uid=session_uid)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, {"code": "banned_keyword"})
        db.execute.assert_not_awaited()

    async def test_duplicate_keyword_is_idempotent_and_skips_cap_check(self):
        """중복(대소문자/성조만 다름) 재등록은 기존 row 를 그대로 반환 — 상한 검사보다 먼저
        수행되므로 상한에 이미 도달한 유저도 통과해야 한다(W1 §④ 명세)."""
        session_uid = uuid.uuid4()
        existing = _alert(session_uid, keyword="Helmet", keyword_norm="helmet")
        body = MarketplaceKeywordAlertCreateRequest(user_id=session_uid, keyword="HELMET")
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                MagicMock(),  # advisory lock
                _result(scalar_one_or_none=existing),  # 중복 조회
            ]
        )
        with patch.object(market, "_banned_keywords_norm", AsyncMock(return_value=[])):
            out = await market.add_keyword_alert(body, db=db, session_uid=session_uid)
        self.assertIs(out, existing)
        # 상한(count) 조회 자체가 실행되지 않아야 한다 — dedup 이 cap 보다 먼저.
        self.assertEqual(db.execute.await_count, 2)
        db.commit.assert_not_awaited()

    async def test_limit_exceeded_rejects_new_keyword(self):
        session_uid = uuid.uuid4()
        body = MarketplaceKeywordAlertCreateRequest(user_id=session_uid, keyword="new keyword")
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                MagicMock(),  # advisory lock
                _result(scalar_one_or_none=None),  # 중복 없음
                _result(scalar_one=20),  # 현재 개수 == 상한
            ]
        )
        with (
            patch.object(market, "_banned_keywords_norm", AsyncMock(return_value=[])),
            patch.object(market, "_keyword_alert_max_count", AsyncMock(return_value=20)),
            self.assertRaises(HTTPException) as ctx,
        ):
            await market.add_keyword_alert(body, db=db, session_uid=session_uid)
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, {"code": "keyword_alert_limit", "max_count": 20})
        db.commit.assert_not_awaited()

    async def test_new_keyword_under_cap_is_created(self):
        session_uid = uuid.uuid4()
        body = MarketplaceKeywordAlertCreateRequest(user_id=session_uid, keyword="Mũ bảo hiểm")
        db = AsyncMock()
        db.add = MagicMock()
        db.execute = AsyncMock(
            side_effect=[
                MagicMock(),  # advisory lock
                _result(scalar_one_or_none=None),  # 중복 없음
                _result(scalar_one=0),  # 현재 개수
            ]
        )
        with (
            patch.object(market, "_banned_keywords_norm", AsyncMock(return_value=[])),
            patch.object(market, "_keyword_alert_max_count", AsyncMock(return_value=20)),
        ):
            await market.add_keyword_alert(body, db=db, session_uid=session_uid)
        db.commit.assert_awaited()
        db.refresh.assert_awaited()
        created = db.add.call_args[0][0]
        self.assertEqual(created.user_id, session_uid)
        self.assertEqual(created.keyword, "Mũ bảo hiểm")
        # 등록 시 정규화 저장 — 베트남어 성조 제거 규약(search_norm.norm) 그대로.
        self.assertEqual(created.keyword_norm, "mu bao hiem")


class KeywordAlertMaxCountTest(unittest.IsolatedAsyncioTestCase):
    async def test_default_when_no_config_row(self):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_result(scalar_one_or_none=None))
        self.assertEqual(await market._keyword_alert_max_count(db), 20)

    async def test_reads_configured_value(self):
        db = AsyncMock()
        row = SimpleNamespace(value="50")
        db.execute = AsyncMock(return_value=_result(scalar_one_or_none=row))
        self.assertEqual(await market._keyword_alert_max_count(db), 50)

    async def test_non_integer_value_falls_back_to_default(self):
        db = AsyncMock()
        row = SimpleNamespace(value="not-a-number")
        db.execute = AsyncMock(return_value=_result(scalar_one_or_none=row))
        self.assertEqual(await market._keyword_alert_max_count(db), 20)


class UpdateKeywordAlertTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_found(self):
        session_uid = uuid.uuid4()
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        body = MarketplaceKeywordAlertUpdateRequest(user_id=session_uid, keyword="helmet")
        with self.assertRaises(HTTPException) as ctx:
            await market.update_keyword_alert(uuid.uuid4(), body, db=db, session_uid=session_uid)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_forbidden_for_non_owner(self):
        owner_id = uuid.uuid4()
        session_uid = uuid.uuid4()
        alert = _alert(owner_id)
        db = AsyncMock()
        db.get = AsyncMock(return_value=alert)
        body = MarketplaceKeywordAlertUpdateRequest(user_id=owner_id, keyword="new")
        with self.assertRaises(HTTPException) as ctx:
            await market.update_keyword_alert(alert.id, body, db=db, session_uid=session_uid)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_body_user_id_mismatch_forbidden(self):
        owner_id = uuid.uuid4()
        alert = _alert(owner_id)
        db = AsyncMock()
        db.get = AsyncMock(return_value=alert)
        body = MarketplaceKeywordAlertUpdateRequest(user_id=uuid.uuid4(), keyword="new")
        with self.assertRaises(HTTPException) as ctx:
            await market.update_keyword_alert(alert.id, body, db=db, session_uid=owner_id)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_duplicate_with_other_row_returns_existing(self):
        owner_id = uuid.uuid4()
        alert = _alert(owner_id, keyword="old", keyword_norm="old")
        other = _alert(owner_id, keyword="Bike", keyword_norm="bike")
        db = AsyncMock()
        db.get = AsyncMock(return_value=alert)
        db.execute = AsyncMock(
            side_effect=[
                MagicMock(),  # advisory lock (F-2)
                _result(scalar_one_or_none=other),  # 중복 조회
            ]
        )
        body = MarketplaceKeywordAlertUpdateRequest(user_id=owner_id, keyword="BIKE")
        with patch.object(market, "_banned_keywords_norm", AsyncMock(return_value=[])):
            out = await market.update_keyword_alert(alert.id, body, db=db, session_uid=owner_id)
        self.assertIs(out, other)
        db.commit.assert_not_awaited()

    async def test_success_updates_keyword_and_norm(self):
        owner_id = uuid.uuid4()
        alert = _alert(owner_id, keyword="old", keyword_norm="old")
        db = AsyncMock()
        db.get = AsyncMock(return_value=alert)
        db.execute = AsyncMock(
            side_effect=[
                MagicMock(),  # advisory lock (F-2)
                _result(scalar_one_or_none=None),  # 중복 없음
            ]
        )
        body = MarketplaceKeywordAlertUpdateRequest(user_id=owner_id, keyword="Mũ bảo hiểm")
        with patch.object(market, "_banned_keywords_norm", AsyncMock(return_value=[])):
            out = await market.update_keyword_alert(alert.id, body, db=db, session_uid=owner_id)
        self.assertEqual(out.keyword, "Mũ bảo hiểm")
        self.assertEqual(out.keyword_norm, "mu bao hiem")
        db.commit.assert_awaited()

    async def test_concurrent_patch_uses_same_advisory_lock_key_as_post(self):
        """F-2: PATCH 도 POST 와 동일한 pg_advisory_xact_lock(hashtext(:key)) 패턴을 써야
        동시 PATCHxPOST 수렴 시 두 번째 커밋이 unique 위반 500 대신 직렬화된다."""
        owner_id = uuid.uuid4()
        alert = _alert(owner_id, keyword="old", keyword_norm="old")
        db = AsyncMock()
        db.get = AsyncMock(return_value=alert)
        db.execute = AsyncMock(
            side_effect=[
                MagicMock(),  # advisory lock
                _result(scalar_one_or_none=None),  # 중복 없음
            ]
        )
        body = MarketplaceKeywordAlertUpdateRequest(user_id=owner_id, keyword="new")
        with patch.object(market, "_banned_keywords_norm", AsyncMock(return_value=[])):
            await market.update_keyword_alert(alert.id, body, db=db, session_uid=owner_id)
        lock_call = db.execute.await_args_list[0]
        lock_sql = str(lock_call.args[0])
        self.assertIn("pg_advisory_xact_lock(hashtext(:key)::bigint)", lock_sql)
        self.assertEqual(lock_call.args[1], {"key": f"kw_alert:{owner_id}"})


class DeleteKeywordAlertTest(unittest.IsolatedAsyncioTestCase):
    async def test_not_found(self):
        session_uid = uuid.uuid4()
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)
        body = MarketplaceKeywordAlertDeleteRequest(user_id=session_uid)
        with self.assertRaises(HTTPException) as ctx:
            await market.delete_keyword_alert(uuid.uuid4(), body, db=db, session_uid=session_uid)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_forbidden_for_non_owner(self):
        owner_id = uuid.uuid4()
        session_uid = uuid.uuid4()
        alert = _alert(owner_id)
        db = AsyncMock()
        db.get = AsyncMock(return_value=alert)
        body = MarketplaceKeywordAlertDeleteRequest(user_id=owner_id)
        with self.assertRaises(HTTPException) as ctx:
            await market.delete_keyword_alert(alert.id, body, db=db, session_uid=session_uid)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_owner_can_delete(self):
        owner_id = uuid.uuid4()
        alert = _alert(owner_id)
        db = AsyncMock()
        db.get = AsyncMock(return_value=alert)
        await market.delete_keyword_alert(alert.id, MarketplaceKeywordAlertDeleteRequest(user_id=owner_id), db=db, session_uid=owner_id)
        db.delete.assert_awaited_once_with(alert)
        db.commit.assert_awaited()


if __name__ == "__main__":
    unittest.main()
