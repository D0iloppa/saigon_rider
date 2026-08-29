"""서버 생성 알림 문안의 지역화(221) 회귀 테스트.

고정하는 불변식:
  1. `t()` 는 미지원/미설정 언어를 앱 기본 언어 vi 로 폴백한다.
  2. 키워드 알림은 **수신자별로** 그 사람의 언어로 만들어진다(한 이벤트에 언어가 섞여도 무방).
  3. 키워드 알림 본문은 매물 제목만 — 가격을 붙이지 않는다(대표 확정).
  4. `PUT /users/me/language` 는 본인 행만 갱신하고, 지원하지 않는 값은 스키마에서 거부된다.

기존 관례 미러링: `test_market_keyword_alerts.py` 의 AsyncMock(db) 패턴을 그대로 쓴다.
"""

import unittest
import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from pydantic import ValidationError

from app.noti_worker import __main__ as noti_worker
from app.routers import users as users_router
from app.schemas import UserLanguageUpdateRequest
from app.services import push_i18n


class NormalizeTest(unittest.TestCase):
    def test_region_suffix_is_stripped(self):
        self.assertEqual(push_i18n.normalize("ko-KR"), "ko")
        self.assertEqual(push_i18n.normalize("VI-vn"), "vi")

    def test_unknown_and_empty_fall_back_to_default(self):
        self.assertEqual(push_i18n.normalize(None), "vi")
        self.assertEqual(push_i18n.normalize(""), "vi")
        self.assertEqual(push_i18n.normalize("fr"), "vi")


class TranslateTest(unittest.TestCase):
    def test_keyword_alert_title_per_language(self):
        self.assertEqual(push_i18n.t("ko", "keyword_alert.title", keyword="타이어"), "'타이어' 상품이 등록되었습니다")
        self.assertEqual(push_i18n.t("en", "keyword_alert.title", keyword="타이어"), "New listing for '타이어'")
        self.assertEqual(push_i18n.t("vi", "keyword_alert.title", keyword="타이어"), "Có tin đăng mới cho '타이어'")

    def test_unknown_language_falls_back_to_vi(self):
        self.assertEqual(
            push_i18n.t("fr", "keyword_alert.title", keyword="x"),
            push_i18n.t("vi", "keyword_alert.title", keyword="x"),
        )

    def test_missing_key_raises(self):
        with self.assertRaises(KeyError):
            push_i18n.t("ko", "no.such.key")


def _alert(user_id, keyword):
    return SimpleNamespace(id=uuid.uuid4(), user_id=user_id, keyword=keyword, keyword_norm=keyword.lower())


class ListingCreatedLocalizationTest(unittest.IsolatedAsyncioTestCase):
    async def test_each_recipient_gets_their_own_language(self):
        ko_user, en_user, unset_user = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        alerts = [_alert(ko_user, "타이어"), _alert(en_user, "타이어"), _alert(unset_user, "타이어")]
        db = AsyncMock()
        result = MagicMock()
        result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=alerts)))
        db.execute = AsyncMock(return_value=result)

        @asynccontextmanager
        async def _session():
            yield db

        inserted: list[tuple] = []
        pushes: list[tuple] = []

        async def _insert(_db, *, source_event_id, user_id, notification_type, title, body, link):
            inserted.append((user_id, title, body))
            return True

        with (
            patch.object(noti_worker, "AsyncSessionLocal", _session),
            patch.object(noti_worker, "_insert_notification", _insert),
            patch.object(noti_worker, "_push_enabled", AsyncMock(return_value=True)),
            patch.object(
                noti_worker,
                "langs_for_users",
                AsyncMock(return_value={ko_user: "ko", en_user: "en", unset_user: "vi"}),
            ),
            patch.object(noti_worker, "_try_push", AsyncMock(side_effect=lambda *a: pushes.append(a))),
        ):
            await noti_worker._handle_listing_created(
                {
                    "title": "타이어 테스트",
                    "seller_id": str(uuid.uuid4()),
                    "listing_id": str(uuid.uuid4()),
                    "price_vnd": 500000,
                },
                source_event_id="evt-1",
            )

        titles = {user_id: title for user_id, title, _ in inserted}
        self.assertEqual(titles[ko_user], "'타이어' 상품이 등록되었습니다")
        self.assertEqual(titles[en_user], "New listing for '타이어'")
        self.assertEqual(titles[unset_user], "Có tin đăng mới cho '타이어'")
        # 본문은 언어와 무관하게 매물 제목만 — 가격(500,000 đ)이 섞이면 회귀.
        self.assertEqual({body for _, _, body in inserted}, {"타이어 테스트"})
        # 푸시도 인앱 row 와 같은 문안으로 나간다.
        self.assertEqual({(a[0], a[1], a[2]) for a in pushes}, {(str(u), t, b) for u, t, b in inserted})


class UpdatePreferredLanguageTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_unsupported_language(self):
        with self.assertRaises(ValidationError):
            UserLanguageUpdateRequest(lang="fr")

    async def test_forbidden_for_other_user(self):
        db = AsyncMock()
        with self.assertRaises(Exception) as ctx:
            await users_router.update_preferred_language(
                user_id=uuid.uuid4(),
                body=UserLanguageUpdateRequest(lang="ko"),
                db=db,
                _session_uid=uuid.uuid4(),
            )
        self.assertEqual(ctx.exception.status_code, 403)
        db.execute.assert_not_awaited()

    async def test_updates_own_row(self):
        uid = uuid.uuid4()
        db = AsyncMock()
        res = await users_router.update_preferred_language(
            user_id=uid, body=UserLanguageUpdateRequest(lang="en"), db=db, _session_uid=uid
        )
        self.assertEqual(res.status_code, 204)
        db.execute.assert_awaited_once()
        stmt = db.execute.await_args.args[0]
        self.assertEqual(stmt.compile().params["preferred_lang"], "en")
        db.commit.assert_awaited()


if __name__ == "__main__":
    unittest.main()
