import logging
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.config import settings
from app.logging_config import configure_logging
from app.routers import admin, balance, catalog, events, missions, redemptions

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
configure_logging(settings.sre_log_level)
log = logging.getLogger(__name__)

# ── APScheduler ───────────────────────────────────────────────


def _make_scheduler() -> AsyncIOScheduler:
    from app.jobs import cleanup_idem, expire_missions, expire_rp, verify_balance

    scheduler = AsyncIOScheduler(timezone=VN_TZ)
    scheduler.add_job(expire_rp.run,        CronTrigger(hour=4,  minute=0,  timezone=VN_TZ), id="expire_rp")
    scheduler.add_job(expire_missions.run,  CronTrigger(hour=4,  minute=5,  timezone=VN_TZ), id="expire_missions")
    scheduler.add_job(cleanup_idem.run,     CronTrigger(hour=4,  minute=10, timezone=VN_TZ), id="cleanup_idem")
    scheduler.add_job(verify_balance.run,   CronTrigger(hour=4,  minute=30, timezone=VN_TZ), id="verify_balance")
    return scheduler


# ── App 생명주기 ──────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = _make_scheduler()
    scheduler.start()
    log.info("APScheduler started with %d jobs", len(scheduler.get_jobs()))
    yield
    scheduler.shutdown(wait=False)
    log.info("APScheduler stopped")


# ── FastAPI 앱 ────────────────────────────────────────────────

app = FastAPI(
    title="Saigon SRE Engine",
    version="1.0.0",
    docs_url="/v1/docs",
    openapi_url="/v1/openapi.json",
    lifespan=lifespan,
)

# 라우터 등록
app.include_router(events.router)
app.include_router(balance.router)
app.include_router(missions.router)
app.include_router(catalog.router)
app.include_router(redemptions.router)
app.include_router(admin.router)


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
    return JSONResponse(status_code=402, content={"detail": str(exc), "code": "INSUFFICIENT_BALANCE"})


@app.exception_handler(RewardUnavailableError)
async def reward_unavailable_handler(request, exc):
    return JSONResponse(status_code=409, content={"detail": str(exc), "code": "REWARD_UNAVAILABLE"})
