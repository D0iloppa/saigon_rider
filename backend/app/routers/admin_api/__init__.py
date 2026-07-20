"""신규 admin JSON API (`/admin/api/*`) — SPA 관리자 콘솔용.

후속 패키지(P2·P3·P5·P6)가 reports / users / listings / dashboard / support / cms
모듈을 추가하면 아래 include 목록에 등록한다.
"""

from fastapi import APIRouter

from . import audit_logs, auth, cms, dashboard, listings, map, reports, support, users

router = APIRouter(prefix="/admin/api", include_in_schema=False)
router.include_router(auth.router)
router.include_router(reports.router)
router.include_router(users.router)
router.include_router(listings.router)
router.include_router(dashboard.router)
router.include_router(support.router)
router.include_router(cms.router)
router.include_router(audit_logs.router)
router.include_router(map.router)
