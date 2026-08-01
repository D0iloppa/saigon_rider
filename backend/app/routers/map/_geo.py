"""좌표 → 구역 코드 역조회 — PostGIS `districts.boundary` 컬럼 기반.

구 위치: `utils.py`(공용 유틸). 지도 도메인 함수인데 전역 유틸에 얹혀 있어 소유권이
불명확했다(설계 문서 §2-(a)-3) — map 패키지로 이관.
호출부(2026-07-20 git grep 확인): `routers/info_flood.py`, `routers/info_weather.py`.
"""

from sqlalchemy import text


async def find_district_by_point(db, lat: float, lng: float) -> str | None:
    """PostGIS ST_Covers로 좌표가 속하는 구역 코드를 반환한다. 없으면 None."""
    row = (
        await db.execute(
            text(
                "SELECT code FROM districts "
                "WHERE boundary IS NOT NULL "
                "AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) "
                "LIMIT 1"
            ),
            {"lat": lat, "lng": lng},
        )
    ).first()
    return row[0] if row else None
