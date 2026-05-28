# Saigon Rider — 침수 정보 지도 표출 작업 지시서 v1.0

> 발행일: 2026-05-27
> 대상: Claude Code
> 코드베이스: github.com/D0iloppa/saigon_rider
> 범위: 침수 정보를 지도에 표출 (L1 상습 침수 hotspot + L4 사용자 제보)
> 기간: 4-5일 (단일 개발자 풀타임)
> 전제: H 문서 Phase 2 (침수 모듈) 완료 + 지도 컴포넌트 (`SaigonWardMap.tsx`) 완료

---

## §0. 작업 범위 (의도적 단순화)

### 0.1 무엇을 만들지

이 작업은 H 문서의 침수 모듈(Phase 2) **위에 추가**되는 작업이에요. 새로 만드는 게 아니라 **확장**.

#### 추가할 두 가지

```
✅ L1: 상습 침수 hotspot 30개 (정적 GeoJSON)
   - 호치민 시정부가 공개한 23개 상습 침수 지점
   - 2026-2030 계획의 13개 강우 침수 도로 + 6개 조위 hotspot 통합
   - LineString/Polygon GeoJSON으로 정의
   - 사용자 0명 상태에서도 작동 (콜드 스타트 해결)

✅ L4 강화: 사용자 제보 UX 풍성하게
   - 4단계 깊이 (잔수/정강이/무릎/통과불가)
   - 한 손 1탭 신고 (라이딩 중 안전)
   - GP 보상 (제보 +20, 사진 +10, 검증 +5)
   - 다른 라이더 3명+ 확인 → "라이더 검증" 배지
   - 시즌 50건 → Legendary Storm Scout 타이틀
```

#### 빼는 것 (의도적)

```
❌ L2 만조 예보 (NCHMF 파싱) → v2
❌ L3 강우 레이더 (RainViewer 상용 불가) → v2
❌ L5 UDI 스크래핑 → 정치 리스크 절대 X
❌ Risk Score 합성 알고리즘 → L1+L4만으로 충분
❌ 우회 경로 자동 계산 → 외부 라우팅 API 필요, v2
```

### 0.2 왜 이렇게 가는가

- **사용자 안전이 진짜 중요한 정보**라서, **불확실한 데이터 합성 알고리즘은 위험**. 차라리 명확한 두 소스 (정부 공식 + 사용자 직접 신고)만 쓰는 게 신뢰도 높음
- **L1만으로도 사용자 가치 50%** 확보 (정부 공식 상습 침수 지점은 80% 침수의 원인)
- **L4는 베트남 라이더 1,000명이 무료로 만들어주는 데이터** — 우리 진짜 자산
- **L2/L3 빼면 작업 1-2주 절약** → 우기 5월 전 출시 가능

---

## §1. 파일 위치

```
saigon_rider/
├── backend/
│   ├── data/                                       ⭐ 신규 폴더
│   │   └── flood_hotspots_v1.geojson              ⭐ 30개 정적 hotspot
│   ├── migrations/
│   │   └── 202605xx_flood_hotspot.sql             ⭐ flood_hotspot 테이블
│   ├── scripts/
│   │   └── seed_flood_hotspots.py                 ⭐ GeoJSON → DB 시드
│   ├── routers/
│   │   └── info_flood.py                          🔧 기존 H 작업물 + hotspot 엔드포인트
│   └── services/
│       └── flood_service.py                       ⭐ 신규 (hotspot + 제보 join)
├── frontend/src/
│   ├── components/
│   │   ├── maps/
│   │   │   └── SaigonWardMap.tsx                  🔧 hotspot 라인 + flood 마커 확장
│   │   └── flood/                                  ⭐ 신규 폴더
│   │       ├── FloodReportSheet.tsx               ⭐ 신고 폼 (4단계 깊이)
│   │       ├── FloodDetailSheet.tsx               ⭐ 침수 상세 (검증 + 사진)
│   │       ├── FloodHotspotLayer.tsx              ⭐ L1 정적 라인 레이어
│   │       ├── FloodMarker.tsx                    ⭐ L4 사용자 제보 마커
│   │       └── flood-tokens.ts                    ⭐ 깊이별 컬러 토큰
│   ├── pages/info/
│   │   ├── InfoFloodMap.tsx                       🔧 hotspot + 사용자 제보 통합
│   │   └── InfoFloodReport.tsx                    🔧 4단계 깊이 UX
│   └── api/
│       └── info.ts                                🔧 flood API 응답 확장
└── docs/
    └── flood-map-instructions.md                   ⭐ 이 문서
```

---

## §2. Phase 0 — 사전 확인 (15분)

### Task 0.1: H Phase 2 진척 확인

```bash
# flood_report 테이블 존재 확인
psql $DATABASE_URL -c "\d flood_report"

# 기존 라우터 + 화면 존재 확인
ls saigon_rider/backend/routers/info_flood.py
ls saigon_rider/frontend/src/pages/info/InfoFloodMap.tsx 2>/dev/null
ls saigon_rider/frontend/src/pages/info/InfoFloodReport.tsx 2>/dev/null
```

없으면 H 문서 Phase 2 먼저 완료 후 이 작업.

### Task 0.2: 지도 컴포넌트 확인

```bash
ls saigon_rider/frontend/src/components/maps/SaigonWardMap.tsx
```

없으면 지도 컴포넌트 작업 지시서 먼저.

### Task 0.3: PostGIS 확인

```bash
psql $DATABASE_URL -c "SELECT PostGIS_Version();"
```

---

## §3. Phase 1 — 정적 hotspot 데이터 (1일)

### Task 1.1: 30개 hotspot GeoJSON 작성

`backend/data/flood_hotspots_v1.geojson`:

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "version": "1.0",
    "compiled_at": "2026-05-27",
    "sources": [
      "HCMC City Government Nov 2025 official list (23 sites)",
      "HCMC 2026-2030 Master Plan flood-prone roads (13 sites)",
      "HCMC 2026-2030 tidal flooding hotspots (6 sites)"
    ],
    "notes": "Bến Nghé floodgate operational from Feb 2026; Thảo Điền area protected. Refresh quarterly."
  },
  "features": [
    {
      "type": "Feature",
      "id": "HS_001",
      "properties": {
        "name_vi": "Trần Xuân Soạn",
        "name_en": "Tran Xuan Soan Street",
        "type": "STREET",
        "cause": ["TIDE", "RAIN"],
        "severity_base": 5,
        "source": "GOV_LIST_2025_NOV",
        "ward_code": "TAN_THUAN",
        "notes": "역사적 최악 침수 거리. 만조 + 폭우 시 항시 잠김"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [106.7280, 10.7480],
          [106.7350, 10.7460],
          [106.7420, 10.7440]
        ]
      }
    },
    {
      "type": "Feature",
      "id": "HS_002",
      "properties": {
        "name_vi": "Huỳnh Tấn Phát",
        "name_en": "Huynh Tan Phat Street",
        "type": "STREET",
        "cause": ["TIDE"],
        "severity_base": 5,
        "source": "GOV_LIST_2025_NOV",
        "ward_code": "TAN_THUAN"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [106.7250, 10.7350],
          [106.7280, 10.7280],
          [106.7320, 10.7200]
        ]
      }
    },
    {
      "type": "Feature",
      "id": "HS_003",
      "properties": {
        "name_vi": "Quốc lộ 50",
        "name_en": "National Highway 50",
        "type": "STREET",
        "cause": ["TIDE"],
        "severity_base": 4,
        "source": "GOV_LIST_2025_NOV",
        "ward_code": "BINH_CHANH"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [106.6500, 10.7100],
          [106.6600, 10.7050],
          [106.6700, 10.7000]
        ]
      }
    },
    {
      "type": "Feature",
      "id": "HS_004",
      "properties": {
        "name_vi": "Calmette",
        "name_en": "Calmette Street",
        "type": "STREET",
        "cause": ["RAIN"],
        "severity_base": 4,
        "source": "GOV_LIST_2025_NOV",
        "ward_code": "NGUYEN_THAI_BINH"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [106.6950, 10.7670],
          [106.6985, 10.7685]
        ]
      }
    },
    {
      "type": "Feature",
      "id": "HS_005",
      "properties": {
        "name_vi": "Lê Văn Lương",
        "name_en": "Le Van Luong Street",
        "type": "STREET",
        "cause": ["TIDE", "RAIN"],
        "severity_base": 4,
        "source": "GOV_LIST_2025_NOV",
        "ward_code": "PHU_MY"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [106.7050, 10.7200],
          [106.7100, 10.7100],
          [106.7150, 10.7000]
        ]
      }
    },
    {
      "type": "Feature",
      "id": "HS_006",
      "properties": {
        "name_vi": "Bình Quới (Thanh Đa)",
        "name_en": "Binh Quoi - Thanh Da",
        "type": "AREA",
        "cause": ["TIDE", "RAIN"],
        "severity_base": 5,
        "source": "GOV_LIST_2025_NOV",
        "ward_code": "BINH_THANH"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [106.7350, 10.8100],
          [106.7450, 10.8100],
          [106.7450, 10.8000],
          [106.7350, 10.8000],
          [106.7350, 10.8100]
        ]]
      }
    },
    {
      "type": "Feature",
      "id": "HS_007",
      "properties": {
        "name_vi": "Võ Nguyên Giáp",
        "name_en": "Vo Nguyen Giap Avenue",
        "type": "STREET",
        "cause": ["RAIN"],
        "severity_base": 3,
        "source": "GOV_LIST_2025_NOV",
        "ward_code": "THU_DUC"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [106.7600, 10.8000],
          [106.7700, 10.8200],
          [106.7800, 10.8400]
        ]
      }
    },
    {
      "type": "Feature",
      "id": "HS_008",
      "properties": {
        "name_vi": "Mai Chí Thọ",
        "name_en": "Mai Chi Tho",
        "type": "STREET",
        "cause": ["RAIN"],
        "severity_base": 3,
        "source": "GOV_LIST_2025_NOV",
        "ward_code": "THAO_DIEN"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [106.7400, 10.7900],
          [106.7500, 10.7850],
          [106.7600, 10.7800]
        ]
      }
    }
  ]
}
```

⚠️ **중요**: 위 8개는 예시. **30개까지 채우는 건 운영팀(또는 너) 작업**. 다음 자료 참고:

- 2025년 11월 시정부 공식 리스트: Calmette, Bình Quới, Trần Xuân Soạn, Huỳnh Tấn Phát, Lê Văn Lương, Đào Sư Tích, Phạm Hữu Lậu, Nguyễn Bình, 50번 국도, Nguyễn Văn Hương, Võ Nguyên Giáp, Mai Chí Thọ 등
- 좌표는 Google Maps에서 직접 클릭 → 위경도 확인 → LineString 작성
- 길이 100-500m 정도가 적당
- 정확도 80%면 OK (게임 + 정보 표시용)

작업 매뉴얼:

```
1. Google Maps에서 "Trần Xuân Soạn, Tân Thuận, Ho Chi Minh City" 검색
2. 거리의 시작점 우클릭 → 좌표 복사
3. 중간점 한 번 더 우클릭 → 좌표 복사 (3-5점)
4. 끝점 우클릭 → 좌표 복사
5. coordinates 배열에 [경도, 위도] 순서로 입력
6. GeoJSON 표준 형식 확인 (lng 먼저, lat 나중)
```

이 작업이 4-6시간 걸려요. 사용자가 직접 하거나 운영팀에 위임.

### Task 1.2: flood_hotspot 테이블 마이그레이션

`backend/migrations/202605xx_flood_hotspot.sql`:

```sql
-- L1: 상습 침수 hotspot 마스터 테이블
CREATE TABLE IF NOT EXISTS flood_hotspot (
  hotspot_id      VARCHAR(20) PRIMARY KEY,        -- 'HS_001', 'HS_002' ...
  name_vi         VARCHAR(255) NOT NULL,
  name_en         VARCHAR(255),
  type            VARCHAR(20) NOT NULL CHECK (type IN ('STREET','SEGMENT','INTERSECTION','AREA')),
  cause           TEXT[] NOT NULL,                 -- {'RAIN','TIDE','BOTH'}
  severity_base   SMALLINT CHECK (severity_base BETWEEN 1 AND 5),
  source          VARCHAR(64),                     -- 'GOV_LIST_2025_NOV', 'MEDIA_CRAWL'
  ward_code       VARCHAR(40) REFERENCES ward(ward_code),
  geom            GEOGRAPHY NOT NULL,              -- LineString or Polygon (4326)
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,            -- 수문 가동으로 해제되면 false
  verified_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_hotspot_geom ON flood_hotspot USING GIST(geom);
CREATE INDEX idx_hotspot_active ON flood_hotspot(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_hotspot_ward ON flood_hotspot(ward_code);

-- 기존 flood_report 테이블에 컬럼 추가 (H 문서에서 만든 것 위에)
ALTER TABLE flood_report
  ADD COLUMN IF NOT EXISTS hotspot_id VARCHAR(20) REFERENCES flood_hotspot(hotspot_id),
  ADD COLUMN IF NOT EXISTS verifier_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ride_id BIGINT;  -- 어느 라이딩 중 신고인지 (anti-abuse)

CREATE INDEX IF NOT EXISTS idx_flood_report_hotspot ON flood_report(hotspot_id);

-- H 문서의 4단계 깊이 매핑
-- ankle → PUDDLE (잔수)
-- knee  → SHIN   (정강이)
-- thigh → KNEE   (무릎)
-- above → IMPASSABLE (통과 불가)
--
-- 새 코드 추가 (기존 호환 유지):
ALTER TABLE flood_report
  DROP CONSTRAINT IF EXISTS flood_report_depth_level_check;
ALTER TABLE flood_report
  ADD CONSTRAINT flood_report_depth_level_check
  CHECK (depth_level IN (
    'ankle', 'knee', 'thigh', 'above',          -- 기존 H 문서 호환
    'PUDDLE', 'SHIN', 'KNEE', 'IMPASSABLE'      -- 신규 명명
  ));

-- 검증자 카운트는 confirmation_count랑 다름.
-- confirmation = 'still_flooded' 한 사람 수 = verifier_count로 자동 갱신
```

### Task 1.3: GeoJSON → DB 시드 스크립트

`backend/scripts/seed_flood_hotspots.py`:

```python
"""
flood_hotspots_v1.geojson을 flood_hotspot 테이블에 시드.

사용:
    python scripts/seed_flood_hotspots.py
    
재실행 안전 (ON CONFLICT UPDATE).
"""
import json
import psycopg2
import os
from pathlib import Path


def main():
    geojson_path = Path(__file__).parent.parent / "data" / "flood_hotspots_v1.geojson"
    
    with open(geojson_path) as f:
        gj = json.load(f)
    
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()
    
    inserted = 0
    updated = 0
    
    for feature in gj["features"]:
        props = feature["properties"]
        geom = feature["geometry"]
        hotspot_id = feature["id"]
        
        # cause는 PostgreSQL TEXT[] 형식
        cause_array = props.get("cause", [])
        
        # 기존 row 확인
        cur.execute("SELECT 1 FROM flood_hotspot WHERE hotspot_id = %s", (hotspot_id,))
        exists = cur.fetchone() is not None
        
        cur.execute("""
            INSERT INTO flood_hotspot (
                hotspot_id, name_vi, name_en, type, cause, severity_base,
                source, ward_code, geom, notes, is_active
            )
            VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, ST_GeomFromGeoJSON(%s)::geography, %s, TRUE
            )
            ON CONFLICT (hotspot_id) DO UPDATE SET
                name_vi = EXCLUDED.name_vi,
                name_en = EXCLUDED.name_en,
                type = EXCLUDED.type,
                cause = EXCLUDED.cause,
                severity_base = EXCLUDED.severity_base,
                source = EXCLUDED.source,
                ward_code = EXCLUDED.ward_code,
                geom = EXCLUDED.geom,
                notes = EXCLUDED.notes,
                updated_at = NOW()
        """, (
            hotspot_id,
            props.get("name_vi"),
            props.get("name_en"),
            props.get("type", "STREET"),
            cause_array,
            props.get("severity_base", 3),
            props.get("source"),
            props.get("ward_code"),
            json.dumps(geom),
            props.get("notes"),
        ))
        
        if exists:
            updated += 1
        else:
            inserted += 1
    
    conn.commit()
    
    # 검증
    cur.execute("SELECT COUNT(*) FROM flood_hotspot WHERE is_active = TRUE")
    total = cur.fetchone()[0]
    
    print(f"✓ Inserted: {inserted}, Updated: {updated}")
    print(f"✓ Total active hotspots: {total}")
    
    conn.close()


if __name__ == "__main__":
    main()
```

### Task 1.4: 실행 + 검증

```bash
# 마이그레이션
psql $DATABASE_URL < backend/migrations/202605xx_flood_hotspot.sql

# 시드
cd backend && python scripts/seed_flood_hotspots.py
# 기대: "Total active hotspots: 8" (또는 작성한 개수)

# 검증
psql $DATABASE_URL -c "
  SELECT hotspot_id, name_vi, type, severity_base, 
         ward_code, ST_GeometryType(geom::geometry) AS geom_type
  FROM flood_hotspot
  WHERE is_active = TRUE
  ORDER BY severity_base DESC;
"
```

---

## §4. Phase 2 — API 확장 (3-4시간)

### Task 2.1: flood_service.py 작성

`backend/services/flood_service.py`:

```python
"""침수 비즈니스 로직 (L1 hotspot + L4 사용자 제보 통합)."""
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_active_floods_with_hotspots(
    session: AsyncSession, lat: float, lng: float, radius_km: float = 5.0
) -> dict:
    """
    지도에 표출할 데이터 한 번에 반환:
      - L1 정적 hotspot (상시)
      - L4 활성 사용자 제보 (지난 6시간 + 만료 안 됨)
    """
    # L1: 정적 hotspot (반경 내 모든 것)
    hotspot_result = await session.execute(text("""
        SELECT 
            hotspot_id, name_vi, name_en, type, cause, severity_base, 
            source, ward_code, notes,
            ST_AsGeoJSON(geom::geometry) AS geometry,
            ST_Distance(
                geom,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) / 1000 AS distance_km
        FROM flood_hotspot
        WHERE is_active = TRUE
          AND ST_DWithin(
            geom,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius_m
          )
        ORDER BY severity_base DESC, distance_km
    """), {"lat": lat, "lng": lng, "radius_m": radius_km * 1000})
    
    hotspots = []
    for r in hotspot_result:
        d = dict(r._mapping)
        # geometry는 JSON 객체로 파싱
        import json
        d["geometry"] = json.loads(d["geometry"]) if d["geometry"] else None
        hotspots.append(d)
    
    # L4: 활성 사용자 제보 (지난 6시간, 만료 안 됨)
    report_result = await session.execute(text("""
        SELECT 
            fr.report_id, fr.lat, fr.lng, fr.depth_level, fr.photo_url,
            fr.reported_at, fr.confidence_score, fr.verifier_count,
            fr.hotspot_id, fr.ward_code,
            ST_Distance(
                fr.geom,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) / 1000 AS distance_km,
            -- 시간차 계산 (분 단위)
            EXTRACT(EPOCH FROM (NOW() - fr.reported_at)) / 60 AS minutes_ago,
            -- 신뢰도 등급
            CASE 
                WHEN fr.verifier_count >= 3 THEN 'VERIFIED'
                WHEN fr.verifier_count >= 1 THEN 'CONFIRMED'
                ELSE 'PENDING'
            END AS trust_level
        FROM flood_report fr
        WHERE fr.status = 'ACTIVE'
          AND fr.expires_at > NOW()
          AND ST_DWithin(
            fr.geom,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius_m
          )
        ORDER BY 
            CASE WHEN fr.verifier_count >= 3 THEN 0 ELSE 1 END,
            fr.reported_at DESC
        LIMIT 50
    """), {"lat": lat, "lng": lng, "radius_m": radius_km * 1000})
    
    reports = []
    for r in report_result:
        d = dict(r._mapping)
        # depth_level 표준화 (기존 H 코드 + 신규 코드 둘 다 지원)
        d["depth_normalized"] = normalize_depth(d["depth_level"])
        reports.append(d)
    
    return {
        "hotspots": hotspots,
        "reports": reports,
        "fetched_at": datetime.utcnow().isoformat(),
    }


def normalize_depth(depth: str) -> str:
    """기존 H 코드와 신규 코드를 4단계로 통일."""
    mapping = {
        # 기존 H 코드
        'ankle': 'PUDDLE', 
        'knee': 'SHIN', 
        'thigh': 'KNEE', 
        'above': 'IMPASSABLE',
        # 신규 코드
        'PUDDLE': 'PUDDLE',
        'SHIN': 'SHIN',
        'KNEE': 'KNEE',
        'IMPASSABLE': 'IMPASSABLE',
    }
    return mapping.get(depth, 'SHIN')


async def increment_verifier_count(session: AsyncSession, report_id: int):
    """다른 사용자가 신고 확인 시 verifier_count 증가."""
    await session.execute(text("""
        UPDATE flood_report
        SET verifier_count = verifier_count + 1,
            confidence_score = confidence_score + 1,
            -- 3명 이상 확인 시 만료 시간 연장
            expires_at = CASE 
                WHEN verifier_count + 1 >= 3 THEN NOW() + INTERVAL '4 hours'
                ELSE expires_at
            END
        WHERE report_id = :id
    """), {"id": report_id})
```

### Task 2.2: 라우터 확장

`backend/routers/info_flood.py`에 추가:

```python
from services.flood_service import (
    get_active_floods_with_hotspots, increment_verifier_count, normalize_depth
)


@router.get("/map-data")
async def get_flood_map_data(
    lat: float, lng: float, radius_km: float = 5.0,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """지도용 통합 엔드포인트 — hotspot + active reports 한 번에."""
    return await get_active_floods_with_hotspots(session, lat, lng, radius_km)


@router.get("/hotspots")
async def get_hotspots_only(
    ward_code: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    """정적 hotspot만 (지도 줌아웃 시 또는 ward 필터)."""
    if ward_code:
        result = await session.execute(text("""
            SELECT hotspot_id, name_vi, type, cause, severity_base,
                   ST_AsGeoJSON(geom::geometry) AS geometry
            FROM flood_hotspot
            WHERE is_active = TRUE AND ward_code = :wc
        """), {"wc": ward_code})
    else:
        result = await session.execute(text("""
            SELECT hotspot_id, name_vi, type, cause, severity_base,
                   ST_AsGeoJSON(geom::geometry) AS geometry
            FROM flood_hotspot
            WHERE is_active = TRUE
        """))
    
    import json
    hotspots = []
    for r in result:
        d = dict(r._mapping)
        d["geometry"] = json.loads(d["geometry"]) if d["geometry"] else None
        hotspots.append(d)
    return {"hotspots": hotspots}
```

⚠️ **기존 H 문서의 `/active` 엔드포인트는 그대로 둠**. 신규 `/map-data`는 hotspot + 제보 통합용.

---

## §5. Phase 3 — 프론트엔드 (1-2일)

### Task 3.1: 깊이 토큰

`frontend/src/components/flood/flood-tokens.ts`:

```typescript
/** 침수 깊이 4단계 토큰 */
export interface DepthToken {
  code: 'PUDDLE' | 'SHIN' | 'KNEE' | 'IMPASSABLE';
  emoji: string;
  labelKo: string;
  labelVi: string;
  shortLabel: string;     // 마커용
  color: string;          // 진한 색 (보더)
  fillColor: string;      // 옅은 색 (배경)
  textColor: string;
  cmRange: string;        // 사용자 설명용
  severity: number;       // 1~4
}

export const DEPTH_TOKENS: Record<string, DepthToken> = {
  PUDDLE: {
    code: 'PUDDLE',
    emoji: '💧',
    labelKo: '잔수',
    labelVi: 'Đọng nước',
    shortLabel: '잔',
    color: '#FBBF24',
    fillColor: '#FEF3C7',
    textColor: '#92400E',
    cmRange: '5cm 이하',
    severity: 1,
  },
  SHIN: {
    code: 'SHIN',
    emoji: '🟡',
    labelKo: '정강이',
    labelVi: 'Mắt cá chân',
    shortLabel: '정',
    color: '#F97316',
    fillColor: '#FED7AA',
    textColor: '#9A3412',
    cmRange: '5-25cm',
    severity: 2,
  },
  KNEE: {
    code: 'KNEE',
    emoji: '🟠',
    labelKo: '무릎',
    labelVi: 'Đầu gối',
    shortLabel: '무',
    color: '#DC2626',
    fillColor: '#FECACA',
    textColor: '#7F1D1D',
    cmRange: '25-50cm · 바이크 위험',
    severity: 3,
  },
  IMPASSABLE: {
    code: 'IMPASSABLE',
    emoji: '🔴',
    labelKo: '통과 불가',
    labelVi: 'Không thể qua',
    shortLabel: '✕',
    color: '#7F1D1D',
    fillColor: '#FCA5A5',
    textColor: '#FFFFFF',
    cmRange: '50cm+',
    severity: 4,
  },
};

export function getDepth(code?: string | null): DepthToken {
  if (!code) return DEPTH_TOKENS.SHIN;
  return DEPTH_TOKENS[code] || DEPTH_TOKENS.SHIN;
}

/** 신뢰도 등급 토큰 */
export const TRUST_TOKENS = {
  PENDING: { 
    label: '확인 중', 
    color: '#9CA3AF', 
    badge: null 
  },
  CONFIRMED: { 
    label: '확인됨', 
    color: '#3B82F6', 
    badge: '👤+1' 
  },
  VERIFIED: { 
    label: '라이더 검증', 
    color: '#16A34A', 
    badge: '✓ 검증' 
  },
};

/** "X분 전" 포맷 */
export function formatTimeAgo(minutes: number): string {
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${Math.round(minutes)}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
```

### Task 3.2: hotspot 라인 레이어

`frontend/src/components/flood/FloodHotspotLayer.tsx`:

```tsx
import React from 'react';
import { gpsToSvg } from '@/components/maps/ward-data';

interface Hotspot {
  hotspot_id: string;
  name_vi: string;
  type: 'STREET' | 'AREA' | 'SEGMENT' | 'INTERSECTION';
  severity_base: number;
  cause: string[];
  geometry: {
    type: 'LineString' | 'Polygon' | 'Point';
    coordinates: any;
  };
}

interface Props {
  hotspots: Hotspot[];
  onClick?: (hotspot: Hotspot) => void;
}

/**
 * L1 정적 hotspot SVG 레이어.
 * LineString → 진한 빨간 라인 (대시 패턴, 위험도 따라 두께)
 * Polygon → 옅은 빨간 영역
 *
 * SaigonWardMap 내부에 <g> 그룹으로 들어감.
 */
export default function FloodHotspotLayer({ hotspots, onClick }: Props) {
  return (
    <g className="flood-hotspot-layer">
      {hotspots.map(h => {
        if (h.geometry.type === 'LineString') {
          return (
            <FloodLineSegment key={h.hotspot_id} hotspot={h} onClick={onClick} />
          );
        }
        if (h.geometry.type === 'Polygon') {
          return (
            <FloodAreaPolygon key={h.hotspot_id} hotspot={h} onClick={onClick} />
          );
        }
        return null;
      })}
    </g>
  );
}


function FloodLineSegment({ hotspot, onClick }: { hotspot: Hotspot; onClick?: (h: Hotspot) => void }) {
  // GeoJSON coordinates → SVG path
  const coords = hotspot.geometry.coordinates as [number, number][];
  const points = coords.map(([lng, lat]) => gpsToSvg(lat, lng));
  
  if (points.length < 2) return null;
  
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  
  // 위험도 따른 라인 스타일
  const strokeWidth = 2 + hotspot.severity_base * 0.5;
  const strokeColor = hotspot.severity_base >= 4 ? '#DC2626' : '#F97316';
  
  return (
    <g style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={() => onClick?.(hotspot)}>
      {/* 외곽 (흰 보더로 가독성) */}
      <path
        d={pathD}
        stroke="white"
        strokeWidth={strokeWidth + 2}
        fill="none"
        opacity="0.9"
      />
      {/* 본 라인 (대시 패턴 = 정적 hotspot임을 시각화) */}
      <path
        d={pathD}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray="4 3"
        opacity="0.75"
      />
    </g>
  );
}


function FloodAreaPolygon({ hotspot, onClick }: { hotspot: Hotspot; onClick?: (h: Hotspot) => void }) {
  const rings = hotspot.geometry.coordinates as [number, number][][];
  const exterior = rings[0];
  
  const points = exterior
    .map(([lng, lat]) => {
      const p = gpsToSvg(lat, lng);
      return `${p.x},${p.y}`;
    })
    .join(' ');
  
  return (
    <g style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={() => onClick?.(hotspot)}>
      <polygon
        points={points}
        fill="rgba(239, 59, 59, 0.15)"
        stroke="#DC2626"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
    </g>
  );
}
```

### Task 3.3: 사용자 제보 마커

`frontend/src/components/flood/FloodMarker.tsx`:

```tsx
import React from 'react';
import { getDepth, TRUST_TOKENS, formatTimeAgo } from './flood-tokens';

interface Props {
  depth: string;         // 'PUDDLE' | 'SHIN' | 'KNEE' | 'IMPASSABLE'
  trustLevel: string;    // 'PENDING' | 'CONFIRMED' | 'VERIFIED'
  minutesAgo: number;
  hasPhoto?: boolean;
  onClick?: () => void;
}

/**
 * L4 사용자 제보 마커.
 *
 * 깊이별 색 + 신선도 (시간 따라 옅어짐) + 검증 배지
 */
export default function FloodMarker({
  depth, trustLevel, minutesAgo, hasPhoto, onClick,
}: Props) {
  const d = getDepth(depth);
  const t = TRUST_TOKENS[trustLevel] || TRUST_TOKENS.PENDING;
  
  // 신선도 → opacity (방금 = 1.0, 6시간 전 = 0.5)
  const freshness = Math.max(0.5, 1 - minutesAgo / 360);
  
  return (
    <g 
      style={{ cursor: 'pointer' }}
      onClick={onClick}
      opacity={freshness}
    >
      {/* 펄스 (VERIFIED만) */}
      {trustLevel === 'VERIFIED' && (
        <circle r="10" fill={d.color} opacity="0.3">
          <animate
            attributeName="r"
            values="8;14;8"
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.3;0;0.3"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      
      {/* 메인 원 */}
      <circle r="8" fill={d.fillColor} stroke={d.color} strokeWidth="2" />
      
      {/* 깊이 라벨 (한글 한 자) */}
      <text
        y="3"
        fontSize="8"
        fontWeight="700"
        fill={d.textColor}
        textAnchor="middle"
      >
        {d.shortLabel}
      </text>
      
      {/* 사진 배지 (작은 점) */}
      {hasPhoto && (
        <circle cx="6" cy="-6" r="3" fill="white" stroke={d.color} strokeWidth="1" />
      )}
      
      {/* 검증 체크 */}
      {trustLevel === 'VERIFIED' && (
        <g transform="translate(7, -7)">
          <circle r="4" fill="#16A34A" stroke="white" strokeWidth="1" />
          <text y="1.5" fontSize="5" fontWeight="900" fill="white" textAnchor="middle">✓</text>
        </g>
      )}
    </g>
  );
}
```

### Task 3.4: 신고 폼 (4단계 깊이)

`frontend/src/components/flood/FloodReportSheet.tsx`:

```tsx
import React, { useState } from 'react';
import { DEPTH_TOKENS, getDepth } from './flood-tokens';
import { floodApi } from '@/api/info';
import styles from './FloodReportSheet.module.css';

interface Props {
  lat: number;
  lng: number;
  rideId?: number;       // 라이딩 중 신고면 ride_id 전달 (anti-abuse)
  onSuccess: (reportId: number, gpEarned: number) => void;
  onCancel: () => void;
}

/**
 * 라이딩 중 한 손 1탭 신고 폼.
 *
 * UX 핵심:
 *   - 4 큰 버튼 (운전 중 잠깐 멈춰서 1탭 가능한 크기)
 *   - 사진은 옵션 (라이딩 중 어렵)
 *   - GP 보상 실시간 표시
 */
export default function FloodReportSheet({
  lat, lng, rideId, onSuccess, onCancel,
}: Props) {
  const [selectedDepth, setSelectedDepth] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const gpEstimate = (selectedDepth ? 20 : 0) + (photo ? 10 : 0);
  
  const handleSubmit = async () => {
    if (!selectedDepth) {
      setError('침수 깊이를 선택해주세요');
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      // 사진 업로드 (있으면)
      let photoUrl: string | undefined;
      if (photo) {
        const formData = new FormData();
        formData.append('photo', photo);
        const uploadRes = await floodApi.uploadPhoto(formData);
        photoUrl = uploadRes.url;
      }
      
      // 신고 제출
      const result = await floodApi.report({
        lat,
        lng,
        depth_level: selectedDepth,
        photo_url: photoUrl,
        ride_id: rideId,
      });
      
      onSuccess(result.report_id, result.gp_earned);
    } catch (e: any) {
      setError(e.response?.data?.detail || '신고 실패');
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <div className={styles.sheet}>
      <header className={styles.header}>
        <h2>침수 신고</h2>
        <button onClick={onCancel} className={styles.closeBtn}>✕</button>
      </header>
      
      <p className={styles.subtitle}>침수 깊이를 선택하세요</p>
      
      {/* 4단계 깊이 큰 버튼 */}
      <div className={styles.depthGrid}>
        {Object.values(DEPTH_TOKENS).map(d => (
          <button
            key={d.code}
            className={[
              styles.depthBtn,
              selectedDepth === d.code ? styles.selected : '',
            ].join(' ')}
            style={{
              borderColor: selectedDepth === d.code ? d.color : '#E5E7EB',
              backgroundColor: selectedDepth === d.code ? d.fillColor : 'white',
            }}
            onClick={() => setSelectedDepth(d.code)}
          >
            <div className={styles.depthEmoji}>{d.emoji}</div>
            <div className={styles.depthLabel} style={{ color: d.textColor }}>
              {d.labelKo}
            </div>
            <div className={styles.depthRange}>{d.cmRange}</div>
          </button>
        ))}
      </div>
      
      {/* 사진 (옵션) */}
      <label className={styles.photoBtn}>
        📷 사진 추가 (+10 GP)
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={e => setPhoto(e.target.files?.[0] || null)}
          style={{ display: 'none' }}
        />
      </label>
      {photo && (
        <div className={styles.photoPreview}>
          ✓ {photo.name} ({Math.round(photo.size / 1024)}KB)
        </div>
      )}
      
      {/* GP 보상 실시간 표시 */}
      <div className={styles.rewardBox}>
        <span>예상 보상:</span>
        <span className={styles.rewardAmount}>+{gpEstimate} GP</span>
      </div>
      
      {/* 에러 */}
      {error && <div className={styles.error}>{error}</div>}
      
      {/* 제출 */}
      <button
        className={styles.submitBtn}
        disabled={!selectedDepth || submitting}
        onClick={handleSubmit}
      >
        {submitting ? '제출 중...' : '신고하기'}
      </button>
      
      <p className={styles.disclaimer}>
        ⓘ 다른 라이더가 확인하면 +5 GP 추가 보상
      </p>
    </div>
  );
}
```

`FloodReportSheet.module.css`:

```css
.sheet {
  position: fixed;
  inset: 0;
  background: white;
  z-index: 200;
  display: flex;
  flex-direction: column;
  padding: 20px;
  max-width: 480px;
  margin: 0 auto;
  animation: slideUp 0.25s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h2 {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.closeBtn {
  background: #F3F4F6;
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
}

.subtitle {
  font-size: 14px;
  color: #6B7280;
  margin: 16px 0 12px;
}

/* 4 깊이 큰 버튼 */
.depthGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.depthBtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 12px;
  background: white;
  border: 2px solid #E5E7EB;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  min-height: 110px;
}

.depthBtn:active {
  transform: scale(0.97);
}

.depthBtn.selected {
  border-width: 3px;
  box-shadow: 0 0 0 4px rgba(255, 90, 31, 0.12);
}

.depthEmoji {
  font-size: 28px;
  margin-bottom: 4px;
}

.depthLabel {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 2px;
}

.depthRange {
  font-size: 11px;
  color: #6B7280;
  text-align: center;
}

/* 사진 */
.photoBtn {
  display: block;
  width: 100%;
  padding: 14px;
  background: #F9FAFB;
  border: 1px dashed #D1D5DB;
  border-radius: 10px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #4B5563;
  cursor: pointer;
  margin-bottom: 12px;
}

.photoPreview {
  font-size: 12px;
  color: #16A34A;
  margin-bottom: 12px;
}

/* GP 보상 */
.rewardBox {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: linear-gradient(135deg, #FEF3C7, #FED7AA);
  border-radius: 10px;
  font-size: 14px;
  color: #92400E;
  margin-bottom: 16px;
}

.rewardAmount {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 800;
  color: #DC2626;
}

.submitBtn {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #FF5A1F, #FF8A4F);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  margin-bottom: 12px;
}

.submitBtn:disabled {
  background: #D1D5DB;
  cursor: not-allowed;
}

.error {
  padding: 10px;
  background: #FEE2E2;
  color: #991B1B;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 10px;
}

.disclaimer {
  font-size: 11px;
  color: #9CA3AF;
  text-align: center;
  margin: 0;
}
```

### Task 3.5: InfoFloodMap.tsx 통합

`frontend/src/pages/info/InfoFloodMap.tsx`:

```tsx
import React, { useState, useEffect, useMemo } from 'react';
import SaigonWardMap, { MapMarker } from '@/components/maps/SaigonWardMap';
import FloodHotspotLayer from '@/components/flood/FloodHotspotLayer';
import FloodReportSheet from '@/components/flood/FloodReportSheet';
import FloodDetailSheet from '@/components/flood/FloodDetailSheet';
import { floodApi } from '@/api/info';
import { useGeolocation } from '@/hooks/useGeolocation';
import { getDepth, formatTimeAgo } from '@/components/flood/flood-tokens';

export default function InfoFloodMap() {
  const { location } = useGeolocation();
  const [data, setData] = useState<any>({ hotspots: [], reports: [] });
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<any | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  
  useEffect(() => {
    if (!location) return;
    loadData();
    const interval = setInterval(loadData, 60_000);  // 1분마다 갱신
    return () => clearInterval(interval);
  }, [location]);
  
  async function loadData() {
    if (!location) return;
    const result = await floodApi.getMapData(location.lat, location.lng, 5.0);
    setData(result);
  }
  
  const markers: MapMarker[] = useMemo(() => {
    const result: MapMarker[] = [];
    
    // 사용자 위치
    if (location) {
      result.push({
        type: 'me',
        lat: location.lat,
        lng: location.lng,
        label: '나',
      });
    }
    
    // L4 사용자 제보
    data.reports.forEach((r: any) => {
      result.push({
        type: 'flood',
        lat: r.lat,
        lng: r.lng,
        label: getDepth(r.depth_normalized).shortLabel,
        onClick: () => setSelectedReport(r),
        data: r,
      });
    });
    
    return result;
  }, [data, location]);
  
  const activeCount = data.reports.filter((r: any) => r.trust_level !== 'PENDING').length;
  const pendingCount = data.reports.filter((r: any) => r.trust_level === 'PENDING').length;
  
  return (
    <div className="info-flood-map">
      {/* 헤더 */}
      <header className="flood-header">
        <h1>침수 지도</h1>
        <div className="flood-stats">
          <span className="stat-verified">✓ 확인 {activeCount}건</span>
          <span className="stat-pending">⏳ 신고 {pendingCount}건</span>
        </div>
      </header>
      
      {/* 지도 + L1 hotspot 라인 + L4 마커 */}
      <SaigonWardMap
        height={420}
        markers={markers}
        showLabels={false}
        showLegend={true}
        interactive={true}
        /* TODO: hotspotLayer prop 추가 */
      >
        {/* L1 hotspot 라인 (SaigonWardMap이 children 받도록 확장 필요) */}
        <FloodHotspotLayer
          hotspots={data.hotspots}
          onClick={setSelectedHotspot}
        />
      </SaigonWardMap>
      
      {/* 범례 (depth 4단계) */}
      <DepthLegend />
      
      {/* 상습 침수 지점 리스트 */}
      <section className="hotspot-list">
        <h2>📍 상습 침수 지점 ({data.hotspots.length})</h2>
        {data.hotspots.slice(0, 5).map((h: any) => (
          <HotspotCard 
            key={h.hotspot_id} 
            hotspot={h}
            onClick={() => setSelectedHotspot(h)}
          />
        ))}
      </section>
      
      {/* 활성 신고 리스트 */}
      <section className="reports-list">
        <h2>🚨 활성 신고 ({data.reports.length})</h2>
        {data.reports.map((r: any) => (
          <ReportCard 
            key={r.report_id} 
            report={r}
            onClick={() => setSelectedReport(r)}
          />
        ))}
      </section>
      
      {/* FAB 신고 버튼 */}
      <button className="fab-report" onClick={() => setShowReportForm(true)}>
        <span className="fab-icon">+</span>
        <span className="fab-text">침수 신고</span>
      </button>
      
      {/* 신고 폼 */}
      {showReportForm && location && (
        <FloodReportSheet
          lat={location.lat}
          lng={location.lng}
          onSuccess={(id, gp) => {
            setShowReportForm(false);
            loadData();
            // TODO: 토스트 알림 "+ {gp} GP"
          }}
          onCancel={() => setShowReportForm(false)}
        />
      )}
      
      {/* 신고 상세 */}
      {selectedReport && (
        <FloodDetailSheet
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onConfirm={async () => {
            await floodApi.confirm(selectedReport.report_id, 'still_flooded');
            loadData();
            setSelectedReport(null);
          }}
          onResolve={async () => {
            await floodApi.confirm(selectedReport.report_id, 'resolved');
            loadData();
            setSelectedReport(null);
          }}
        />
      )}
    </div>
  );
}
```

⚠️ `SaigonWardMap` 컴포넌트가 `children` 받도록 작은 수정 필요. 다음 줄을 SaigonWardMap.tsx의 `</svg>` 직전에 추가:

```tsx
{/* 외부에서 SVG 자식 요소 주입 가능 (FloodHotspotLayer 등) */}
{children}
```

그리고 props에 `children?: React.ReactNode` 추가.

### Task 3.6: API 클라이언트 확장

`frontend/src/api/info.ts`:

```typescript
export const floodApi = {
  // 기존 H 작업
  getActive: (lat: number, lng: number, radius_km: number) =>
    apiClient.get('/api/bff/info/flood/active', { params: { lat, lng, radius_km } }),
  report: (data: any) => 
    apiClient.post('/api/bff/info/flood/report', data),
  confirm: (report_id: number, type: string) =>
    apiClient.post(`/api/bff/info/flood/confirm/${report_id}`, { confirmation_type: type }),
  
  // 신규 추가
  getMapData: (lat: number, lng: number, radius_km: number) =>
    apiClient.get('/api/bff/info/flood/map-data', { params: { lat, lng, radius_km } }),
  getHotspots: (ward_code?: string) =>
    apiClient.get('/api/bff/info/flood/hotspots', { params: { ward_code } }),
  uploadPhoto: (formData: FormData) =>
    apiClient.post('/api/bff/info/flood/upload-photo', formData),
};
```

---

## §6. Phase 4 — 검수 + 테스트 (1일)

### Task 4.1: 데이터 검수

```bash
# 1. hotspot 시드 확인
psql $DATABASE_URL -c "SELECT COUNT(*) FROM flood_hotspot WHERE is_active = TRUE;"
# 기대: 8+ (또는 30개)

# 2. API 응답 확인
curl "http://localhost:8000/api/bff/info/flood/map-data?lat=10.78&lng=106.7" \
  -H "Authorization: Bearer $TOKEN" | jq

# 기대:
# {
#   "hotspots": [{...}, ...],
#   "reports": [],
#   "fetched_at": "2026-..."
# }

# 3. 사용자 제보 1건 추가
curl -X POST http://localhost:8000/api/bff/info/flood/report \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"lat": 10.7780, "lng": 106.7019, "depth_level": "KNEE"}'

# 4. 다시 map-data 호출 → reports에 1건 나옴
```

### Task 4.2: 프론트 시각 검수

```
□ /info/flood 접속
□ 지도에 상습 침수 거리 (대시 라인) 보임
□ 만약 사용자 제보 있으면 깊이별 색 마커 보임
□ FAB "+ 침수 신고" 버튼 우하단 고정
□ 신고 폼 → 4 깊이 큰 버튼 (각 110px 이상)
□ 사진 옵션 → +10 GP 표시
□ "예상 보상 +30 GP" 박스 (깊이 + 사진 합산)
□ 제출 → 지도에 즉시 마커 추가
□ 마커 탭 → 상세 시트 (사진 + 다른 사용자 확인 + 검증 배지)
□ "맞아요" 탭 → verifier_count 증가 → 3명 시 VERIFIED 배지
□ 1분 후 자동 갱신 (interval) 동작
```

### Task 4.3: 어뷰징 가드레일 테스트

```bash
# 동일 사용자가 5건 빠르게 신고 → 6번째 차단
for i in {1..6}; do
  curl -X POST http://localhost:8000/api/bff/info/flood/report \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"lat\": 10.78, \"lng\": 106.70$i, \"depth_level\": \"SHIN\"}"
  echo ""
done
# 기대: 6번째에서 429 에러 ("Daily report limit reached")

# 같은 위치 30분 이내 중복 차단
curl -X POST http://localhost:8000/api/bff/info/flood/report \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"lat": 10.78, "lng": 106.70, "depth_level": "KNEE"}'
# 두 번 연속 → 429 ("Same location within 30 minutes")
```

---

## §7. 작업 순서 (요약)

```
Phase 0 (15분):     H Phase 2 + 지도 컴포넌트 진척 확인
Phase 1 (1일):      flood_hotspots_v1.geojson 작성 + DB 시드
Phase 2 (3-4시간):  API 라우터 + service 확장
Phase 3 (1-2일):    프론트 (토큰 + hotspot 레이어 + 마커 + 신고 폼 + 통합)
Phase 4 (1일):      검수 + 어뷰징 테스트

총 4-5일 (단일 개발자 풀타임)
```

---

## §8. v2 확장 (이번 작업 범위 밖)

다음 작업은 **출시 후 우기 한 시즌 검증 후** 진행:

| 기능 | 시점 | 비고 |
|---|---|---|
| **L2 만조 예보** | v2 (우기 후) | NCHMF 파싱 + UTide 천문 계산 |
| **L3 강우 레이더** | v2 (우기 시즌만) | Open-Meteo (무료) + Tomorrow.io (유료, 우기만) |
| **푸시 알림** | v2 | 만조 06:00 + 본인 경로 신규 신고 |
| **Risk Score 합성** | v3 | 사용자 1,000명+ 데이터 누적 후 |
| **우회 경로 추천** | v3 | 외부 라우팅 API 필요 |
| **Storm Scout 타이틀** | v2 | RPG 시즌 시스템과 연동 |
| **UDI 제휴 협상** | 시즌 3+ | 우리 라이더 데이터를 협상 카드로 |

---

## §9. 코드에게 던질 첫 메시지

```
Saigon Rider 침수 지도 표출 작업 시작.

【작업 지시서】
docs/flood-map-instructions.md

【전제】
- H 문서 Phase 2 (침수 모듈) 완료
  - flood_report 테이블 + INFO-FLOOD-MAP, INFO-FLOOD-REPORT 화면 존재
- 지도 컴포넌트 완료
  - components/maps/SaigonWardMap.tsx 존재
- 이번 작업은 그 위에 "L1 정적 hotspot + L4 강화" 추가

【핵심 결정】
- L2 만조 / L3 강우 / L5 UDI 모두 v2 또는 빼기
- L1 (상습 침수 hotspot 30개) + L4 (사용자 제보) 만 구현
- 4단계 깊이 토큰 (PUDDLE/SHIN/KNEE/IMPASSABLE)
- 검증 시스템 (verifier_count 3+ = "라이더 검증" 배지)

【주의 사항】
- L1 GeoJSON 30개 작성은 위임형 OK (Google Maps에서 직접 좌표 추출)
- 8개만 예시로 적혀있음. 나머지 22개는 기획서 §2 L1 자료 참고
- 사진 업로드 엔드포인트 (/upload-photo) 없으면 별도 작업 필요
- SaigonWardMap.tsx에 children prop 추가 작은 수정 필요

위임형 진행. Phase 0부터 시작해줘.
```

---

## §10. 문제 해결 가이드

| 문제 | 해결 |
|---|---|
| GeoJSON 좌표 입력 실수 (lat/lng 순서) | GeoJSON 표준: **[lng, lat]** 순서. PostGIS도 마찬가지 |
| 30개 hotspot 작성 시간 너무 길어 | 8개로 시작 + 운영팀에 위임 (Google Maps 30분 매뉴얼 작업) |
| FloodHotspotLayer가 SaigonWardMap 안에 안 들어감 | SaigonWardMap에 `children?: ReactNode` 추가 + `</svg>` 직전에 `{children}` |
| verifier_count 증가 안 됨 | trigger 또는 confirm 엔드포인트 안의 UPDATE 확인 |
| 사진 업로드 실패 | S3/Cloudflare R2 설정 또는 로컬 fs 폴백 |
| 라이더 검증 배지 안 보임 | trust_level 필드 응답에 포함됐는지 확인 + DEPTH_TOKENS 매핑 |

---

## §11. 한 줄 정리

**"L1 정적 hotspot 30개 + L4 사용자 제보 강화. L2/L3/L5는 의도적으로 빼고 v2로 미룸. 4단계 깊이 + 한 손 1탭 신고 + verifier 3+ '라이더 검증' 배지. SaigonWardMap 위에 FloodHotspotLayer + FloodMarker로 표출. 4-5일 작업."**

이게 우기 5월 전 출시할 침수 정보 시스템의 최소 완결판입니다.

---

(끝)
