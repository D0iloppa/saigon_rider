"""지도(Map) 도메인 라우터 — POI/구역/장소제보를 한 곳에 모아 `/api`에 단일 등록한다.

`admin_api/__init__.py` 패턴 미러: 하위 라우터를 모아 노출하고, main.py는 이 패키지
하나만 include한다. 각 하위 라우터가 자체 prefix(`/poi`, `/map`)를 가지므로 이 패키지
router 자체에는 prefix를 두지 않는다.
"""

from fastapi import APIRouter

from . import districts, place_suggestions, poi

router = APIRouter()
router.include_router(poi.router)
router.include_router(districts.router)
router.include_router(place_suggestions.router)
