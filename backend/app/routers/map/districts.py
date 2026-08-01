"""District/Ward 지오메트리·집계 라우터.

구 `GET /district-counts`(map.py, 도시 전체/ward 별 매물·피드 집계 배지용)는
프론트 소비처가 전무해(§1.2·§6 항목5, `fetchDistrictCounts` grep 0건) 폐기했다.
poi.py/place_suggestions.py와 함께 map 패키지 아래 도메인 파일 자리는 유지한다.
"""

import json

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db

router = APIRouter(prefix="/map", tags=["지도 (Map)"])

# 배경용 실루엣이라 세부 경계 불필요 — 도(度) 단위, 적도 기준 약 55m.
_OUTLINE_SIMPLIFY_TOLERANCE = 0.0005
_outline_cache: dict | None = None


@router.get("/city-outline")
async def get_city_outline(db: AsyncSession = Depends(get_db)) -> dict:
    """HCMC 전역 외곽 윤곽 — `districts.boundary` 합집합을 단순화해 반환.

    순수 표시(배경)용이다. 서비스지역 판정(등록 게이트)은 여전히
    `saigon-depth1.json`(37워드)/`service_area.py` 기준이며, 이 응답은 그 판정에
    쓰지 않는다. 정적 데이터라 최초 요청 시 1회 계산 후 프로세스 메모리에 캐시한다.
    """
    global _outline_cache
    if _outline_cache is not None:
        return _outline_cache

    geojson = (
        await db.execute(
            text(
                "SELECT ST_AsGeoJSON(ST_Simplify(ST_Union(boundary::geometry), :tol)) "
                "FROM districts WHERE boundary IS NOT NULL"
            ),
            {"tol": _OUTLINE_SIMPLIFY_TOLERANCE},
        )
    ).scalar()
    geom = json.loads(geojson)
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    # 배경 실루엣이라 각 폴리곤의 외곽(exterior ring)만 취한다 — 구멍(holes)은 무시.
    rings = [[[lat, lng] for lng, lat in poly[0]] for poly in polys]

    lats = [pt[0] for ring in rings for pt in ring]
    lngs = [pt[1] for ring in rings for pt in ring]
    _outline_cache = {
        "bbox": {"S": min(lats), "W": min(lngs), "N": max(lats), "E": max(lngs)},
        "rings": rings,
    }
    return _outline_cache
