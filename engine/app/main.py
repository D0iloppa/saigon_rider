import logging
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, Response
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.config import settings
from app.logging_config import configure_logging
from app.routers import (
    admin,
    balance,
    catalog,
    device_map,
    events,
    gacha,
    inventory,
    message,
    missions,
    redemptions,
    season,
    shop,
)

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
configure_logging(settings.sre_log_level)
log = logging.getLogger(__name__)

# ── APScheduler ───────────────────────────────────────────────


def _make_scheduler() -> AsyncIOScheduler:
    from app.jobs import cleanup_idem, expire_missions, expire_xp, trim_stream, verify_balance

    scheduler = AsyncIOScheduler(timezone=VN_TZ)
    scheduler.add_job(
        expire_xp.run, CronTrigger(hour=4, minute=0, timezone=VN_TZ), id="expire_xp"
    )
    scheduler.add_job(
        expire_missions.run,
        CronTrigger(hour=4, minute=5, timezone=VN_TZ),
        id="expire_missions",
    )
    scheduler.add_job(
        cleanup_idem.run,
        CronTrigger(hour=4, minute=10, timezone=VN_TZ),
        id="cleanup_idem",
    )
    scheduler.add_job(
        trim_stream.run,
        CronTrigger(hour=4, minute=15, timezone=VN_TZ),
        id="trim_stream",
    )
    scheduler.add_job(
        verify_balance.run,
        CronTrigger(hour=4, minute=30, timezone=VN_TZ),
        id="verify_balance",
    )
    return scheduler


# ── App 생명주기 ──────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.redis_client import close_redis, ensure_consumer_group

    await ensure_consumer_group()
    log.info("Redis stream consumer group ready")

    scheduler = _make_scheduler()
    scheduler.start()
    log.info("APScheduler started with %d jobs", len(scheduler.get_jobs()))
    yield
    scheduler.shutdown(wait=False)
    log.info("APScheduler stopped")
    await close_redis()
    log.info("Redis connection closed")
    from app.bff_client import bff_client
    await bff_client.close()
    log.info("BFF client closed")


# ── FastAPI 앱 ────────────────────────────────────────────────

# Nginx 가 외부 `/api/sre/*` → 내부 `/v1/*` 로 rewrite 하므로
# Swagger HTML 안의 openapi_url 은 외부 경로(`/api/sre/openapi.json`)로 명시해야
# 브라우저가 spec 을 정상 fetch 함.
_EXTERNAL_OPENAPI_URL = "/api/sre/openapi.json"

app = FastAPI(
    title="Saigon SRE Engine",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url="/v1/openapi.json",
    lifespan=lifespan,
)


@app.get("/v1/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url=_EXTERNAL_OPENAPI_URL,
        title=f"{app.title} — Swagger UI",
    )


@app.get("/v1/redoc", include_in_schema=False)
async def custom_redoc_html():
    return get_redoc_html(
        openapi_url=_EXTERNAL_OPENAPI_URL,
        title=f"{app.title} — ReDoc",
    )


# 라우터 등록
app.include_router(events.router)
app.include_router(balance.router)
app.include_router(missions.router)
app.include_router(catalog.router)
app.include_router(redemptions.router)
app.include_router(admin.router)
app.include_router(message.router)
app.include_router(device_map.router)
app.include_router(gacha.router)
app.include_router(shop.router)
app.include_router(inventory.router)
app.include_router(season.router)


# ── 헬스체크 / 메타 ──────────────────────────────────────────


@app.get("/v1/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok"}


@app.get("/v1/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/v1/version", tags=["meta"])
async def version() -> dict:
    return {"version": "1.0.0", "engine": "SRE"}


# ── 전역 예외 핸들러 ─────────────────────────────────────────


from app.exceptions import InsufficientBalanceError, RewardUnavailableError


@app.exception_handler(InsufficientBalanceError)
async def insufficient_balance_handler(request, exc):
    return JSONResponse(
        status_code=402, content={"detail": str(exc), "code": "INSUFFICIENT_BALANCE"}
    )


@app.exception_handler(RewardUnavailableError)
async def reward_unavailable_handler(request, exc):
    return JSONResponse(
        status_code=409, content={"detail": str(exc), "code": "REWARD_UNAVAILABLE"}
    )
