from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import IdempotencyKey
from app.services import operation_idempotency
from app.services.operation_idempotency import IdempotencyConflictError

from .conftest import make_execute_result


async def test_new_key_is_claimed(mock_db: AsyncMock):
    inserted = MagicMock(rowcount=1)
    mock_db.execute.return_value = inserted

    result = await operation_idempotency.claim_or_replay(
        mock_db,
        idempotency_key="new-key",
        operation="GACHA_PULL",
        user_uuid="user-1",
        payload={"gacha_code": "BASIC", "is_10_pull": False},
    )

    assert result is None
    mock_db.execute.assert_awaited_once()


async def test_same_request_replays_first_response(mock_db: AsyncMock):
    payload = {"item_code": "HELMET", "currency": "GP"}
    existing = IdempotencyKey(
        idempotency_key="same-key",
        resource_type="SHOP_PURCHASE",
        external_user_uuid="user-1",
        request_hash=operation_idempotency._request_hash(payload),
        response_json={"purchase_log_id": 7},
    )
    mock_db.execute.side_effect = [
        MagicMock(rowcount=0),
        make_execute_result(scalar_one=existing),
    ]

    result = await operation_idempotency.claim_or_replay(
        mock_db,
        idempotency_key="same-key",
        operation="SHOP_PURCHASE",
        user_uuid="user-1",
        payload=payload,
    )

    assert result == {"purchase_log_id": 7}


async def test_same_key_with_different_payload_is_rejected(mock_db: AsyncMock):
    existing = IdempotencyKey(
        idempotency_key="reused-key",
        resource_type="GACHA_PULL",
        external_user_uuid="user-1",
        request_hash=operation_idempotency._request_hash(
            {"gacha_code": "BASIC", "is_10_pull": False}
        ),
        response_json={"ok": True},
    )
    mock_db.execute.side_effect = [
        MagicMock(rowcount=0),
        make_execute_result(scalar_one=existing),
    ]

    with pytest.raises(IdempotencyConflictError):
        await operation_idempotency.claim_or_replay(
            mock_db,
            idempotency_key="reused-key",
            operation="GACHA_PULL",
            user_uuid="user-1",
            payload={"gacha_code": "BASIC", "is_10_pull": True},
        )


async def test_store_response_updates_claimed_key(mock_db: AsyncMock):
    with patch.object(mock_db, "execute", new=AsyncMock()) as execute:
        await operation_idempotency.store_response(mock_db, "key", {"ok": True})

    execute.assert_awaited_once()
