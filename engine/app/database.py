from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# idle_in_transaction_session_timeout: 트랜잭션을 연 채 30초 이상 놀고 있는 세션을 서버가 끊는다.
# 요청 취소(클라이언트 연결 끊김)가 DB 작업 도중에 들어오면 커넥션이 반납되지 않고 풀에 남는데,
# 이 누수가 쌓여 푸시 발송이 전면 중단된 적이 있다(2026-09-13, routers/device_map.py 주석 참조).
# 호출부 수정이 1차 방어이고 이건 2차 안전망이다. 끊긴 커넥션은 pool_pre_ping 이 걸러낸다.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    connect_args={"server_settings": {"idle_in_transaction_session_timeout": "30000"}},
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
