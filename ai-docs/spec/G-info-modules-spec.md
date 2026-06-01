# Saigon Rider — 정보 모듈 최종 기획서 v1.0

> 발행일: 2026-05-18
> 위치: 메인 RPG 기획서 v2의 부속 모듈
> 목적: 신규 사용자 첫 30초 가치 확보 + 매일 켤 이유 만들기
> 핵심: 앱이 단순 라이딩 트래커가 아닌, **"살아있는 호치민 동네 layer"**가 되도록

---

## 1. 한눈에 보기

### 1.1 왜 만드는가

베트남 앱 시장 통계: D1 리텐션 30%, D7 리텐션 10%. **첫 화면에 가치 없으면 죽는다.**

지금까지 만든 라이딩 + RPG 단독 모델의 약점:
- 가입 직후 GP 0, 미션 0, 친구 0 → 콜드 스타트 끔찍
- "왜 매일 켜야 하나" 답 약함

정보 모듈이 해결하는 것:
- ✅ 사용자 0명일 때도 가치 있음 (OSM + 외부 API)
- ✅ 매일 켜는 이유 (오늘 비 와요?)
- ✅ 호치민 특화 (Strava·Google Maps에 없는 침수 정보)
- ✅ 향후 B2B 매출 기반 (정비소·주유소·보험 광고)

### 1.2 모듈 4개

| 모듈 | 가치 | 빈도 | 베트남 특화 | 구현 비용 |
|---|---|---|---|---|
| 🌧 **날씨 + 비 레이더** | 출발 전 결정 | 매일 1-3회 | ★★★★ | $0, 1주 |
| 🌊 **침수 신고 + 지도** | 안전 + 시간 절약 | 매일 (우기) | ★★★★★ | $0, 1-2주 |
| ⛽ **주유소 + 가격** | 비용 절감 | 주 1-2회 | ★★★★★ | $0, 1주 |
| 🔧 **정비소 + 평점** | 큰 의사결정 | 월 1-2회 | ★★★★★ | $0, 2주 |

총 4-6주 개발 + 운영 시드 콘텐츠 $400-1,600

### 1.3 핵심 원칙

1. **거짓말 안 하기**: "라이더 47명 활동 중" 같은 가짜 숫자 절대 X. 작은 숫자도 매력적으로 포장.
2. **OSM + 시드 + UGC 3층 데이터**: 외부 데이터 80% + 운영팀 시드 15% + 사용자 신고 5%
3. **District 1 + Bình Thạnh 집중**: 호치민 전체 아닌 두 District에서 시작
4. **모든 모듈에 GP 보상**: 침수 신고 → GP 10, 정비소 리뷰 → GP 20 등 (라이딩 외 GP 적립 통로)

---

## 2. 모듈 1: 날씨 + 비 레이더 🌧

### 2.1 핵심 가치 제안

"**지금 출발해도 비 안 맞을까요?**" — 베트남 라이더가 매일 출발 전 묻는 질문.

호치민 우기 5-10월에는 폭우가 갑자기 옴. 한 시간에 District 4 정도 작은 면적만 집중적으로 폭우 → Google Maps 일반 날씨로는 의사결정 불가능.

### 2.2 사용자 행동

```
앱 열기 (출발 직전)
   ↓
홈 상단에 자동 표시:
┌──────────────────────────────────────────┐
│  📍 District 1, Quận 1, 14:32           │
│  ☀️  지금 32°C, 안 옴                    │
│  ⛈  1시간 후: District 4 비 80%         │
│                                          │
│  💡 추천: 14:30 출발하면 비 피함          │
│  [📍 경로 비 예측 보기]                  │
└──────────────────────────────────────────┘
```

### 2.3 데이터 소스

| 소스 | 무료 | 사용처 |
|---|---|---|
| **OpenWeather API** | ✅ Free 60 calls/min | 현재 + 7일 예보 |
| **RainViewer API** | ✅ 무료 | 실시간 비 레이더 (5분 단위) |
| **Open-Meteo** (백업) | ✅ 완전 무료 | OpenWeather 장애 시 |

베트남에서 모든 무료 quota 안에서 충분히 운영 가능.

### 2.4 데이터 모델 (PostgreSQL)

```sql
-- 캐시 테이블 (외부 API 비용 절감)
CREATE TABLE weather_cache (
  cache_id BIGSERIAL PRIMARY KEY,
  district_code VARCHAR(20) NOT NULL,
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  weather_type VARCHAR(20) NOT NULL, -- 'current', 'forecast_1h', 'forecast_24h'
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (district_code, weather_type)
);
CREATE INDEX idx_weather_cache_district ON weather_cache(district_code, weather_type);
CREATE INDEX idx_weather_cache_expires ON weather_cache(expires_at);

-- 사용자 위치 권한 + 자주 가는 곳
CREATE TABLE user_favorite_location (
  user_id BIGINT REFERENCES sre_user(user_id),
  label VARCHAR(50) NOT NULL,   -- '집', '회사', '카페'
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  notify_rain BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, label)
);
```

### 2.5 캐싱 전략 (비용 0원 유지)

```
요청: GET /info/weather?lat=10.776&lng=106.700
   ↓
PostgreSQL weather_cache 조회 (district 그리드 1km 단위)
   ↓
캐시 hit (expires_at > NOW)? 
   ├─ YES → 즉시 반환 (DB만)
   └─ NO → OpenWeather API 호출 → 캐시 갱신 → 반환

캐시 TTL:
- 현재 날씨: 10분
- 1시간 예보: 30분
- 24시간 예보: 1시간
```

District별 그리드로 묶으면 1,000 사용자가 호치민에 있어도 OpenWeather 호출은 시간당 20-30회 수준 (60/min free quota 안에 충분).

### 2.6 API 엔드포인트

```
GET /api/bff/info/weather
  Query: lat, lng (필수)
  Returns: {
    location: { district, ward },
    current: { temp_c, condition, rain_prob, humidity, wind_kmh },
    forecast: {
      next_1h: [{ time, temp, rain_prob, condition }],
      next_24h: [...]
    },
    recommendation: "지금 출발 시 비 안 맞음" | "14:30 후 출발 추천" | ...
  }

GET /api/bff/info/weather/rain-radar
  Query: lat, lng, zoom
  Returns: {
    tile_url: "https://tilecache.rainviewer.com/v2/radar/...",
    last_updated: timestamp
  }

POST /api/bff/info/weather/notify-rain
  Body: { lat, lng, label }
  → 비 올 때 푸시 알림 등록
```

### 2.7 화면 (INFO-WEATHER)

홈 화면 상단에 카드 형태 + 탭하면 전체 화면 비 레이더 + 24시간 예보.

(상세 디자인은 Skywork v6 프롬프트에서)

### 2.8 사용자 행동 보상

| 행동 | GP 보상 |
|---|---|
| 매일 날씨 첫 조회 | +2 GP (일일 1회) |
| 즐겨찾기 위치 등록 | +5 GP (총 3회까지) |
| 비 알림 ON | +3 GP (1회) |

---

## 3. 모듈 2: 침수 신고 + 지도 🌊

### 3.1 핵심 가치 제안

호치민 우기 평일 저녁 = District 4, 7, Bình Thạnh, Thủ Đức 어딘가 잠겨있음. **사용자가 출발 전 1초만 확인하면 30분-1시간 절약**.

지금까지 어디 잠겼는지 알 방법은:
- Facebook 그룹 글 (스크롤 필요)
- Zalo 동네 단톡 (가입돼야 함)
- 직접 가서 보기

우리가 시스템화하면 호치민 라이더 첫 켜는 앱이 됨.

### 3.2 사용자 행동

```
케이스 1: 출발 전 확인
   앱 켜기 → 홈에 표시:
   "🌊 지금 침수 중 (2건)"
   "⚠️ Bình Thạnh - Xô Viết Nghệ Tĩnh - 무릎 (30분 전)"
   "⚠️ District 4 - Đoàn Văn Bơ - 발목 (1시간 전)"
   "✓ Phú Nhuận 침수 30분 전 해소"
   [지도에서 보기]

케이스 2: 직접 신고
   라이딩 중 침수 마주침 → 정지 → 앱 켜기 → "+ 침수 신고"
   ┌─ 1탭 신고 ──────────────┐
   │ 위치: 자동 GPS          │
   │ 깊이: [발목 / 무릎 / 허벅지 / 위] │
   │ 사진: 옵션              │
   │ [신고하기]              │
   └─────────────────────────┘
   → +10 GP 즉시 적립
   → 다른 사용자 확인 시 +5 GP 추가
```

### 3.3 데이터 소스

| 소스 | 비율 | 비고 |
|---|---|---|
| **사용자 신고 (UGC)** | 60% | 1탭 신고 메커니즘 |
| **호치민 시 공식 침수 통계** | 30% | 일배치 (공개 데이터) |
| **OpenWeather 강수량 + 우리 침수 이력 예측** | 10% | ML 모델 (Phase 2) |

### 3.4 데이터 모델

```sql
-- 침수 신고
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
  resolved_at TIMESTAMPTZ,                -- 해소된 시각 (다른 사용자가 "해소됨" 표시)
  confidence_score INT DEFAULT 1,         -- 다른 사용자 확인 수
  status VARCHAR(20) DEFAULT 'ACTIVE',    -- ACTIVE / RESOLVED / EXPIRED
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '6 hours'),
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ) STORED
);
CREATE INDEX idx_flood_active ON flood_report(status, expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_flood_geom ON flood_report USING GIST(geom);

-- 침수 확인 (다른 사용자가 "맞아요" 또는 "해소됨" 표시)
CREATE TABLE flood_confirmation (
  confirmation_id BIGSERIAL PRIMARY KEY,
  report_id BIGINT REFERENCES flood_report(report_id),
  user_id BIGINT REFERENCES sre_user(user_id),
  confirmation_type VARCHAR(20) NOT NULL,  -- 'still_flooded' / 'resolved' / 'false'
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, user_id)
);
CREATE INDEX idx_confirm_report ON flood_confirmation(report_id);

-- 침수 다발 구역 통계 (집계 view, 일배치 갱신)
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
```

### 3.5 자동 만료 로직 (cron)

```
매 30분마다 실행:
  UPDATE flood_report
  SET status = 'EXPIRED'
  WHERE status = 'ACTIVE'
    AND reported_at < NOW() - INTERVAL '6 hours'
    AND NOT EXISTS (
      SELECT 1 FROM flood_confirmation
      WHERE report_id = flood_report.report_id
        AND confirmation_type = 'still_flooded'
        AND confirmed_at > NOW() - INTERVAL '2 hours'
    );
```

신고된 침수는 6시간 후 자동 만료. 단 누군가 "아직 잠겨있어요" 확인하면 2시간 연장.

### 3.6 API 엔드포인트

```
GET /api/bff/info/flood/active
  Query: lat, lng, radius_km (default: 5)
  Returns: {
    floods: [{
      report_id, district, street_name,
      depth_level, photo_url,
      reported_at, time_ago: "30분 전",
      confidence_score, lat, lng,
      distance_km: 1.2
    }]
  }

POST /api/bff/info/flood/report
  Body: { lat, lng, depth_level, photo_url? }
  → 신고 + GP 10 적립 + 어뷰징 검증
  Returns: { report_id, gp_earned: 10 }

POST /api/bff/info/flood/confirm/:report_id
  Body: { confirmation_type: 'still_flooded' | 'resolved' | 'false' }
  → 확인 + GP 5 적립 (still_flooded 또는 resolved만)
  Returns: { confirmed, gp_earned: 5 | 0 }

GET /api/bff/info/flood/hotspots
  Query: district_code?
  Returns: { hotspots: [...] } -- 최근 30일 침수 다발 구역
```

### 3.7 어뷰징 가드레일

| 리스크 | 대응 |
|---|---|
| 가짜 신고 폭주 | 동일 사용자 일일 신고 5건 상한 |
| 같은 위치 중복 신고 | 100m 반경 30분 이내 동일 사용자 차단 |
| 침수 안 났는데 GP 노리기 | 사진 첨부 시 GP +5 추가 (가짜 사진 검증은 Phase 2) |
| 신고 후 confirmation 어뷰징 | 신고자 본인 confirmation 불가 (다른 사용자만) |
| 다계정 farm | 1 IP/디바이스에서 다중 신고 차단 |

### 3.8 사용자 행동 보상

| 행동 | GP 보상 |
|---|---|
| 침수 신고 (텍스트) | +10 GP |
| 침수 신고 (사진 첨부) | +15 GP |
| 다른 사용자 신고 확인 ("맞아요") | +5 GP |
| "해소됨" 표시 (정확하면) | +5 GP |
| 7일 누적 신고 5건 이상 | 미션 보상 (배지 + 시즌 SXP) |

---

## 4. 모듈 3: 주유소 + 가격 ⛽

### 4.1 핵심 가치 제안

베트남 휘발유 가격은 정부가 2주마다 조정. 호치민에 약 800개 주유소 (OSM 데이터). 가격은 비슷하지만:
- **줄 서는 정도**가 다름 (출퇴근 시간대 격차)
- **위치**가 라이딩 동선에 따라 효율 다름

"가까운 주유소 + 대기 시간 + 가격"을 1초에 보여주는 앱이 없음.

### 4.2 사용자 행동

```
홈에서 "⛽ 가까운 주유소" 탭
   ↓
┌─────────────────────────────────────┐
│  📍 District 1 기준 가까운 주유소    │
├─────────────────────────────────────┤
│  Petrolimex - Trần Hưng Đạo         │
│  💧 RON 95 · 25,420 VND/L           │
│  ⏱  대기 5분 (2건 신고, 10분 전)    │
│  🚹 1.2km · [경로 보기]              │
├─────────────────────────────────────┤
│  PV Oil - Lê Lai                    │
│  💧 RON 95 · 25,380 VND/L  💰 저렴   │
│  ⏱  대기 없음 (15분 전)             │
│  🚹 1.8km                            │
├─────────────────────────────────────┤
│  Petrolimex - Nguyễn Trãi           │
│  💧 RON 95 · 25,420 VND/L           │
│  ⏱  대기 정보 없음                  │
│  🚹 2.3km                            │
└─────────────────────────────────────┘

[+ 주유 끝났어요 신고 (5초 / 줄 없음 / 5분 / 10분+)]
```

### 4.3 데이터 소스

| 소스 | 비율 |
|---|---|
| **OSM (위치 + 브랜드)** | 100% 위치 정보 |
| **베트남 산업통상부 공식 가격** | 100% 가격 (2주 단위 자동 갱신) |
| **사용자 신고 (대기 시간)** | 100% 대기 시간 |

### 4.4 데이터 모델

```sql
-- OSM에서 import한 주유소 (Phase 1 운영팀이 1회 import)
CREATE TABLE gas_station (
  station_id BIGSERIAL PRIMARY KEY,
  osm_id VARCHAR(50) UNIQUE,
  brand VARCHAR(50),                    -- 'Petrolimex', 'PV Oil', 'Saigon Petro' 등
  name VARCHAR(200),
  lat DECIMAL(10, 7) NOT NULL,
  lng DECIMAL(10, 7) NOT NULL,
  district_code VARCHAR(20),
  street_name VARCHAR(200),
  opening_hours VARCHAR(100),           -- '24/7' 또는 '06:00-22:00'
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gas_geom ON gas_station USING GIST(geom);

-- 휘발유 종류별 가격 (정부 공시, 2주 단위)
CREATE TABLE fuel_price_official (
  price_id BIGSERIAL PRIMARY KEY,
  fuel_type VARCHAR(20) NOT NULL,       -- 'RON95', 'RON92', 'DO'
  price_vnd INT NOT NULL,
  effective_from DATE NOT NULL,
  effective_until DATE,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자 대기 시간 신고
CREATE TABLE gas_station_wait_report (
  wait_id BIGSERIAL PRIMARY KEY,
  station_id BIGINT REFERENCES gas_station(station_id),
  reporter_user_id BIGINT REFERENCES sre_user(user_id),
  wait_minutes INT NOT NULL CHECK (wait_minutes >= 0),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 minutes')
);
CREATE INDEX idx_wait_station_recent ON gas_station_wait_report(station_id, reported_at DESC);
```

### 4.5 대기 시간 표시 로직

```python
def get_wait_time(station_id):
    # 최근 90분 이내 신고 평균
    recent_reports = query(
        SELECT wait_minutes
        FROM gas_station_wait_report
        WHERE station_id = ? AND reported_at > NOW() - INTERVAL '90 minutes'
        ORDER BY reported_at DESC
        LIMIT 5
    )
    
    if len(recent_reports) == 0:
        return None  # "대기 정보 없음"
    
    avg = mean(recent_reports)
    confidence = len(recent_reports)
    
    return {
        'wait_minutes': round(avg),
        'confidence': 'high' if confidence >= 3 else 'low',
        'last_reported_minutes_ago': minutes_since(recent_reports[0].reported_at)
    }
```

### 4.6 API 엔드포인트

```
GET /api/bff/info/gas/nearby
  Query: lat, lng, radius_km (default: 5), fuel_type? (default: RON95)
  Returns: {
    stations: [{
      station_id, brand, name, address,
      distance_km, opening_hours,
      price: { fuel_type: 'RON95', price_vnd: 25420, official_since: '...' },
      wait: { minutes: 5, confidence: 'high', reported_minutes_ago: 10 } | null,
      lat, lng
    }],
    cheapest_nearby: station_id,
    no_wait_nearby: [station_id, ...]
  }

POST /api/bff/info/gas/wait-report
  Body: { station_id, wait_minutes }
  → 신고 + GP 3 적립
  Returns: { wait_id, gp_earned: 3 }

GET /api/bff/info/gas/prices
  Returns: 현재 공식 가격표 (RON95, RON92, DO 등)
```

### 4.7 운영팀 1회 작업: OSM 주유소 import

```bash
# Overpass API로 호치민 주유소 데이터 dump
curl -X POST "https://overpass-api.de/api/interpreter" \
  -d 'data=[out:json][timeout:60];area["name:en"="Ho Chi Minh City"];(node["amenity"="fuel"](area);way["amenity"="fuel"](area););out center;' \
  > hcm_gas_stations.json

# 약 800개 결과 → PostgreSQL import
python import_osm_gas.py hcm_gas_stations.json
```

소요: 2-3시간 (1회). 이후 분기마다 갱신.

### 4.8 사용자 행동 보상

| 행동 | GP 보상 |
|---|---|
| 주유 대기 시간 신고 | +3 GP |
| 주유소 정보 수정 (잘못된 위치 등) | +5 GP |
| 일일 첫 가격 조회 | +1 GP |

---

## 5. 모듈 4: 정비소 + 평점 🔧

### 5.1 핵심 가치 제안

호치민 라이더 평생 고민:
- "이 정비소 바가지 씌우는 거 아니야?"
- "엔진오일 교체 얼마 받아야 정상이야?"
- "내 차종(Wave 110) 잘 보는 곳 어디?"

베트남에 통합된 정비소 리뷰 플랫폼 없음. Google Maps에 일부 있지만 차 정비소와 섞여 있고 라이더 특화 X.

### 5.2 사용자 행동

```
케이스 1: 정비 검색
   "🔧 정비소" → 차종 선택 (Wave/SH/Exciter 등) → 작업 선택 (오일/타이어/체인/엔진)
   ↓
┌─────────────────────────────────────┐
│  🔧 SH 350i 엔진오일 교체 - 가까운 정비소  │
├─────────────────────────────────────┤
│  🥇 Honda Head 2S - Phú Nhuận       │
│      ⭐ 4.7 (87 리뷰)               │
│      💵 평균 250,000 VND             │
│      💬 "정직하고 빨라요"            │
│      💬 "Honda 정품 부품"            │
│      🚹 2.1km · [☎ 전화]             │
├─────────────────────────────────────┤
│  🥈 Hùng Auto Shop                  │
│      ⭐ 4.5 (43 리뷰)               │
│      💵 평균 180,000 VND  💰         │
│      💬 "가성비 좋아요"              │
│      🚹 1.4km                        │
├─────────────────────────────────────┤
│  ⚠️ Tâm Motor                       │
│      ⭐ 3.2 (12 리뷰)               │
│      💵 평균 350,000 VND             │
│      💬 "바가지" · "비싸요"          │
│      🚹 0.8km                        │
└─────────────────────────────────────┘

케이스 2: 정비 후 리뷰 작성
   "정비 받았어요" → 별점 + 작업 종류 + 받은 금액 + 한 줄
   → GP 20 적립 (즉시)
```

### 5.3 데이터 소스

| 소스 | 비율 |
|---|---|
| **OSM (위치 + 이름)** | 위치 100% |
| **운영팀 초기 시드 50개** | 첫 출시 시 리뷰 시드 |
| **사용자 리뷰 (UGC)** | 시간이 지나면서 100% |

### 5.4 데이터 모델

```sql
-- 정비소 (OSM + 사용자 추가)
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
  brand_focus VARCHAR(100),             -- 'Honda', 'Yamaha', 'All'
  is_verified BOOLEAN DEFAULT FALSE,    -- 운영팀 검증
  status VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE / CLOSED / DUPLICATE
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_repair_geom ON repair_shop USING GIST(geom);

-- 정비 작업 종류 (lookup)
CREATE TABLE repair_service_type (
  service_code VARCHAR(20) PRIMARY KEY,  -- 'OIL_CHANGE', 'TIRE', 'CHAIN', 'ENGINE'
  service_name_ko VARCHAR(100),
  service_name_vi VARCHAR(100),
  service_name_en VARCHAR(100),
  typical_duration_min INT
);

-- 정비 리뷰
CREATE TABLE repair_review (
  review_id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT REFERENCES repair_shop(shop_id),
  reviewer_user_id BIGINT REFERENCES sre_user(user_id),
  service_code VARCHAR(20) REFERENCES repair_service_type(service_code),
  motorcycle_model VARCHAR(100),         -- 'Honda SH 350i' 등 자유 텍스트
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

-- 정비소 평균 통계 (집계 view, 일배치 갱신)
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

-- 자주 리뷰되는 키워드 (자연어 처리 후, Phase 2)
CREATE TABLE repair_keyword (
  shop_id BIGINT REFERENCES repair_shop(shop_id),
  keyword VARCHAR(50),
  occurrences INT DEFAULT 1,
  sentiment VARCHAR(10),                 -- 'positive' / 'negative' / 'neutral'
  PRIMARY KEY (shop_id, keyword)
);
```

### 5.5 평균 가격 표시 로직

```python
def get_avg_price_by_service(shop_id, service_code):
    # 최근 1년 리뷰의 중앙값 (이상치 제거)
    return query(
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price_vnd)
        FROM repair_review
        WHERE shop_id = ? AND service_code = ?
          AND price_vnd IS NOT NULL
          AND reviewed_at > NOW() - INTERVAL '1 year'
          AND flagged = FALSE
    )
```

### 5.6 API 엔드포인트

```
GET /api/bff/info/repair/nearby
  Query: lat, lng, radius_km, service_code?, motorcycle_model?
  Returns: {
    shops: [{
      shop_id, name, address, distance_km,
      stats: { avg_rating, review_count, avg_price_for_service },
      keywords: [{ keyword: "정직", sentiment: "positive" }, ...],
      phone, opening_hours, lat, lng
    }]
  }

GET /api/bff/info/repair/:shop_id
  Returns: {
    shop: {...},
    recent_reviews: [...] (최근 10개),
    price_by_service: { OIL_CHANGE: 250000, TIRE: 350000, ... }
  }

POST /api/bff/info/repair/review
  Body: {
    shop_id, service_code, motorcycle_model,
    rating, price_vnd?, comment?, photo_url?, is_anonymous?
  }
  → 리뷰 + GP 20 적립
  Returns: { review_id, gp_earned: 20 }

POST /api/bff/info/repair/add-shop
  Body: { name, lat, lng, phone? }
  → 새 정비소 추가 (운영팀 검증 대기) + GP 30 적립
  Returns: { shop_id, status: 'PENDING_VERIFICATION' }
```

### 5.7 운영팀 시드 작업 (출시 전 2주)

```
목표: 출시 시 정비소 50개 + 리뷰 100개 시드

Day 1-3: OSM에서 호치민 정비소 import (자동, ~300개)
Day 4-10: 운영팀 3명이 District 1 + Bình Thạnh 정비소 50개 방문
   - 위치/전화/영업시간 검증
   - 운영팀 차종으로 실제 간단한 정비 받기 (오일 체크 등)
   - 리뷰 작성 (운영팀 본인 닉네임, 가짜 X)
Day 11-14: 100개 리뷰 채우기 (운영팀 + 베타 사용자)
```

예산: 운영팀 식비/기름값 ~$400-600

### 5.8 어뷰징 가드레일

| 리스크 | 대응 |
|---|---|
| 정비소 사장이 자기 가게 5점 도배 | IP/디바이스 중복 체크, 같은 사용자 같은 가게 1회만 |
| 경쟁 정비소가 1점 도배 | 신고 시스템 + 운영팀 검수 + 신뢰도 점수 |
| 가짜 리뷰 (정비 안 받고 작성) | 사진 첨부 시 GP +5, 리뷰 후 24시간 이내 GPS 매칭 검증 |
| 같은 차종 리뷰 0개 | 사용자가 "내 차종 리뷰 없음" 경고 표시 |

### 5.9 사용자 행동 보상

| 행동 | GP 보상 |
|---|---|
| 정비 리뷰 작성 | +20 GP |
| 사진 첨부 시 추가 | +5 GP |
| 가격 정보 포함 | +5 GP |
| 새 정비소 추가 (검증 통과) | +30 GP |
| 자기 리뷰 좋아요 받기 | +1 GP (10개까지) |

---

## 6. 화면 추가 사양

### 6.1 신규 화면 6개

| ID | 화면 | 우선순위 | 슬롯 |
|---|---|---|---|
| **INFO-HUB** | 정보 허브 (홈에 통합 또는 독립 탭) | 🔴 | 메인 |
| **INFO-WEATHER** | 비 레이더 + 24시간 예보 상세 | 🔴 | 모듈 1 |
| **INFO-FLOOD-MAP** | 침수 지도 + 활성 신고 목록 | 🔴 | 모듈 2 |
| **INFO-FLOOD-REPORT** | 침수 신고 폼 (1탭) | 🔴 | 모듈 2 |
| **INFO-GAS-LIST** | 주유소 리스트 + 가격 + 대기 | 🟠 | 모듈 3 |
| **INFO-REPAIR-LIST** | 정비소 리스트 + 평점 | 🟠 | 모듈 4 |
| **INFO-REPAIR-DETAIL** | 정비소 상세 + 리뷰 | 🟠 | 모듈 4 |
| **INFO-REPAIR-WRITE** | 리뷰 작성 폼 | 🟠 | 모듈 4 |

### 6.2 기존 화면에 미치는 영향

| 기존 화면 | 변경 |
|---|---|
| **HOME-001** | 상단에 INFO 카드 4개 추가 (날씨 / 침수 / 주유 / 정비) |
| **하단 탭바** | 메인 탭에 "정보" 추가 또는 홈에서 진입 (디자이너 결정) |
| **RIDE-ACTIVE** | 라이딩 중 침수 신호 표시 + 1탭 신고 버튼 |

상세 디자인은 **Skywork 프롬프트 v6**에서 발주.

---

## 7. 데이터 시드 + 콜드 스타트 해결

### 7.1 출시 전 시드 작업 (4주)

```
Week -4 (출시 4주 전):
  - OSM 데이터 import (주유소 800, 정비소 300, 카페 6,000)
  - 운영팀 3명 채용 또는 배정
  - 베타 라이더 100명 페이스북 그룹 모집 시작

Week -3:
  - 운영팀 매일 호치민 라이딩 (각 30km)
  - 정비소 50개 방문 + 리뷰 작성 (시드 50개)
  - 침수 위치 매핑 (과거 1년 데이터 입력)

Week -2:
  - 베타 라이더 100명 클로즈드 베타 시작
  - 정비소 50개 추가 리뷰 (시드 100개)
  - 침수 신고 시스템 검증

Week -1:
  - 인플루언서 라이더 5명 영입 시작 (가능하면)
  - 출시 준비 + 마지막 시드
```

### 7.2 출시일 시드 상태 목표

| 데이터 | 출시일 목표 |
|---|---|
| 등록 라이더 (베타 + 운영팀) | 100+ 명 |
| 누적 라이딩 기록 | 500건 (호치민 1,500km) |
| 정비소 등록 | 350개 (OSM 300 + 운영 50 추가) |
| 정비소 리뷰 | 100개 |
| 주유소 등록 | 800개 (OSM) |
| 침수 hotspot 통계 | 호치민 1년치 |
| 클럽 (지역별) | District 1, Bình Thạnh 시드 클럽 5개 |

### 7.3 시드 비용

| 항목 | 비용 |
|---|---|
| 운영팀 3명 × 4주 시드 라이딩 (식비/기름) | $400-600 |
| 정비소 50곳 실제 정비 (시드 리뷰) | $300-500 (운영팀 차종으로 가벼운 정비) |
| 인플루언서 영입 (무료 프리미엄 제공 시 자본 0) | $0 (가치 교환) |
| 페이스북 베타 라이더 모집 광고 | $100-200 (선택) |
| **총 시드 비용** | **$800-1,300** |

---

## 8. KPI + 성공 지표

### 8.1 정보 모듈 KPI (출시 후 3개월)

| 지표 | 목표 |
|---|---|
| INFO-HUB 일일 방문률 | 70%+ (전체 WAU 중) |
| 침수 신고 일일 건수 (우기) | 20+ 건 |
| 정비소 리뷰 누적 | 500개 (3개월 누적) |
| 주유소 대기 신고 일일 | 10+ 건 |
| 정보 모듈 GP 적립 비율 | 전체 GP의 30%+ |

### 8.2 리텐션 KPI

| 지표 | 정보 모듈 X | 정보 모듈 O |
|---|---|---|
| D1 리텐션 | 30% (베트남 평균) | **45%+** |
| D7 리텐션 | 10% | **20%+** |
| D30 리텐션 | 5% | **10%+** |

→ 정보 모듈은 **리텐션을 약 2배** 끌어올리는 것이 목표. 출시 후 데이터로 검증.

---

## 9. 백엔드 변경 사항 정리

### 9.1 신규 테이블 (총 7개)

```
weather_cache              -- 외부 API 캐시
user_favorite_location     -- 즐겨찾는 위치
flood_report              -- 침수 신고
flood_confirmation        -- 침수 확인
flood_hotspot_stats       -- 침수 다발 통계
gas_station               -- 주유소 마스터 (OSM)
fuel_price_official       -- 정부 공식 가격
gas_station_wait_report   -- 대기 시간 신고
repair_shop               -- 정비소 마스터
repair_service_type       -- 작업 종류 lookup
repair_review             -- 정비 리뷰
repair_shop_stats         -- 정비소 통계 (materialized view)
```

### 9.2 신규 FastAPI 라우터 (1개)

```
backend/routers/info.py
  ├── /weather/*
  ├── /flood/*
  ├── /gas/*
  └── /repair/*
```

### 9.3 SRE Engine 통합 (기존 활용)

```
정보 모듈 → SRE Engine
  ↓
"INFO_FLOOD_REPORT" 액션 → +10 GP
"INFO_FLOOD_CONFIRM" 액션 → +5 GP
"INFO_GAS_WAIT_REPORT" 액션 → +3 GP
"INFO_REPAIR_REVIEW" 액션 → +20 GP
... 등 액션 정의 추가
```

기존 SRE의 `action_definition` 테이블에 INFO_* 액션 8-10개 추가만 하면 됨. 디스패처 로직 변경 0.

### 9.4 외부 API 키 발급

| API | 가입 | 비용 |
|---|---|---|
| OpenWeather | https://openweathermap.org/api | Free (60/min) |
| RainViewer | https://www.rainviewer.com/api.html | Free |
| Open-Meteo (백업) | https://open-meteo.com | Free |

모두 API 키 발급 후 환경변수 설정만 하면 됨.

---

## 10. 개발 일정 (4-6주)

```
Week 1:  외부 API 통합 (날씨 + 비 레이더)
         WeatherCache 테이블 + 캐싱 로직
         INFO-WEATHER 화면 구현

Week 2:  침수 신고 시스템
         flood_report 테이블 + 1탭 신고 폼
         지도 통합 (Leaflet 또는 Mapbox)
         INFO-FLOOD-MAP 화면 구현

Week 3:  OSM 주유소 import
         가격 API + 대기 시간 신고
         INFO-GAS-LIST 화면 구현

Week 4:  OSM 정비소 import
         리뷰 시스템 + 평점
         INFO-REPAIR-LIST + DETAIL 화면 구현

Week 5:  INFO-HUB (메인 통합)
         홈 화면 카드 통합
         어뷰징 가드레일 + 운영자 도구

Week 6:  운영팀 시드 콘텐츠 + 베타 테스트
         최종 폴리시 + 출시 준비
```

병렬 진행 시 **4주 단축 가능** (개발자 2명).

---

## 11. 출시 후 Phase 2 확장

| 모듈 | 시점 | 비고 |
|---|---|---|
| 🛣 **인기 코스 자동 추출** | WAU 500+ 시 | 사용자 GPS 데이터 누적 후 |
| 🗓 **음력 + 라이딩 운세** | 출시 3개월 후 | 베트남 정서 강화 |
| 🚨 **도난 신고 보드** | WAU 1,000+ 시 | 법적 검토 후 |
| 🚓 **단속 정보 (간접 표현)** | 법적 검토 완료 후 | "주의 구역" 라벨링 |
| 🏫 **시간대별 주의 구역** | Phase 2 후반 | 학교 하교 / 톨게이트 등 |

---

## 12. 핵심 의사결정 요약

| 항목 | 결정 |
|---|---|
| **첫 출시 모듈** | 4개 (날씨/침수/주유소/정비소) |
| **외부 API** | OpenWeather + RainViewer + OSM (모두 무료) |
| **위치 데이터** | OSM dump 1회 import + 운영팀 검증 |
| **콜드 스타트** | 운영팀 4주 시드 (라이딩 + 정비소 리뷰) + 베타 100명 |
| **District 집중** | District 1 + Bình Thạnh 우선 |
| **GP 보상** | 모든 모듈에 GP 적립 통로 (라이딩 외 통화 적립) |
| **백엔드 변경** | 신규 테이블 12개 + 라우터 1개 (FastAPI) |
| **개발 기간** | 4-6주 (병렬 시 4주) |
| **시드 비용** | $800-1,300 |
| **외부 API 비용** | $0 (무료 quota 안에서 운영) |

---

## 13. 한 줄 정리

**"호치민 라이더가 매일 켜는 4가지 정보 (비/침수/주유/정비)를 OSM + 무료 API + 사용자 신고로 무비용 운영. 운영팀 4주 시드로 출시일 350개 정비소 + 800개 주유소 + 100개 리뷰 + 호치민 1년 침수 데이터 확보. 정보 모듈이 메인, RPG는 뒤따라옴."**

이것이 베트남에서 진짜 매일 켜는 앱이 되는 길입니다.

---

(끝)
