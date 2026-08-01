# Saigon Rider — 정보 모듈 Claude Code 작업 지시서 v1.0

> 발행일: 2026-05-18
> 대상: Claude Code (`claude` CLI)
> 코드베이스: github.com/D0iloppa/saigon_rider (FastAPI + React + Vite + Capacitor)
> 범위: 4개 정보 모듈 (날씨/침수/주유소/정비소) + 신규 8개 화면
> 기간: 4-6주 (단일 개발자, 병렬 시 단축)
> 전제: 기획서 G + 디자인 시안 v6 결과물 (Skywork 결과 후)

---

## §0. Claude Code에 던지는 방법

### 0.1 컨텍스트 파일 준비

작업 디렉토리에 다음 파일들이 있어야 함:

```
saigon_rider/                          # 기존 코드베이스
├── backend/                           # FastAPI BFF
├── engine/                            # FastAPI SRE Engine
├── frontend/                          # React + Vite + Capacitor
└── docs/
    ├── G-info-modules-spec.md         # 기획서 (필수)
    ├── H-info-modules-instructions.md # 이 문서
    └── screens_v6_info.html           # Skywork v6 결과물 (선택)

/assets/skywork-v6/                    # Skywork 시안
└── screens_v6_info.html
```

### 0.2 첫 메시지로 던질 내용

```
Saigon Rider 정보 모듈 개발 시작.

코드베이스 위치: github.com/D0iloppa/saigon_rider (이미 클론됨)
기획서: docs/G-info-modules-spec.md
이 지시서: docs/H-info-modules-instructions.md
디자인 시안: assets/skywork-v6/screens_v6_info.html (Skywork 결과물)

지시서대로 Phase 0의 Task 1부터 시작해줘.
나는 위임형이니까 적극 결정하고 진행해.
막힌 게 있으면 구체적으로 질문해.
```

(이후 이 문서 §1부터 통째 붙여넣기 또는 docs 폴더 위치 알려주기)

---

## §1. 전체 작업 계획

### 1.1 Phase 분할

| Phase | 작업 | 기간 |
|---|---|---|
| **Phase 0** | 환경 + 외부 API 키 + DB 마이그레이션 | 2-3일 |
| **Phase 1** | 모듈 1 (날씨) + INFO-HUB 통합 | 1주 |
| **Phase 2** | 모듈 2 (침수 신고 + 지도) | 1-2주 |
| **Phase 3** | 모듈 3 (주유소) | 1주 |
| **Phase 4** | 모듈 4 (정비소) | 2주 |
| **Phase 5** | SRE 통합 + 어뷰징 가드레일 + 운영팀 시드 | 3-5일 |

**총 4-6주** (단일 개발자 풀타임 기준)

### 1.2 의존성 그래프

```
Phase 0 (필수 선행)
   ↓
Phase 1 (날씨) ─── 단독 출시 가능 ─── 첫 가치 검증
   ↓
Phase 2 (침수) ─── 우기 전 출시 필수
   ↓
Phase 3 (주유소) ─── OSM import 일회성
Phase 4 (정비소) ─── 운영팀 시드 동시 진행
   ↓
Phase 5 (통합 + 출시)
```

Phase 1만으로도 출시 가능 (정보 모듈 MVP). 베트남 우기 (5-10월) 전까지 Phase 2 완료 필수.

---

## §2. Phase 0 — 환경 셋업 (2-3일)

### Task 1: 외부 API 키 발급 (1시간)

#### 1.1 OpenWeather API
```
1. https://openweathermap.org/api 방문
2. Sign Up (무료 계정)
3. API Key 발급 (Free tier: 60 calls/min)
4. .env에 추가:
   OPENWEATHER_API_KEY=<key>
```

#### 1.2 RainViewer API
```
1. https://www.rainviewer.com/api.html 방문
2. API 키 발급 (무료, Sign Up 없이 사용 가능한 경우도 있음)
3. .env에 추가:
   RAINVIEWER_API_KEY=<key>  # 필요 시
```

#### 1.3 환경 변수 통합

`backend/.env.example` 업데이트:
```bash
# === Info Modules (v6) ===
OPENWEATHER_API_KEY=
RAINVIEWER_API_KEY=
OSM_OVERPASS_ENDPOINT=https://overpass-api.de/api/interpreter
WEATHER_CACHE_TTL_CURRENT=600       # 10분
WEATHER_CACHE_TTL_FORECAST_1H=1800  # 30분
WEATHER_CACHE_TTL_FORECAST_24H=3600 # 1시간
```

**검수 기준**:
- [ ] `.env`에 OpenWeather 키 존재
- [ ] `curl "https://api.openweathermap.org/data/2.5/weather?lat=10.776&lon=106.700&appid=$KEY"` 호출 성공
- [ ] `.env.example` 업데이트됨 + git commit

---

### Task 2: PostgreSQL 마이그레이션 (3-4시간)

신규 테이블 12개 추가. Alembic 또는 자체 마이그레이션 도구 사용.

#### 2.1 신규 마이그레이션 파일

`backend/migrations/202605xx_info_modules.sql`:

```sql
-- =====================================================
-- Module 1: Weather
-- =====================================================
CREATE TABLE weather_cache (
  cache_id BIGSERIAL PRIMARY KEY,
  district_code VARCHAR(20) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  weather_type VARCHAR(20) NOT NULL,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (district_code, weather_type)
);
CREATE INDEX idx_weather_cache_district ON weather_cache(district_code, weather_type);
CREATE INDEX idx_weather_cache_expires ON weather_cache(expires_at);

CREATE TABLE user_favorite_location (
  user_id BIGINT REFERENCES sre_user(user_id) ON DELETE CASCADE,
  label VARCHAR(50) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  notify_rain BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, label)
);

-- =====================================================
-- Module 2: Flood
-- =====================================================
CREATE TABLE flood_report (
  report_id BIGSERIAL PRIMARY KEY,
  reporter_user_id BIGINT REFERENCES sre_user(user_id),
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  district_code VARCHAR(20) NOT NULL,
  street_name VARCHAR(200),
  depth_level VARCHAR(20) NOT NULL CHECK (depth_level IN ('ankle', 'knee', 'thigh', 'above')),
  photo_url TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  confidence_score INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESOLVED', 'EXPIRED', 'FLAGGED')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '6 hours'),
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ) STORED
);
CREATE INDEX idx_flood_active ON flood_report(status, expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_flood_geom ON flood_report USING GIST(geom);
CREATE INDEX idx_flood_reporter ON flood_report(reporter_user_id, reported_at);

CREATE TABLE flood_confirmation (
  confirmation_id BIGSERIAL PRIMARY KEY,
  report_id BIGINT REFERENCES flood_report(report_id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES sre_user(user_id),
  confirmation_type VARCHAR(20) NOT NULL CHECK (confirmation_type IN ('still_flooded', 'resolved', 'false')),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, user_id)
);
CREATE INDEX idx_confirm_report ON flood_confirmation(report_id);

CREATE TABLE flood_hotspot_stats (
  hotspot_id BIGSERIAL PRIMARY KEY,
  district_code VARCHAR(20) NOT NULL,
  street_name VARCHAR(200),
  centroid_lat DECIMAL(10, 7),
  centroid_lng DECIMAL(10, 7),
  flood_count_30d INT DEFAULT 0,
  last_flood_at TIMESTAMPTZ,
  avg_depth_level VARCHAR(20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- Module 3: Gas Station
-- =====================================================
CREATE TABLE gas_station (
  station_id BIGSERIAL PRIMARY KEY,
  osm_id VARCHAR(50) UNIQUE,
  brand VARCHAR(50),
  name VARCHAR(200),
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  district_code VARCHAR(20),
  street_name VARCHAR(200),
  opening_hours VARCHAR(100),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gas_geom ON gas_station USING GIST(geom);
CREATE INDEX idx_gas_brand ON gas_station(brand);

CREATE TABLE fuel_price_official (
  price_id BIGSERIAL PRIMARY KEY,
  fuel_type VARCHAR(20) NOT NULL,
  price_vnd INT NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gas_station_wait_report (
  wait_id BIGSERIAL PRIMARY KEY,
  station_id BIGINT REFERENCES gas_station(station_id),
  reporter_user_id BIGINT REFERENCES sre_user(user_id),
  wait_minutes INT NOT NULL CHECK (wait_minutes >= 0 AND wait_minutes <= 120),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 minutes')
);
CREATE INDEX idx_wait_station_recent ON gas_station_wait_report(station_id, reported_at DESC);
CREATE INDEX idx_wait_expires ON gas_station_wait_report(expires_at);

-- =====================================================
-- Module 4: Repair Shop
-- =====================================================
CREATE TABLE repair_shop (
  shop_id BIGSERIAL PRIMARY KEY,
  osm_id VARCHAR(50) UNIQUE,
  name VARCHAR(200) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  district_code VARCHAR(20),
  street_name VARCHAR(200),
  phone VARCHAR(20),
  opening_hours VARCHAR(100),
  brand_focus VARCHAR(100),
  is_verified BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  added_by_user_id BIGINT REFERENCES sre_user(user_id),
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_repair_geom ON repair_shop USING GIST(geom);
CREATE INDEX idx_repair_status ON repair_shop(status) WHERE status = 'ACTIVE';

CREATE TABLE repair_service_type (
  service_code VARCHAR(20) PRIMARY KEY,
  service_name_ko VARCHAR(100),
  service_name_vi VARCHAR(100),
  service_name_en VARCHAR(100),
  typical_duration_min INT
);

-- 시드 데이터
INSERT INTO repair_service_type VALUES
  ('OIL_CHANGE',    '엔진오일 교체',  'Thay nhớt động cơ',   'Engine Oil Change',   30),
  ('TIRE',          '타이어 교체',    'Thay lốp xe',         'Tire Replacement',    45),
  ('CHAIN',         '체인 교체',      'Thay xích',           'Chain Replacement',   60),
  ('ENGINE',        '엔진 정비',      'Sửa động cơ',         'Engine Repair',       120),
  ('BRAKE',         '브레이크 패드',  'Thay má phanh',       'Brake Pad',           45),
  ('BATTERY',       '배터리 교체',    'Thay pin',            'Battery Replacement', 30),
  ('GENERAL_CHECK', '일반 점검',      'Bảo dưỡng tổng quát', 'General Maintenance', 60),
  ('WASH',          '세차',           'Rửa xe',              'Wash',                20);

CREATE TABLE repair_review (
  review_id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT REFERENCES repair_shop(shop_id),
  reviewer_user_id BIGINT REFERENCES sre_user(user_id),
  service_code VARCHAR(20) REFERENCES repair_service_type(service_code),
  motorcycle_model VARCHAR(100),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  price_vnd INT,
  comment TEXT,
  photo_url TEXT,
  is_anonymous BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  upvotes INT DEFAULT 0,
  flagged BOOLEAN DEFAULT FALSE,
  UNIQUE (shop_id, reviewer_user_id, service_code)
);
CREATE INDEX idx_review_shop ON repair_review(shop_id, reviewed_at DESC);
CREATE INDEX idx_review_user ON repair_review(reviewer_user_id);

CREATE MATERIALIZED VIEW repair_shop_stats AS
SELECT
  shop_id,
  COUNT(*) AS review_count,
  ROUND(AVG(rating)::numeric, 1) AS avg_rating,
  AVG(price_vnd)::INT AS avg_price,
  MAX(reviewed_at) AS last_review_at
FROM repair_review
WHERE flagged = FALSE
GROUP BY shop_id;
CREATE UNIQUE INDEX idx_repair_stats_shop ON repair_shop_stats(shop_id);
```

#### 2.2 SRE 액션 정의 추가

`engine/migrations/202605xx_info_actions.sql`:

```sql
-- 정보 모듈 액션 8개 추가
INSERT INTO action_definition (
  action_code, action_name, gp_base, gp_max_daily,
  xp_base, sxp_base, requires_kyc, description
) VALUES
  ('INFO_WEATHER_VIEW',      '날씨 첫 조회',          2,   2,    5,   5,   FALSE, '일일 1회 한정'),
  ('INFO_FAVORITE_LOCATION', '즐겨찾기 위치 등록',    5,   15,   10,  0,   FALSE, '총 3회까지'),
  ('INFO_FLOOD_REPORT',      '침수 신고',             10,  50,   30,  20,  FALSE, '일일 5건 상한'),
  ('INFO_FLOOD_PHOTO',       '침수 신고 사진',        5,   25,   10,  10,  FALSE, '추가 보너스'),
  ('INFO_FLOOD_CONFIRM',     '침수 확인',             5,   25,   10,  5,   FALSE, '본인 신고 X'),
  ('INFO_GAS_WAIT_REPORT',   '주유 대기 신고',        3,   15,   5,   0,   FALSE, '90분 cooldown'),
  ('INFO_REPAIR_REVIEW',     '정비 리뷰 작성',        20,  60,   50,  30,  FALSE, '같은 가게 같은 작업 1회'),
  ('INFO_REPAIR_PHOTO',      '정비 리뷰 사진',        5,   15,   10,  10,  FALSE, '추가 보너스'),
  ('INFO_REPAIR_PRICE',      '정비 가격 정보',        5,   15,   10,  10,  FALSE, '추가 보너스'),
  ('INFO_REPAIR_ADD_SHOP',   '새 정비소 추가',        30,  30,   80,  40,  FALSE, '운영팀 검증 후 지급');
```

#### 2.3 마이그레이션 실행

```bash
cd backend
# Alembic 사용 시
alembic upgrade head

# 또는 직접 실행
psql $DATABASE_URL < migrations/202605xx_info_modules.sql

cd ../engine
psql $DATABASE_URL < migrations/202605xx_info_actions.sql
```

**검수 기준**:
- [ ] 신규 테이블 12개 생성 확인 (`\dt info_*` 또는 `\dt`)
- [ ] PostGIS 확장 활성화 (`CREATE EXTENSION IF NOT EXISTS postgis`)
- [ ] `repair_service_type` 시드 8개 확인
- [ ] `action_definition` INFO_* 10개 확인
- [ ] GIST 인덱스 4개 생성 (`\di idx_*_geom`)

---

### Task 3: OSM 데이터 import 스크립트 (4-5시간)

호치민 주유소 + 정비소 일회성 import.

#### 3.1 Overpass API 호출 스크립트

`backend/scripts/osm_import.py`:

```python
import requests
import json
import psycopg2
from datetime import datetime

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

GAS_QUERY = """
[out:json][timeout:120];
area["name:en"="Ho Chi Minh City"]->.hcm;
(
  node["amenity"="fuel"](area.hcm);
  way["amenity"="fuel"](area.hcm);
);
out center;
"""

REPAIR_QUERY = """
[out:json][timeout:120];
area["name:en"="Ho Chi Minh City"]->.hcm;
(
  node["shop"="motorcycle_repair"](area.hcm);
  node["shop"="motorcycle"](area.hcm);
  way["shop"="motorcycle_repair"](area.hcm);
  way["shop"="motorcycle"](area.hcm);
);
out center;
"""

def fetch_osm(query, name):
    print(f"Fetching {name} from OSM Overpass...")
    response = requests.post(OVERPASS_URL, data={"data": query}, timeout=180)
    response.raise_for_status()
    data = response.json()
    
    elements = data.get("elements", [])
    print(f"  → {len(elements)} elements")
    
    # 표준화
    items = []
    for el in elements:
        if el["type"] == "node":
            lat, lng = el["lat"], el["lon"]
        elif el["type"] == "way" and "center" in el:
            lat, lng = el["center"]["lat"], el["center"]["lon"]
        else:
            continue
        
        tags = el.get("tags", {})
        items.append({
            "osm_id": f"{el['type']}/{el['id']}",
            "name": tags.get("name") or tags.get("brand") or "Unknown",
            "brand": tags.get("brand"),
            "lat": lat,
            "lng": lng,
            "street_name": tags.get("addr:street"),
            "opening_hours": tags.get("opening_hours"),
            "phone": tags.get("phone") or tags.get("contact:phone"),
        })
    
    return items


def import_gas(conn, items):
    cur = conn.cursor()
    for item in items:
        cur.execute("""
            INSERT INTO gas_station (
                osm_id, brand, name, lat, lng, street_name, opening_hours
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (osm_id) DO UPDATE SET
                name = EXCLUDED.name,
                brand = EXCLUDED.brand
        """, (
            item["osm_id"],
            item["brand"],
            item["name"],
            item["lat"],
            item["lng"],
            item["street_name"],
            item["opening_hours"],
        ))
    conn.commit()
    print(f"  ✓ {len(items)} gas stations imported")


def import_repair(conn, items):
    cur = conn.cursor()
    for item in items:
        cur.execute("""
            INSERT INTO repair_shop (
                osm_id, name, lat, lng, street_name, phone, opening_hours,
                is_verified, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE, 'ACTIVE')
            ON CONFLICT (osm_id) DO UPDATE SET
                name = EXCLUDED.name
        """, (
            item["osm_id"],
            item["name"],
            item["lat"],
            item["lng"],
            item["street_name"],
            item["phone"],
            item["opening_hours"],
        ))
    conn.commit()
    print(f"  ✓ {len(items)} repair shops imported")


def main():
    import os
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    
    # 주유소
    gas_items = fetch_osm(GAS_QUERY, "gas stations")
    import_gas(conn, gas_items)
    
    # 정비소
    repair_items = fetch_osm(REPAIR_QUERY, "repair shops")
    import_repair(conn, repair_items)
    
    # 베트남 휘발유 가격 초기 시드 (수동, 정부 공시 데이터)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO fuel_price_official (fuel_type, price_vnd, effective_from)
        VALUES ('RON95', 25420, CURRENT_DATE),
               ('RON92', 24300, CURRENT_DATE),
               ('DO',    22100, CURRENT_DATE)
        ON CONFLICT DO NOTHING
    """)
    conn.commit()
    
    conn.close()
    print("✓ All imports complete")


if __name__ == "__main__":
    main()
```

#### 3.2 District 자동 매핑

OSM에서 District 코드는 없으니, 좌표 기반으로 매핑:

`backend/scripts/assign_districts.py`:

```python
# 호치민 District 19개 경계 좌표 (간략화)
HCM_DISTRICTS = {
    "Q1": {"lat_min": 10.762, "lat_max": 10.785, "lng_min": 106.695, "lng_max": 106.712},
    "Q3": {"lat_min": 10.770, "lat_max": 10.795, "lng_min": 106.675, "lng_max": 106.695},
    "Q4": {"lat_min": 10.755, "lat_max": 10.770, "lng_min": 106.700, "lng_max": 106.710},
    "Q5": {"lat_min": 10.750, "lat_max": 10.770, "lng_min": 106.665, "lng_max": 106.685},
    "Q7": {"lat_min": 10.720, "lat_max": 10.750, "lng_min": 106.700, "lng_max": 106.745},
    "BinhThanh": {"lat_min": 10.795, "lat_max": 10.825, "lng_min": 106.685, "lng_max": 106.720},
    "PhuNhuan": {"lat_min": 10.785, "lat_max": 10.805, "lng_min": 106.665, "lng_max": 106.685},
    "GoVap":    {"lat_min": 10.820, "lat_max": 10.860, "lng_min": 106.660, "lng_max": 106.695},
    "ThuDuc":   {"lat_min": 10.820, "lat_max": 10.880, "lng_min": 106.720, "lng_max": 106.800},
    # ... 나머지 (필요 시 추가)
}

def find_district(lat, lng):
    for code, bounds in HCM_DISTRICTS.items():
        if (bounds["lat_min"] <= lat <= bounds["lat_max"] and
            bounds["lng_min"] <= lng <= bounds["lng_max"]):
            return code
    return "OTHER"

# 모든 row 업데이트
cur.execute("SELECT station_id, lat, lng FROM gas_station WHERE district_code IS NULL")
for row in cur.fetchall():
    district = find_district(row[1], row[2])
    cur.execute("UPDATE gas_station SET district_code = %s WHERE station_id = %s",
                (district, row[0]))
```

⚠️ 더 정확한 매핑은 PostGIS + 행정구역 폴리곤 사용 권장 (`ST_Contains`). Phase 2에서 개선.

#### 3.3 실행

```bash
cd backend
pip install requests psycopg2-binary
python scripts/osm_import.py
python scripts/assign_districts.py
```

**검수 기준**:
- [ ] `SELECT COUNT(*) FROM gas_station` → 600-900 (호치민 주유소 약 800개)
- [ ] `SELECT COUNT(*) FROM repair_shop` → 200-400 (호치민 정비소 약 300개)
- [ ] `SELECT COUNT(*) FROM gas_station WHERE district_code IS NULL` → 0
- [ ] `SELECT COUNT(*) FROM fuel_price_official` → 3 (RON95, RON92, DO)

---

## §3. Phase 1 — 날씨 모듈 (1주)

### Task 4: 백엔드 — 날씨 라우터 (2-3일)

#### 4.1 새 라우터 생성

`backend/routers/info_weather.py`:

```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import httpx
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..db import get_session
from ..models import WeatherCache
from ..auth import get_current_user

router = APIRouter(prefix="/api/bff/info/weather", tags=["info-weather"])


class WeatherResponse(BaseModel):
    location: dict
    current: dict
    forecast: dict
    recommendation: Optional[str] = None


@router.get("", response_model=WeatherResponse)
async def get_weather(
    lat: float,
    lng: float,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # 1. 캐시 조회 (District 코드 기반)
    district = await find_district_by_coord(lat, lng)
    cached = await get_cached_weather(session, district, 'current')
    
    if cached:
        data = cached.data
    else:
        # 2. OpenWeather API 호출
        data = await fetch_openweather(lat, lng)
        await cache_weather(session, district, lat, lng, 'current', data, ttl=600)
    
    # 3. 1시간 예보 (별도 캐시)
    forecast_1h = await get_or_fetch_forecast(session, district, lat, lng, '1h')
    forecast_24h = await get_or_fetch_forecast(session, district, lat, lng, '24h')
    
    # 4. 추천 메시지 생성
    recommendation = generate_recommendation(data, forecast_1h)
    
    # 5. GP 적립 (일일 1회)
    await earn_gp_action(user.user_id, 'INFO_WEATHER_VIEW')
    
    return WeatherResponse(
        location={"lat": lat, "lng": lng, "district": district},
        current={
            "temp_c": data["main"]["temp"],
            "condition": data["weather"][0]["main"],
            "rain_prob": forecast_1h.get("rain_prob", 0),
            "humidity": data["main"]["humidity"],
            "wind_kmh": round(data["wind"]["speed"] * 3.6),
        },
        forecast={
            "next_1h": forecast_1h.get("hourly", []),
            "next_24h": forecast_24h.get("hourly", []),
        },
        recommendation=recommendation,
    )


async def fetch_openweather(lat: float, lng: float):
    """OpenWeather Current Weather API"""
    import os
    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        raise HTTPException(500, "OpenWeather API key not configured")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": lat, "lon": lng, "appid": api_key, "units": "metric"},
            timeout=10.0,
        )
        if response.status_code != 200:
            raise HTTPException(502, "OpenWeather API error")
        return response.json()


async def get_cached_weather(session, district: str, weather_type: str):
    result = await session.execute(
        select(WeatherCache).where(
            WeatherCache.district_code == district,
            WeatherCache.weather_type == weather_type,
            WeatherCache.expires_at > datetime.now(),
        )
    )
    return result.scalar_one_or_none()


async def cache_weather(session, district, lat, lng, weather_type, data, ttl):
    """Upsert cache entry"""
    from sqlalchemy.dialects.postgresql import insert
    stmt = insert(WeatherCache).values(
        district_code=district,
        lat=lat, lng=lng,
        weather_type=weather_type,
        data=data,
        expires_at=datetime.now() + timedelta(seconds=ttl),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=['district_code', 'weather_type'],
        set_=dict(
            data=stmt.excluded.data,
            fetched_at=datetime.now(),
            expires_at=stmt.excluded.expires_at,
        ),
    )
    await session.execute(stmt)
    await session.commit()


def generate_recommendation(current, forecast_1h):
    rain_prob_1h = forecast_1h.get("rain_prob", 0)
    
    if rain_prob_1h >= 80:
        return "지금 출발은 비 위험. 30분 후 재확인 추천"
    elif rain_prob_1h >= 50:
        return f"1시간 내 비 가능성 {rain_prob_1h}%. 빠른 라이딩 OK"
    elif rain_prob_1h < 20:
        return "비 안 옴. 좋은 라이딩 날씨"
    else:
        return None


@router.get("/rain-radar")
async def get_rain_radar(lat: float, lng: float, zoom: int = 11):
    """RainViewer tile URL 반환"""
    # RainViewer 최신 timestamp 조회
    async with httpx.AsyncClient() as client:
        meta = await client.get("https://api.rainviewer.com/public/weather-maps.json")
        meta_data = meta.json()
    
    radar_meta = meta_data["radar"]["past"][-1]  # 가장 최근
    timestamp = radar_meta["time"]
    
    return {
        "tile_url": f"https://tilecache.rainviewer.com/v2/radar/{timestamp}/256/{{z}}/{{x}}/{{y}}/2/1_1.png",
        "last_updated": timestamp,
    }


@router.post("/notify-rain")
async def register_rain_notify(
    label: str, lat: float, lng: float,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """비 알림 등록 - GP 적립"""
    # 즐겨찾기 위치 추가 + notify_rain = TRUE
    # GP +3 적립
    pass
```

#### 4.2 라우터 등록

`backend/main.py`:
```python
from .routers import info_weather

app.include_router(info_weather.router)
```

**검수 기준**:
- [ ] `GET /api/bff/info/weather?lat=10.776&lng=106.700` 응답 200
- [ ] 응답에 `current.temp_c`, `forecast.next_1h`, `recommendation` 포함
- [ ] 캐시 hit 시 응답 시간 < 50ms
- [ ] 캐시 miss 시 응답 시간 < 2초
- [ ] OpenWeather 키 없을 때 500 에러 + 명확한 메시지

---

### Task 5: 프론트엔드 — INFO-HUB + 날씨 화면 (3-4일)

#### 5.1 라우터 추가

`frontend/src/App.jsx` 또는 라우터 파일:

```javascript
import InfoHub from './pages/info/InfoHub';
import InfoWeather from './pages/info/InfoWeather';

// 라우터에 추가
<Route path="/info" element={<InfoHub />} />
<Route path="/info/weather" element={<InfoWeather />} />
```

#### 5.2 InfoHub 컴포넌트

`frontend/src/pages/info/InfoHub.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation as useGeolocation } from '../../hooks/useGeolocation';
import { weatherApi, floodApi, gasApi, repairApi } from '../../api/info';
import WeatherCard from './components/WeatherCard';
import FloodCard from './components/FloodCard';
import GasCard from './components/GasCard';
import RepairCard from './components/RepairCard';
import AppShell from '../../layouts/AppShell';

export default function InfoHub() {
  const navigate = useNavigate();
  const { coords, error: geoError } = useGeolocation();
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coords) return;
    
    Promise.all([
      weatherApi.get(coords.lat, coords.lng),
      floodApi.getActive(coords.lat, coords.lng, 5),
      gasApi.getNearby(coords.lat, coords.lng, 5),
      repairApi.getNearby(coords.lat, coords.lng, 5),
    ]).then(([weather, flood, gas, repair]) => {
      setData({ weather, flood, gas, repair });
      setLoading(false);
    });
  }, [coords]);

  if (loading) return <div>Loading...</div>;
  if (geoError) return <div>위치 권한이 필요합니다</div>;

  return (
    <AppShell>
      <div className="info-hub p-4 space-y-4">
        <div className="location-header">
          <span>📍 {data.weather?.location?.district}</span>
          {data.flood?.floods?.length > 0 && (
            <div className="alert-banner bg-danger text-white p-2 rounded">
              ⚠️ 침수 주의: {data.flood.floods.length}건 활성
            </div>
          )}
        </div>

        <WeatherCard
          data={data.weather}
          onClick={() => navigate('/info/weather')}
        />
        <FloodCard
          data={data.flood}
          onClick={() => navigate('/info/flood')}
        />
        <GasCard
          data={data.gas}
          onClick={() => navigate('/info/gas')}
        />
        <RepairCard
          data={data.repair}
          onClick={() => navigate('/info/repair')}
        />

        <div className="text-xs text-text-3 text-center mt-6">
          💡 정보 신고 시 GP 적립!
        </div>
      </div>
    </AppShell>
  );
}
```

#### 5.3 InfoWeather 상세 컴포넌트

기획서 G의 §2.7 사양 + Skywork v6 시안 그대로 구현. 핵심 컴포넌트:

```jsx
// frontend/src/pages/info/InfoWeather.jsx
import { RainRadarMap } from './components/RainRadarMap';
import { ForecastBarChart } from './components/ForecastBarChart';

export default function InfoWeather() {
  // ... 기본 구조
  return (
    <AppShell>
      <CurrentWeather data={data.current} />
      <RainRadarMap lat={lat} lng={lng} />
      <ForecastBarChart hourly={data.forecast.next_24h} />
      <RecommendationCard message={data.recommendation} />
      <FavoriteLocationButton />
    </AppShell>
  );
}
```

#### 5.4 API 클라이언트

`frontend/src/api/info.js`:

```javascript
import { apiClient } from './client';

export const weatherApi = {
  get: (lat, lng) =>
    apiClient.get(`/api/bff/info/weather`, { params: { lat, lng } }),
  getRainRadar: (lat, lng) =>
    apiClient.get(`/api/bff/info/weather/rain-radar`, { params: { lat, lng } }),
  notifyRain: (label, lat, lng) =>
    apiClient.post(`/api/bff/info/weather/notify-rain`, { label, lat, lng }),
};

export const floodApi = {
  getActive: (lat, lng, radius_km) =>
    apiClient.get(`/api/bff/info/flood/active`, { params: { lat, lng, radius_km } }),
  report: (data) => apiClient.post(`/api/bff/info/flood/report`, data),
  confirm: (report_id, type) =>
    apiClient.post(`/api/bff/info/flood/confirm/${report_id}`, { confirmation_type: type }),
  getHotspots: (district_code) =>
    apiClient.get(`/api/bff/info/flood/hotspots`, { params: { district_code } }),
};

export const gasApi = {
  getNearby: (lat, lng, radius_km, fuel_type = 'RON95') =>
    apiClient.get(`/api/bff/info/gas/nearby`, { params: { lat, lng, radius_km, fuel_type } }),
  reportWait: (station_id, wait_minutes) =>
    apiClient.post(`/api/bff/info/gas/wait-report`, { station_id, wait_minutes }),
  getPrices: () => apiClient.get(`/api/bff/info/gas/prices`),
};

export const repairApi = {
  getNearby: (lat, lng, radius_km, service_code, motorcycle_model) =>
    apiClient.get(`/api/bff/info/repair/nearby`, {
      params: { lat, lng, radius_km, service_code, motorcycle_model }
    }),
  getDetail: (shop_id) =>
    apiClient.get(`/api/bff/info/repair/${shop_id}`),
  writeReview: (data) =>
    apiClient.post(`/api/bff/info/repair/review`, data),
  addShop: (data) =>
    apiClient.post(`/api/bff/info/repair/add-shop`, data),
};
```

#### 5.5 디자인 토큰 (정보 모듈)

`frontend/src/styles/info-tokens.css`:

```css
:root {
  /* 상태색 (위험/주의/안전) */
  --info-danger:  #EF3B3B;
  --info-warn:    #F59E0B;
  --info-success: #16A34A;
  --info-info:    #3B82F6;

  /* 깊이 색상 (침수) */
  --depth-ankle:  #FBBF24;  /* 노랑 */
  --depth-knee:   #F97316;  /* 주황 */
  --depth-thigh:  #DC2626;  /* 빨강 */
  --depth-above:  #7F1D1D;  /* 진빨강 */
}

.info-card {
  background: var(--surface);
  border-radius: 16px;
  padding: 16px;
  border: 1.5px solid var(--line);
  cursor: pointer;
  transition: transform 0.15s ease;
}
.info-card:active {
  transform: scale(0.98);
}
.info-card.alert {
  border-color: var(--info-danger);
  box-shadow: 0 0 0 4px rgba(239, 59, 59, 0.1);
}

.info-stat {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  letter-spacing: -0.02em;
}
```

**검수 기준**:
- [ ] `/info` 접속 시 4개 카드 표시
- [ ] GPS 권한 거부 시 폴백 UI
- [ ] 침수 활성 시 빨강 배너 표시
- [ ] 각 카드 탭 시 상세 화면 이동
- [ ] `/info/weather` 비 레이더 + 24h 예보 표시
- [ ] 출발 전 추천 메시지 표시

---

## §4. Phase 2 — 침수 모듈 (1-2주)

### Task 6: 침수 라우터 (3-4일)

`backend/routers/info_flood.py` (핵심 메서드만):

```python
@router.get("/active")
async def get_active_floods(
    lat: float, lng: float, radius_km: float = 5.0,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """반경 N km 이내 활성 침수 신고 조회"""
    # PostGIS ST_DWithin 사용
    result = await session.execute(
        text("""
            SELECT fr.*, ST_Distance(
                fr.geom,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
            ) / 1000 AS distance_km
            FROM flood_report fr
            WHERE fr.status = 'ACTIVE'
              AND fr.expires_at > NOW()
              AND ST_DWithin(
                fr.geom,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius_m
              )
            ORDER BY fr.confidence_score DESC, fr.reported_at DESC
            LIMIT 50
        """),
        {"lat": lat, "lng": lng, "radius_m": radius_km * 1000}
    )
    floods = [dict(r._mapping) for r in result]
    return {"floods": floods}


@router.post("/report")
async def report_flood(
    data: FloodReportCreate,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # 어뷰징 체크
    await check_abuse_guards(session, user.user_id, data)
    
    # 신고 저장
    district = await find_district_by_coord(data.lat, data.lng)
    report = FloodReport(
        reporter_user_id=user.user_id,
        lat=data.lat, lng=data.lng,
        district_code=district,
        street_name=data.street_name,
        depth_level=data.depth_level,
        photo_url=data.photo_url,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    
    # GP 적립 (SRE Engine 호출)
    gp_base = await earn_gp_action(user.user_id, 'INFO_FLOOD_REPORT', context={
        "report_id": report.report_id
    })
    
    # 사진 첨부 시 보너스
    gp_photo = 0
    if data.photo_url:
        gp_photo = await earn_gp_action(user.user_id, 'INFO_FLOOD_PHOTO')
    
    return {
        "report_id": report.report_id,
        "gp_earned": gp_base + gp_photo,
        "expires_at": report.expires_at,
    }


@router.post("/confirm/{report_id}")
async def confirm_flood(
    report_id: int, body: FloodConfirmCreate,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # 본인 신고 확인 불가
    report = await session.get(FloodReport, report_id)
    if report.reporter_user_id == user.user_id:
        raise HTTPException(400, "Cannot confirm your own report")
    
    # 중복 확인 차단
    existing = await session.execute(
        select(FloodConfirmation).where(
            FloodConfirmation.report_id == report_id,
            FloodConfirmation.user_id == user.user_id,
        )
    )
    if existing.scalar():
        raise HTTPException(400, "Already confirmed")
    
    # 확인 저장
    confirmation = FloodConfirmation(
        report_id=report_id,
        user_id=user.user_id,
        confirmation_type=body.confirmation_type,
    )
    session.add(confirmation)
    
    # confidence_score 증가
    if body.confirmation_type == 'still_flooded':
        report.confidence_score += 1
        # 만료 시간 2시간 연장
        report.expires_at = datetime.now() + timedelta(hours=2)
    elif body.confirmation_type == 'resolved':
        report.status = 'RESOLVED'
        report.resolved_at = datetime.now()
    
    await session.commit()
    
    # GP 적립 (still_flooded 또는 resolved만)
    gp = 0
    if body.confirmation_type in ('still_flooded', 'resolved'):
        gp = await earn_gp_action(user.user_id, 'INFO_FLOOD_CONFIRM')
    
    return {"confirmed": True, "gp_earned": gp}


async def check_abuse_guards(session, user_id: int, data):
    """어뷰징 가드레일"""
    # 1. 일일 5건 상한
    today_count = await session.scalar(
        select(func.count(FloodReport.report_id)).where(
            FloodReport.reporter_user_id == user_id,
            FloodReport.reported_at >= datetime.now().date(),
        )
    )
    if today_count >= 5:
        raise HTTPException(429, "Daily report limit reached (5)")
    
    # 2. 같은 위치 30분 이내 중복
    nearby_recent = await session.scalar(
        select(func.count(FloodReport.report_id)).where(
            FloodReport.reporter_user_id == user_id,
            FloodReport.reported_at >= datetime.now() - timedelta(minutes=30),
            text(
                "ST_DWithin(geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, 100)"
            ).bindparams(lat=data.lat, lng=data.lng),
        )
    )
    if nearby_recent > 0:
        raise HTTPException(429, "Same location within 30 minutes")
```

#### 6.1 만료 cron job

`backend/scripts/expire_flood_reports.py`:

```python
"""매 30분마다 실행. crontab 또는 APScheduler로 스케줄링."""
import asyncio
from sqlalchemy import text
from db import get_session

async def expire_floods():
    async with get_session() as session:
        result = await session.execute(text("""
            UPDATE flood_report
            SET status = 'EXPIRED'
            WHERE status = 'ACTIVE'
              AND reported_at < NOW() - INTERVAL '6 hours'
              AND NOT EXISTS (
                SELECT 1 FROM flood_confirmation
                WHERE report_id = flood_report.report_id
                  AND confirmation_type = 'still_flooded'
                  AND confirmed_at > NOW() - INTERVAL '2 hours'
              )
        """))
        await session.commit()
        print(f"Expired {result.rowcount} flood reports")

if __name__ == "__main__":
    asyncio.run(expire_floods())
```

crontab:
```
*/30 * * * * cd /app/backend && python scripts/expire_flood_reports.py
```

---

### Task 7: 침수 화면 (3-4일)

`frontend/src/pages/info/InfoFloodMap.jsx`:
- Mapbox 또는 Leaflet으로 지도 표시
- 활성 침수 핀 (4색)
- FAB 신고 버튼
- 활성 침수 리스트 (지도 아래 스크롤)

`frontend/src/pages/info/InfoFloodReport.jsx`:
- 깊이 4 버튼
- 사진 첨부 (camera)
- GP 표시
- 신고 CTA

**검수 기준**:
- [ ] 활성 침수 5건 이상 시 지도에 핀 5개 표시
- [ ] 1탭 신고 → 30초 안에 신고 완료 가능
- [ ] 어뷰징 (일일 5건 초과) 시 명확한 에러
- [ ] 본인 신고 확인 차단 동작
- [ ] cron 30분마다 expired 처리 동작

---

## §5. Phase 3 — 주유소 모듈 (1주)

### Task 8: 주유소 라우터 + 화면 (3-4일)

`backend/routers/info_gas.py`:

```python
@router.get("/nearby")
async def get_nearby_gas(
    lat: float, lng: float, radius_km: float = 5.0,
    fuel_type: str = "RON95",
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """가까운 주유소 + 가격 + 대기 시간"""
    result = await session.execute(text("""
        WITH nearby AS (
            SELECT
                gs.station_id, gs.brand, gs.name, gs.lat, gs.lng,
                gs.district_code, gs.street_name, gs.opening_hours,
                ST_Distance(
                    gs.geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                ) / 1000 AS distance_km
            FROM gas_station gs
            WHERE gs.status = 'ACTIVE'
              AND ST_DWithin(
                gs.geom,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius_m
              )
            ORDER BY distance_km
            LIMIT 20
        ),
        wait_summary AS (
            SELECT
                station_id,
                AVG(wait_minutes)::INT AS avg_wait,
                COUNT(*) AS report_count,
                MAX(reported_at) AS last_reported_at
            FROM gas_station_wait_report
            WHERE reported_at > NOW() - INTERVAL '90 minutes'
            GROUP BY station_id
        ),
        current_price AS (
            SELECT price_vnd FROM fuel_price_official
            WHERE fuel_type = :fuel_type
              AND effective_from <= CURRENT_DATE
              AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
            ORDER BY effective_from DESC LIMIT 1
        )
        SELECT
            n.*,
            (SELECT price_vnd FROM current_price) AS price_vnd,
            w.avg_wait AS wait_minutes,
            w.report_count AS wait_confidence,
            w.last_reported_at AS wait_reported_at
        FROM nearby n
        LEFT JOIN wait_summary w USING (station_id)
        ORDER BY n.distance_km
    """), {
        "lat": lat, "lng": lng,
        "radius_m": radius_km * 1000,
        "fuel_type": fuel_type,
    })
    
    stations = [dict(r._mapping) for r in result]
    return {"stations": stations}


@router.post("/wait-report")
async def report_wait_time(
    station_id: int, wait_minutes: int,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """주유 대기 시간 신고"""
    # 90분 cooldown 체크
    recent = await session.scalar(
        select(GasStationWaitReport).where(
            GasStationWaitReport.station_id == station_id,
            GasStationWaitReport.reporter_user_id == user.user_id,
            GasStationWaitReport.reported_at > datetime.now() - timedelta(minutes=90),
        )
    )
    if recent:
        raise HTTPException(429, "Already reported within 90 minutes")
    
    # 저장
    report = GasStationWaitReport(
        station_id=station_id,
        reporter_user_id=user.user_id,
        wait_minutes=wait_minutes,
    )
    session.add(report)
    await session.commit()
    
    # GP 적립
    gp = await earn_gp_action(user.user_id, 'INFO_GAS_WAIT_REPORT')
    
    return {"wait_id": report.wait_id, "gp_earned": gp}
```

`frontend/src/pages/info/InfoGasList.jsx`:
- 주유소 리스트 카드
- 가격 + 대기 시간 도트 (●●○○○)
- 대기 신고 모달

**검수 기준**:
- [ ] District 1 기준 가까운 주유소 10개 이상 표시
- [ ] 공식 가격 + 대기 시간 표시
- [ ] 대기 신고 → GP 3 적립 + 90분 cooldown

---

## §6. Phase 4 — 정비소 모듈 (2주)

### Task 9: 정비소 라우터 (5-7일)

`backend/routers/info_repair.py` 핵심 메서드:

```python
@router.get("/nearby")
async def get_nearby_repair(
    lat: float, lng: float, radius_km: float = 5.0,
    service_code: Optional[str] = None,
    motorcycle_model: Optional[str] = None,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """가까운 정비소 + 통계 + 키워드"""
    # PostGIS 거리 + repair_shop_stats join
    # 키워드 (기본 빈 배열, Phase 2에서 NLP 추가)
    ...


@router.get("/{shop_id}")
async def get_repair_detail(
    shop_id: int,
    session: AsyncSession = Depends(get_session),
):
    """정비소 상세 + 작업별 가격 + 최근 리뷰 10개"""
    shop = await session.get(RepairShop, shop_id)
    stats = await session.get(RepairShopStats, shop_id)
    
    # 작업별 평균 가격
    price_by_service = await session.execute(text("""
        SELECT service_code,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY price_vnd) AS median_price
        FROM repair_review
        WHERE shop_id = :shop_id AND price_vnd IS NOT NULL
          AND reviewed_at > NOW() - INTERVAL '1 year'
          AND flagged = FALSE
        GROUP BY service_code
    """), {"shop_id": shop_id})
    
    # 최근 리뷰 10개
    recent_reviews = await session.execute(
        select(RepairReview).where(RepairReview.shop_id == shop_id)
        .order_by(RepairReview.reviewed_at.desc()).limit(10)
    )
    
    return {
        "shop": shop,
        "stats": stats,
        "price_by_service": {row.service_code: int(row.median_price) for row in price_by_service},
        "recent_reviews": [r for (r,) in recent_reviews],
    }


@router.post("/review")
async def write_review(
    data: ReviewCreate,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # 중복 체크 (같은 가게 같은 작업 1회)
    existing = await session.scalar(
        select(RepairReview).where(
            RepairReview.shop_id == data.shop_id,
            RepairReview.reviewer_user_id == user.user_id,
            RepairReview.service_code == data.service_code,
        )
    )
    if existing:
        raise HTTPException(400, "Already reviewed this shop for this service")
    
    review = RepairReview(
        shop_id=data.shop_id,
        reviewer_user_id=user.user_id,
        service_code=data.service_code,
        motorcycle_model=data.motorcycle_model,
        rating=data.rating,
        price_vnd=data.price_vnd,
        comment=data.comment,
        photo_url=data.photo_url,
        is_anonymous=data.is_anonymous,
    )
    session.add(review)
    await session.commit()
    
    # GP 적립
    gp_base = await earn_gp_action(user.user_id, 'INFO_REPAIR_REVIEW')
    gp_photo = 0
    gp_price = 0
    if data.photo_url:
        gp_photo = await earn_gp_action(user.user_id, 'INFO_REPAIR_PHOTO')
    if data.price_vnd:
        gp_price = await earn_gp_action(user.user_id, 'INFO_REPAIR_PRICE')
    
    # materialized view 갱신 (백그라운드)
    await session.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY repair_shop_stats"))
    
    return {
        "review_id": review.review_id,
        "gp_earned": gp_base + gp_photo + gp_price,
    }
```

### Task 10: 정비소 화면 (5-7일)

3개 화면 구현:
- `InfoRepairList.jsx` — 리스트 + 필터 + 정렬
- `InfoRepairDetail.jsx` — 사진 슬라이드 + 가격표 + 리뷰
- `InfoRepairWrite.jsx` — 별점 + 가격 + 코멘트 폼

**검수 기준**:
- [ ] District 1 기준 정비소 5개 이상 표시
- [ ] 차종 + 작업 필터 동작
- [ ] 리뷰 작성 → GP 20-30 적립
- [ ] 같은 가게 같은 작업 중복 차단
- [ ] 익명 옵션 동작

---

## §7. Phase 5 — 통합 + 운영 준비 (3-5일)

### Task 11: HOME-001 통합

`frontend/src/pages/Home.jsx` 상단에 INFO 카드 4개 가로 슬라이드 추가:

```jsx
<div className="info-cards-horizontal">
  <InfoMiniCard type="weather" data={weatherData} onClick={() => navigate('/info/weather')} />
  <InfoMiniCard type="flood" data={floodData} onClick={() => navigate('/info/flood')} alert={floodData?.count > 0} />
  <InfoMiniCard type="gas" data={gasData} onClick={() => navigate('/info/gas')} />
  <InfoMiniCard type="repair" data={repairData} onClick={() => navigate('/info/repair')} />
</div>
```

### Task 12: 하단 탭바 추가

`frontend/src/components/BottomTabBar.jsx`:

```jsx
const tabs = [
  { id: 'home', icon: '🏠', label: '홈', path: '/' },
  { id: 'info', icon: '📍', label: '정보', path: '/info' }, // ⭐ NEW
  { id: 'ride', icon: '🛵', label: '라이딩', path: '/ride', isFab: true },
  { id: 'quest', icon: '🏆', label: '퀘스트', path: '/quests' },
  { id: 'profile', icon: '👤', label: '프로필', path: '/profile' },
];
```

### Task 13: 운영팀 시드 데이터 입력 도구

`backend/scripts/seed_repair_reviews.py`:

```python
"""운영팀이 정비소 50개 방문 후 리뷰 입력"""
SEED_REVIEWS = [
    {
        "shop_name": "Honda Head 2S - Phú Nhuận",
        "service": "OIL_CHANGE",
        "rating": 5,
        "price": 250000,
        "comment": "정직하고 빨라요. Honda 정품 부품 사용.",
        "reviewer": "ops_admin_1",
    },
    # ... 50-100개
]

# 실행: python scripts/seed_repair_reviews.py
```

### Task 14: 어뷰징 모니터링 대시보드

운영자용 간단한 대시보드 (FastAPI admin or Django admin):

- 신고 폭주 사용자 (일일 5건 가까이)
- 가짜 신고 의심 (사진 없음 + confirmation 0)
- 정비소 평점 1점 도배
- 가격 정보 outlier

---

## §8. 최종 검수 체크리스트

### 출시 전 검수

#### 기능 검수
- [ ] 외부 API 키 모두 설정됨 + 작동 확인
- [ ] 4개 모듈 모두 GP 적립 동작
- [ ] 어뷰징 가드레일 모두 동작 (일일 상한, cooldown, 중복 차단)
- [ ] PostGIS 거리 계산 정확 (실제 거리와 ±10% 이내)
- [ ] 침수 신고 6시간 후 자동 만료
- [ ] 정비소 통계 materialized view 일배치 갱신

#### 성능 검수
- [ ] INFO-HUB 첫 로드 < 3초
- [ ] 캐시 hit 시 응답 < 50ms
- [ ] 캐시 miss 시 응답 < 2초
- [ ] 100 동시 사용자 부하 테스트 통과

#### 데이터 검수
- [ ] 주유소 600+ 등록
- [ ] 정비소 300+ 등록
- [ ] 운영팀 시드 리뷰 50+ 작성
- [ ] District 매핑 누락 0건
- [ ] 휘발유 공식 가격 최신 (정부 공시 1주 이내)

#### 모바일 검수 (Capacitor)
- [ ] GPS 권한 요청 동작
- [ ] 카메라 권한 (침수 신고 사진)
- [ ] 백그라운드에서도 위치 업데이트
- [ ] iOS / Android 모두 빌드 + 동작
- [ ] 오프라인 시 폴백 UI

---

## §9. 출시 후 모니터링 지표

운영자 대시보드에 다음 지표 노출:

| 지표 | 목표 (출시 후 1개월) |
|---|---|
| INFO-HUB 일일 방문률 | 70%+ (WAU 중) |
| 침수 신고 일일 건수 (우기) | 20+ |
| 주유 대기 신고 일일 | 10+ |
| 정비 리뷰 신규 누적 | 50/주 |
| 외부 API 호출 (캐시 hit율) | 80%+ |
| 어뷰징 차단 건수 | <전체 신고의 5% |

---

## §10. 문제 해결 가이드

| 문제 | 해결 |
|---|---|
| OpenWeather rate limit (60/min 초과) | 캐시 TTL 증가 또는 1km 그리드로 묶기 |
| PostGIS GIST 인덱스 안 사용됨 | `EXPLAIN ANALYZE` 확인 후 통계 갱신 `ANALYZE flood_report` |
| 어뷰징 false positive 너무 많음 | 일일 상한 5 → 10으로 완화, 신뢰도 점수 강화 |
| 침수 신고 사진 용량 폭주 | imgproxy로 리사이즈 + S3/Cloudflare R2 사용 |
| District 매핑 정확도 낮음 | 행정구역 폴리곤 import 후 `ST_Contains` 사용 |
| 정비소 키워드 추출 안 됨 | Phase 2로 미루기, 출시는 키워드 없이 OK |

---

## §11. 출시 일정 (참고)

```
Day 1-3:    Phase 0 (환경 + DB + OSM import)
Day 4-10:   Phase 1 (날씨)
Day 11-24:  Phase 2 (침수, 우기 전 필수)
Day 25-31:  Phase 3 (주유소)
Day 32-45:  Phase 4 (정비소, 운영팀 시드 병행)
Day 46-49:  Phase 5 (통합 + 출시 준비)
Day 50:     출시
```

**총 약 50일 (7-8주)**. 단일 개발자 풀타임 기준. 병렬 시 4-6주 단축 가능.

---

## §12. 한 줄 정리

**"4개 정보 모듈을 4-6주에 doil.me 기존 코드베이스 위에 추가. OSM dump 1회 + 외부 API 무료 + 운영팀 시드 4주 → 호치민 라이더가 매일 켜는 첫 화면이 되는 정보 layer 완성. RPG 자산 100% 유지하면서 콜드 스타트 해결."**

이게 v1 출시의 마지막 큰 작업이에요.

---

(끝)
