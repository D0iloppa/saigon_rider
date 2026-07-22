# 지도 연동 서비스 신뢰성 수정

## 목적

`.orca/drops/HANDOFF_MAP_INTEGRATION_REVIEW.md`의 결함을 재현 테스트와 함께 순차 수정한다.

## Phase

- [x] MAP-1 OpenWeather 실패 시 mock 반환·캐시 금지
- [x] MAP-2 이륜차 경로·rate limit·단기 캐시
- [x] ENG-1 Engine 재화 경로 멱등성 검증 및 보강
- [x] MAP-3 리뷰 요청 경로의 materialized view refresh 제거
- [x] MAP-4 주유소 대기 제보의 nearby 전체 cache flush 제거
- [x] MAP-5 날씨 cache stampede 방지
- [x] MAP-6 침수 GET의 쓰기 제거
- [x] MAP-7 POI bbox 페이지네이션·결정적 relevance 정렬
- [x] MAP-8 주유소 캐시 거리 요청 좌표 후계산
- [x] MAP-9 주유소 조회 GP 적립 fire-and-forget 제거
- [x] MAP-10 정비 리뷰 NULL-safe 중복·보상 파밍 가드
- [x] MAP-11 info API 공통 WGS84 좌표 검증
- [x] MAP-12 legacy 22개 행정경계 정식 데이터 교체
- [x] SYS-1 CORS origin 화이트리스트·DB/Redis/Engine readiness

## 현재 작업 단위: 완료

1. MAP-1~12 및 ENG-1 검증 완료

## 제약

- 기존 정상 날씨 응답 계약은 유지한다.
- 외부 API 실패·mock 데이터는 `weather_cache`에 기록하지 않는다.
- 기존 워킹트리의 사용자 변경은 수정하지 않는다.

## 외부 추적

- Plane/Notion 도구가 현재 세션에 노출되지 않아 로컬 SoT부터 작성했다. 도구 사용 가능 시 미러 및 이슈를 생성한다.
- codebase-memory MCP가 현재 세션에 없어 `rg`/서브에이전트 탐색으로 대체한다.

## MAP-1 검증 결과

- `python -m unittest app.tests.test_info_weather`: 3건 통과
  - OpenWeather current 비정상 응답이 mock 대신 502
  - forecast 네트워크 오류가 mock 대신 502
  - current fetch 실패 시 cache upsert 미호출
- Ruff 통과, 변경 프론트 파일 ESLint error 0건
- `docker compose --env-file .env up --build -d bff frontend` 성공
- 운영 주의: 이전 버전이 저장한 mock cache는 출처 표식이 없어 식별 삭제할 수 없다. 배포 후 기존 TTL(최대 1시간)이 지나면 자연 만료된다.

## MAP-2 구현·검증 결과

- Legacy Directions `driving`을 Routes API `computeRoutes` + `TWO_WHEELER`로 전환
- 기존 프론트 `RouteData` 계약으로 거리·시간·polyline·단계 안내 변환
- 출발지 약 110m 격자 + 목적지 좌표 조합으로 Redis 60초 캐시
- cache miss에 한해 사용자별 60초 10회 제한, Redis 장애는 fail-open
- 모듈 단일 `httpx.AsyncClient`를 BFF lifespan에서 종료
- Google의 TWO_WHEELER 베타 고지 요건에 따라 경로 시트에 한/영/베트남어 경고 추가
- `python -m unittest app.tests.test_info_route app.tests.test_info_weather`: 7건 통과
  - TWO_WHEELER body·API key·field mask 검증
  - Routes API 응답의 기존 프론트 계약 변환 검증
  - 동일 격자 경로 2회 요청 시 Google 호출 1회·rate-limit 1회
  - 11번째 cache miss 429
- Ruff 통과, 변경 프론트 ESLint error 0건, BFF/프론트 Compose 재빌드 성공
- 실제 Google 과금 호출은 테스트에서 mock 처리했다. 운영 키에서 Routes API v2 활성화 여부를 배포 점검해야 한다.

## ENG-1 구현·검증 결과

- Alembic `sre056`: 기존 `idempotency_key`에 사용자·요청 해시·최초 응답 JSON 추가
- `CREDIT_RP`, `GACHA_PULL`, `SHOP_PURCHASE`를 멱등 claim과 재화 변경이 같은 DB 트랜잭션에서 처리
- 동일 키·동일 payload는 최초 응답 재생, 동일 키 재사용/다른 payload는 409
- BFF가 `Idempotency-Key`를 Engine에 전달하고 가챠·상점 프론트가 액션별 UUID 생성
- 퀘스트 RP는 `quest-rp-{user_quest_id}` 결정적 키 사용
- Engine 멱등 단위테스트 4건, BFF 누적 단위테스트 10건 통과
- 실제 PostgreSQL claim→응답 저장→재조회 재생→테스트 행 정리 PASS
- `alembic current`: `sre056 (head)`
- 변경 파일 Ruff 통과, 프론트 ESLint error 0건, Engine/BFF/Frontend Compose 재빌드 성공
- 별도 잔여: BFF 퀘스트 완료 commit 후 Engine RP 실패 시 재시도가 status guard에 막히는 미지급 위험은 `project_todo.md`에 등록

## MAP-3 구현·검증 결과

- 리뷰 POST에서 `REFRESH MATERIALIZED VIEW CONCURRENTLY repair_shop_stats`와 무음 `except` 제거
- BFF APScheduler의 5분 interval job으로 refresh 이관 (`max_instances=1`, `coalesce=True`)
- `CONCURRENTLY` 요구에 맞춰 DB engine AUTOCOMMIT 연결 사용
- 실패 시 `log.exception` 기록 후 다음 스케줄 실행 유지
- 리뷰 요청 테스트: 단건 및 동시 10건 모두 refresh SQL 0회·commit 1회·응답 성공
- 잡 테스트: AUTOCOMMIT 실행 및 실패 로깅 검증
- 실제 DB refresh 성공, 52.2ms
- 관련 단위테스트 4건·Ruff 통과, BFF Compose 재빌드 및 health 정상
- 통계 신선도: 상세는 최대 약 5분, `/nearby`는 기존 600초 캐시 때문에 최대 약 10분 지연 가능

## MAP-4 구현·검증 결과

- 대기 제보 후 `nearby:v1:*` 전체 삭제 제거
- 주유소 좌표와 캐시 조회 중심·반경의 거리를 계산해 영향권 키만 선별
- 소수점 3자리 캐시 격자 오차를 고려해 반경에 0.1km 여유 적용
- Redis `SCAN` 순회 + 영향권 키만 `UNLINK`하여 원거리 캐시 보존 및 동기 DELETE 회피
- v2 nearby 응답은 대기시간을 포함하지 않으므로 무효화 대상에서 제외
- 단위테스트 2건: 인근 다연료 키 삭제·원거리/비정상 키 보존, 매칭 없음 시 UNLINK 미호출
- 실제 Redis 검증: 인근 키 삭제·원거리 키 보존·테스트 키 정리 PASS
- Ruff 통과, BFF Compose 재빌드 및 health 정상

## MAP-5 구현·검증 결과

- `district + weather_type` 단위 local `asyncio.Lock` + Redis `SET NX EX` 분산 single-flight 적용
- current와 forecast 락 분리, 락 TTL 15초, follower는 DB cache를 최대 12초 polling
- Redis 장애 시 local lock 아래 fail-open하여 단일 인스턴스의 stampede 방지 유지
- Lua token compare-and-delete로 만료 후 새 소유자의 락을 이전 요청이 삭제하지 않도록 보호
- upstream 실패 시 5초 local/Redis failure marker로 같은 burst의 연쇄 외부 호출 차단, 실패 데이터 cache write 없음
- 동시 성공 50요청: producer·Redis lock 각 1회, 50건 동일 응답
- 동시 실패 50요청: upstream 호출 1회, cache upsert 0회, 전건 명시 오류
- 날씨 관련 테스트 5건 및 BFF 누적 테스트 18건·Ruff 통과
- BFF Compose 재빌드 및 health 정상

## MAP-6 구현·검증 결과

- `/active`, `/map-data`의 lazy `_expire_stale` UPDATE+commit 제거
- 두 조회의 기존 `status = 'ACTIVE' AND expires_at > NOW()` 필터를 유지해 응답 정확도 불변
- 기존 최근 2시간 `still_flooded` 확인 보호 규칙을 5분 주기 만료 배치로 이관
- 배치 `max_instances=1`, `coalesce=True`, 실패 시 `log.exception` 후 다음 주기 유지
- GET 테스트: `/active` execute 1회, `/map-data` 3회 모두 SELECT이며 commit 0회
- 배치 테스트: UPDATE 규칙·commit 및 실패 로깅 검증
- 실제 DB 만료 배치 성공, 54.9ms
- 관련 테스트 4건, BFF 누적 테스트 22건·Ruff 통과
- BFF Compose 재빌드 및 health 정상

## MAP-7 구현·검증 결과

- HANDOFF에 적힌 고정 `limit(200)`은 선행 미커밋 변경에서 이미 `page`/`size`(최대 100) 응답과 프론트 전체 페이지 조회로 해소된 상태임을 확인
- bbox 중심과의 거리 오름차순을 1차 기준으로 적용하고, 랜드마크·공공시설 우선순위, 기존 수동 `sort_order`, UUID를 후속 tie-breaker로 사용
- 필터·페이지 응답 계약은 유지하며 동일 bbox/페이지의 순서를 결정적으로 고정
- 관련 단위테스트 3건 통과, 변경 파일 Ruff 통과
- 실제 API 확인: `size=3` 요청에서 `total=97`, `has_more=true`, 3건 반환
- BFF Compose 재빌드 성공

## MAP-8 구현·검증 결과

- `/nearby`, `/stations/nearby-v2`의 반올림 좌표 캐시에 요청별 `distance_km`를 저장하지 않도록 변경
- 캐시 hit/miss 모두 기존 `haversine_m`으로 현재 요청 좌표 기준 거리를 후계산
- `(distance_km, station_id)` 기준으로 안정 정렬하고 캐시 원본은 변경하지 않음
- 관련 단위테스트 6건 통과, 변경 파일 Ruff·`git diff --check` 통과
- 실제 Redis 검증: 저장 payload에 `distance_km` 없음, 같은 payload가 서쪽 요청 `[1, 2]`·동쪽 요청 `[2, 1]`로 재정렬
- BFF Compose 재빌드 및 health 정상

## MAP-9 구현·검증 결과

- `/nearby` cache hit/miss의 `asyncio.create_task(_earn_gp_safe(...))`를 직접 `await`로 변경
- 기존 사용자별 일일 멱등키와 `post_event_safe`의 실패 로깅·조회 성공 유지 계약은 변경하지 않음
- 보상 코루틴을 대기시키는 테스트로 cache hit/miss 모두 적립 완료 전에 응답하지 않음을 확인
- 관련 단위테스트 7건, 변경 파일 Ruff·`git diff --check` 통과
- BFF Compose 재빌드 및 health 정상

## MAP-10 구현·검증 결과

- 외부 수집 리뷰 1,225건의 `reviewer_user_id IS NULL`은 보존하고 로그인 사용자 리뷰만 대상으로 하는 부분 유니크 인덱스 추가
- `(shop_id, reviewer_user_id, service_code) NULLS NOT DISTINCT`로 서비스 미선택 리뷰도 정비소별 1건으로 제한
- 동시 요청 race의 unique violation은 rollback 후 409로 변환하고, 다른 FK 등 무결성 오류는 숨기지 않고 재발생
- insert 성공 이후에만 기존 리뷰·사진·가격 보상을 호출하므로 race loser의 보상 호출 차단
- Engine의 기존 세 리뷰 보상 액션 모두 일일 3회 제한 활성 상태 확인
- 관련 단위테스트 4건, 변경 파일 Ruff·`git diff --check` 통과
- `137_repair_review_null_unique.sql` 개발 DB 적용 및 실제 NULL 서비스 중복 INSERT 차단·검증 행 0건 롤백 확인
- BFF Compose 재빌드 및 health 정상

## MAP-11 구현·검증 결과

- 공통 `Latitude(-90..90)`·`Longitude(-180..180)` 타입을 추가하고 weather·route·gas·repair·flood의 query/body 좌표에 적용
- 침수 제보의 호치민 bbox 하드코딩을 제거해 유효 WGS84 좌표는 지역 확장과 무관하게 통과
- 위경도 범위 밖·NaN·무한대는 FastAPI/Pydantic 단계에서 422로 거절
- 실제 info 라우터 8개 query 경로와 body/global boundary 테스트 포함 관련 회귀 25건 통과
- 변경 파일 Ruff·`git diff --check` 통과, 새 BFF 이미지 및 health 정상
- 재빌드 중 별도 사용자 변경인 Engine `sre059`의 `:91` 바인드 오류가 드러나 이전 정상 Engine 이미지로 컨테이너를 복구했으며 BFF/Engine health 정상

## MAP-12 구현·검증 결과

- 제품 결정에 따라 최신 168개 체계 전환 대신 기존 앱 계약인 2025년 7월 이전 HCMC 22개 구·현 유지
- geoBoundaries `gbOpen VNM ADM2`의 OCHA ROAP·Government of Viet Nam 계보 데이터를 고정 커밋·SHA-256·CC BY 3.0 IGO 조건으로 사용
- 이름 자동 매칭 대신 원본 `shapeID`를 내부 코드에 명시 매핑하고, `THU_DUC`는 2020 `Quan 2`·`Quan 9`·`Thu Duc` 합집합으로 생성
- 재현 생성기와 출처 문서, 원자적 DB 마이그레이션 `138_legacy_district_boundaries.sql` 추가
- 마이그레이션 자체에서 22개 1:1 매핑, 유효 Polygon, 최소 1㎢, 구역 간 1㎡ 초과 중첩 0건, 중심점 포함을 검증
- 개발 DB 적용 결과: 22개 UPDATE, 유효 경계 22/22, 중첩 0쌍, 대표 좌표 5/5 예상 구역 역매핑
- 잘못된 외곽 면적 교정: `BINH_CHANH` 0.02→248.42㎢, `CAN_GIO` 0.03→652.98㎢, `CU_CHI` 0.07→433.77㎢
- 생성기 Ruff·`git diff --check` 통과, 마이그레이션 재적용 멱등성 확인
- 최신 HCMC 168개 phường/xã/đặc khu 전환은 별도 제품·데이터 마이그레이션 범위

## SYS-1 구현·검증 결과

- credential CORS의 `allow_origins=["*"]`를 `CORS_ALLOWED_ORIGINS` CSV 화이트리스트로 교체
- 실제 origin 기준 로컬 Nginx/Vite, `https://saigon.doil.me`, Capacitor bundled `https://localhost`만 기본 허용
- 빈 목록과 `*` 설정은 BFF 시작 단계에서 거부하며 `.env`·`.env.example` 키셋과 Compose 전달을 동기화
- `/api/health`는 프로세스 liveness로 명시하고 기존 `/api/ready`에 Engine `/v1/ready` 2초 제한 검사를 추가
- 단위테스트 8건, 변경 파일 Ruff·`git diff --check` 통과
- 실제 preflight: 허용 origin 200+명시 헤더, 임의 origin 400+허용 헤더 없음
- 실제 `/api/ready`: database·schema·redis·engine 전부 ready, BFF/Engine/DB/Redis health 정상
- 별도 미완성 Engine `sre059` 재실행을 피하기 위해 BFF 이미지만 빌드·교체

## 파생 후속 — 퀘스트 RP 지급 재시도 보장

- 퀘스트 완료 지급을 공용 함수로 분리하고 `UserQuest` 행 잠금 아래 Engine RP 성공 후에만 EXP·Gold와 완료 상태를 함께 commit
- Engine 일시 장애는 `reward_grant_status=FAILED`와 결정적 `reward_idempotency_key`를 보존하고 HTTP 503으로 반환
- BFF 1분 배치가 PENDING/FAILED 지급을 `FOR UPDATE SKIP LOCKED`로 재처리해 다중 인스턴스 중복 실행 방지
- Engine 정리 배치는 RP·가챠·상점의 금전성 멱등키를 만료 삭제 대상에서 제외
- BFF 콜백·재시도 테스트 9건, Engine 멱등키 정리 테스트 1건, Ruff 통과
- BFF 재빌드·배포 및 `/api/bff/ready` 정상. Engine 변경은 별도 미완성 `sre059`를 건드리지 않기 위해 테스트만 수행하고 현재 정상 이미지에는 미배포
