import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .database import engine
from .engine_client import engine_client
from .routers import (
    ad_contract,
    admin_api,
    admin_legacy,
    app_version,
    auth,
    badges,
    biz,
    community_groups,
    contents,
    dev_context,
    dm,
    dm_channels,
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
    live_activities,
    location_channels,
    map,
    market,
    master,
    notices,
    notifications,
    profile,
    proximity,
    quest_cards,
    quests,
    ride,
    season,  # noqa: F401 -- [게이미피케이션 잠정보류 — 재개 시 주석 해제] 라우터 include 주석처리로 미사용
    shop,  # noqa: F401 -- [게이미피케이션 잠정보류 — 재개 시 주석 해제] 라우터 include 주석처리로 미사용
    support,
    tracking,
    translate,
    user_quests,
    users,
    wallet,
)
from .routers.contents import CONTENTS_BASE_PATH
from .services.cors import get_allowed_origins
from .services.ops_alerts import send_ops_alert
from .services.walkie_module import build_walkie

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 유가 갱신 cron (Asia/Ho_Chi_Minh) ──────────────────────────────
    # 04:00 / 15:30 / 22:30 / 23:30 ICT — 정부 조정 시각대 캐치.
    # 현재 외부 스크래퍼는 스텁 (D9), admin manual upsert 가 1차 운영 경로.
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    from .jobs.alert_report_backlog import check_report_backlog
    from .jobs.backup_db import run_backup
    from .jobs.deal_result_ping import send_deal_result_pings
    from .jobs.expire_flood_reports import expire_stale_flood_reports
    from .jobs.expire_stale_listings import expire_stale_listings
    from .jobs.fetch_fuel_prices import run_fetch_cycle
    from .jobs.predict_flood_risk import run_flood_risk_prediction
    from .jobs.purge_deleted_accounts import purge_deleted_accounts
    from .jobs.purge_old_dm_messages import purge_old_dm_messages
    from .jobs.purge_old_notifications import purge_old_notifications
    from .jobs.refresh_repair_stats import refresh_repair_shop_stats
    from .jobs.retry_quest_rewards import retry_failed_quest_rewards
    from .jobs.rollup_ad_stats import rollup_ad_stats
    from .jobs.rollup_funnel_stats import rollup_funnel_stats
    from .jobs.title_transfer_reminders import send_title_transfer_reminders

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
    # 매물 30일 무갱신 자동 EXPIRED (016 §4-1 #36, D-32=(a)) — 트래픽 낮은 새벽, backup(02:30)·
    # purge_deleted_accounts(03:10) 과 겹치지 않는 시간대.
    scheduler.add_job(
        expire_stale_listings,
        CronTrigger(hour=1, minute=0),
        id="expire_stale_listings",
        max_instances=1,
        coalesce=True,
    )
    # 명의이전 D+7/D+25 리마인더 (016 §4-6 #41, D-35=(a)) — expire_stale_listings(01:00) 직후.
    scheduler.add_job(
        send_title_transfer_reminders,
        CronTrigger(hour=1, minute=5),
        id="title_transfer_reminders",
        max_instances=1,
        coalesce=True,
    )
    # 거래 결과 확인 핑 (016 §4-7 #42) — title_transfer_reminders(01:05) 직후.
    scheduler.add_job(
        send_deal_result_pings,
        CronTrigger(hour=1, minute=10),
        id="deal_result_ping",
        max_instances=1,
        coalesce=True,
    )
    # 신고 큐 적체 경보 (정본 §5 #3, D-11 — 우선순위 상승만, 자동 조치 없음) — SLA 24h 기준이라
    # 1시간 주기면 충분히 촘촘하다. 실제 발송 빈도는 send_ops_alert 쪽 24h 쿨다운이 제한한다.
    scheduler.add_job(
        check_report_backlog,
        IntervalTrigger(hours=1),
        id="alert_report_backlog",
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
    # 알림 90일 보관기간 정책 — 알림함 무기한 보관 방지. purge_deleted_accounts(03:10) 직후.
    scheduler.add_job(
        purge_old_notifications,
        CronTrigger(hour=3, minute=20),
        id="purge_old_notifications",
        max_instances=1,
        coalesce=True,
    )
    # DM 메시지 365일 보관정책 (purge_old_dm_messages 모듈 docstring 참조) —
    # purge_old_notifications(03:20) 직후 새벽 시간대.
    scheduler.add_job(
        purge_old_dm_messages,
        CronTrigger(hour=3, minute=30),
        id="purge_old_dm_messages",
        max_instances=1,
        coalesce=True,
    )
    # DB 일 백업 (게이트9 B-5) — purge_deleted_accounts(03:10) 보다 앞선 새벽 시간대.
    # 오프사이트 반출·암호화는 별도(대표 결정 대기) — ai-docs/260802_backup_restore_drill.md.
    scheduler.add_job(
        run_backup,
        CronTrigger(hour=2, minute=30),
        id="backup_db",
        max_instances=1,
        coalesce=True,
    )
    # 광고 성과 일별 롤업 (정본 §5 #6, D-1) — 전날(VN) 하루를 ad_events 에서 재집계해
    # ad_daily_stats 에 upsert. 00:20 ICT — 자정 직후 지연 도착 이벤트를 약간 흡수.
    scheduler.add_job(
        rollup_ad_stats,
        CronTrigger(hour=0, minute=20),
        id="rollup_ad_stats",
        max_instances=1,
        coalesce=True,
    )
    # 퍼널 계측 일별 롤업 (정본 §5 #5, D-18(a)) — 전날(VN) 하루를 funnel_events 에서 재집계해
    # funnel_daily_stats 에 upsert. rollup_ad_stats(00:20)와 겹치지 않게 5분 뒤.
    scheduler.add_job(
        rollup_funnel_stats,
        CronTrigger(hour=0, minute=25),
        id="rollup_funnel_stats",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()

    # 워키토키 모듈의 `wt_*` 테이블 확보(멱등). 이 프로젝트의 번호매김 SQL 규약을 따르지 않는
    # 유일한 예외다 — 해당 스키마는 모듈이 소유하고, DDL 을 여기 복사해두면 모듈을 업데이트할
    # 때마다 두 곳이 어긋난다. 모듈 전용 metadata 라 호스트 테이블은 건드리지 않는다.
    await _walkie.setup()

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

# 2026-08-02 외부 검증에서 운영 `app.saigon-rider.com` 의 `/api/bff/openapi.json`·`/docs`·
# `/redoc` 이 무인증 200 으로 전체 API 표면(엔드포인트·파라미터·모델)을 공개하고 있었다.
# FastAPI 기본 docs 는 이미 껐지만(docs_url/redoc_url=None) 아래 커스텀 라우트와
# openapi_url 이 무조건 등록돼 있어 소용이 없었다.
#
# 판정은 fail-safe 화이트리스트다 — APP_ENV 가 미설정이거나 오타면 **닫힌다**.
# ("production 이 아니면 dev" 라는 fail-open 판정은 APP_ENV 오타 하나로 운영에서 열린다.)
# 같은 기준이 routers/auth.py 의 `_DEV_ENV_VALUES`(AUTH-10)에도 있다 — 판정 통합은
# 별건(그 파일은 현재 다른 변경이 진행 중이라 이번 범위에서 손대지 않았다).
_DEV_ENV_VALUES = {"development", "dev", "local", "test"}
_DOCS_ENABLED = os.getenv("APP_ENV", "").strip().lower() in _DEV_ENV_VALUES

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
    openapi_url="/api/openapi.json" if _DOCS_ENABLED else None,
    lifespan=lifespan,
)


if _DOCS_ENABLED:

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

# ── 워키토키 모듈 (d_modules/WalkieTalkie) ────────────────────────────────
# 이 앱은 어댑터(app/services/walkie_module.py)만 제공하고, 참석·권한 판정은 전부 그쪽에 있다.
# 모듈 자체는 우리 스키마를 모른다 — 사용자를 불투명 문자열로만 다룬다.
_walkie = build_walkie(engine, CONTENTS_BASE_PATH)
app.include_router(_walkie.router, prefix="/api")

app.include_router(auth.router, prefix="/api")
app.include_router(master.router, prefix="/api")
app.include_router(notices.router, prefix="/api")
app.include_router(map.router, prefix="/api")
app.include_router(live_activities.router, prefix="/api")  # iOS Live Activity 푸시토큰 (260829 Phase 3)
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
app.include_router(community_groups.router, prefix="/api")
app.include_router(ad_contract.router, prefix="/api")
app.include_router(follows.router, prefix="/api")
app.include_router(dm.router, prefix="/api")
app.include_router(dm_channels.router, prefix="/api")  # 대화방 게시판 (init/218)
app.include_router(location_channels.router, prefix="/api")  # 실시간 위치공유 채널 (260829 Phase 1)
app.include_router(tracking.router, prefix="/api")
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
app.include_router(proximity.router, prefix="/api")
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
