# 유가 정보 표출 — 데이터 파이프라인 + UI

> **상태**: 📋 PLAN ONLY (지도 컴포넌트 완성 대기 중)
> **착수일**: 2026-05-27
> **원본 지시서**: [`docs/fuel-price-instructions.md`](../../../docs/fuel-price-instructions.md)
> **참고 현황**: [`ai-docs/context/current.md`](../../context/current.md) — 정보 모듈 Phase 3 (주유소) ✅ DONE
> **블로커**: `frontend/src/components/maps/SaigonWardMap.tsx` 본체 미완성 (별도 작업 진행 중)

---

## 1. 의사결정 기록 (Karpathy 1원칙)

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| D1 | 스키마 통합 | `fuel_price_official`(035) 폐기 → `fuel_price_snapshot` 신규 | 지시서 §3.1 그대로. brand/region/source 분리 필요. crowdsourcing 은 별도 테이블 `fuel_price_report` 로 보존 |
| D2 | 라이더 제보 | `fuel_price_report` 스키마는 v1에 포함, 로직은 v2 | 지시서 §3.1 + 사용자 명시: "제보는 살려야 한다" |
| D3 | 파일 위치 | `backend/scrapers/` → `backend/app/scrapers/`, `backend/jobs/` → `backend/app/jobs/` | 프로젝트 컨벤션 (라우터/모델 모두 `backend/app/` 산하) |
| D4 | BFF vs Engine | **BFF 측 단독 처리** | `gas_station`/`fuel_price_*` 가 BFF 도메인 (`backend/app/models.py` + `database/init/035`). CLAUDE.md "BFF→Engine DB 직접 접근 금지" 제약과 무관 |
| D5 | 마이그 번호 | `042_fuel_price_v2.sql` | 040, 041 이미 존재 |
| D6 | 스케줄러 | APScheduler in-process | 지시서 옵션 A. Engine 측에 이미 APScheduler 사용 사례 있음 (퀘스트 만료 배치) |
| D7 | 지도 통합 (Phase 5) | **대기** — 지도 컴포넌트(`SaigonWardMap.tsx`) 완성 후 재개 | 사용자 명시 |
| D8 | 기존 `/info/gas/nearby` 라우터 | 신규 엔드포인트 추가, 기존은 점진 마이그 | Karpathy 3원칙 (surgical change) — 시그니처 변경 회피 |
| D9 | **외부 스크래핑 실패** (2026-05-27 Phase 2 검증) — Petrolimex 가격은 보도자료 이미지로 노출 / VNExpress tag 페이지는 일반 뉴스 / PVOil 403 WAF | **운영자 수동 입력 1차 운영** + 자동 수집은 v1.1 R&D 이월 | 사용자 결정. 스크래퍼 인터페이스는 완성, fetch() 본문은 스텁(빈 리스트). Phase 3 에 admin 수동 입력 엔드포인트 신규 추가. Phase 4 의 cron 은 스텁 fetch_cycle + 로그만 |

---

## 2. 현재 코드 ↔ 지시서 매핑

| 지시서 경로 | 실제 배치 |
|---|---|
| `backend/scrapers/*` | `backend/app/scrapers/*` |
| `backend/services/fuel_price_service.py` | `backend/app/services/fuel_price_service.py` |
| `backend/services/redis_cache.py` | `backend/app/services/redis_cache.py` |
| `backend/jobs/fetch_fuel_prices.py` | `backend/app/jobs/fetch_fuel_prices.py` |
| `backend/routers/info_gas.py` | `backend/app/routers/info_gas.py` (이미 존재, 확장) |
| `backend/migrations/202605xx_fuel_price_v2.sql` | `database/init/042_fuel_price_v2.sql` |
| `backend/routers/admin_fuel_price.py` | `backend/app/routers/admin.py` 내 섹션 추가 (기존 admin 통합) |
| `frontend/src/components/gas/*` | 동일 |
| `frontend/src/pages/info/InfoGasList.tsx` | 이미 존재, 확장 |

---

## 3. Phase 별 진행 계획 + 검증 기준

> Karpathy 4원칙 (goal-driven). 각 phase 의 검증 기준이 명확하지 않으면 phase 분해.
> [[feedback_report_first]]: phase 마다 IN_PROGRESS 보고 → 검증 → DONE.

### Phase 0 — 사전 작업 (30분) — 의존성 단독 확인

- [ ] `backend/requirements.txt` 에 `beautifulsoup4>=4.12`, `lxml>=4.9`, `tenacity>=8.2`, `apscheduler>=3.10`, `redis[hiredis]>=5.0` 추가
- [ ] BFF 컨테이너 재빌드 후 import 검증 (`python -c "import bs4, lxml, tenacity, apscheduler, redis"`)
- [ ] `.env` / `.env.example` 의 `REDIS_URL` 키셋 동일 확인 (이미 양쪽 있음)
- [ ] BFF 컨테이너에서 `petrolimex.com.vn`, `pvoil.com.vn`, `vnexpress.net/gia-xang-dau` 도달성 확인 (`curl -I`)

**검증**: BFF 컨테이너 부팅 + 모듈 import 성공 + 3개 소스 HTTP 200.

### Phase 1 — DB 스키마 (2-3h)

- [ ] `database/init/042_fuel_price_v2.sql` 작성:
  - `fuel_price_snapshot` 신규
  - `gas_station` ALTER: `source_type`, `external_id`, `is_24h`, `verified_at`, `brand_normalized` ADD
  - `gas_station.brand` → `brand_normalized` 정규화 백필 (`PETROLIMEX`/`PVOIL`/`SAIGON_PETRO`/`MIPEC`/`COMECO`/`UNKNOWN`)
  - `fuel_price_report` 신규 (v1: 스키마만, 로직 v2)
  - `fuel_price_fetch_log` 신규
  - **`fuel_price_official` DROP** (단, 042 안에 데이터 백필 SQL 동봉: 마지막 가격을 `fuel_price_snapshot` 으로 migrate, brand='MARKET_AVG')
- [ ] `backend/app/models.py` 에 SQLAlchemy 모델 추가: `FuelPriceSnapshot`, `FuelPriceReport`, `FuelPriceFetchLog`. `GasStation` 모델에 신규 컬럼 추가
- [ ] `backend/app/routers/info_gas.py:85` 의 `fuel_price_official` 참조 제거 / `fuel_price_snapshot` 으로 교체

**검증**: 마이그 적용 후 `\d fuel_price_snapshot` + `gas_station.brand_normalized` 분포 SELECT + 기존 `/info/gas/nearby` 응답 200 유지.

### Phase 2 — 스크래퍼 (1-2일)

- [ ] `backend/app/scrapers/__init__.py`
- [ ] `backend/app/scrapers/base_scraper.py` — `BaseFuelScraper` + `FuelPriceRecord` (지시서 §4.1 그대로, naive datetime 대신 **timezone-aware** 사용 → CLAUDE.md 핵심 제약: BFF 도 동일 룰 따름)
- [ ] `backend/app/scrapers/petrolimex_scraper.py` (지시서 §4.2)
- [ ] `backend/app/scrapers/vnexpress_scraper.py` (지시서 §4.3)
- [ ] `backend/app/scrapers/pvoil_scraper.py` — 실제 사이트 DOM 확인 후 selector fine-tune (지시서 §4.4 가 pass 처리)
- [ ] `backend/app/scrapers/price_validator.py` — 3-way validation (지시서 §4.5)
- [ ] 각 스크래퍼 단위 호출 스크립트 (`python -m app.scrapers.petrolimex_scraper`) → records 출력

**검증**: 3개 스크래퍼 모두 `len(records) >= 1` 반환. validator 가 trusted/disagree 분류 정상.

### Phase 3 — 서비스 + 캐시 + API (4-6h)

- [ ] `backend/app/services/redis_cache.py` (지시서 §5.1) — 기존 Redis Streams 클라이언트와 키 prefix 충돌 회피 (`saigon:fuel:` 사용)
- [ ] `backend/app/services/fuel_price_service.py` (지시서 §5.2)
- [ ] `backend/app/routers/info_gas.py` 에 신규 엔드포인트 **추가** (기존은 유지):
  - `GET /info/gas/today-prices`
  - `GET /info/gas/stations/nearby-v2` (기존 `/nearby` 와 공존, v2 응답 형식)
  - `GET /info/gas/station/{station_id}`
- [ ] 응답 스키마 Pydantic 정의 (`reference_price`, `updated_at`, `source` 노출 필수 — "오늘의 참고가" 카피)

**검증**: `curl /api/bff/info/gas/today-prices | jq` → brand×fuel_type 매트릭스 + `updated_at`. Swagger UI 200.

### Phase 4 — Cron (3-4h)

- [ ] `backend/app/jobs/__init__.py`
- [ ] `backend/app/jobs/fetch_fuel_prices.py` — `run_fetch_cycle()` (지시서 §6.1, asyncio.gather 패턴 + safe_fetch)
- [ ] `backend/app/main.py` 에 APScheduler startup hook 추가 (timezone=`Asia/Ho_Chi_Minh`, cron 04:00 / 15:30 / 22:30 / 23:30)
- [ ] 운영자 수동 트리거 엔드포인트 `POST /admin/fuel-price/refresh` (이미 admin.py 있으니 섹션 추가)

**검증**: 수동 1회 실행 → `fuel_price_snapshot` insert + `fuel_price_fetch_log` SUCCESS + Redis 키 set. `cache_invalidate` 후 재조회 시 갱신 반영.

### Phase 5 — Frontend (1-2일) — **부분 진행 가능 / 지도 통합은 D7 블로커**

5.A — 지도 비의존 (지금 진행 가능)
- [ ] `frontend/src/components/gas/gas-tokens.ts` — 브랜드 토큰 + `formatPriceShort`/`formatPriceFull` (지시서 §7.1)
- [ ] `frontend/src/components/gas/GasStationSheet.tsx` + `.module.css` (지시서 §7.3) — "오늘의 참고가" 카피, 갱신 시각 노출
- [ ] `frontend/src/components/gas/FuelPriceCard.tsx` — `today-prices` 표시용 (브랜드 카드 N개)
- [ ] `frontend/src/api/info.ts` 에 `gasApi.getTodayPrices()`, `getStation()`, `getNearbyV2()` 추가
- [ ] i18n 키: ko/vi/en 에 "오늘의 참고가" / "Vùng 1 공식 참고가" / "{HH:MM} 갱신" 등 (사용자 노출 카피)
- [ ] `frontend/src/pages/info/InfoGasList.tsx` 리스트 부분만 v2 응답 형식 반영. 지도 부분 **TODO 주석으로 보류**

5.B — 지도 통합 (D7 블로커 해제 후)
- [ ] `frontend/src/components/gas/GasStationMarker.tsx` (지시서 §7.2)
- [ ] `SaigonWardMap.tsx` 의 marker type `'gas'` 분기에 `GasStationMarker` 연결 (해당 파일이 본 작업 외부에서 도착하면 통합)
- [ ] 줌 레벨 기반 `showPrice` 토글 정책 (Phase 6 정밀화)

**검증 (5.A)**: ESLint 통과 + `npm run build` 통과 + Storybook 또는 dev 서버에서 `GasStationSheet` 단독 렌더 (`stationId=1` mock).

### Phase 6 — 통합 검수 (1일) — Phase 5.B 완료 후

- [ ] 지시서 §8.1 데이터 파이프라인 검수 체크리스트
- [ ] 지시서 §8.2 프론트 시각 검수 (특히 "실시간가" 단어 부재, "오늘의 참고가" 카피 사용, 갱신 시각 노출)
- [ ] 지시서 §8.3 사고 시뮬레이션 (소스 1개 다운, 이상치)

---

## 4. 절대 규칙 (지시서 §0.2)

- ❌ "**실시간가**" 단어 금지 → ✅ "**오늘의 참고가**" / "**Vùng 1 공식 참고가**"
- ✅ 갱신 시각 (`HH:MM 갱신`) 항상 노출
- ✅ 천 단위 축약 (`21.5k` / `21,560 VND/L`)
- ✅ 브랜드 색 도트 (Petrolimex 파랑 `#003F87`, PVOil 주황 `#F36F21`)

## 5. v2 (이번 범위 밖, 지시서 §10)

라이더 제보 워크플로(`fuel_price_report` PENDING → ACCEPTED, 신뢰도 알고리즘, GP 보상, 라이더 검증 배지). v1 종료 후 D7 리텐션 검증 뒤 진입.

---

## 6. 진척 트래킹

| Phase | 상태 | 검증 결과 |
|---|---|---|
| 0 — 의존성 | ✅ DONE | bs4/lxml/tenacity/apscheduler/redis BFF 컨테이너 import OK. Petrolimex 200, VNExpress alt-URL 200, PVOil 403(WAF) |
| 1 — DB 스키마 | ✅ DONE | `042_fuel_price_v2.sql` 적용. `gas_station.brand_normalized` 759행 정규화 (PETROLIMEX 82 / PVOIL 28 / SAIGON_PETRO 11 / MIPEC 3 / COMECO 2 / UNKNOWN 633). `fuel_price_official` drop + 백필. 모델 갱신. CTE 교체 |
| 2 — 스크래퍼 | ✅ DONE (골격) | BaseFuelScraper + 3종 + 3-way validator 인터페이스 완성. **fetch() 본문은 스텁 (D9 R&D 이월)** — Petrolimex 가격이 이미지 / VNExpress 미가용 / PVOil WAF |
| 3 — 서비스+API | ✅ DONE | `services/redis_cache.py` + `fuel_price_service.py`. 신규 엔드포인트 3종 (today-prices / nearby-v2 / station/{id}) + **admin manual upsert** + admin refresh trigger. 실제 호출 검증 완료 |
| 4 — Cron | ✅ DONE | APScheduler in-process (Asia/Ho_Chi_Minh 04:00/15:30/22:30/23:30). 스텁 cycle → fetch_log FAILED + R&D pending 메시지 정상 |
| 5.A — 프론트(비지도) | ✅ DONE | `components/gas/` (tokens, Sheet, Marker) + `gasApi.getTodayPrices/getStation` + i18n ko/vi/en. InfoGasList 의 하드코딩 25420 제거, `priceBar` 가 today-prices API + updated_at 표출. 카드 탭 → Sheet |
| 5.B — 지도 통합 | ✅ DONE | SaigonWardMap 'gas' 분기에 brand 컬러 도트 + 24h 마커 + (옵션) 가격 라벨. `GasMarkerData` 인터페이스. InfoGasList 마커 데이터에 brand_code/ref_price 전달. 탭 핸들러 연결 |
| 6 — 통합 검수 | ✅ DONE | TS check / Vite build 통과. "실시간가" 단어 0건. "오늘의 참고가" / "Giá tham khảo hôm nay" / "Today's reference" 카피 ko/vi/en 정착. fuel_price_snapshot 4행 ACTIVE 검증 |

---

## 7. 다음 액션

1. 본 계획 사용자 승인.
2. 승인 시 `__DEV_features` / `__DEV_todos` 에 Feature + 메인/서브 Todo 등록 ([[feedback_report_first]]).
3. Phase 0 IN_PROGRESS 보고 → 의존성 추가 → 검증 → DONE.
4. Phase 5.B 차례에 사용자에게 `SaigonWardMap.tsx` 도착 여부 확인.
