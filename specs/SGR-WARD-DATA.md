# SGR-WARD-DATA — #8 위치 데이터 재설계: 신 phường 경계 소싱 스펙

> 우선순위: **P1 — 2025-07-01 시행 완료된 리스크. 현재 district 기반 데이터는 법적으로 무효.**
> 범위: 데이터 소싱 + DB 마이그레이션 + 백엔드 + 프론트 LocationPickerSheet
> 성격: 데이터 엔지니어링 선행 → 프론트/백 후속

---

## 배경: 무엇이 바뀌었나

베트남 행정 통폐합(결의 202/2025/QH15, 2025-07-01 시행):

| 이전 | 이후 |
|---|---|
| 성/시 → **군/구(district)** → 동/방(ward) 3계층 | 성/시 → **방(phường)/사(xã)/특구** 2계층 |
| HCMC: 22개 quận + 5개 huyện | HCMC + Bình Dương + Bà Rịa-Vũng Tàu → 신 HCMC, **168 코뮌급** (방 113 + 사 54 + 특구 1) |
| 전국 ~9,907 방/사 | 전국 ~3,300 방/사 (-2/3) |

**현재 앱의 문제**: `District`(quận/huyện 단위) 기반으로 설계. `api/master.ts`의 `fetchDistricts()`, `MarketMain`의 `resolveDistrict()`, `MarketCreate`의 `LocationPickerSheet`가 전부 **폐지된 행정 계층**을 사용.

---

## Phase 0 — 데이터 소싱 (착수 전 선행)

### 목표: 신 phường 경계 GeoJSON 확보

**소싱 우선순위:**

| 소스 | 비고 | URL |
|---|---|---|
| **1순위** HCMC 인민의회 결의 원문 | 방 목록·명칭 확정. 경계 GeoJSON은 별도 | 인민의회 공식 포털 |
| **2순위** GADM v4.1 (Vietnam Level 3) | 오픈 데이터, 방 폴리곤 포함. 2025 통폐합 반영 여부 확인 필요 | gadm.org/country/VNM |
| **3순위** OpenStreetMap admin_level=8 | osm2pgsql로 추출. 커뮤니티 반영 속도 빠름 | overpass-api.de |
| **4순위** VBDT(베트남 법령 데이터베이스) | 행정단위 코드 공식 테이블 | vbdt.moj.gov.vn |

**검증 기준:**
- HCMC 신 phường 수 = 113개 방 + 54개 사 + 1 특구 = 168 코뮌급
- 기존 "District 1, 3, 4…" 지명이 **없음** — 있으면 구버전

**소싱 산출물:** `ward_boundaries_hcmc_2025.geojson` (방 code, name_vi, name_en, 폴리곤)

---

## Phase 1 — DB 마이그레이션

### 현재 스키마

```sql
-- 현재 (district 기반)
districts (id, code, name_ko, name_vi, name_en, lat, lng, polygon)
listings.district_id → districts.id
```

### 신규 스키마

```sql
-- 신규 (ward 기반, district는 deprecated)
wards (
  id        SERIAL PRIMARY KEY,
  code      VARCHAR(32) UNIQUE NOT NULL,  -- 예: HCMC_WARD_BINH_THANH_01
  name_vi   VARCHAR(128) NOT NULL,
  name_en   VARCHAR(128) NOT NULL,
  name_ko   VARCHAR(128),
  city_code VARCHAR(32) NOT NULL,         -- 예: HCMC
  polygon   GEOMETRY(MULTIPOLYGON, 4326),
  lat       DOUBLE PRECISION,             -- 중심점
  lng       DOUBLE PRECISION,
  is_active BOOLEAN DEFAULT TRUE
)
```

**마이그레이션 전략 (무중단):**

```
1. wards 테이블 추가 (district는 유지)
2. listings에 ward_id 컬럼 추가 (nullable)
3. 기존 district_id → ward_id 매핑 (PostGIS ST_Within으로 일괄 변환)
4. ward_id NOT NULL 마이그레이션 후 district 컬럼 deprecated
```

> asyncpg 다중문장 마이그레이션 금지 규칙 준수 — 각 ALTER를 별도 `op.execute()`로 분리.

---

## Phase 2 — 백엔드

### `api/master.py` 신규 엔드포인트

```python
GET /master/wards?city=HCMC          # 도시별 전체 방 목록
GET /master/wards/resolve?lat=&lng=  # 좌표 → ward (PostGIS ST_Within)
```

### 기존 `resolveDistrict` 대체

프론트 `api/master.ts`의 `fetchDistricts()` → `fetchWards()` 로 교체.

### `schemas.py`

```python
class WardBrief(BaseModel):
    id: int
    code: str
    name_vi: str
    name_en: str
    name_ko: str | None
    city_code: str
    lat: float | None
    lng: float | None
```

---

## Phase 3 — 프론트엔드

### `api/master.ts`

```ts
export interface Ward {
  id: number;
  code: string;
  name_vi: string;
  name_en: string;
  name_ko: string | null;
  cityCode: string;
  lat: number | null;
  lng: number | null;
}

export async function fetchWards(city = 'HCMC'): Promise<Ward[]> {
  return api.realFetch<Ward[]>(`/master/wards?city=${city}`);
}

export async function resolveWard(lat: number, lng: number): Promise<Ward | null> {
  return api.realFetch<Ward | null>(`/master/wards/resolve?lat=${lat}&lng=${lng}`);
}
```

### `MarketMain.tsx` 변경

```ts
// Before
import { fetchDistricts, type District } from '@/api/master';
const [district, setDistrict] = useState<District | null>(null);
resolveDistrict(lat, lng, districts)

// After
import { fetchWards, resolveWard, type Ward } from '@/api/master';
const [ward, setWard] = useState<Ward | null>(null);
await resolveWard(lat, lng)
```

`fetchPage` 파라미터도 `districtId` → `wardId`로 교체.

### `LocationPickerSheet` (MarketCreate·약속)

- 선택 단위: **방(phường)** — 구(district) 드롭다운 제거
- 표시: `Phường Bình Thạnh`, `Quận/Huyện` 라벨 제거
- 검색: 방 이름 검색 (베트남어 diacritic 무시 검색 권장)

### `api/market.ts`

```ts
// ListingQuery
districtId?: number | null;  // deprecated — 제거 또는 유지(폴백)
wardId?: number | null;       // 추가
```

---

## 수용 기준 (Done)

- [ ] `wards` 테이블에 HCMC 168 코뮌급 데이터 적재 완료
- [ ] 좌표 → ward resolve가 PostGIS로 동작 (오토바이 현위치 기준)
- [ ] `MarketMain` 동네 표시가 방(phường) 단위로 표시됨 ("Phường Bình Thạnh" 등)
- [ ] `MarketCreate`의 장소 선택이 방 단위로 동작
- [ ] 기존 매물의 `ward_id` 역매핑 완료 (null 없음)
- [ ] district 기반 API 폴백 제거 또는 deprecated 표시
- [ ] 빌드·ESLint 통과

---

## 주의사항

1. **경계 데이터 정확도**: GADM/OSM은 커뮤니티 유지이므로 최신 통폐합 반영 여부 먼저 확인. 반영 안 돼 있으면 HCMC 인민의회 공식 좌표표를 수작업 입력.
2. **방 명칭 중복**: 신 HCMC 내 "Phường 1"이 여러 구에 중복 존재했음 — code 체계에 도시+구역 prefix 필수 (예: `HCMC_BT_P01`).
3. **단계적 배포**: Phase 0(데이터) → Phase 1(DB) → Phase 2(백엔드) → Phase 3(프론트) 순서 엄수. 프론트를 먼저 올리면 ward API가 없어 404 발생.
4. **기존 매물 district_id**: 폐지된 district라도 PostGIS로 역산하면 신 ward로 매핑 가능. 역매핑 배치 작업을 마이그레이션에 포함.
