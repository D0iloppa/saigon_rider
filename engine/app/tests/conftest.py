"""공통 픽스처. 환경변수는 app.config import 전에 설정해야 함."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("ENGINE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("ENGINE_ADMIN_JWT_SECRET", "test-jwt-secret")

from unittest.mock import AsyncMock, MagicMock  # noqa: E402

import pytest  # noqa: E402


@pytest.fixture
def mock_db() -> AsyncMock:
    db = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    return db


def make_execute_result(
    *,
    scalar_one_or_none=None,
    scalar_one=None,
    scalars_all=None,
) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = scalar_one_or_none
    result.scalar_one.return_value = scalar_one
    if scalars_all is not None:
        result.scalars.return_value.all.return_value = scalars_all
    return result
