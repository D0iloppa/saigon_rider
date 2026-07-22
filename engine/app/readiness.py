import asyncio

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.redis_client import get_redis


def expected_migration_head() -> str:
    return ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()


async def check_readiness() -> dict[str, str]:
    expected = expected_migration_head()
    async with AsyncSessionLocal() as db:
        current = (await db.execute(text("SELECT version_num FROM alembic_version"))).scalar_one_or_none()
        if current != expected:
            raise RuntimeError(f"Engine migration is not current (expected {expected})")

    redis = await get_redis()
    if not await redis.ping():
        raise RuntimeError("Redis ping failed")
    return {"database": "ready", "redis": "ready", "migration": expected}


def main() -> None:
    asyncio.run(check_readiness())


if __name__ == "__main__":
    main()
