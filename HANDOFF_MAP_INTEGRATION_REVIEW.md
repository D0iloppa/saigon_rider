# HANDOFF — 지도 연동 서비스 문제점 및 수정 작업지시 (BFF)

> **작성 맥락**: BFF 진입점(`main.py`)부터 지도 연동 코드를 1줄씩 정독(주석이 아닌 구현)해
> **사용자 서비스 관점**의 문제점을 도출했다. 작성 2026-07-22.
> **대상 독자**: 타 PC의 Claude Code — 이 문서 하나만으로 이어서 수정에 착수할 수 있게 적었다.
> **원칙**: 각 항목은 `증상(사용자) → 위치(file:line) → 원인 → 수정방향 → 검증`으로 실행가능하게 적었다.
> 검증은 레포 카파시 4원칙(버그 수정 = 재현 테스트 작성 후 통과)을 따른다 — "고쳤다"가 아니라 "실측으로 확인"까지가 완료다.

---

## 0. 환경·재빌드 주의 (착수 전 반드시)
- 레포 원본은 **WSL `/mnt/c/DEV/saigon_rider`** 기준이다(codebase-memory 워크스페이스 `mnt-c-DEV-saigon_rider`, docker/pnpm 리눅스 전제). 지금 사본이 **Windows `C:\saigon_rider`** 라면 빌드·MCP·경로 정합부터 확인한다.
- BFF = `backend/`, Engine = `engine/`. 재빌드: `docker compose --env-file .env up --build -d bff` (상세 `ai-docs/agent-guidelines.md` §1). `worker`/`noti_worker` 는 자동 reload 없음 → 코드 수정 후 재시작.
- 지도 라우터는 `main.py` 에서 `/api` prefix 로 등록되고 nginx 가 외부 `/api/bff/*` → 내부 `/api/*` rewrite 한다.

## 1. 정독 완료 범위
`backend/app/main.py` · `engine_client.py` · `routers/map/{__init__,poi,place_suggestions,districts,_geo}.py` · `routers/info_route.py` · `info_gas.py` · `info_repair.py` · `info_weather.py` · `info_flood.py` · `jobs/predict_flood_risk.py`

## 2. 검증 완료 — 재조사 불필요 (설계 견고, 문제 아님)
착수자는 아래를 다시 파헤치지 말 것(토큰·시간 낭비 방지):
- **geom 자동생성 O**: `flood_report`·`gas_station`·`repair_shop`(`database/init/035_info_modules.sql`), `flood_risk_daily`(`054_flood_risk_daily.sql`) 모두 `geom GEOGRAPHY(POINT,4326) GENERATED ALWAYS AS (...) STORED` + GIST 인덱스. INSERT 에서 geom 생략은 정상이고 `ST_DWithin`/`ST_Distance` 공간쿼리가 인덱스를 탄다. → **risks/active/nearby 표시 정상.**
- **Poi.photo_content eager O**: `backend/app/models.py:639` `relationship("Content", ..., lazy="selectin")`. async 세션 N+1/`MissingGreenlet` 아님. → **POI 사진/조회 500 아님.**
- **districts.boundary 존재 O**: `database/init/036_district_geo.sql` 에 `GEOGRAPHY(POLYGON)` 시드 + `_geo.py` `ST_Covers` 타입 정합. 단 폴리곤이 4~10점 **근사치** → 정확도는 아래 [MAP-12].

---

## 3. 수정 작업 목록

### P0 — 사용자 신뢰 직결 (최우선)

#### [MAP-1] 날씨 API 장애를 가짜 데이터로 은폐
- **증상**: OpenWeather 실패/쿼터초과/키만료 시 사용자가 **가짜 날씨(항상 32도 흐림)·틀린 라이딩 추천**(실제 폭우인데 `CLEAR`)을 진짜로 본다. mock 이 캐시에 저장돼 API 복구 후에도 최대 1h(`WEATHER_CACHE_TTL_FORECAST_24H`) 지속.
- **위치**: `routers/info_weather.py` L67-83(`_MOCK_CURRENT/_MOCK_FORECAST`), L96·99·112·115(실패 시 mock 반환), L203·222(mock 을 `_upsert_cache` 로 저장).
- **원인**: fetch 실패를 정상 데이터처럼 취급 + 캐시 기록.
- **수정방향**: (a) 실패 시 mock 반환 금지 → 명시적 미가용 신호(`configured:false` 또는 HTTP 503) + 프론트 "날씨 일시 불가" 폴백. (b) mock/실패 응답은 **절대 캐시에 쓰지 않는다**. (c) `rain-radar`(L255, 정직하게 502)와 폴백 정책 통일.
- **검증**: `OPENWEATHER_API_KEY` 를 무효화하고 `/api/info/weather?lat=..&lng=..` 호출 → 32도 mock 이 안 나오고 미가용 신호가 나오는지, `weather_cache` 테이블에 mock 이 안 쌓이는지 확인.

#### [MAP-2] 경로가 오토바이용이 아니고 과금·남용 무방비
- **증상**: 이륜차 앱인데 **자동차(driving) 경로**를 안내(오토바이 금지도로·일방통행·골목 무시 → 틀린 길/거리/시간). `[경로]` 연타 시 Google Directions **과금 폭증**.
- **위치**: `routers/info_route.py` L19-21(`_TRAVEL_MODE="driving"`), L53-78(`_fetch_directions`: 매 호출 새 `httpx.AsyncClient`, rate limit·캐시 전무), L81-98(엔드포인트).
- **수정방향**: (a) Routes API `computeRoutes` + `TWO_WHEELER` 로 전환(주석 L20 이 이미 지목) 또는 이륜차 미지원을 사용자에게 명시. (b) 사용자별 rate limit. (c) `origin` 그리드 라운딩 + `dest` 조합으로 단기 캐시. (d) httpx client 모듈 싱글턴(engine_client 패턴 참고).
- **검증**: 동일 origin/dest 반복 호출 시 Google 실호출 수가 rate limit·캐시로 제한되는지 카운트.

### P1 — 성능·DB 부하·정합

#### [MAP-3] 리뷰 작성이 매트뷰 refresh 로 지연·충돌
- **위치**: `routers/info_repair.py` L351-355 (`REFRESH MATERIALIZED VIEW CONCURRENTLY repair_shop_stats` 를 요청 경로에서 동기 실행 + `except: pass`).
- **증상**: 리뷰 저장 응답이 수 초 지연, 동시 작성 시 refresh 직렬화/충돌, 통계 갱신이 조용히 실패.
- **수정방향**: refresh 를 요청 경로에서 제거 → 주기 cron/워커 또는 debounce. 최소한 참조 보관 백그라운드 태스크. 실패는 로깅(무음 금지).
- **검증**: 리뷰 POST 응답시간이 refresh 와 무관하게 일정한지, 동시 10건에서 에러 없는지.

#### [MAP-4] 대기 제보 1건마다 주유소 캐시 전체 flush
- **위치**: `routers/info_gas.py` L211 (`cache_invalidate("nearby:v1:*")`).
- **증상**: 제보 잦으면 전 지역 캐시 상시 무효화 → DB 직격, redis 패턴삭제 블로킹.
- **수정방향**: 제보 station 좌표 기반 **인근 그리드 키만** 무효화, 또는 wait 데이터를 캐시와 분리해 응답 조립 시 합성(캐시 유지).
- **검증**: 한 제보 후 무효화되는 캐시 키가 인근으로 한정되는지.

#### [MAP-5] 날씨 캐시 stampede
- **위치**: `info_weather.py` L191-222 (캐시 미스 시 락 없이 각자 외부호출).
- **수정방향**: single-flight(구역+타입 키 락) 또는 stale-while-revalidate.
- **검증**: 캐시 만료 순간 동시 50요청 시 OpenWeather 실호출이 1회로 수렴하는지.

#### [MAP-6] 침수 조회가 쓰기(`_expire_stale`)를 유발
- **위치**: `info_flood.py` L119·L275 (`/active`·`/map-data` GET 내부에서 `_expire_stale` UPDATE+commit).
- **수정방향**: 만료 전환을 cron/워커로 이관하고, 조회는 `expires_at > NOW()` 필터만.
- **검증**: `/active`·`/map-data` 가 SELECT-only 인지, 만료는 배치가 처리하는지.

### P2 — 품질·정확도·어뷰징
- **[MAP-7]** `map/poi.py` L45 `limit(200)` 에 `order_by` 없음 → 줌아웃 시 핀 무작위 누락. 거리/우선순위 정렬 추가 또는 클러스터링. (photo_content 는 검증 완료 = 문제 아님)
- **[MAP-8]** `info_gas.py` L97·L260 캐시키 `round(lat,3)`(≈111m)인데 응답 `distance_km` 는 캐시 생성자 위치 기준 → 거리 부정확·정렬 흔들림. 캐시엔 정적 목록만 담고 `distance_km` 는 요청 좌표로 후계산.
- **[MAP-9]** `info_gas.py` L102·L168 GP 적립이 `asyncio.create_task(...)` fire-and-forget(태스크 참조 미보관) → GC 수거 시 보상 유실. `await` 로 전환하거나 태스크 참조 보관/영속 큐.
- **[MAP-10]** `info_repair.py` L325-333 리뷰 중복체크가 `service_code` NULL 조합에서 뚫릴 소지 + 리뷰당 RP 50/10/10 → 파밍. NULL-safe 유니크(부분 인덱스) + 적립 가드.
- **[MAP-11]** `info_flood.py` L68-69 좌표검증이 호치민 bbox 하드코딩(타 info 라우터는 무검증 → 비일관). 공통 좌표검증 유틸로 통일 + 확장 대비.
- **[MAP-12]** `districts.boundary` 근사 폴리곤(036) → 정식 행정경계 데이터로 교체(구역 오매핑 정확도). 모든 구역 커버 여부도 점검(누락 구역은 `_geo.find_district_by_point` 가 None → grid fallback).

### 별도 트랙 (지도 밖이지만 정독 중 발견 — 중대)
- **[ENG-1]** `engine_client.py` 머니 경로 **멱등키 부재**: `pull_gacha`(L167)·`purchase_shop_item`(L245)·`credit_rp`(L86) 에 idempotency_key 없음 → 재시도/더블클릭 시 **가챠 이중 뽑기·상점 이중 결제·재화 이중 차감**. `post_event`(L37)·`create_redemption`(L111) 처럼 idem_key 추가. 먼저 `engine/` 에서 Engine 자체 중복방지 여부 확인.
- **[SYS-1]** `main.py` CORS `allow_origins=["*"]` + `allow_credentials=True`(L122-128) → 사실상 전 출처에 credential 허용. 화이트리스트로 교체. 그리고 `/api/health`(L171) 가 무조건 ok → DB/Engine readiness 반영.

---

## 4. 착수 순서 추천
P0(MAP-1, MAP-2) → P1(MAP-3~6) → P2(MAP-7~12). **ENG-1** 은 사용자 재화 직결이라 P0 과 병행 검토.
각 항목 수정 후 `docker compose --env-file .env up --build -d bff` 재빌드 + 위 "검증" 실측. 카파시 4원칙: 재현/검증 테스트가 통과할 때까지 "완료"라 부르지 않는다.

## 5. 관통하는 안티패턴 2가지 (설계 레벨)
1. **외부 API 장애를 사용자에게 숨김** — 날씨는 가짜(mock)로, 경로·침수예측은 조용히 빈값으로 degrade. 정직한 "일시 불가" 표기가 없다(MAP-1·MAP-2·MAP-5).
2. **캐시·매트뷰 갱신을 사용자 요청 경로에 얹음** — 조회가 쓰기를 유발(MAP-3·MAP-4·MAP-6).
새 코드도 이 두 패턴을 피한다.
