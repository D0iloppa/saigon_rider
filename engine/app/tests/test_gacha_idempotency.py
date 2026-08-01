from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import gacha

from .conftest import make_execute_result


RAW_RESULT = {
    "gacha_code": "BASIC_PULL",
    "is_10_pull": True,
    "batch_id": 42,
    "cost_currency": "GP",
    "cost_amount": 1000,
    "results": [
        {
            "pull_index": index,
            "rarity": "C",
            "item_code": f"ITEM_{index}",
            "grant_status": "GRANTED",
        }
        for index in range(1, 11)
    ],
    "pity_count_after": 10,
    "total_pulls_after": 10,
}


async def test_ten_retries_execute_paid_pull_once(mock_db: AsyncMock):
    user = MagicMock(user_id=7)
    stored = RAW_RESULT.copy()
    stored["results"] = [item.copy() for item in RAW_RESULT["results"]]
    claim = AsyncMock(side_effect=[None, *([stored] * 9)])
    store = AsyncMock()
    mock_db.execute.return_value = make_execute_result(scalar_one=RAW_RESULT)

    with (
        patch.object(gacha, "get_or_create_user", new=AsyncMock(return_value=user)),
        patch.object(gacha, "get_or_create_balance", new=AsyncMock()),
        patch("app.services.operation_idempotency.claim_or_replay", new=claim),
        patch("app.services.operation_idempotency.store_response", new=store),
    ):
        results = [
            await gacha.pull(
                mock_db,
                user_uuid="user-1",
                idempotency_key="one-intent",
                gacha_code="BASIC_PULL",
                is_10_pull=True,
            )
            for _ in range(10)
        ]

    assert all(result == results[0] for result in results)
    mock_db.execute.assert_awaited_once()
    store.assert_awaited_once()
    mock_db.commit.assert_awaited_once()


async def test_response_storage_failure_does_not_commit_paid_pull(mock_db: AsyncMock):
    user = MagicMock(user_id=7)
    mock_db.execute.return_value = make_execute_result(scalar_one=RAW_RESULT)

    with (
        patch.object(gacha, "get_or_create_user", new=AsyncMock(return_value=user)),
        patch.object(gacha, "get_or_create_balance", new=AsyncMock()),
        patch(
            "app.services.operation_idempotency.claim_or_replay",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.operation_idempotency.store_response",
            new=AsyncMock(side_effect=RuntimeError("storage failed")),
        ),
    ):
        with pytest.raises(RuntimeError, match="storage failed"):
            await gacha.pull(
                mock_db,
                user_uuid="user-1",
                idempotency_key="one-intent",
                gacha_code="BASIC_PULL",
                is_10_pull=True,
            )

    mock_db.commit.assert_not_awaited()
