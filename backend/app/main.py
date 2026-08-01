import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .engine_client import engine_client
from .routers import (
    admin_api,
    admin_legacy,
    app_version,
    auth,
    badges,
    biz,
    contents,
    dev_context,
    dm,
    feed,
    follows,
    gacha,  # noqa: F401 -- [게이미피케이션 잠정보류 — 재개 시 주석 해제] 라우터 include 주석처리로 미사용
    info_flood,
    info_gas,
    info_repair,
    info_route,
    info_weather,
    internal,
    inventory,  # noqa: F401 -- [게이미피케이션 잠정보류 — 재개 시 주석 해제] 라우터 include 주석처리로 미사용
    map,
    market,
    master,
    notices,
    notifications,
    profile,
    quest_cards,
    quests,
    ride,
    season,  # noqa: F401 -- [게이미피케이션 잠정보류 — 재개 시 주석 해제] 라우터 include 주석처리로 미사용
    shop,  # noqa: F401 -- [게이미피케이션 잠정보류 — 재개 시 주석 해제] 라우터 include 주석처리로 미사용
    support,
    translate,
    user_quests,
    users,
    wallet,
)
from .services.cors import get_allowed_origins
from .services.ops_alerts import send_ops_alert

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 유가 갱신 cron (Asia/Ho_Chi_Minh) ──────────────────────────────
    # 04:00 / 15:30 / 22:30 / 23:30 ICT — 정부 조정 시각대 캐치.
    # 현재 외부 스크래퍼는 스텁 (D9), admin manual upsert 가 1차 운영 경로.
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    from .jobs.expire_flood_reports import expire_stale_flood_reports
    from .jobs.fetch_fuel_prices import run_fetch_cycle
    from .jobs.predict_flood_risk import run_flood_risk_prediction
    from .jobs.purge_deleted_accounts import purge_deleted_accounts
    from .jobs.refresh_repair_stats import refresh_repair_shop_stats
    from .jobs.retry_quest_rewards import retry_failed_quest_rewards

    scheduler = AsyncIOScheduler(timezone="Asia/Ho_Chi_Minh")
    for hour, minute in [(4, 0), (15, 30), (22, 30), (23, 30)]:
        scheduler.add_job(
            run_fetch_cycle,
            CronTrigger(hour=hour, minute=minute),
            id=f"fuel_fetch_{hour:02d}{minute:02d}",
            max_instances=1,
            coalesce=True,
        )
    # 침수 예측 ②: 아침(출근 전) + 오후(퇴근 전) 강수예보 반영.
    for hour, minute in [(5, 30), (15, 0)]:
        scheduler.add_job(
            run_flood_risk_prediction,
            CronTrigger(hour=hour, minute=minute),
            id=f"flood_risk_{hour:02d}{minute:02d}",
        )
    scheduler.add_job(
        refresh_repair_shop_stats,
        IntervalTrigger(minutes=5),
        id="refresh_repair_shop_stats",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        expire_stale_flood_reports,
        IntervalTrigger(minutes=5),
        id="expire_stale_flood_reports",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        retry_failed_quest_rewards,
        IntervalTrigger(minutes=1),
        id="retry_failed_quest_rewards",
        max_instances=1,
        coalesce=True,
    )
    # 탈퇴 30일 경과 계정 개인데이터 파기 (F-10) — 트래픽 낮은 새벽 시간대.
    scheduler.add_job(
        purge_deleted_accounts,
        CronTrigger(hour=3, minute=10),
        id="purge_deleted_accounts",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()

    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
        await info_route.close_route_client()
        await engine_client.close()


# Nginx 가 외부 `/api/bff/*` → 내부 `/api/*` 로 rewrite 하므로
# Swagger HTML 안의 openapi_url 은 외부 경로(`/api/bff/openapi.json`)로 명시해야
# 브라우저가 spec 을 정상 fetch 함.
_EXTERNAL_OPENAPI_URL = "/api/bff/openapi.json"

app = FastAPI(
    title="Saigon Rider API",
    version="1.0.0",
    description=(
        "Saigon Rider 백엔드 API.\n\n"
        "- **인증**: 전화번호 기반 passcode 발급/검증\n"
        "- **컨텐츠**: 이미지 업로드 및 imgproxy URL 서빙\n"
        "- **프로필**: 사진 변경, 닉네임 수정\n"
        "- **퀘스트**: 목록/상세/수락/북마크\n"
        "- **라이딩**: 결과 제출, 스트릭, 이력\n"
        "- **피드**: 게시·좋아요·댓글\n"
    ),
    docs_url=None,
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


@app.get("/api/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url=_EXTERNAL_OPENAPI_URL,
        title=f"{app.title} — Swagger UI",
    )


@app.get("/api/redoc", include_in_schema=False)
async def custom_redoc_html():
    return get_redoc_html(
        openapi_url=_EXTERNAL_OPENAPI_URL,
        title=f"{app.title} — ReDoc",
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(master.router, prefix="/api")
app.include_router(notices.router, prefix="/api")
app.include_router(map.router, prefix="/api")
app.include_router(market.router, prefix="/api")
app.include_router(translate.router, prefix="/api")
app.include_router(contents.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(quests.router, prefix="/api")
app.include_router(quest_cards.router, prefix="/api")
app.include_router(user_quests.router, prefix="/api")
app.include_router(ride.router, prefix="/api")
app.include_router(feed.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(badges.router, prefix="/api")
app.include_router(biz.router, prefix="/api")
app.include_router(follows.router, prefix="/api")
app.include_router(dm.router, prefix="/api")
app.include_router(app_version.router, prefix="/api")
app.include_router(app_version.config_router, prefix="/api")
# [게이미피케이션 잠정보류 — 재개 시 주석 해제]
# app.include_router(gacha.router, prefix="/api")
# app.include_router(shop.router, prefix="/api")
# app.include_router(inventory.router, prefix="/api")
# app.include_router(season.router, prefix="/api")
app.include_router(dev_context.admin_router)
app.include_router(wallet.router)
app.include_router(admin_legacy.router)
app.include_router(admin_api.router)
app.include_router(support.router, prefix="/api")
app.include_router(internal.router, prefix="/api")
app.include_router(info_flood.router, prefix="/api")
app.include_router(info_gas.router, prefix="/api")
app.include_router(info_repair.router, prefix="/api")
app.include_router(info_route.router, prefix="/api")
app.include_router(info_weather.router, prefix="/api")

app.mount("/admin-legacy/static", StaticFiles(directory=Path(__file__).parent / "static"), name="admin-static")


@app.get("/api/health", tags=["system"], summary="생존 상태")
async def health():
    """프로세스 liveness. DB·Redis 준비 상태는 /api/ready에서 확인한다."""
    return {"status": "ok"}


@app.get("/api/ready", tags=["system"], summary="준비 상태")
async def readiness():
    from .readiness import check_readiness

    try:
        checks = await check_readiness()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return {"status": "ready", "checks": checks}


# ── F-18: 미처리 예외 운영자 알림 (최소 경로 — sentry 대체) ──────────────


@app.exception_handler(Exception)
async def _unhandled_exception_alert(request: Request, exc: Exception):
    log.exception("Unhandled exception at %s %s", request.method, request.url.path)
    await send_ops_alert(
        f"[BFF 5xx] {request.method} {request.url.path}: {type(exc).__name__}: {exc}",
        key=f"bff-exc:{type(exc).__name__}:{request.url.path}",
    )
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})
