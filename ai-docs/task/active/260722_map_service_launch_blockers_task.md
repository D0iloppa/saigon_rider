# 지도 연동 서비스 출시 차단 결함 개선 태스크

> 작성일: 2026-07-22
> 상태: **CODE COMPLETE (로컬) — 실기기·외부 연동 검증 대기**
> 우선순위: **P0 출시 차단 → P1 데이터 정합성 → P1 GPS/보상 신뢰성 → P2 성능·운영**
> SoT: 이 문서
> 기준: `origin/main` `3755179` 재-pull 후 원격 구현과 잔여 안전 상태 수정 재조정
> 주의: 아래 원본 감사의 “현재 구현” 설명은 발견 당시 스냅샷이며, 현행 상태는 바로 다음 재조정 표를 우선한다.

---

## 2026-07-22 재조정 결과

원격 PR-1~6에서 인증 principal, 위치 프라이버시, 이륜차 경로·캐시, bbox 단일 SoT, GPS/보상 멱등성, fresh DB/readiness 및 서비스 geometry 작업이 반영된 것을 다시 확인했다. 이번 작업은 화면에 남아 있던 세 가지 신뢰 위반을 닫았다.

| 잔여 결함 | 조치 | 수용 기준 |
|---|---|---|
| 침수 제보 화면 진입 시 GPS 자동 요청 | query 좌표만 초기값으로 사용하고, “현재 위치 사용” 버튼을 누른 뒤에만 NativeInterface 권한·위치 API 호출 | mount 경로에 위치 권한 호출 없음 |
| 침수 API null/실패를 0건·안전으로 표시 | 홈과 정보 허브에 별도 unavailable 상태와 3개 언어 안내 추가 | 실패 시 safe/empty 문구보다 unavailable 상태 우선 |
| 기본 도시 좌표를 GPS로 오표기 | 날씨 위치 source를 default/query/map/gps로 분리하고 실제 GPS일 때만 GPS 문구 표시 | 기본 좌표는 `initialGps`로 전달하지 않음 |
| 응답 전 침수 안전 표시·날씨 요청 경합 | 홈 침수 상태를 loading/ready/unavailable로 분리하고, 날씨 위치 변경 시 이전 요청 응답을 취소 가드로 무시 | 성공 응답 전 safe 문구 없음, 최신 선택 위치만 화면 반영 |

직접 실행한 `frontend/src/pages/info/infoLaunchSafety.contract.test.mjs`는 5/5 통과했다. 다만 다음 항목은 저장소 코드만으로 완료할 수 없어 출시 게이트로 남는다.

- Android/iOS native submodule 실체와 실제 권한·백그라운드 GPS·FCM 동작
- 운영 Google Routes key/API의 `TWO_WHEELER` 응답과 과금 제한
- Redis/Engine/worker kill 및 외부 API 실패 주입 종단 시험
- Docker fresh-volume bootstrap, compose build/health, 실제 기기 시각 회귀

결론은 **코드에서 재현된 지도 출시 차단 결함은 해소, 실제 출시는 위 외부 검증 전까지 HOLD**다.

---

## 0. 원본 착수 지침 (재조정 이전 기록)

아래 내용은 구현 착수 전 작성한 실행 핸드오프 원문이다. 현행 상태는 위 재조정 결과를 따른다.

작업 시작 순서:

1. 루트 `AGENTS.md`와 `ai-docs/INDEX.md`, `ai-docs/context/current.md`, `ai-docs/agent-guidelines.md`를 먼저 읽는다.
2. `git status --short`로 기존 사용자 변경을 확인하고 보존한다. 감사 PC에는 사용자 소유 untracked 파일 `CLAUDE.kr_s3_engine_port.md`가 있었다.
3. codebase-memory MCP가 있으면 문서의 함수명을 `search_graph` → `get_code_snippet` → `trace_path` 순으로 다시 확인한다.
4. 아래 Phase를 순서대로 처리한다. 서로 다른 신뢰 경계를 한 PR에 섞지 않는다.
5. 각 Phase는 실패 테스트를 먼저 추가하고, 구현 후 같은 테스트가 통과해야 완료다.
6. 프런트는 `npm run build`를 호스트에서 직접 실행하지 않는다. 프로젝트 규칙대로 Docker Compose 재빌드로 검증한다.
7. 코드를 수정한 세션은 종료 전에 codebase-memory를 재인덱싱한다.

### 권장 PR 분리

| PR | 범위 | 이유 |
|---|---|---|
| PR-1 | 인증·계정복구·DM·device-map | 사용자 신원 신뢰 경계 |
| PR-2 | 위치 동의·피드 좌표 공개·위치 상태 | 개인정보 경계 |
| PR-3 | 길찾기·지도 bbox·차단/숨김·오류 상태 | 지도 사용자 경험과 안전 |
| PR-4 | GPS worker·퀘스트·보상·FCM | 비동기/재화 신뢰 경계 |
| PR-5 | fresh DB bootstrap·health·시간대 | 배포/운영 경계 |
| PR-6 | 지도 외 결제·부팅 안정성 | 가챠 멱등성·공통 timeout |

---

## 1. 감사 범위와 결론

실제 실행 경로를 다음 순서로 추적했다.

```text
frontend/src/main.tsx
  → frontend/src/App.tsx
  → Home / WorldMapV2 / NeighborhoodMap / SaigonMapV5
  → NativeInterface / user·location store
  → BFF feed / market / biz / poi / dm / info / ride
  → Engine device-map / GPS worker / quest tracker / policy engine / FCM
  → Redis / PostgreSQL / docker-compose / nginx
```

발견 당시 결론은 **출시 보류**였다. 지도 렌더 품질 문제가 아니라 다음 서비스 계약이 깨져 있었다.

- 위치 동의: 화면 진입만으로 GPS가 시작되고 정확 좌표가 공개될 수 있다.
- 신원: 보호 API가 세션 토큰 대신 사용자 UUID 문자열을 신뢰한다.
- 거래 안전: 지도에서 들어간 DM에서 타인을 사칭할 수 있다.
- 길찾기: 모든 사용자의 출발지가 Bến Thành으로 강제된다.
- 데이터 완결성: 현재 bbox 안에 데이터가 있어도 0건으로 표시될 수 있다.
- GPS/보상: 재전달·계정 전환·부분 실패 때 거리와 보상이 중복 또는 유실된다.
- 배포: 깨끗한 DB 볼륨에서 init이 실패할 수 있으나 health는 정상으로 보일 수 있다.

### 감사 제약

- 감사 PC에는 Docker 실행 파일, 설치된 `node_modules`, Python test 환경이 없어 런타임 E2E를 수행하지 못했다.
- `native/android`, `native/ios` submodule이 비어 있어 실제 권한 프롬프트, 백그라운드 GPS 송신, service-key 보관 방식은 확인하지 못했다.
- CSS·번역·asset은 동작 판정에 필요한 부분만 확인했다.
- `backend/app/routers/admin_legacy.py` 전체 4,500여 줄은 지도 사용자 경로에 연결된 부분만 확인했다.

---

## 2. 반드시 보존할 프로젝트 불변식

구현하면서 아래 규칙을 변경하거나 우회하지 않는다.

1. GPS는 사용자가 명시적으로 **내 현재 위치**를 선택한 시점에만 측정한다. 화면 진입·로그인·화면 전환만으로 측정하지 않는다.
2. 위치 미선택은 전체 지역이며, 지도는 줌 게이트 전 데이터를 표시하지 않는다.
3. 지도 핀과 바텀시트 목록은 같은 bbox 응답을 단일 데이터 소스로 사용한다.
4. BFF는 Engine DB 테이블을 직접 읽지 않고 `backend/app/engine_client.py` HTTP API만 사용한다.
5. Engine의 시간은 timezone-aware여야 한다.
6. 모든 동적 이미지는 `contents`와 `<AppImage>` 규칙을 유지한다.
7. 네이티브 기능은 `NativeInterface`를 경유한다.
8. `.env` 키를 바꾸면 `.env.example` 키셋도 같은 변경에 포함한다. 비밀 값은 커밋하지 않는다.

참조: `ai-docs/context/service-rules.md`, `ai-docs/context/architecture.md`, `ai-docs/context/frontend.md`.

---

## 3. P0 — 출시 차단 결함

## P0-1. 세션·계정 복구 신뢰 경계 복구

### 현재 구현

- `backend/app/deps.py:50` `verify_user_session()`은 `X-User-Id`를 UUID로 파싱하고 활성 사용자 존재 여부만 확인한다.
- `frontend/src/api/client.ts:86`은 저장된 session token 대신 `X-User-Id`를 보낸다.
- `backend/app/routers/auth.py:69` `/auth/register`는 기존 전화번호에도 새 passcode를 발급하고 기존 hash를 덮는다.
- 사용자 UUID는 공개 피드·매물 응답에서 얻을 수 있다.

### 사용자 피해

- ACTIVE 사용자 UUID만 알면 피해자 명의로 보호 API를 호출할 수 있다.
- 전화번호만으로 기존 계정의 passcode를 바꿀 수 있다.
- 차단/정지 사용자가 다른 ACTIVE UUID로 제재를 우회할 수 있다.

### 구현 요구

- [ ] 기존 session token 발급·검증 경로를 조사해 모든 보호 API가 검증된 세션 principal을 사용하게 한다.
- [ ] 프런트 공통 client가 session token을 전송하게 한다. 헤더 형식은 기존 서버 토큰 구현과 맞추고 새 인증 체계를 중복 생성하지 않는다.
- [ ] `X-User-Id`, query/body의 `user_id`는 권한 근거로 사용하지 않는다. 필요한 ID는 세션 principal에서 파생한다.
- [ ] `/auth/register`의 기존 번호 경로를 제거하거나 OTP/기존 자격 증명 검증이 있는 별도 recovery 흐름으로 분리한다.
- [ ] BANNED/SUSPENDED/DELETED 상태가 공통 dependency에서 일관되게 차단되는지 확인한다.
- [ ] 로그인·로그아웃·토큰 만료 시 device-map/GPS 수명주기를 함께 정리한다.

### 수용 기준

- 유효하지 않은 토큰 + 유효한 피해자 UUID → 모든 보호 API `401/419`.
- 유효한 사용자 A 토큰 + body/query 사용자 B UUID → `403` 또는 B 값 무시 후 A로 처리.
- 기존 전화번호만 입력한 `/register` 요청으로 passcode가 변경되지 않는다.
- 정상 OAuth/기존 로그인 회귀가 통과한다.

---

## P0-2. 정확 위치 공개 중단과 명시적 동의

### 현재 구현

- `frontend/src/pages/feed/FeedCreate.tsx:37` 위치 첨부가 기본 `true`다.
- 같은 파일 `:55-66`은 mount 즉시 권한 요청과 GPS 측정을 실행한다.
- 같은 파일 `:126-138`은 원본 위·경도를 POST한다. 화면 `:203-216`에는 Ward/District 이름만 보여 정확 좌표 공개를 인지하기 어렵다.
- `backend/app/routers/feed.py:82` 공개 `GET /feed`에는 인증 dependency가 없다.
- `backend/app/routers/feed.py:54-77`과 `backend/app/schemas.py:694-713`은 사용자 식별 정보와 원본 좌표를 반환한다.
- `frontend/src/store/useUserStore.ts:65-87`은 로그인 직후 `native.startGPS()`를 호출한다.
- `WorldMapV2`, `FeedCreate`, `MarketCreate`, `InfoHub`가 사용자 버튼 없이 위치를 요청한다.

### 사용자 피해

- 피드 작성자가 동네만 공유한다고 생각해도 집·직장 수준의 위치가 공개될 수 있다.
- 로그인과 화면 진입만으로 위치 권한 요청 또는 백그라운드 위치 시작이 발생한다.

### 구현 요구

- [ ] 모든 화면의 자동 `getLocation()`, `ensureLocationPermission()`, `startGPS()` 호출을 제거한다.
- [ ] 위치 첨부 기본값을 OFF로 바꾸고 사용자가 현재 위치 버튼을 누른 뒤 공개 범위를 확인해야만 활성화한다.
- [ ] 공개 피드 DTO에서 원본 latitude/longitude를 제거한다.
- [ ] 지도에 위치 핀이 필요하면 서버가 공개용 좌표를 별도 생성한다. 최소 Ward centroid 또는 명시적으로 정의한 coarse/jitter 좌표를 사용한다.
- [ ] 내부 원본 좌표와 공개 좌표의 저장·보존·삭제 목적을 분리한다. 기존 게시물도 공개 응답에서 즉시 마스킹한다.
- [ ] 위치 공유 UI에 공개 단위와 끄기 동작을 명시한다.

### 수용 기준

- 로그인, 홈, 지도, 피드 작성, 매물 작성 진입만으로 native 위치 API 호출 0회.
- 비로그인 `GET /feed` 응답에 원본 위·경도 없음.
- 위치 OFF 게시물은 DB와 응답 모두 위치 없음.
- 위치 ON 게시물도 공개 응답은 정책상 coarse 위치만 포함.
- 권한 거절·서비스 지역 밖·브라우저 환경 모두 현재 위치로 오인되는 fallback을 저장하지 않는다.

---

## P0-3. 지도 → 상세 → DM 사칭 차단

### 현재 구현

- `backend/app/routers/dm.py:192` 대화 생성은 `_session_uid`와 `body.user_id`를 비교하지 않는다.
- 같은 파일 `:341` 메시지 발송은 세션 사용자의 대화 참여 여부와 `body.sender_id` 일치를 확인하지 않는다.
- 같은 파일 `:409` 읽음 처리도 참여자와 `body.user_id`를 확인하지 않는다.
- 조작한 sender로 상대방 푸시 이벤트까지 발행된다.

### 구현 요구

- [ ] 대화 생성 principal은 세션 사용자로 고정하고 `body.user_id`를 제거하거나 무시한다.
- [ ] `other_user_id` 존재·상태·차단 관계와 listing context 접근 가능성을 서버가 확인한다.
- [ ] send/read/list/detail/appointment/offer 전체 endpoint에 공통 participant guard를 적용한다.
- [ ] sender는 세션 principal로 고정한다.
- [ ] 차단 후 기존 대화에서 메시지 허용 여부를 제품 규칙으로 확정하고 서버에서 일관되게 강제한다.
- [ ] 동일 사용자 쌍 대화방에서 새 매물 문의가 기존 `context_id`를 덮는 구조를 고친다. 매물별 대화 또는 immutable context 중 하나를 명시적으로 선택한다.

### 수용 기준

- 비참여자 토큰으로 대화 조회·발송·읽음 처리 모두 `403`.
- 사용자 A 토큰으로 `sender_id=B`를 보내도 저장 발신자는 A이거나 요청이 `403`.
- 차단된 상대는 지도 상세와 신규 대화 생성에서 모두 차단.
- 서로 다른 두 매물 문의가 과거 대화의 거래 문맥을 변경하지 않는다.

---

## P0-4. device-map 탈취 차단

### 현재 구현

- `backend/app/routers/auth.py:145` `/auth/device-map`은 인증 없이 `device_uuid`, `user_id`, `fcm_token`을 받는다.
- `engine/app/routers/device_map.py:50`은 기존 device/FCM 매핑을 요청 값으로 교체한다.

### 구현 요구

- [ ] BFF route에 세션 검증을 추가하고 user UUID는 principal에서 파생한다.
- [ ] device UUID 소유권/재등록 정책을 정의하고 계정 전환 시 이전 매핑을 원자적으로 해제한다.
- [ ] FCM token 교체와 GPS device 매핑을 무인증 단일 요청으로 함께 바꾸지 못하게 한다.
- [ ] 로그인·로그아웃·탈퇴·정지·token refresh 상황의 매핑 정리 테스트를 추가한다.

### 수용 기준

- 무인증 device-map 요청 `401/419`.
- 사용자 A 토큰으로 B의 `user_id`를 보내도 B 매핑 변경 불가.
- A 로그아웃 후 같은 단말에 B 로그인 시 worker 재시작 없이 B에게만 귀속.
- 피해자 FCM token이 다른 사용자 요청으로 삭제·교체되지 않는다.

---

## P0-5. 길찾기 실제 출발지와 오토바이 경로

### 현재 구현

- `frontend/src/pages/ride/RideNav.tsx:29` `DEV_FORCE_HCMC_ORIGIN = true`다.
- 같은 파일 `:158`은 실제 GPS 대신 Bến Thành 고정 좌표를 출발지로 사용한다.
- `backend/app/routers/info_route.py:21`은 `_TRAVEL_MODE = "driving"`, `:64`는 `language="ko"`를 고정한다.

### 구현 요구

- [ ] 강제 출발지와 GPS 실패용 가짜 좌표를 제거한다.
- [ ] 현재 위치 측정은 길찾기 시작 버튼을 누른 뒤 명시적으로 수행한다.
- [ ] 위치 권한 거절/실패 시 수동 출발지 선택 또는 명확한 오류를 제공한다.
- [ ] 사용하는 지도 provider가 베트남의 two-wheeler routing을 지원하는지 확인한다.
- [ ] 지원하지 않으면 자동차 경로를 오토바이 경로로 표시하지 말고 기능을 제한하거나 provider를 교체한다.
- [ ] 안내 언어를 사용자 locale로 전달한다.

### 수용 기준

- 사용자 현재 위치와 요청 origin의 차이가 허용 GPS 오차 범위 안이다.
- 위치 권한 거절 시 Bến Thành 등 임의 경로가 생성되지 않는다.
- ko/en/vi 각각 요청 언어와 안내 언어가 일치한다.
- 오토바이 경로 지원 여부와 fallback 정책이 테스트와 문서에 명시된다.

---

## P0-6. 클라이언트 성공값 기반 보상 제거

### 현재 구현

- `backend/app/schemas.py:596-605` 거리·시간에 양수 제약이 없다.
- `backend/app/routers/ride.py:91-106`은 Engine 카드/GPS 달성 상태를 확인하지 않고 `body.is_success`를 신뢰한다.
- 같은 파일 `:127-137`은 `COMPLETED`만 아니면 EXP·Gold를 지급한다. EXPIRED/ABANDONED도 포함된다.

### 구현 요구

- [ ] `is_success`, 거리, 시간, 평균속도, 안전등급을 보상 판정의 클라이언트 truth로 사용하지 않는다.
- [ ] 서버가 Engine의 완료된 card와 사용자·quest·기간을 교차 검증한 뒤 한 번만 지급한다.
- [ ] EXPIRED/ABANDONED/취소 퀘스트는 완료 callback과 submit 모두 보상하지 않는다.
- [ ] `distance_km`, `duration_sec` 입력 제약을 추가하되 이것만으로 부정행위 방지를 해결했다고 판단하지 않는다.
- [ ] BFF grant endpoint에 멱등 키와 unique constraint를 추가한다.

### 수용 기준

- `distance=0`, `duration=0`, `is_success=true`만으로 상태·잔액 변화 없음.
- 완료되지 않은 Engine card와 만료된 퀘스트는 지급 불가.
- 같은 완료 이벤트를 N회 보내도 EXP·Gold·RP·item은 정확히 1회 지급.

---

## P0-7. quest 완료와 보상 이벤트 원자화

### 현재 구현

- `engine/app/services/quest_tracker.py:31-56`은 카드 완료 이벤트 발행 후 마지막에 DB commit한다.
- 같은 파일 `:128-145`은 Redis `XADD` 실패를 삼키고 카드 완료는 commit한다.
- Redis 성공 후 DB commit 실패 시 반대로 미완료 카드의 보상이 지급될 수 있다.

### 구현 요구

- [ ] card 완료와 outbox row 생성을 같은 DB transaction으로 묶는다.
- [ ] 별도 dispatcher가 committed outbox만 Redis/BFF로 전달한다.
- [ ] dispatcher와 BFF grant 모두 동일한 idempotency key를 사용한다.
- [ ] 실패 상태, retry 횟수, DLQ, 수동 재처리 경로를 제공한다.

### 수용 기준

- Redis 장애 중 card 완료 transaction이 성공하면 outbox가 남고 복구 후 정확히 1회 지급.
- DB commit 실패 시 이벤트와 보상 모두 없음.
- callback 성공 후 worker 종료/ACK 실패가 발생해도 중복 지급 없음.

---

## P0-8. fresh DB bootstrap 복구

### 현재 구현

- `docker-compose.yml:304-320` DB는 `database/init`만 자동 실행한다.
- Engine/worker startup에는 `alembic upgrade head`가 없다.
- `database/init/060_gacha_rate_rebalance.sql:17`은 Alembic이 생성할 `gacha_definition`을 UPDATE한다.
- `engine/app/main.py:154-156` health는 DB/Redis 연결을 확인하지 않는다.

### 구현 요구

- [ ] database/init과 Engine Alembic 중 스키마 SoT를 하나로 정하고 실행 순서를 명시한다.
- [ ] 기존 운영 DB와 fresh DB 모두 안전한 migration 경로를 제공한다.
- [ ] 존재하지 않는 테이블을 참조하는 init 의존을 제거한다.
- [ ] readiness는 DB·Redis·필수 migration version을 검사한다.
- [ ] 기존 `SGR-227`과 중복 작업을 만들지 말고 상태를 확인한다.

### 수용 기준

- 완전히 새로운 **일회용** volume에서 compose 기동 성공.
- BFF/Engine/worker readiness가 실제 의존 서비스 준비 전에는 실패한다.
- 같은 migration/startup을 재실행해도 데이터 파손과 중복 seed가 없다.

---

## 4. P1 — 지도 데이터·상태 정합성

## P1-1. 위치 상태를 하나의 원자적 모델로 통합

### 현재 구현

- `frontend/src/pages/home/WorldMapV2.tsx:189-226`은 mount GPS 실패/지역 밖에서 Bến Thành을 전역 위치로 저장한다.
- `frontend/src/store/useLocationStore.ts:8-24`는 좌표와 `wardName`을 별도로 영속화한다.
- GPS 경로는 기존 이름을 갱신/삭제하지 않지만 `frontend/src/pages/home/WorldMapV2.tsx:309-314`는 저장 이름을 우선 표시한다.
- 로그아웃은 위치 store를 비우지 않는다.

### 구현 요구

- [ ] `{coords, wardId, wardName, source, measuredAt, accountId}`를 한 번에 갱신하는 상태로 통합한다.
- [ ] `source`는 최소 `manual | gps`를 구분한다. UI fallback은 사용자 위치로 저장하지 않는다.
- [ ] GPS 위치에는 freshness 기준을 적용한다.
- [ ] 로그아웃·계정 전환 시 계정 범위 위치를 초기화한다.
- [ ] 위치 미선택은 `null`이며 전체 지역/줌 게이트 정책을 따른다.

### 수용 기준

- 헤더 지역명과 API 조회 좌표가 같은 snapshot에서 파생된다.
- 권한 거절/서비스 지역 밖에서 위치 store는 `null` 또는 사용자가 선택한 수동 위치를 유지한다.
- A 계정의 위치가 B 계정에 표시되지 않는다.

---

## P1-2. 모든 지도 레이어를 bbox 서버 조회로 통일

### 현재 구현

- `frontend/src/pages/map/NeighborhoodMap.tsx:609-625` feed는 bbox 대신 중심 좌표와 size만 전달한다.
- `backend/app/routers/feed.py:82-140`은 기본 5km의 최신순 페이지를 반환한다.
- 클라이언트가 받은 최신 40~50건만 다시 bbox로 자른다. 화면 안 오래된 게시물은 누락될 수 있다.
- 매물은 최대 300건, 업체/POI는 각각 200건으로 조용히 잘린다.
- 지도 검색 매물은 첫 40건만 사용한다.

### 구현 요구

- [ ] feed API에 bbox 파라미터와 결정적 정렬·pagination을 추가한다.
- [ ] listing/feed/biz/poi가 동일 bbox 계약을 사용하게 한다.
- [ ] 응답에 `items`, `total`, `has_more` 또는 `truncated`, cursor/page 정보를 포함한다.
- [ ] 무작위/무정렬 `limit(200)`을 제거한다.
- [ ] 서버 bbox 결과를 핀과 바텀시트가 함께 사용하고 클라이언트 후필터를 진실의 원천으로 사용하지 않는다.
- [ ] 검색은 전역 bbox, 현재 화면 bbox, 위치 무관 검색 중 제품 의도를 API 파라미터로 명시한다.

### 수용 기준

- bbox 안 fixture가 500개여도 pagination을 통해 total과 누락 여부를 정확히 표현한다.
- bbox 밖 최신 데이터가 많아도 bbox 안 오래된 데이터가 누락되지 않는다.
- 핀 개수와 바텀시트 목록 개수의 데이터 원천이 동일하다.

---

## P1-3. 오류와 0건 상태 분리

### 현재 구현

- `frontend/src/pages/map/NeighborhoodMap.tsx:609-626`은 listing/feed 둘 다 실패할 때만 전체 오류를 표시한다.
- biz/poi/favorites/search 오류는 대부분 `[]`로 바뀐다.
- 홈의 침수 API 오류도 일부 화면에서 안전/0건처럼 보인다.

### 구현 요구

- [ ] 레이어별 `idle/loading/success-empty/success-data/error/stale` 상태를 둔다.
- [ ] 부분 실패는 성공한 레이어를 유지하면서 실패한 탭에 오류·재시도를 표시한다.
- [ ] 안전정보는 `위험 없음`, `조회 실패`, `stale`을 명확히 분리한다.
- [ ] 마지막 성공값을 보여줄 때 시각적으로 기준 시각과 stale 상태를 표시한다.

### 수용 기준

- listing만 500 → feed는 보이고 listing 탭에는 오류와 재시도 표시.
- flood/weather timeout → 안전/정상 문구가 표시되지 않음.
- retry 성공 후 현재 bbox 데이터로 복구.

---

## P1-4. 차단·HIDDEN 정책을 서버 세션 기준으로 통일

### 현재 구현

- `backend/app/routers/market.py:287`은 선택적 `viewer_id`가 있을 때만 차단 목록을 적용한다.
- 홈 지도와 동네지도는 `viewerId`를 보내지 않는다.
- `backend/app/routers/market.py:374` 상세는 UserBlock을 확인하지 않는다.
- `seller_id == viewer_id`를 query로 조작하면 HIDDEN 목록 가시성 검사를 우회할 수 있고 HIDDEN 상세도 공개된다.

### 구현 요구

- [ ] viewer는 query가 아니라 선택적/필수 인증 principal에서 파생한다.
- [ ] 목록·검색·지도·상세·공유 링크·DM 생성에 같은 block/moderation policy를 적용한다.
- [ ] HIDDEN/REMOVED/판매자 본인 상태별 응답 계약을 정의한다.
- [ ] 공개 endpoint에서 seller가 자신의 숨김 콘텐츠를 볼 필요가 있으면 인증된 별도 `mine` endpoint를 사용한다.

### 수용 기준

- 차단 상대 매물·피드·업체 활동이 홈/지도/검색/상세에 모두 나타나지 않는다.
- query UUID 조작으로 HIDDEN 콘텐츠 조회 불가.
- 판매자 본인 관리 화면만 인증 후 숨김 상태를 확인할 수 있다.

---

## P1-5. 지도 네트워크 취소와 query inset 정합성

### 현재 구현

- stale 응답의 state commit은 `cancelled` flag로 방지되어 있다. 이 race는 수정 대상이 아니다.
- 하지만 `frontend/src/pages/map/NeighborhoodMap.tsx:84-96`의 과거 bbox 요청은 최대 6페이지까지 계속 실행된다.
- `frontend/src/api/market.ts:249-281`과 공통 fetch에 AbortSignal 배선이 없다.
- `frontend/src/components/maps/SaigonMapV5.tsx:789-802` inset 변경은 bbox 재발행을 suppress한다.

### 구현 요구

- [ ] 지도 조회 함수와 공통 client에 `AbortSignal`을 전달한다.
- [ ] bbox/query/tab 변경 시 이전 요청을 실제 abort한다.
- [ ] top/bottom query inset의 실측값이 바뀌면 새 query bbox를 1회 발행한다.
- [ ] 무한 요청 루프가 생기지 않도록 viewport 변경 원인과 query 변경을 구분한다.
- [ ] 고정 2초 로딩은 실제 요청 상태와 UX를 검토해 제거 또는 축소한다.

### 수용 기준

- 빠른 pan 10회 후 마지막 bbox 요청만 완료되고 앞 요청은 abort됨.
- 최초 레이아웃 측정 후 핀·목록이 가시 지도 영역 bbox와 일치.
- abort는 사용자 오류 toast나 0건 상태를 만들지 않음.

---

## P1-6. 서비스 지역과 지도 geometry 통일

### 현재 구현

- `frontend/src/lib/serviceArea.ts`는 광역 HCMC 범위를 허용한다.
- SaigonMap V2/V5 asset과 nearest Ward snapping은 중심부 Ward 집합을 사용한다.
- Thủ Đức·Củ Chi 등에서 서비스 범위 판정과 지도 선택 가능 범위가 달라질 수 있다.

### 구현 요구

- [ ] 서비스 가능 영역의 단일 geometry SoT를 선택한다.
- [ ] map rendering, GPS in-area 판단, 위치 선택, 게시 가능 영역, BFF spatial validation이 같은 버전의 geometry를 사용하게 한다.
- [ ] 지원하지 않는 지역은 nearest central Ward로 자동 스냅하지 않는다.

### 수용 기준

- 경계 안/밖/홀/외곽 fixture가 프런트와 BFF에서 같은 판정을 낸다.
- 지원 범위 안의 모든 Ward를 지도에서 선택하고 조회할 수 있다.
- 지원하지 않는 위치는 명확히 안내되고 임의의 중심부 좌표로 바뀌지 않는다.

---

## 5. P1 — GPS·퀘스트·보상·알림 신뢰성

## P1-7. GPS 메시지 전체 파이프라인 멱등성

### 현재 구현

- `engine/app/services/mileage.py:54-72`은 같은 Redis `msg_id`의 mileage만 중복 방지한다.
- `engine/app/workers/gps_agent.py:49-65`는 중복이어도 원래 distance를 quest tracker로 전달한다.
- `engine/app/services/quest_validators/distance.py:21-25`는 카드 거리를 다시 더한다.
- ACK은 처리 후 수행되므로 commit 후 worker 종료/ACK 실패 창이 존재한다.

### 구현 요구

- [ ] GPS 이벤트 idempotency record가 mileage와 모든 quest validator 업데이트를 함께 보호하게 한다.
- [ ] 이벤트 처리 transaction과 ACK 경계를 명확히 한다.
- [ ] 중복·순서 역전·지연 이벤트 정책을 정의한다.
- [ ] 동일 이벤트의 부분 성공을 만들지 않는다.

### 수용 기준

- 같은 GPS 이벤트 10회 전달 → mileage와 모든 quest progress가 각각 1회 증가.
- commit 직후 worker kill/restart → 같은 결과.
- 서로 다른 이벤트는 정상 누적.

---

## P1-8. device mapping cache와 event time 수정

### 현재 구현

- `engine/app/services/mileage.py:12-28` device→user 캐시는 TTL 없는 프로세스 로컬 dict다.
- Engine API가 cache를 지워도 별도 worker 프로세스 cache는 남는다.
- GPS noise 판정은 측정 시각이 아니라 worker의 `monotonic()` 처리 간격을 사용한다.
- backlog가 빠르게 처리되면 정상 거리도 150km/h 초과로 버릴 수 있다.

### 구현 요구

- [ ] mapping을 매번 DB에서 읽거나 Redis/shared cache + TTL/version invalidation으로 바꾼다.
- [ ] device remap을 원자화하고 worker가 즉시 새 mapping을 보게 한다.
- [ ] GPS payload에 단말 측정 시각을 포함하고 서명/범위/미래시각/과거시각을 검증한다.
- [ ] 속도는 연속한 측정 event time 기준으로 계산한다.

### 수용 기준

- A→B 계정 전환 후 worker 재시작 없이 다음 이벤트가 B에 적립.
- 10분 backlog의 정상 30초 간격 이벤트가 처리 속도 때문에 폐기되지 않음.
- 미래·과거·역순 이벤트의 정책 테스트 통과.

---

## P1-9. 보상 callback 주소·상태·RP 부분 실패 복구

### 현재 구현

- `engine/app/config.py:17-18` policy engine의 기본 BFF 주소는 `http://backend:8000`이다.
- 실제 compose 서비스는 `bff:8080`이다.
- `quest_completed_agent`가 쓰는 `BFF_INTERNAL_URL=http://bff:8080`은 정상이며 이 경로와 혼동하지 않는다.
- `engine/app/services/policy_engine.py:175-188`은 action 실패를 삼키고도 지급 로그를 남겨 재시도를 막는다.
- `backend/app/routers/internal.py:139-163`은 EXP·Gold commit 뒤 RP 호출 실패를 삼키고 200을 반환한다.

### 구현 요구

- [ ] BFF base URL 설정명을 하나로 통합하고 compose/.env/.env.example에 같은 키를 사용한다.
- [ ] 지급 log에 `PENDING/SUCCEEDED/FAILED` 상태와 idempotency key를 둔다.
- [ ] EXP·Gold·RP·item을 하나의 grant transaction 또는 재시도 가능한 saga로 처리한다.
- [ ] 부분 실패 시 2xx 성공으로 ACK하지 않는다.

### 수용 기준

- BFF 500/timeout 뒤 복구하면 같은 grant가 정확히 1회 완료.
- RP만 실패해도 완료 성공으로 기록되지 않고 재시도됨.
- BFF 지급 성공 후 Engine commit 실패/재시도에서도 중복 없음.

---

## P1-10. DAILY 만료·중복 card·시간대 정합성

### 현재 구현

- DAILY card의 `expires_at`이 quest `ends_at`만 사용해 NULL이면 영구 ACTIVE다.
- BFF UserQuest가 EXPIRED여도 callback은 COMPLETED 여부만 검사한다.
- start-ride 반복 호출로 동일 UserQuest card를 여러 개 만들 수 있다.
- BFF 기본 시간대는 `Asia/Seoul`, Engine/jobs는 `Asia/Ho_Chi_Minh`이다.

### 구현 요구

- [ ] DAILY/주간/기간형 만료 규칙을 ICT 기준으로 한 함수에서 계산한다.
- [ ] `user_quest_id`당 활성 Engine card unique/idempotency를 강제한다.
- [ ] start/abandon/drop 모두 세션 소유권과 상태 전이를 검증한다.
- [ ] BFF/Engine/jobs 기본 시간대를 `Asia/Ho_Chi_Minh`로 통일한다.

### 수용 기준

- ICT 자정 이후 이전 DAILY GPS 이벤트로 완료/보상 불가.
- start-ride 10회 요청에도 card 1개.
- ICT 21:59/22:00/23:59/00:00 경계 테스트에서 period key·만료가 일치.

---

## P1-11. GPS URL 로그와 FCM 실패 처리

### 현재 구현

- `engine/app/routers/message.py:18-46` GPS endpoint는 `verify_service_key` 보호가 있다. **무인증 endpoint라는 판정은 잘못이므로 제거하지 않는다.**
- 다만 GET query의 `uuid`, `message`에 단말 식별자와 좌표가 들어가 Nginx access log에 남을 수 있다.
- FCM non-200은 false를 반환하지만 상위 push API는 HTTP 200으로 응답하고 worker는 성공으로 ACK한다.
- fresh checkout에는 기본 firebase credential 파일과 production secret mount가 없다.

### 구현 요구

- [ ] GPS ingest를 인증된 POST body로 전환하고 query URL에 좌표를 넣지 않는다.
- [ ] request/access log에 위치 payload·device UUID·service key가 남지 않게 한다.
- [ ] FCM 429/5xx/transport 실패는 retryable 실패로 worker에 전달한다.
- [ ] 영구 4xx와 재시도 가능 오류를 구분하고 DLQ를 제공한다.
- [ ] credential은 repository 파일이 아니라 production secret mount로 공급한다.

### 수용 기준

- Nginx/Engine access log에 위·경도와 device UUID가 나타나지 않는다.
- FCM 500/429 주입 후 retry되고 복구 시 정확히 1회 알림.
- 잘못된 token은 격리/정리되며 무한 재시도하지 않는다.
- credential 미설정 시 readiness 또는 명확한 운영 경고로 드러난다.

---

## 6. P1 — 날씨·침수 안전정보

## P1-12. mock/stale/실데이터 구분

### 현재 구현

- `backend/app/routers/info_weather.py:67-97` upstream 장애 시 고정 날짜 `2026-05-21` mock을 반환한다.
- 이 값이 정상 데이터처럼 cache되고 riding recommendation에 사용된다.
- 홈·정보 화면 일부는 weather/flood 실패를 빈 데이터나 안전 상태로 표시한다.

### 구현 요구

- [ ] 운영 환경에서 mock을 실제 관측값처럼 반환하지 않는다.
- [ ] 응답에 `source`, `observed_at`, `fetched_at`, `stale`, `error`를 명시한다.
- [ ] recommendation은 fresh 실데이터에서만 계산하거나 불확실성을 표시한다.
- [ ] cache key가 실제 공간 해상도와 맞는지 검증한다.

### 수용 기준

- upstream 장애 시 고정 mock이 현재 날씨로 표시되지 않는다.
- stale 데이터는 기준 시각과 함께 표시되고 안전 추천으로 오인되지 않는다.
- 서로 먼 좌표가 같은 District라는 이유만으로 동일 관측값을 공유하지 않는다.

---

## P1-13. 침수 제보 위치·신뢰·해제 정책

### 현재 구현

- `backend/app/routers/info_flood.py:208` 다른 사용자 한 명의 resolved vote로 즉시 RESOLVED가 된다.
- 최초 제보 기본 점수 1도 CONFIRMED로 보일 수 있다.
- map-data hotspot은 요청 위치·반경을 무시하고 도시 전체 상위 데이터를 반환한다.
- `frontend/src/lib/infoCoords.ts:37-68`은 기본 D1 좌표로 Promise를 먼저 resolve해 실제 GPS 결과가 제보 payload에 반영되지 않을 수 있다.

### 구현 요구

- [ ] 제보 좌표는 명시적 현재 위치 또는 사용자가 확인한 지도 핀만 사용한다.
- [ ] 기본 좌표를 실제 제보 좌표로 제출하지 않는다.
- [ ] confirm/resolved quorum, 거리, 시간, 신고자 중복, 신뢰도 규칙을 정의한다.
- [ ] map-data가 요청 bbox/radius를 서버에서 적용한다.
- [ ] API 실패와 위험 없음 상태를 분리한다.

### 수용 기준

- GPS 응답 전 submit 불가 또는 사용자가 핀을 확인해야 함.
- D1 밖 첫 사용자 제보가 D1 기본 좌표에 저장되지 않음.
- 단일 악의적 vote로 활성 위험이 즉시 사라지지 않음.
- radius 밖 hotspot은 응답에 포함되지 않음.

---

## 7. 지도 외 함께 확인된 출시 위험

지도 PR과 섞지 말고 별도 PR로 처리한다.

### P0-X1. 유료 뽑기 중복 결제

- `frontend/src/pages/gacha/GachaPull.tsx:104-164` 결과 화면 mount가 즉시 유료 POST를 실행한다.
- 중복 방지는 memory `useRef`뿐이며 reload/remount에 초기화된다.
- `frontend/src/api/gacha.ts:160-178` 요청에 idempotency key가 없다.
- 구현: 사용자 action에서 1회 intent를 만들고 서버 idempotency key + unique ledger로 비용 차감을 보호한다.
- 수용 기준: 결과 URL reload/뒤로가기/timeout 재시도 10회에도 비용과 reward 1회.

### P1-X2. 공통 API 무한 pending

- `frontend/src/api/client.ts:94-196`에 timeout/AbortController 정책이 없다.
- `frontend/src/App.tsx:289-335`는 session verify 종료 전 라우트를 열지 않아 pending 연결에서 Splash가 무기한 유지된다.
- 구현: GET/POST 성격별 timeout, 안전한 retry, 결과 불명 POST reconciliation을 설계한다.
- 수용 기준: session verify timeout 뒤 재시도 가능한 오류 화면. POST timeout 뒤 결과 조회 없이 즉시 중복 실행하지 않음.

---

## 8. 필수 테스트 매트릭스

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| AUTH-01 | 유효 UUID + token 없음 | 보호 API 401/419 |
| AUTH-02 | A token + B body/query ID | 403 또는 A principal 강제 |
| AUTH-03 | 기존 전화번호 register | credential 변경 없음 |
| LOC-01 | 로그인/홈/작성 화면 진입 | native GPS 호출 0회 |
| LOC-02 | 공개 feed 조회 | 원본 좌표 없음 |
| LOC-03 | 권한 거절/지역 밖 | Bến Thành을 사용자 위치로 저장하지 않음 |
| DM-01 | 비참여자 send/read/get | 모두 403 |
| DM-02 | A token + sender B | 사칭 불가 |
| MAP-01 | bbox 안 오래된 feed + 밖 최신 100개 | 안의 feed 누락 없음 |
| MAP-02 | listing만 500 | feed 유지, listing 오류+재시도 |
| MAP-03 | blocked/HIDDEN seller | 홈/지도/검색/상세 모두 비노출 |
| MAP-04 | 빠른 pan 10회 | 이전 요청 abort, 마지막 bbox만 반영 |
| ROUTE-01 | D1 밖 실제 위치 | origin이 실제 위치와 일치 |
| ROUTE-02 | 권한 거절 | 가짜 경로 미생성 |
| GPS-01 | 같은 msg 10회 | mileage/quest 각각 1회 |
| GPS-02 | 처리 commit 후 worker kill | 재기동 후 중복 없음 |
| GPS-03 | A→B device remap | worker 재시작 없이 B 귀속 |
| GPS-04 | backlog 정상 event time | 처리속도로 noise 폐기되지 않음 |
| REWARD-01 | client success + 미완료 card | 보상 없음 |
| REWARD-02 | Redis/BFF 장애 후 복구 | 유실·중복 없이 1회 지급 |
| QUEST-01 | ICT 자정 지난 DAILY | 완료·보상 불가 |
| BOOT-01 | 새 disposable volume | init/migration/readiness 성공 |
| SAFE-01 | weather/flood upstream 500 | 안전/정상으로 표시하지 않음 |
| SAFE-02 | flood resolved 1표 | 즉시 제거되지 않음 |
| PAY-01 | 가챠 결과 reload 10회 | 차감·reward 1회 |

### 기존 회귀 하네스에 추가할 것

`tools/qm/regr-map.mjs`의 기존 happy path는 유지하되 다음을 추가한다.

- 위치 권한 거절, 서비스 지역 밖, 저장 위치 stale, 계정 전환
- listing/feed/biz/poi 중 하나만 실패하는 partial outage
- bbox completeness와 pagination/truncated 표시
- block/HIDDEN 전파
- 화면 resize/orientation/query inset 변경
- pan 중 request abort

Engine/BFF에는 현재 공백인 다음 테스트를 새로 만든다.

- session token과 principal/body ID 불일치
- DM participant/sender/read guard
- device-map 본인 검증
- GPS duplicate/ACK failure/remap/backlog
- quest outbox/callback/grant idempotency
- policy action 부분 실패와 RP 부분 실패
- fresh DB bootstrap/readiness

---

## 9. 검증·배포 절차

### 구현 전

```powershell
git status --short
git diff --stat
git submodule status
```

- unrelated 변경과 사용자 파일을 보존한다.
- `.env` 값을 출력하거나 문서에 복사하지 않는다.
- native submodule이 비어 있으면 권한/GPS/FCM 관련 완료 판정을 하지 않는다.

### 서비스 재빌드

호스트 `npm run build` 대신 변경 서비스만 Compose로 빌드한다.

```powershell
docker compose --env-file .env up --build -d bff
docker compose --env-file .env up --build -d engine worker
docker compose --env-file .env up --build -d frontend nginx
docker compose ps
```

DB bootstrap 검증은 운영/개발 기존 volume에 하지 않는다. 별도 compose project와 disposable volume에서만 수행하고 대상 이름을 먼저 확인한다.

### 완료 게이트

- [ ] 각 결함의 재현 테스트가 수정 전 실패, 수정 후 통과했다.
- [ ] AUTH/DM/위치 프라이버시 테스트를 최우선으로 통과했다.
- [ ] 기존 지도 회귀와 새 partial-failure/bbox 회귀가 통과했다.
- [ ] GPS duplicate·worker kill·BFF failure injection 테스트가 통과했다.
- [ ] fresh DB와 기존 DB upgrade 양쪽을 검증했다.
- [ ] `.env`와 `.env.example` 키셋이 같다.
- [ ] `git diff`에 요청과 무관한 리팩터링·포맷 변경이 없다.
- [ ] push/PR 직전 `/code-review`를 실행했다.
- [ ] codebase-memory 재인덱싱을 완료했다.
- [ ] 이 문서의 체크박스와 검증 결과를 갱신했다.

---

## 10. 감사 중 반증·주의한 항목

다음 PC가 같은 오판을 반복하지 않도록 기록한다.

1. `engine/app/routers/message.py`의 GPS route는 함수 위 decorator에서 `Depends(verify_service_key)`를 사용한다. 문제는 **무인증**이 아니라 GET query에 좌표가 들어가 access log에 남는 점이다.
2. 지도 pan의 오래된 응답이 최신 state를 덮는 race는 `cancelled` guard로 차단된다. 남은 문제는 네트워크 요청 자체가 abort되지 않는 것이다.
3. `quest_completed_agent`의 `BFF_INTERNAL_URL=http://bff:8080`은 compose와 맞는다. 주소 불일치는 `policy_engine`이 사용하는 별도 `BFF_BASE_URL` 기본값이다.
4. `SaigonMapV5.runLocate()`의 사용자 버튼 기반 위치 측정 자체는 정책과 맞는다. 문제는 로그인/Home/Create mount의 자동 측정과 fallback provenance다.
5. 정적 분석으로 확정할 수 없는 native service-key 보관·백그라운드 측정 주기는 submodule을 받은 PC에서 별도 확인한다.

---

## 11. 완료 정의

이 태스크는 단순히 지도 화면이 렌더된다고 완료가 아니다. 아래가 모두 충족되어야 한다.

- 사용자가 위치 버튼을 누르기 전에는 GPS 측정이 없다.
- 공개 데이터에서 사용자의 원본 위치가 노출되지 않는다.
- 서버가 인증된 principal만 신뢰하고 지도→DM→거래 전체에 같은 차단 정책을 적용한다.
- 길찾기 origin과 이동 수단·언어가 실제 사용자 컨텍스트와 일치한다.
- 지도 핀과 목록이 같은 bbox의 완전성 있는 데이터를 사용하며 장애를 0건으로 숨기지 않는다.
- GPS 이벤트와 보상은 재전달·부분 실패·worker 재시작에도 정확히 한 번의 결과를 낸다.
- clean install과 기존 DB upgrade가 모두 가능하고 readiness가 실제 의존성 상태를 반영한다.
- 위 테스트 매트릭스와 기존 회귀가 통과하고, 실기기 Android/iOS 권한·백그라운드 GPS·FCM까지 검증 기록이 남는다.
