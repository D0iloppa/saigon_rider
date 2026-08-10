import json
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.dialects import postgresql

from app.models import Notification
from app.noti_worker import __main__ as noti_worker


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class NotificationIdempotencyContractTest(unittest.TestCase):
    def test_model_uses_partial_recipient_scoped_unique_index(self):
        column = Notification.__table__.c.source_event_id
        self.assertTrue(column.nullable)
        self.assertEqual(column.type.length, 64)

        index = next(
            item for item in Notification.__table__.indexes if item.name == "uq_notifications_source_event_user"
        )
        self.assertTrue(index.unique)
        self.assertEqual([item.name for item in index.columns], ["source_event_id", "user_id"])
        self.assertEqual(str(index.dialect_options["postgresql"]["where"]), "source_event_id IS NOT NULL")

    def test_fresh_init_migration_matches_model_contract(self):
        repo_root = Path(__file__).resolve().parents[3]
        sql = (repo_root / "database" / "init" / "145_notifications_event_idempotency.sql").read_text(encoding="utf-8")
        normalized = " ".join(sql.lower().split())

        self.assertIn("add column if not exists source_event_id varchar(64)", normalized)
        self.assertIn("on notifications (source_event_id, user_id)", normalized)
        self.assertIn("where source_event_id is not null", normalized)

    def test_compose_applies_migration_before_bff_and_worker(self):
        repo_root = Path(__file__).resolve().parents[3]
        compose = (repo_root / "docker-compose.yml").read_text(encoding="utf-8")

        self.assertIn("bff_migrate:", compose)
        self.assertIn("145_notifications_event_idempotency.sql", compose)
        self.assertIn("pg_isready -h 127.0.0.1", compose)
        for service, next_service in (("bff", "mcp_dev"), ("noti_worker", "wiki")):
            block = compose.split(f"  {service}:\n", 1)[1].split(f"  {next_service}:\n", 1)[0]
            self.assertIn("bff_migrate:\n        condition: service_completed_successfully", block)


class NotificationWorkerIdempotencyTest(unittest.IsolatedAsyncioTestCase):
    async def test_worker_refuses_to_consume_before_readiness(self):
        with (
            patch.object(noti_worker, "check_readiness", new=AsyncMock(side_effect=RuntimeError("schema missing"))),
            patch.object(noti_worker, "_ensure_consumer_group", new=AsyncMock()) as ensure_group,
            self.assertRaisesRegex(RuntimeError, "schema missing"),
        ):
            await noti_worker.run()

        ensure_group.assert_not_awaited()

    async def test_atomic_insert_returns_whether_row_is_new(self):
        recipient_id = uuid.uuid4()
        db = MagicMock(scalar=AsyncMock(return_value=17))

        inserted = await noti_worker._insert_notification(
            db,
            source_event_id="1721635200000-0",
            user_id=recipient_id,
            notification_type="SOCIAL",
            title="title",
            body="body",
            link="dm&id=conversation",
        )

        self.assertTrue(inserted)
        statement = db.scalar.await_args.args[0]
        compiled = " ".join(str(statement.compile(dialect=postgresql.dialect())).split())
        self.assertIn(
            "ON CONFLICT (source_event_id, user_id) WHERE source_event_id IS NOT NULL DO NOTHING",
            compiled,
        )
        self.assertIn("RETURNING notifications.id", compiled)

        db.scalar.return_value = None
        self.assertFalse(
            await noti_worker._insert_notification(
                db,
                source_event_id="1721635200000-0",
                user_id=recipient_id,
                notification_type="SOCIAL",
                title="title",
                body="body",
                link="dm&id=conversation",
            )
        )

    async def test_dm_redelivery_reuses_stream_id_and_pushes_only_once(self):
        recipient_id = uuid.uuid4()
        session = MagicMock(commit=AsyncMock())
        redis_client = MagicMock(xack=AsyncMock())
        insert_notification = AsyncMock(side_effect=[True, False])
        push_enabled = AsyncMock(return_value=True)
        try_push = AsyncMock()
        payload = {
            "recipient_id": str(recipient_id),
            "conversation_id": str(uuid.uuid4()),
            "sender_nickname": "Rider",
            "preview": "hello",
        }
        batch = [
            (
                "1721635200000-0",
                {"type": "dm.message_sent", "payload": json.dumps(payload)},
            )
        ]

        with (
            patch.object(noti_worker, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(noti_worker, "get_client", new=AsyncMock(return_value=redis_client)),
            patch.object(noti_worker, "_insert_notification", new=insert_notification),
            patch.object(noti_worker, "_push_enabled", new=push_enabled),
            patch.object(noti_worker, "_try_push", new=try_push),
        ):
            await noti_worker._process_batch(batch)
            await noti_worker._process_batch(batch)

        self.assertEqual(insert_notification.await_count, 2)
        self.assertEqual(
            [call.kwargs["source_event_id"] for call in insert_notification.await_args_list],
            ["1721635200000-0", "1721635200000-0"],
        )
        push_enabled.assert_awaited_once_with(session, recipient_id, "chat")
        try_push.assert_awaited_once()
        self.assertEqual(redis_client.xack.await_count, 2)

    async def test_dm_push_skipped_when_chat_disabled_but_notification_row_still_inserted(self):
        """S-9: 수신자가 chat=off 여도 인앱 notifications row 는 기록하고 푸시만 게이트한다."""
        recipient_id = uuid.uuid4()
        session = MagicMock(commit=AsyncMock())
        insert_notification = AsyncMock(return_value=True)
        push_enabled = AsyncMock(return_value=False)
        try_push = AsyncMock()
        payload = {
            "recipient_id": str(recipient_id),
            "conversation_id": str(uuid.uuid4()),
            "sender_nickname": "Rider",
            "preview": "hello",
        }

        with (
            patch.object(noti_worker, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(noti_worker, "_insert_notification", new=insert_notification),
            patch.object(noti_worker, "_push_enabled", new=push_enabled),
            patch.object(noti_worker, "_try_push", new=try_push),
        ):
            await noti_worker._handle_dm_message(payload, source_event_id="1721635200003-0")

        insert_notification.assert_awaited_once()
        push_enabled.assert_awaited_once_with(session, recipient_id, "chat")
        try_push.assert_not_awaited()

    async def test_commit_before_push_crash_is_at_most_once_on_redelivery(self):
        """FD-5 suppresses a second push path; FD-6 must close the commit-before-push loss window."""
        recipient_id = uuid.uuid4()
        session = MagicMock(commit=AsyncMock())
        redis_client = MagicMock(xack=AsyncMock())
        insert_notification = AsyncMock(side_effect=[True, False])
        try_push = AsyncMock(side_effect=RuntimeError("worker crashed before provider call"))
        payload = {
            "recipient_id": str(recipient_id),
            "conversation_id": str(uuid.uuid4()),
            "sender_nickname": "Rider",
            "preview": "hello",
        }
        batch = [
            (
                "1721635200002-0",
                {"type": "dm.message_sent", "payload": json.dumps(payload)},
            )
        ]

        with (
            patch.object(noti_worker, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(noti_worker, "get_client", new=AsyncMock(return_value=redis_client)),
            patch.object(noti_worker, "_insert_notification", new=insert_notification),
            patch.object(noti_worker, "_push_enabled", new=AsyncMock(return_value=True)),
            patch.object(noti_worker, "_try_push", new=try_push),
            patch.object(noti_worker.log, "exception"),
        ):
            await noti_worker._process_batch(batch)
            await noti_worker._process_batch(batch, deliveries={"1721635200002-0": 2})

        self.assertEqual(session.commit.await_count, 2)
        self.assertEqual(insert_notification.await_count, 2)
        try_push.assert_awaited_once()
        redis_client.xack.assert_awaited_once_with(
            noti_worker.STREAM_KEY,
            noti_worker.CONSUMER_GROUP,
            "1721635200002-0",
        )

    async def test_proximity_hit_redelivery_reuses_stream_id_and_pushes_only_once(self):
        """근접 광고 진입 알림(260806_proximity_ad_design.md §9-5) — dm.message_sent 와 동일한
        FD-6 재전달 멱등성을 만족해야 한다(재전달 시 insert 는 2회, push 는 1회)."""
        user_id = uuid.uuid4()
        session = MagicMock(commit=AsyncMock())
        redis_client = MagicMock(xack=AsyncMock())
        insert_notification = AsyncMock(side_effect=[True, False])
        push_enabled = AsyncMock(return_value=True)
        try_push = AsyncMock()
        ad_id = str(uuid.uuid4())
        payload = {
            "user_id": str(user_id),
            "ad_id": ad_id,
            "title": "근처 가게 알림",
            "body": "지금 근처를 지나고 있어요",
            "partner_name": "Shop",
        }
        batch = [
            (
                "1721635200004-0",
                {"type": "proximity.hit", "payload": json.dumps(payload)},
            )
        ]

        with (
            patch.object(noti_worker, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(noti_worker, "get_client", new=AsyncMock(return_value=redis_client)),
            patch.object(noti_worker, "_insert_notification", new=insert_notification),
            patch.object(noti_worker, "_push_enabled", new=push_enabled),
            patch.object(noti_worker, "_try_push", new=try_push),
        ):
            await noti_worker._process_batch(batch)
            await noti_worker._process_batch(batch)

        self.assertEqual(insert_notification.await_count, 2)
        self.assertEqual(
            [call.kwargs["source_event_id"] for call in insert_notification.await_args_list],
            ["1721635200004-0", "1721635200004-0"],
        )
        push_enabled.assert_awaited_once_with(session, user_id, "event")
        try_push.assert_awaited_once_with(
            str(user_id), "근처 가게 알림", "지금 근처를 지나고 있어요", f"bizad&id={ad_id}"
        )
        self.assertEqual(redis_client.xack.await_count, 2)

    async def test_proximity_hit_push_skipped_when_event_notifications_disabled(self):
        user_id = uuid.uuid4()
        session = MagicMock(commit=AsyncMock())
        insert_notification = AsyncMock(return_value=True)
        push_enabled = AsyncMock(return_value=False)
        try_push = AsyncMock()
        payload = {
            "user_id": str(user_id),
            "ad_id": str(uuid.uuid4()),
            "title": "근처 가게 알림",
            "body": "지금 근처를 지나고 있어요",
        }

        with (
            patch.object(noti_worker, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(noti_worker, "_insert_notification", new=insert_notification),
            patch.object(noti_worker, "_push_enabled", new=push_enabled),
            patch.object(noti_worker, "_try_push", new=try_push),
        ):
            await noti_worker._handle_proximity_hit(payload, source_event_id="1721635200005-0")

        insert_notification.assert_awaited_once()
        push_enabled.assert_awaited_once_with(session, user_id, "event")
        try_push.assert_not_awaited()

    async def test_listing_event_can_insert_once_for_each_recipient(self):
        seller_id = uuid.uuid4()
        recipient_ids = [uuid.uuid4(), uuid.uuid4()]
        alerts = [SimpleNamespace(user_id=user_id, keyword="helmet") for user_id in recipient_ids]
        result = MagicMock()
        result.scalars.return_value.all.return_value = alerts
        session = MagicMock(execute=AsyncMock(return_value=result), commit=AsyncMock())
        insert_notification = AsyncMock(side_effect=[True, True, False, False])
        push_enabled = AsyncMock(return_value=True)
        try_push = AsyncMock()
        payload = {
            "seller_id": str(seller_id),
            "listing_id": str(uuid.uuid4()),
            "title": "Full-face helmet",
        }

        with (
            patch.object(noti_worker, "AsyncSessionLocal", return_value=_SessionContext(session)),
            patch.object(noti_worker, "_insert_notification", new=insert_notification),
            patch.object(noti_worker, "_push_enabled", new=push_enabled),
            patch.object(noti_worker, "_try_push", new=try_push),
        ):
            await noti_worker._handle_listing_created(payload, source_event_id="1721635200001-0")
            await noti_worker._handle_listing_created(payload, source_event_id="1721635200001-0")

        first_delivery = insert_notification.await_args_list[:2]
        self.assertEqual({call.kwargs["user_id"] for call in first_delivery}, set(recipient_ids))
        self.assertEqual({call.kwargs["source_event_id"] for call in first_delivery}, {"1721635200001-0"})
        self.assertEqual(try_push.await_count, 2)
        self.assertEqual(session.commit.await_count, 2)
