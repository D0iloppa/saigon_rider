from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.staticfiles import StaticFiles

from .engine_client import engine_client
from .routers import (
    admin,
    app_version,
    auth,
    badges,
    contents,
    coupons,
    dev_context,
    dm,
    feed,
    follows,
    gacha,
    info_flood,
    info_gas,
    info_repair,
    info_route,
    info_weather,
    internal,
    inventory,
    master,
    notifications,
    profile,
    quest_cards,
    quests,
    ride,
    season,
    shop,
    support,
    user_quests,
    users,
    wallet,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 유가 갱신 cron (Asia/Ho_Chi_Minh) ──────────────────────────────
    # 04:00 / 15:30 / 22:30 / 23:30 ICT — 정부 조정 시각대 캐치.
    # 현재 외부 스크래퍼는 스텁 (D9), admin manual upsert 가 1차 운영 경로.
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger

    from .jobs.fetch_fuel_prices import run_fetch_cycle
    from .jobs.predict_flood_risk import run_flood_risk_prediction

    scheduler = AsyncIOScheduler(timezone="Asia/Ho_Chi_Minh")
    for hour, minute in [(4, 0), (15, 30), (22, 30), (23, 30)]:
        scheduler.add_job(
            run_fetch_cycle, CronTrigger(hour=hour, minute=minute), id=f"fuel_fetch_{hour:02d}{minute:02d}"
        )
    # 침수 예측 ②: 아침(출근 전) + 오후(퇴근 전) 강수예보 반영.
    for hour, minute in [(5, 30), (15, 0)]:
        scheduler.add_job(
            run_flood_risk_prediction,
            CronTrigger(hour=hour, minute=minute),
            id=f"flood_risk_{hour:02d}{minute:02d}",
        )
    scheduler.start()

    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(master.router, prefix="/api")
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
app.include_router(follows.router, prefix="/api")
app.include_router(dm.router, prefix="/api")
app.include_router(app_version.router, prefix="/api")
app.include_router(app_version.config_router, prefix="/api")
app.include_router(gacha.router, prefix="/api")
app.include_router(shop.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(season.router, prefix="/api")
app.include_router(dev_context.admin_router)
app.include_router(wallet.router)
app.include_router(coupons.router)
app.include_router(admin.router)
app.include_router(support.router, prefix="/api")
app.include_router(internal.router, prefix="/api")
app.include_router(info_flood.router, prefix="/api")
app.include_router(info_gas.router, prefix="/api")
app.include_router(info_repair.router, prefix="/api")
app.include_router(info_route.router, prefix="/api")
app.include_router(info_weather.router, prefix="/api")

app.mount("/admin/static", StaticFiles(directory=Path(__file__).parent / "static"), name="admin-static")


@app.get("/api/health", tags=["system"], summary="헬스체크")
async def health():
    return {"status": "ok"}
