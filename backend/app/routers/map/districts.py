"""District/Ward 지오메트리·집계 라우터.

구 `GET /district-counts`(map.py, 도시 전체/ward 별 매물·피드 집계 배지용)는
프론트 소비처가 전무해(§1.2·§6 항목5, `fetchDistrictCounts` grep 0건) 폐기했다.
poi.py/place_suggestions.py와 함께 map 패키지 아래 도메인 파일 자리는 유지한다.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/map", tags=["지도 (Map)"])
