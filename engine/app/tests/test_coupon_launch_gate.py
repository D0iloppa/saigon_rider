import importlib.util
import sqlite3
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import RewardUnavailableError
from app.services import reward

from .conftest import make_execute_result


def _load_migration():
    path = (
        Path(__file__).parents[2]
        / "alembic"
        / "versions"
        / "062_disable_internal_coupon_catalog.py"
    )
    spec = importlib.util.spec_from_file_location(
        "disable_internal_coupon_catalog", path
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_disables_every_active_internal_catalog_item():
    migration = _load_migration()

    with patch.object(migration.op, "execute") as execute:
        migration.upgrade()

    execute.assert_called_once()
    sql = " ".join(execute.call_args.args[0].split()).upper()
    assert "UPDATE REWARD_CATALOG AS CATALOG" in sql
    assert "SET IS_ACTIVE = FALSE" in sql
    assert "FROM REWARD_PARTNER AS PARTNER" in sql
    assert "CATALOG.PARTNER_ID = PARTNER.PARTNER_ID" in sql
    assert "PARTNER.PARTNER_CODE = 'INTERNAL'" in sql

    db = sqlite3.connect(":memory:")
    try:
        db.executescript(
            """
            CREATE TABLE reward_partner (partner_id INTEGER, partner_code TEXT);
            CREATE TABLE reward_catalog (catalog_id INTEGER, partner_id INTEGER, is_active BOOLEAN);
            INSERT INTO reward_partner VALUES (1, 'INTERNAL'), (2, 'EXTERNAL');
            INSERT INTO reward_catalog VALUES (1, 1, TRUE), (2, 1, FALSE), (3, 2, TRUE);
            """
        )
        db.execute(execute.call_args.args[0])

        active_internal = db.execute(
            """
            SELECT COUNT(*)
            FROM reward_catalog AS catalog
            JOIN reward_partner AS partner ON partner.partner_id = catalog.partner_id
            WHERE partner.partner_code = 'INTERNAL' AND catalog.is_active = TRUE
            """
        ).fetchone()
        external = db.execute(
            "SELECT is_active FROM reward_catalog WHERE catalog_id = 3"
        ).fetchone()

        assert active_internal == (0,)
        assert external == (1,)
    finally:
        db.close()


def test_migration_downgrade_never_reactivates_catalog_items():
    migration = _load_migration()

    with patch.object(migration.op, "execute") as execute:
        migration.downgrade()

    execute.assert_not_called()


async def test_inactive_catalog_is_rejected_before_any_balance_or_ledger_mutation(
    mock_db: AsyncMock,
):
    inactive_catalog = MagicMock(is_active=False, monthly_issued=11)
    mock_db.execute.side_effect = [
        make_execute_result(scalar_one_or_none=None),
        make_execute_result(scalar_one_or_none=inactive_catalog),
    ]
    user = MagicMock(user_id=7)

    with (
        patch.object(reward.xp_ledger, "lock_balance", new=AsyncMock()) as lock_balance,
        patch.object(reward.xp_ledger, "record_gc_tx", new=AsyncMock()) as record_gc_tx,
        pytest.raises(RewardUnavailableError, match="Catalog item not available"),
    ):
        await reward.redeem(
            mock_db,
            user=user,
            catalog_id=1,
            idempotency_key="inactive-internal-coupon",
        )

    lock_balance.assert_not_awaited()
    record_gc_tx.assert_not_awaited()
    assert inactive_catalog.monthly_issued == 11
    mock_db.add.assert_not_called()
    mock_db.flush.assert_not_awaited()
    mock_db.commit.assert_not_awaited()
