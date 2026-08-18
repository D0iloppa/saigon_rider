"""신규 admin JSON API (`/admin/api/*`) — SPA 관리자 콘솔용.

후속 패키지(P2·P3·P5·P6)가 reports / users / listings / dashboard / support / cms
모듈을 추가하면 아래 include 목록에 등록한다.
"""

from fastapi import APIRouter

from . import (
    accounts,
    audit_logs,
    auth,
    badges,
    biz,
    cms,
    dashboard,
    dev_context,
    feed,
    fuel,
    funnel,
    gacha,
    issues,
    items,
    liquidity,
    listings,
    map,
    ops,
    push,
    quests,
    reports,
    reward_policy,
    ride_policy,
    settings,
    shop,
    stream,
    support,
    trades,
    users,
)

router = APIRouter(prefix="/admin/api", include_in_schema=False)
router.include_router(auth.router)
router.include_router(reports.router)
router.include_router(users.router)
router.include_router(listings.router)
router.include_router(dashboard.router)
router.include_router(support.router)
router.include_router(issues.router)
router.include_router(cms.router)
router.include_router(audit_logs.router)
router.include_router(map.router)
router.include_router(biz.router)
router.include_router(accounts.router)
router.include_router(feed.router)
router.include_router(dev_context.router)
router.include_router(fuel.router)
router.include_router(ride_policy.router)
router.include_router(reward_policy.router)
router.include_router(badges.router)
router.include_router(items.router)
router.include_router(quests.router)
router.include_router(gacha.router)
router.include_router(shop.router)
router.include_router(ops.router)
router.include_router(push.router)
router.include_router(settings.router)
router.include_router(stream.router)
router.include_router(trades.router)
router.include_router(funnel.router)
router.include_router(liquidity.router)
