"""FD-6 producer transactional outbox 테스트.

- enqueue 가 도메인 세션에 outbox row 만 적재하고 커밋하지 않는지
- relay 가 미발행 row 를 event_id(불변 row id)와 함께 stream 으로 발행하고 published_at 을 찍는지
- 소비자가 msg_id 가 아닌 event_id 를 멱등키로 우선하는지 (재발행 중복 방지의 핵심)
- fresh init SQL / compose 배선 계약
"""

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.models import NotificationOutbox
from app.noti_worker import __main__ as noti_worker
from app.services import noti_events


class _SessionContext:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class EnqueueContractTest(unittest.TestCase):
    def test_enqueue_adds_outbox_row_without_committing(self):
        db = MagicMock()
        noti_events.enqueue(db, "dm.message_sent", {"conversation_id": "c1"})

        db.add.assert_called_once()
        added = db.add.call_args.args[0]
        self.assertIsInstance(added, NotificationOutbox)
        self.assertEqual(added.event_type, "dm.message_sent")
        self.assertEqual(added.payload, {"conversation_id": "c1"})
        # 커밋은 호출부(도메인 트랜잭션) 책임 — 여기서 커밋하면 원자성이 깨진다.
        db.commit.assert_not_called()


class OutboxRelayTest(unittest.IsolatedAsyncioTestCase):
    def _mock_session(self, rows):
        scalars = MagicMock()
        scalars.all.return_value = rows
        result = MagicMock()
        result.scalars.return_value = scalars
        db = MagicMock()
        db.execute = AsyncMock(return_value=result)
        db.commit = AsyncMock()
        return db

    async def test_publishes_unpublished_rows_with_stable_event_id(self):
        rows = [
            SimpleNamespace(id=11, event_type="dm.message_sent", payload={"a": 1}, published_at=None),
            SimpleNamespace(id=12, event_type="market.listing_created", payload={"b": 2}, published_at=None),
        ]
        db = self._mock_session(rows)
        redis = MagicMock(xadd=AsyncMock())

        with (
            patch.object(noti_worker, "AsyncSessionLocal", return_value=_SessionContext(db)),
            patch.object(noti_worker, "get_client", AsyncMock(return_value=redis)),
        ):
            count = await noti_worker._drain_outbox_once()

        self.assertEqual(count, 2)
        self.assertEqual(redis.xadd.await_count, 2)
        # event_id = 불변 outbox row id (재발행돼도 소비자가 멱등 처리)
        first_fields = redis.xadd.await_args_list[0].args[1]
        self.assertEqual(first_fields["event_id"], "11")
        self.assertEqual(first_fields["type"], "dm.message_sent")
        # 발행한 row 는 published 로 마킹 후 커밋
        self.assertIsNotNone(rows[0].published_at)
        self.assertIsNotNone(rows[1].published_at)
        db.commit.assert_awaited_once()

    async def test_empty_outbox_does_not_publish_or_commit(self):
        db = self._mock_session([])
        redis = MagicMock(xadd=AsyncMock())

        with (
            patch.object(noti_worker, "AsyncSessionLocal", return_value=_SessionContext(db)),
            patch.object(noti_worker, "get_client", AsyncMock(return_value=redis)),
        ):
            count = await noti_worker._drain_outbox_once()

        self.assertEqual(count, 0)
        redis.xadd.assert_not_awaited()
        db.commit.assert_not_awaited()


class ConsumerIdempotencyKeyTest(unittest.IsolatedAsyncioTestCase):
    async def test_process_batch_prefers_event_id_over_stream_msg_id(self):
        captured = {}

        async def fake_handler(payload, *, source_event_id):
            captured["source_event_id"] = source_event_id

        redis = MagicMock(xack=AsyncMock())
        batch = [("1700000000000-0", {"type": "dm.message_sent", "payload": "{}", "event_id": "42"})]

        with (
            patch.dict(noti_worker.HANDLERS, {"dm.message_sent": fake_handler}, clear=False),
            patch.object(noti_worker, "get_client", AsyncMock(return_value=redis)),
        ):
            await noti_worker._process_batch(batch)

        # msg_id(1700...-0) 가 아니라 outbox event_id(42) 를 멱등키로 써야 한다.
        self.assertEqual(captured["source_event_id"], "42")

    async def test_process_batch_falls_back_to_msg_id_without_event_id(self):
        captured = {}

        async def fake_handler(payload, *, source_event_id):
            captured["source_event_id"] = source_event_id

        redis = MagicMock(xack=AsyncMock())
        batch = [("1700000000000-5", {"type": "dm.message_sent", "payload": "{}"})]

        with (
            patch.dict(noti_worker.HANDLERS, {"dm.message_sent": fake_handler}, clear=False),
            patch.object(noti_worker, "get_client", AsyncMock(return_value=redis)),
        ):
            await noti_worker._process_batch(batch)

        self.assertEqual(captured["source_event_id"], "1700000000000-5")


class OutboxWiringContractTest(unittest.TestCase):
    def _root(self) -> Path:
        return Path(__file__).resolve().parents[3]

    def test_fresh_init_migration_creates_outbox(self):
        sql = (self._root() / "database" / "init" / "146_notification_outbox.sql").read_text(encoding="utf-8")
        normalized = " ".join(sql.lower().split())
        self.assertIn("create table if not exists notification_outbox", normalized)
        self.assertIn("published_at timestamptz", normalized)

    def test_compose_migrate_applies_outbox_before_worker(self):
        compose = (self._root() / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertIn("146_notification_outbox.sql", compose)

    def test_readiness_checks_outbox_table(self):
        import inspect

        from app import readiness

        src = inspect.getsource(readiness.check_readiness)
        self.assertIn("notification_outbox", src)


if __name__ == "__main__":
    unittest.main()
