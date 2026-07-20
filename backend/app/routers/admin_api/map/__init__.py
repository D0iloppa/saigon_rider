"""admin JSON API — 지도(Map) 도메인 (`admin_api/__init__.py` 패턴 미러).

POI 단건 CRUD(`poi.py`) + 제보심사 3종(`submissions.py`)을 `/map` prefix 하나로 모아
`admin_api/__init__.py`가 include하는 최상위 router 하나만 노출한다.
"""

from fastapi import APIRouter

from . import poi, submissions

router = APIRouter(prefix="/map")
router.include_router(poi.router)
router.include_router(submissions.router)
