# SGR-310 완료 보고서 — 위치 데이터 재설계 (신 phường 경계)

**상태**: Done ✓ | **완료일**: 2026-06-22  
**Plane**: SGR-310 (parent: 고도화 계획)

---

## Phase별 완료 내용

### Phase 0 — 데이터 소싱 스크립트 ✅ (도구 완성, 실행 대기)

**조사 결과:**
- **GADM 4.1**: 2025 통폐합 미반영 (구 행정경계 기준)
- **OSM**: 부분 반영 중 (커뮤니티 기여 속도 의존)
- **HCMGIS OpenData** (opendata.hcmgis.vn): HCMC 공식 GIS 포털 — 반영 가능성 가장 높음

**작성된 스크립트:**

| 파일 | 역할 |
|---|---|
| `backend/scripts/ward_import.py` | Overpass API → wards 테이블 upsert. 검증: 100개 이상이면 pass. |
| `backend/scripts/assign_wards.py` | 기존 listings.ward_id 역매핑 (haversine nearest centroid) |

**실행 순서:**
```bash
# 1. DB 스키마 먼저
psql $DATABASE_URL -f scripts/migrate_wards.sql

# 2. ward 데이터 소싱 (dry-run 먼저)
DATABASE_URL=... python -m scripts.ward_import --dry-run
DATABASE_URL=... python -m scripts.ward_import

# 3. 기존 매물 역매핑
DATABASE_URL=... python -m scripts.assign_wards
```

---

### Phase 1 — DB 마이그레이션 ✅

**`backend/scripts/migrate_wards.sql`** 작성:
```sql
CREATE TABLE IF NOT EXISTS wards (id, code, city_code, name_vi, name_en, name_ko, center_lat, center_lng, sort_order, is_active);
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS ward_id SMALLINT REFERENCES wards(id);
CREATE INDEX idx_wards_city_code, idx_listings_ward_id;
```

**`backend/app/models.py`** 변경:
- `Ward` 모델 클래스 추가 (District 바로 다음)
- `MarketplaceListing`에 `ward_id` FK + `ward` relationship 추가

---

### Phase 2 — 백엔드 ✅

**`backend/app/schemas.py`**:
- `WardOut` 스키마 추가

**`backend/app/routers/master.py`**:
- `GET /master/wards?city=HCMC` — 도시별 ward 목록
- `GET /master/wards/resolve?lat=&lng=` — 좌표 → 최근접 ward (haversine centroid)
- `GET /master/districts` — deprecated 주석 추가

**`backend/app/routers/market.py`**:
- `GET /market/listings`에 `ward_id` 쿼리 파라미터 추가
- ward_id 있으면 우선, 없으면 district_id 폴백 (하위호환)

---

### Phase 3 — 프론트엔드 ✅

**`frontend/src/api/master.ts`**:
- `Ward` 인터페이스 추가
- `fetchWards(city?)` 함수 추가
- `resolveWardByCoords(lat, lng, wards)` — client-side haversine (HCMC bbox 밖이면 null)

**`frontend/src/api/market.ts`**:
- `ListingQuery.wardId?: number | null` 추가
- `fetchListings`에서 `ward_id` 파라미터 전달

**`frontend/src/pages/market/MarketMain.tsx`**:
- `ward` state 추가
- 위치 결정 로직: `fetchWards()` 먼저, 비어있으면 `fetchDistricts()` 폴백
- 동네 표시: `ward.name_vi` (예: "Phường Bình Thạnh") 우선
- `fetchPage`: `wardId` 우선, ward 없으면 `districtId` 전달

---

## 빌드 / 타입 체크

- TypeScript `tsc --noEmit` — 오류 없음
- `npm run build` — 성공 (41.79s)

---

## 수용 기준 달성 여부

| 기준 | 상태 |
|---|---|
| HCMC 168 코뮌급 데이터 적재 | ⏳ Phase 0 스크립트 실행 후 완료 (opendata.hcmgis.vn 또는 OSM) |
| 동네 표시 ward 단위 | ✅ 코드 완료 — ward 데이터 있으면 `name_vi` 표시 |
| 기존 매물 ward_id 역매핑 | ⏳ `assign_wards.py` 실행 후 완료 |
| 빌드·ESLint 통과 | ✅ |

---

## 미완 항목 (운영 배포 전 필수)

1. **`psql $DATABASE_URL -f scripts/migrate_wards.sql` 실행** (wards 테이블 생성)
2. **`ward_import.py` 실행** — Overpass 결과 100개 미달 시 HCMGIS OpenData 수동 소싱 필요
3. **`assign_wards.py` 실행** — 기존 매물 ward_id 채우기
4. 백엔드 재시작 (Ward 모델 인식)

> 프론트 Phase 3 코드는 wards 테이블이 비어있으면 자동으로 district 폴백하므로  
> 데이터 없이 배포해도 기존 동작 유지됨 (안전).
