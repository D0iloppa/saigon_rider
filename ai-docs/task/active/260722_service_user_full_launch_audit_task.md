# 서비스 사용자 관점 전 영역 출시 차단 감사 및 구현 태스크

> 작성일: 2026-07-22
> 상태: **코드상 출시 차단(P0/High) 처리 완료 — 외부 게이트·중위험 후속 대기**
> 출시 판단: **HOLD**
> SoT: 이 문서. 지도 상세 SoT는 [`260722_map_service_launch_blockers_task.md`](./260722_map_service_launch_blockers_task.md)
> 기준: `origin/main` `3755179` 재-pull 후 원격 Batch A~F와 로컬 잔여 수정 재조정
> 주의: 아래 원본 감사의 “현재 구현” 설명은 발견 당시 스냅샷이며, 현행 상태는 바로 다음 재조정 표를 우선한다.

---

## 2026-07-22 재조정 결과

원격의 감사 Batch A~F가 세션·IDOR·거래·보상·경제·피드·지원·인프라 결함 대부분을 이미 닫은 상태를 확인했다. 이번 작업은 그 이후에도 실제 사용자 피해 경로로 남은 항목만 최소 범위로 마무리했다.

| 영역 | 현행 조치 | 검증 |
|---|---|---|
| OAuth | 프로세스 메모리 state를 Redis 10분 TTL·원자적 1회 소비로 교체. callback URL에는 장기 session token 대신 2분 TTL 단회용 code만 전달하고 `/auth/oauth/exchange`에서 세션 발급 | Redis TTL·1회 소비 및 URL 비노출 단위 테스트 추가, Python compile 통과 |
| 사용자 보호 | story·피드 단건·댓글 조회와 게시물/댓글 좋아요에 양방향 차단 경계를 적용 | 차단 SQL과 상호작용 guard 회귀 테스트 통과 |
| 알림 재전달 | Redis Stream `msg_id`를 알림의 `source_event_id`로 보존하고 `(source_event_id, user_id)` 부분 유니크 인덱스로 수신자별 행을 멱등화. 재전달은 신규 행일 때만 푸시. `bff_migrate`가 fresh/기존 DB 모두에 idempotent DDL을 먼저 적용하고 BFF·worker readiness가 누락 스키마를 차단 | 정상 재전달·다중 수신자·commit 직후 crash·기존 볼륨 배포 경계 테스트 통과. 푸시는 at-most-once이며 아래 FD-6 한계 유지 |
| 미완성 경제 기능 | 실제 fulfillment 파트너가 없는 INTERNAL coupon catalog를 `sre062`에서 비활성화하고 BFF API·앱 진입점을 제거. 서버 inventory가 잠정보류인 동안 차고 route·프로필 배너·게임 허브 진입점도 제거 | BFF 3개 경로 404/Engine 미호출, Engine 비활성 catalog 선차단, 프런트 coupon·garage 진입점 계약 테스트 |
| 번역 비용 보호 | Redis rate-limit 장애 시 유료 번역 provider 경로를 503으로 fail-closed하고 `INCR`+초기 TTL을 Redis transaction으로 원자화 | Redis 장애·부분 실패 회귀 테스트 통과 |
| 운영 seed | PostgreSQL `app.seed_profile`을 dev/prod compose에서 명시하고 `[DEV]` 광고·사업자·뉴스·리뷰 seed를 dev 전용 블록으로 격리 | `tools/check_production_seed_safety.py` 및 pre-commit gate 통과 |
| 안전 정보 | 침수 조회 null/실패를 “안전/0건”과 분리하고, 응답 전에도 안전으로 표시하지 않도록 loading/ready/unavailable을 분리. 침수 제보 GPS는 사용자의 명시적 버튼 이후에만 요청. 날씨 기본 좌표·query·지도·GPS provenance와 요청 간 경합을 분리 | `infoLaunchSafety.contract.test.mjs` 5/5 통과 |
| 업로드 | 컨텐츠 디렉터리 생성과 파일 저장을 `asyncio.to_thread`로 넘겨 event loop 동기 I/O를 제거 | stdlib 계약 테스트 1/1 통과 |

### 코드상 비차단 후속

- **ADM-6 (2026-07-23 해결)**: 관리자 로그인 브루트포스 throttle 도입. `backend/app/services/admin_login_throttle.py` — Redis 기반 escalating lockout(1분→5분→15분→1시간)을 **username** 과 **client IP** 두 축에 독립 적용(legacy `/admin-legacy/login` + JSON `/admin/api/auth/login` 양쪽 배선). client IP 는 nginx `$proxy_add_x_forwarded_for` 의 **마지막 홉**(위조 불가)에서 취한다. Redis 장애 시 fail-open(관리자 lockout 방지, 자격증명은 여전히 요구). 검증: `test_admin_login_throttle.py`(임계 lockout·429 Retry-After·fail-open·IP 파싱).
- **DB-6 (2026-07-23 해결)**: `tools/check_migration_prefixes.py` — `database/init/*.sql` 의 기존 중복 prefix(002/042/092/093/138)를 baseline 로 grandfather 하고 **새 중복 도입만** 차단. pre-commit `migration-prefix-lint` 훅 배선. 검증: `test_migration_prefix_lint.py` 4/4.
- **FD-6**: producer의 도메인 커밋과 Redis publish를 묶는 durable outbox가 없다. 또한 현재 알림 worker는 중복 푸시 방지를 우선해 at-most-once로 동작하므로, notification 행 커밋 직후 provider 호출 전에 프로세스가 종료되면 인앱 행만 남고 푸시는 유실될 수 있다. provider 멱등 키를 포함한 delivery outbox가 후속으로 필요하다.
- **BIZ-9**: 번역 provider 실패 시 일부 소비 화면이 원문 fallback을 번역 성공처럼 보일 수 있어 공통 실패 표시가 필요하다.

이 항목들(FD-6·BIZ-9)은 이번 재감사에서 P0/High 피해 경로와 분리한 중위험 후속이며, 해결 전까지 상태 문구를 전체 `COMPLETE`로 올리지 않는다.

### 출시 전 외부 게이트

- Android/iOS native submodule과 실기기에서 권한 프롬프트, 백그라운드 GPS, FCM, OAuth 딥링크 왕복을 검증해야 한다.
- 실제 Google Routes/날씨/스토어 키와 운영 도메인·TLS 환경에서 외부 실패 주입 및 worker kill/retry를 검증해야 한다.
- 이 PC에는 Docker와 프런트 의존성이 없어 compose build·fresh-volume bootstrap·브라우저 E2E를 실행하지 못했다.
- 가입 전 약관 동의 버전, 개인정보 내보내기·탈퇴 보존 범위는 제품·법무 결정과 실제 문안 확정이 필요하다.

따라서 **저장소에서 확인된 즉시 출시 차단(P0/High) 경로는 닫았지만, 위 외부 게이트가 끝나기 전 출시 판단은 HOLD**다. 이 문서의 전체 완료 정의에는 실기기·fresh DB 종단 검증이 포함되므로 태스크 자체를 완료 상태로 바꾸지 않는다.

---

## 0. 원본 감사 결론 (발견 당시 스냅샷)

발견 당시 구현은 출시하면 안 되는 상태였다. 화면 완성도의 문제가 아니라 사용자가 다음 피해를 실제로 겪을 수 있었다.

1. 전화번호 또는 공개 UUID만으로 계정 탈취·사칭·개인정보 조회·재화 사용이 가능하다.
2. 글쓰기 화면 진입만으로 정확한 GPS가 기본 첨부되고 공개 피드 API가 원본 좌표를 반환한다.
3. 제3자 두 명이 다른 판매자의 매물을 강제로 `RESERVED`로 잠글 수 있다.
4. 실제 주행 없이 퀘스트 보상을 만들 수 있고 운영 라우터에 강제 완료용 디버그 API가 열려 있다.
5. 500 RP를 차감하는 쿠폰이 실제 제휴 쿠폰이 아니라 매장에서 수납할 수 없는 임의 문자열이다.
6. 날씨 제공자 장애를 오래된 임의 날씨로 바꾸어 실데이터처럼 표시하고, 침수 예측 장애는 기존 위험 데이터를 삭제한다.
7. 길찾기 출발지가 실제 사용자 위치가 아니라 Bến Thành으로 강제될 수 있으며 자동차 경로를 오토바이 안내처럼 보여 준다.
8. 앱 부팅·안전정보·지원 화면은 장애를 무한 로딩, 빈 목록, 안전 상태로 위장한다.
9. 가챠·쿠폰·퀘스트 보상은 응답 유실과 부분 실패를 복구할 멱등성·원장이 부족해 이중 차감 또는 보상 유실이 가능하다.
10. 깨끗한 운영 DB 초기화가 실패할 수 있고, 성공하더라도 `[DEV]` 광고·승인 업체가 사용자에게 노출될 수 있다.

가장 먼저 해야 할 일은 기능 추가가 아니라 **피해 경로를 닫는 것**이다. P0 임시 차단 → 인증 주체 복구 → 안전·거래·재화 정합성 순서로 진행한다.

---

## 1. 원본 착수 지침 (재조정 이전 기록)

1. 루트 `AGENTS.md`, `ai-docs/INDEX.md`, `ai-docs/context/current.md`, `ai-docs/agent-guidelines.md`를 먼저 읽는다.
2. `git status --short`로 기존 변경을 확인하고 사용자 소유 파일을 보존한다.
3. 이 문서의 함수·라우트는 codebase-memory `search_graph` → `get_code_snippet` → `trace_path` 순서로 다시 확인한다.
4. 첫 PR은 아래 **Phase 0 피해 차단**만 수행한다. 인증·거래·재화 대수술을 한 PR에 섞지 않는다.
5. 각 결함은 실패 테스트를 먼저 만들고, 수정 후 같은 테스트가 통과해야 완료다.
6. 프론트 검증은 프로젝트 규칙대로 Docker Compose 재빌드를 사용한다. 호스트에서 `npm run build`를 직접 실행하지 않는다.
7. 코드를 수정한 세션은 종료 전에 `/mnt/c/DEV/saigon_rider`를 codebase-memory로 재인덱싱한다.
8. P0 해소 전 실제 쿠폰, 광고 과금, 보상성 이벤트, 신규 사용자 유입을 열지 않는다.

### 권장 PR 분리

| PR | 범위 | 핵심 검증 |
|---|---|---|
| PR-0 | kill switch·노출 차단 | 피해 기능이 UI와 API 양쪽에서 닫힘 |
| PR-1 | 세션·계정복구·principal | UUID만으로 모든 보호 API 호출 실패 |
| PR-2 | endpoint별 소유권·차단·신고 | A 세션으로 B 자원 변경 불가 |
| PR-3 | 위치·피드·지도·길찾기·안전정보 | 가짜 위치/날씨/안전 상태 0건 |
| PR-4 | DM·거래 상태 머신 | 제3자 예약·이중 약속·재판매 불가 |
| PR-5 | 퀘스트·보상·가챠·쿠폰·원장 | 재전송/응답 유실에도 정확히 1회 |
| PR-6 | 부팅·업데이트·딥링크·알림·네이티브 | 오프라인/구버전/로그인 왕복 복구 |
| PR-7 | 법적 고지·지원·업로드·사업자 신뢰 | 사용자 약속과 실제 동작 일치 |
| PR-8 | fresh DB·운영 seed·E2E release gate | 일회용 volume에서 종단 시나리오 통과 |

---

## 2. 감사 범위와 방법

주석이나 문서의 완료 주장만 신뢰하지 않고 다음 실제 구현 경로를 대조했다.

```text
frontend/src/main.tsx
  → frontend/src/App.tsx 전체 사용자 route
  → 각 페이지·store·api client·NativeInterface
  → BFF router/dependency/service/model
  → Engine router/service/worker/job/DB function
  → database/init + Alembic + compose/nginx
```

점검 영역:

| 사용자 영역 | 실제로 따라간 경로 | 판정 |
|---|---|---|
| 앱 진입·세션·온보딩 | splash, OAuth, session verify, profile setup, private route | P0/P1 |
| 홈·동네지도·길찾기 | WorldMapV2, NeighborhoodMap, SaigonMapV5, RideNav, route API | P0/P1 |
| 피드·소셜 | 글/댓글/좋아요/스토리/팔로우/차단/신고 | P0/P1 |
| 중고거래·DM | 매물, 제안, 약속, 완료, 리뷰, 채팅, 알림 | P0/P1 |
| 사업자·광고 | 신청, 수정, 리뷰, 광고 생성·노출·심사 | P1 |
| 퀘스트·라이딩 | accept/start/GPS/card/submit/callback/reward | P0/P1 |
| 경제 | Gold/EXP/RP, 가챠, 상점, 인벤토리, 쿠폰, 시즌 | P0/P1/P2 |
| 라이더 정보 | 날씨, 침수, 주유소, 정비소, 제보·보상 | P0/P1 |
| 설정·알림·지원 | 업데이트, 딥링크, FCM, FAQ, 고객센터, 탈퇴·내보내기 | P0/P1 |
| 네이티브·배포 | Capacitor config, native bridge, compose, migration, health | P0/P1 |
| 공개 랜딩 | 공개 route, CTA, 개인정보 링크, 가입 화면 | P2 |

관리자 전용 화면은 전체 UI 품질 대상에서는 제외했지만, 신고 처리·지원 답변·사업자 심사·쿠폰 fulfillment처럼 사용자 결과를 바꾸는 연결 지점은 포함했다.

### 감사 제약

- 이 PC에는 Docker 실행 파일과 `frontend/node_modules`가 없어 컨테이너·브라우저 E2E를 실행하지 못했다.
- `native/android`, `native/ios` 내용이 비어 있어 권한 프롬프트, FCM, 앱링크, IAP의 실제 바이너리 동작은 확인하지 못했다.
- 외부 지도·날씨·쿠폰 제휴사의 운영 콘솔/계약은 확인 대상이 아니었다. 아래 확정 결함은 저장소 코드만으로 재현 가능한 계약 위반이다.
- 런타임 재현이 필요한 항목은 별도로 **실기기/운영 확인 필요**라고 표시했다.

---

## 3. P0 — 출시 전에 반드시 닫을 결함

## P0-1. UUID-only 인증과 전화번호 재등록으로 전체 계정 탈취

### 확인된 구현

- `frontend/src/lib/session.ts:24-27`은 토큰을 저장하지만 `frontend/src/api/client.ts:86-89`은 모든 요청에 `X-User-Id`만 보낸다.
- `backend/app/deps.py:50-71`은 UUID의 존재와 계정 상태만 확인하고 세션 토큰을 검증하지 않는다.
- `backend/app/routers/auth.py:63-107`의 공개 `/auth/register`는 기존 전화번호의 passcode hash를 OTP 없이 교체하고 새 passcode를 반환한다.
- 공개 사용자 응답과 `frontend/src/pages/profile/ProfileMain.tsx:913-924`의 QR로 UUID를 얻을 수 있다.
- 위조 principal로 계정 삭제 `backend/app/routers/users.py:243-261`, 개인정보 내보내기 `:265-326`, 전화번호 연결 `backend/app/routers/auth.py:317-437`까지 호출할 수 있다.
- OAuth session token도 URL query에 노출된다: `backend/app/routers/auth.py:568-570,675-677,757-770`, `frontend/src/pages/auth/OAuthResult.tsx:18-29`.

### 사용자 피해

- 공격자가 피해자 계정으로 DM·게시물·매물·퀘스트·상점·쿠폰을 조작하고 계정을 삭제할 수 있다.
- 전화번호만 알면 credential을 재설정하고 전화번호·잔액·활동 이력을 읽을 수 있다.

### 구현 요구

- [ ] 만료·폐기·회전 가능한 서버 세션을 검증하고 principal을 서버에서 파생한다.
- [ ] 외부 `X-User-Id`를 nginx와 BFF에서 제거/무시한다.
- [ ] 기존 전화번호 재등록을 제거하고 OTP를 통과한 recovery 흐름으로 분리한다.
- [ ] passcode 원문 응답과 장기 토큰 URL 전달을 제거한다. OAuth URL에는 1회용 code만 둔다.
- [ ] 현재 발급된 passcode/session을 회전하고 과거 비정상 호출을 감사한다.
- [ ] 공개 프로필 DTO와 본인 전용 개인정보 DTO를 분리한다.

### 수용 기준

- 토큰 없음/위조/만료 + 유효한 피해자 UUID는 모든 보호 API에서 `401/419`다.
- 기존 전화번호만으로 passcode가 바뀌지 않는다.
- OAuth callback URL, history, access log, Referer에 장기 토큰이 없다.
- 계정 삭제·내보내기·전화번호 변경은 재인증된 본인만 가능하다.

---

## P0-2. 인증 수정 후에도 남는 endpoint별 IDOR와 알림 탈취

전역 세션을 고쳐도 아래 route는 body/query의 사용자 ID나 자원 ID를 따로 신뢰하므로 독립 수정이 필요하다.

- 프로필 아바타·닉네임·라이더 타입: `backend/app/routers/profile.py:54-97,100-122,134-165`.
- 피드 수정·삭제·게시물/댓글 좋아요: `backend/app/routers/feed.py:245-313,379-404`.
- DM 생성·발송·읽음: `backend/app/routers/dm.py:192-239,341-437`.
- 퀘스트 조회·수락·시작·포기: `backend/app/routers/quests.py:248-273,451-499`, `backend/app/routers/user_quests.py:35-45,89-129`.
- 타인의 찜·키워드 알림 조회: `backend/app/routers/market.py:829-856`.
- 무인증 device/FCM 매핑 교체: `backend/app/routers/auth.py:138-152`, `engine/app/routers/device_map.py:50-115,142-171`.

### 구현 요구 및 수용 기준

- [ ] 행위자 ID는 오직 세션 subject에서 가져오고 body/query `user_id`를 제거한다.
- [ ] 자원 mutation마다 owner/participant/role guard를 공통 적용한다.
- [ ] 사용자 A 세션 + B의 자원 ID 조합을 endpoint별 음성 테스트로 고정한다.
- [ ] device-map은 로그인한 subject와 현재 기기만 묶고 token refresh·logout·account switch를 원자적으로 처리한다.
- [ ] 공격자 FCM token으로 피해자 매핑을 덮을 수 없고 빈 token이 유효 token을 지우지 않는다.

---

## P0-3. 정확 위치가 기본 공개되고 위치 동의가 우회됨

- `frontend/src/pages/feed/FeedCreate.tsx:35-38`의 위치 첨부 기본값은 ON이다.
- 같은 파일 `:53-66`은 화면 진입 즉시 위치를 측정하고 `:131-138`은 원본 좌표를 전송한다.
- UI `:203-216`은 동네명만 보여 정확 좌표 공개를 인지하기 어렵다.
- 공개 `GET /feed`가 원본 좌표와 사용자 정보를 반환한다: `backend/app/routers/feed.py:54-77,81-140,160-180`.
- 로그인과 일부 화면 진입만으로 GPS가 시작되는 경로도 있다. 상세 목록은 지도 SoT P0-2 참조.

### 구현 요구 및 수용 기준

- [ ] 모든 자동 위치 측정을 제거하고 사용자가 현재 위치 버튼을 누른 뒤에만 권한을 요청한다.
- [ ] 위치 첨부 기본 OFF, 공개 단위 확인을 필수로 한다.
- [ ] 공개 DTO에서 원본 위·경도를 즉시 제거한다. 기존 게시물도 응답 단계에서 마스킹한다.
- [ ] 공개 지도는 ward centroid 또는 명시한 coarse/jitter 좌표만 사용한다.
- [ ] 비로그인 API와 캐시·로그에도 원본 좌표가 나오지 않는 테스트를 추가한다.

---

## P0-4. 제3자가 타 판매자 매물을 강제 예약할 수 있음

### 공격 시나리오

1. A와 B가 판매자 C의 listing ID를 `context_id`로 넣어 둘만의 DM을 만든다.
2. A가 가격을 제안하고 B가 수락한다.
3. 약속을 제안·수락하면 C의 매물이 `RESERVED`가 된다.

### 근거

- listing 대화에 실제 판매자가 참여했는지 확인하지 않는다: `backend/app/routers/dm.py:192-239`.
- 가격/약속 수락은 판매자 역할이 아니라 단순 대화 참여자 여부만 본다: `backend/app/routers/market.py:914-946,965-1036,1055-1074,1142-1216,1219-1251`.
- DB도 대화 context와 활성 약속의 역할·유일성을 보장하지 않는다: `database/init/086_dm_marketplace_context.sql:9-10`, `database/init/105_marketplace_appointments.sql:9-24`.

### 구현 요구 및 수용 기준

- [ ] listing 대화 참여자는 `{listing.seller_id, 실제 buyer}`로 고정한다.
- [ ] 가격·약속 수락 권한을 seller/buyer role로 명시한다.
- [ ] 제3자 대화 생성·수락은 `403`이고 listing 상태는 변하지 않는다.
- [ ] 매물당 활성 약속 unique constraint와 행 잠금 기반 상태전이를 도입한다.

---

## P0-5. 실제 주행 없이 퀘스트·재화 생성 가능

- `backend/app/routers/ride.py:71-137`은 클라이언트 `is_success`를 믿고 Engine 카드/GPS/만료/ACCEPTED 상태를 검증하지 않은 채 Gold/EXP를 준다.
- `backend/app/schemas.py:596-605`의 거리·시간·속도도 무제약이다.
- 운영에서 상시 등록되는 `[DBG] POST /quests/{quest_id}/complete`가 수락·GPS·기간 확인 없이 보상한다: `backend/app/main.py:138`, `backend/app/routers/quests.py:504-562`.

### 구현 요구 및 수용 기준

- [ ] 디버그 완료 route를 운영 코드에서 제거하고 호출 이력·비정상 잔액을 감사한다.
- [ ] 보상 판정은 서버가 검증한 Engine card 완료 이벤트 하나로만 수행한다.
- [ ] `/ride/submit`은 결과 표시 데이터만 받을 수 있고 상태·보상을 결정하지 못한다.
- [ ] `distance=0`, `duration=0`, `is_success=true`, 만료/포기 quest로 잔액 변화가 없어야 한다.

---

## P0-6. 500 RP를 차감하고 사용할 수 없는 가짜 쿠폰 발급

- 최신 seed는 50,000 VND 커피 쿠폰을 500 RP, `INTERNAL` 파트너로 노출한다: `engine/alembic/versions/053_coupon_catalog_coffee_only.py:31-43`.
- 같은 migration `:6-7`은 실제 제휴 발급이 추후라고 명시한다.
- `engine/app/adapters/internal.py:9-22`는 제휴사 호출 없이 `INT-<uuid>`를 만든다.
- `engine/app/services/reward.py:49-85`는 RP를 차감하고 문자열만 있으면 `FULFILLED`로 확정한다.
- 프론트는 성공 축하와 QR을 보여 준다: `frontend/src/pages/shop/CouponShop.tsx:123-136`, `frontend/src/pages/shop/MyCoupons.tsx:79-84,95-105`.

### 즉시 조치와 수용 기준

- [ ] 실제 제휴 sandbox 수납·취소·환불 E2E 전까지 쿠폰 목록과 redeem API를 모두 닫는다.
- [ ] 제휴사가 수납 가능한 voucher를 확정한 뒤에만 성공과 RP 차감을 commit한다.
- [ ] 실패/timeout/unknown 상태에서 RP가 복구되고 사용자에게 처리 상태가 보인다.
- [ ] 실제 매장 또는 제휴 sandbox에서 발급 QR을 수납하는 release test를 통과한다.

---

## P0-7. 안전정보가 장애를 정상·안전 상태로 위장

### 가짜 날씨

- OpenWeather 오류/timeout이면 하드코딩 mock을 정상 응답처럼 반환한다: `backend/app/routers/info_weather.py:67-115`.
- mock forecast 날짜는 `2026-05-21`이며 현재 화면은 source/degraded 표기 없이 표시한다: `frontend/src/pages/info/InfoWeather.tsx:40-186`.

### 침수 예측 소실

- forecast 오류를 강수확률 `0.0`으로 바꾼다: `backend/app/jobs/predict_flood_risk.py:27-42`.
- 그 결과로 기존 `flood_risk_daily` 전체를 지우고 위험 0건을 commit할 수 있다: `:45-122`.

### 한 명이 침수 경고 제거

- 다른 사용자 한 명의 `resolved` 확인만으로 즉시 report를 `RESOLVED`로 만든다. 거리·신뢰도·합의 기준이 없다: `backend/app/routers/info_flood.py:209-255`.

### 구현 요구 및 수용 기준

- [ ] 운영에서 mock을 반환하지 말고 `unavailable/stale`을 명시한다.
- [ ] 마지막 성공 데이터에는 관측시각·source·stale TTL을 함께 표시한다.
- [ ] 외부 실패 시 기존 위험 snapshot을 보존하고 새 snapshot 완성 후 원자 교체한다.
- [ ] 침수 해제는 근접성, 최소 합의 수, 신뢰도 또는 관리자 확인 정책을 둔다.
- [ ] 401/429/timeout/부분 district 실패에서 “맑음/안전/0건”으로 보이지 않는 테스트가 필요하다.

---

## P0-8. 보상 완료와 이벤트가 원자적이지 않아 중복·유실

- Engine quest tracker는 이벤트를 먼저 발행하고 마지막에 DB commit하며 Redis 실패는 삼킨다: `engine/app/services/quest_tracker.py:31-56,128-145`.
- `/ride/submit`은 BFF Gold/EXP를 commit한 후 Engine RP 이벤트를 보내고 실패해도 성공을 반환한다: `backend/app/routers/ride.py:127-164`.
- Engine 완료 callback도 Gold/EXP commit 뒤 RP를 호출하고 실패해도 `ok=True`다: `backend/app/routers/internal.py:139-176`.
- quest item은 화면·응답에만 있고 실제 inventory grant가 없다: `frontend/src/pages/quest/QuestDetail.tsx:197-220`, `backend/app/routers/internal.py:139-163`.

### 구현 요구 및 수용 기준

- [ ] card 완료와 outbox row를 같은 DB transaction으로 묶는다.
- [ ] Gold/EXP/RP/item을 하나의 completion idempotency key로 추적한다.
- [ ] dispatcher retry·DLQ·수동 재처리·잔액 보정 경로를 제공한다.
- [ ] DB commit 실패, Redis 장애, callback 응답 유실, worker 재시작 각각에서 정확히 1회 지급한다.

---

## P0-9. 길찾기가 실제 출발지·오토바이 경로 계약을 어김

- `frontend/src/pages/ride/RideNav.tsx:29,158`은 실제 GPS 대신 Bến Thành을 출발지로 강제할 수 있다.
- `backend/app/routers/info_route.py:21,64`는 `driving`과 한국어를 고정한다.
- 위치 실패 시 임의 경로를 만드는 것은 단순 편의 문제가 아니라 라이더 안전 문제다.

### 수용 기준

- 현재 위치를 누른 뒤 얻은 좌표 또는 사용자가 선택한 출발지만 사용한다.
- 권한 거절/측정 실패 시 임의 위치로 경로를 만들지 않는다.
- provider의 베트남 two-wheeler 지원을 확인하고 미지원이면 자동차 경로를 오토바이 경로로 표시하지 않는다.
- ko/en/vi 요청과 안내 언어가 일치한다.

지도 bbox·차단·핀/목록·GPS worker 세부 작업은 지도 SoT를 그대로 따른다.

---

## P0-10. fresh DB가 깨지고 운영에 개발 데이터가 노출될 수 있음

- compose DB startup은 `database/init`만 실행하고 Engine Alembic을 자동 적용하지 않는다: `docker-compose.yml:304-320`.
- `database/init/060_gacha_rate_rebalance.sql:17`은 아직 생성되지 않은 `gacha_definition`을 참조할 수 있다.
- 마켓 리뷰 DDL은 `GOOD/BAD` 문자열인데 ORM/API는 `1..5` 정수다: `database/init/088_marketplace_reviews.sql:10-19`, `backend/app/models.py:466-482`.
- init이 `[DEV]` 광고와 승인 사업자를 자동 삽입한다: `database/init/095_marketplace_ads.sql:27-46`, `database/init/096_marketplace_ads_per_district.sql:5-32`, `database/init/106_marketplace_ads_global_seed.sql:5-39`, `database/init/107_marketplace_ads_global_seed2.sql:5-39`, `database/init/113_business_partner.sql:43-48`, `database/init/114_business_dev_migration.sql:3-54`.
- health endpoint는 필수 migration과 DB/Redis readiness를 충분히 확인하지 않는다.

### 구현 요구 및 수용 기준

- [ ] init과 Alembic 중 schema SoT 및 순서를 하나로 확정한다.
- [ ] 리뷰 rating 타입을 `SMALLINT CHECK 1..5`로 통일한다.
- [ ] dev/test seed를 운영 init과 분리하고 `[DEV]`, lorem, example URL을 CI에서 차단한다.
- [ ] 완전히 새로운 일회용 volume에서 compose → migration → seed → 핵심 API smoke가 성공한다.
- [ ] readiness는 DB·Redis·migration head·필수 worker 준비 전 실패해야 한다.

---

## 4. P1 — 핵심 여정과 신뢰를 깨는 결함

## P1-1. 거래 상태 머신·후기 신뢰가 없음

- SOLD 매물을 다시 `ON_SALE`로 돌리고 가격도 바꿀 수 있다: `backend/app/routers/market.py:541-597`.
- 한 매물에 여러 활성 약속을 수락할 수 있고 하나를 취소하면 다른 약속이 있어도 판매중으로 돌아간다: `:1055-1124`, `database/init/105_marketplace_appointments.sql:9-24`.
- 판매자가 구매자 확인 없이 완료할 수 있고 이력 가격은 합의가가 아닌 현재 매물 가격이다: `backend/app/routers/market.py:1078-1096,1297-1353`.
- 실제 거래자가 아니어도 판매자에게 1점 리뷰를 남길 수 있다: `backend/app/routers/market.py:734-794`.

요구: 명시적 상태 그래프, 행 잠금, 활성 약속 unique, buyer/seller 확인, 분쟁 유예, `agreed_price/buyer_id/completed_at` 불변 snapshot, 완료 거래 참여자만 상호 1회 리뷰.

## P1-2. DM이 최신 메시지를 숨기고 보지 않은 메시지까지 읽음 처리

- 최초 50건이 최신이 아니라 오래된 메시지이며, 아직 받지 않은 최신 메시지도 읽음 처리한다: `backend/app/routers/dm.py:242-270,409-437`, `frontend/src/pages/dm/DmDetail.tsx:75-96`.
- 가격·약속 상태 변경은 상대방 이벤트/푸시/시스템 메시지가 없고 열린 화면도 갱신하지 않는다: `backend/app/routers/market.py:1005-1018,1055-1124,1187-1197,1235-1294`.

요구: latest-N cursor, 실제 표시한 최대 message ID만 read, 거래 action도 durable timeline event와 push를 생성하고 열린 대화가 갱신돼야 한다.

## P1-3. 차단·신고가 사용자 보호 기능으로 작동하지 않음

- 차단은 마켓 목록 한 방향 필터뿐이라 DM·팔로우·피드 댓글을 막지 않는다: `backend/app/routers/market.py:680-720,284-290`, `backend/app/routers/dm.py:192-239,341-405`, `backend/app/routers/feed.py:332-375`, `backend/app/routers/follows.py:53-72`.
- USER/DM 신고 unique가 사용자쌍/대화당 평생 1회라 새 사고를 다시 신고할 수 없다: `database/init/126_reports_unified.sql:28-30`.
- 메시지·콘텐츠 snapshot이 없고 관리자 해결도 숨김·제재와 연결되지 않는다: `backend/app/routers/admin_api/reports.py:226-280,294-342`.

요구: 양방향 차단, 기존 DM 정책, 사건/메시지 단위 신고, 불변 증거 snapshot, 신고자 즉시 숨김, 관리자 조치와 사유의 감사로그를 정의한다.

## P1-4. 콘텐츠 도용·고아 업로드·저장소 고갈

- 업로드 owner를 저장하지만 실제 첨부 시 소유권/용도를 확인하지 않는다: `backend/app/routers/contents.py:63-116`.
- 피드·매물·DM·사업자·광고가 전달된 content UUID를 그대로 연결한다.
- 최대 15MB를 DB commit 전에 파일로 쓰고 삭제 API, 임시 만료, 사용자 quota, GC, signature 검증이 없다: `backend/app/routers/contents.py:31-40,63-103`.
- 피드/광고는 파일 선택 즉시 업로드해 작성 취소만 해도 고아 파일이 남는다.

요구: 첨부 경계 owner/purpose guard, magic bytes·크기·치수 검사, 임시 upload TTL, quota/rate limit, DB 실패 rollback, unreferenced GC.

## P1-5. 사업자·광고 신뢰 계약이 불완전

- 승인 업체의 이름·주소·좌표·전화·업종을 바꿔도 재심사 없이 즉시 공개된다: `backend/app/routers/biz.py:154-181,414-453`.
- 사업자 본인이 셀프 5점 리뷰를 작성할 수 있다: `backend/app/routers/biz.py:574-608`.
- 광고에는 예산·단가·결제·노출/클릭 원장·캡·필수 기간·지역 타게팅이 없다: `backend/app/schemas.py:1305-1311`, `backend/app/models.py:708-743`, `backend/app/routers/biz.py:223-253`.

요구: 중요 필드 재심사와 공개본 versioning, self-review 금지, 광고가 유료인지 무료 홍보인지 제품 계약을 먼저 확정하고 그에 맞는 과금/노출/환불 또는 무료 상한을 구현한다.

## P1-6. 가챠 응답 유실이 이중 차감·이중 추첨으로 이어짐

- 화면 진입 즉시 pull을 실행하고 request id가 없다: `frontend/src/pages/gacha/GachaPull.tsx:103-162`, `frontend/src/api/gacha.ts:160-179`.
- 15초 타이머는 요청을 취소하지 않고 실패 화면만 보여 준다.
- BFF/Engine도 멱등 키를 저장하지 않는다: `backend/app/routers/gacha.py:95-110`, `engine/app/services/gacha.py:89-107`.
- 목록/eligibility는 기간·시즌·실제 가격을 다르게 판정해 노출 후 구매 실패가 가능하다: `engine/app/services/gacha.py:12-21,55-86`.

요구: 앱 재시작에도 보존되는 `pull_request_id`, 동일 키 결과 replay, 목록/eligibility/pull 단일 판정, 서버 commit 후 응답 유실 E2E.

## P1-7. 쿠폰 재시도·월 한도·만료 계약이 깨짐

- 클릭마다 새 idempotency key라 응답 유실 후 재클릭하면 이중 차감된다: `frontend/src/pages/shop/CouponShop.tsx:40-55`, `engine/app/services/reward.py:22-31`.
- `monthly_issued`는 월이 아니라 영구 누적이며 reset job도 없다: `engine/app/services/reward.py:43-44,67-68`, `engine/app/main.py:38-75`.
- 목록 기간과 실제 redeem 판정이 다르고 partner 비활성·voucher 만료를 강제하지 않는다: `engine/app/routers/catalog.py:23-30`, `engine/app/services/reward.py:33-85`.

요구: 논리적 구매 동안 key 보존과 결과 복구, VN 월별 quota key, sold-out 표시, redeem 시점 catalog/partner/기간 재검증, 만료·취소·환불 상태 머신.

## P1-8. 재화·아이템 보상 약속과 실제 지급 불일치

- 퀘스트 item은 표시만 되고 지급되지 않는다.
- RP는 적립·차감 거래 원장이 없어 분쟁 시 잔액을 재구성할 수 없다: `engine/app/services/xp_ledger.py:67-87`, `engine/app/services/reward.py:49-68`.
- 활성 정책 action 실패 후에도 rewarded log를 기록할 수 있다: `engine/app/services/policy_engine.py:175-188`.

요구: 모든 재화를 멱등 ledger로 통일, completion별 지급 component 상태, 자동 reconcile, 표시된 item이 inventory에 정확히 1회 들어가는 종단 테스트.

## P1-9. 상점 특가와 시즌 화면이 서버 계약과 다름

- Engine 특가의 nested `item`을 BFF가 잘못 매핑해 빈 이름·0%·`00:00:00`을 만들 수 있다: `engine/app/schemas.py:527-534`, `backend/app/engine_client.py:187-202,230-241`, `frontend/src/pages/shop/ShopCatalog.tsx:48-83`.
- 시즌은 메뉴에서 coming soon이지만 `/season` direct route는 열린다.
- BFF는 실제 reward 대신 임의 문구를 만들고 free/premium claimed를 하나로 취급한다. Engine claim도 실제 재화를 지급하지 않는다: `backend/app/routers/season.py:42-83`, `engine/app/services/season.py:93-136`.
- premium CTA에는 handler가 없다: `frontend/src/pages/season/SeasonPass.tsx:127-155`.

요구: Engine response fixture 계약 테스트, VN timezone, 미완성 route 완전 차단 또는 종단 구현, free/premium claim 분리와 실제 지급.

## P1-10. API 공통 계층이 장애를 무한 로딩·빈 상태로 위장

- `frontend/src/api/client.ts:94-196`에는 timeout/AbortController가 없고 `silent` 오류는 typed `null`로 반환한다.
- session verify가 pending이면 `frontend/src/App.tsx:289-335` 전체가 splash에 고정된다.
- 날씨·침수·주유·정비·지원·FAQ 등은 오류를 빈 배열, 대시, “문제 없음”으로 보이게 한다.
- 소비자 frontend에는 ErrorBoundary가 없다: `frontend/src/main.tsx:10-14`.
- `VITE_USE_MOCK`이 명시적으로 false가 아니면 mock이 기본이다: `frontend/src/api/client.ts:14-15`. Dockerfile은 false지만 다른 release build는 가짜 데이터를 포함할 수 있다.

요구: 공통 timeout·abort·retry budget, typed result/error, safety API에서 silent 금지, loading/error/empty/stale 분리, 재시도·오프라인 화면, root/route ErrorBoundary, production build에서 mock compile-time 차단.

## P1-11. 세션·온보딩·OAuth 실패 복구가 깨짐

- 쿠키만 없어지고 persisted Zustand가 남으면 보호 화면이 로그인처럼 열린다: `frontend/src/store/useUserStore.ts:58-69,173-178`, `frontend/src/components/auth/PrivateRoute.tsx:9-17`.
- profile setup 저장 실패 후에도 Home으로 이동해 미완료가 영구화된다: `frontend/src/pages/auth/ProfileSetup.tsx:77-95`.
- OAuth provider credential 401도 전체 세션 만료로 처리한다: `frontend/src/api/client.ts:120-135`, `frontend/src/api/auth.ts:58-63`.
- 앱 설정 조회 오류는 Google 버튼을 클릭 불가능한 버튼 모양으로 남긴다: `frontend/src/api/appVersion.ts:9-21`, `frontend/src/pages/auth/OAuthLogin.tsx:86-124,299-305`.

요구: auth state `unknown/authenticated/anonymous`, 서버 검증 전 민감 화면 금지, onboarding 완료 flag와 retry, provider 오류와 session 오류 분리, 로그인 설정 장애 UI.

## P1-12. 약관·탈퇴·내 데이터 약속이 실제 동작과 다름

- 로그인 화면 약관/개인정보는 클릭 불가능한 `span`이고 정책 route는 로그인 뒤에 있다: `frontend/src/pages/auth/OAuthLogin.tsx:312-317`, `frontend/src/App.tsx:427-437`.
- 동의 version/time 기록이 없다.
- UI는 영구 삭제/30일 삭제를 약속하지만 서버는 일부 필드 익명화와 `deleted_at`만 설정한다: `backend/app/routers/users.py:243-261`.
- export는 DM·거래·팔로우·지원·알림·OAuth·기기 데이터를 누락하고 native는 파일 대신 JSON 공유를 연다: `backend/app/routers/users.py:265-326`, `frontend/src/lib/native.ts:407-427`.

요구: 로그인 전 정책 열람, versioned consent, 실제 purge 정책과 문구 일치, 관계 데이터 범위 명문화, 실제 파일 export와 실패 상태.

## P1-13. 강제 업데이트와 원격 셸 장애 복구가 없음

- 서버 `is_force_update`를 프론트가 파싱만 하고 startup에서 쓰지 않는다: `backend/app/routers/app_version.py:30-44`, `frontend/src/api/appVersion.ts:24-67`.
- 설치 버전 조회는 `unknown` stub이고 설정은 설치 버전 대신 서버 최신 버전을 표시한다: `frontend/src/lib/native.ts:482-488`, `frontend/src/pages/settings/Settings.tsx:30-36,64-81,175-177`.
- Capacitor는 `https://saigon.doil.me` 원격 origin에 고정돼 DNS/TLS/5xx가 앱 전체 장애가 된다: `frontend/capacitor.config.ts:3-13`.

요구: 실제 설치 version/build 조회, startup 최소버전 비교와 우회 불가 update 화면, store 이동, bundled recovery shell 또는 native load-failure UI, offline/DNS/TLS 실기기 테스트.

## P1-14. 딥링크·알림 설정·FCM 전달이 유실됨

- 비로그인 딥링크 목적지를 저장하지 않고 splash로 보내 로그인 후 Home으로 고정된다: `frontend/src/pages/link/LinkRouter.tsx:31-41`, OAuth 화면들.
- 일반 app URL listener는 no-op이다: `frontend/src/lib/native.ts:499-501`.
- 알림 설정은 GET 전 true snapshot을 편집·전체 PUT해 숨은 false 값을 덮을 수 있다: `frontend/src/pages/settings/NotiSettings.tsx:15-75`.
- push worker는 `{sent,failed}`를 확인하지 않고 재시도 없이 처리하며 FCM token refresh listener도 연결되지 않았다: `backend/app/noti_worker/__main__.py:62-71`, `frontend/src/lib/native.ts:288-303`.

요구: allowlist 목적지 1회 보존/복원, cold/warm app-link E2E, 설정 PATCH 또는 CAS, save serialization, FCM result 검사·retry/DLQ, token refresh mapping.

## P1-15. 라이더 정보 화면의 보이는 약속이 실제로 작동하지 않음

- 위치 실패를 알리지 않고 HCMC 고정 좌표 `10.776,106.700`으로 대체해 현재 주변 정보처럼 표시한다: `frontend/src/pages/info/InfoHub.tsx:15-23`, `frontend/src/pages/info/InfoWeather.tsx:25-38`.
- 비 알림 등록 API는 `notify_rain=true`만 저장하고 읽어 발송하는 job이 없다: `backend/app/routers/info_weather.py:266-300`, `backend/app/main.py:51-79`.
- 침수·정비 사진 버튼은 실제 업로드 없이 boolean만 켜며 화면은 사진 보상을 즉시 받을 것처럼 계산한다: `frontend/src/pages/info/InfoFloodReport.tsx:22-176`, `frontend/src/pages/info/InfoRepairWrite.tsx:16-235`.
- 정비소 전화·길찾기·공유와 주유소 전화 버튼이 동작하지 않는다: `frontend/src/pages/info/InfoRepairDetail.tsx:203-205`, `frontend/src/pages/info/InfoGasList.tsx:258`.
- translation provider key가 없으면 원문을 번역 성공처럼 반환한다: `backend/app/services/translate.py:90-111`.

요구: 위치 실패/수동 지역 선택, 실제 rain scheduler 또는 CTA 제거, content upload 완료 후만 사진 보상 표시·지급, dead CTA 구현/제거, 번역 unavailable 표시.

## P1-16. 고객센터·FAQ가 막다른 흐름이며 장애를 숨김

- 사용자는 ticket 생성·목록·상세만 있고 관리자 추가 질문에 답할 API/UI가 없다: `backend/app/routers/support.py:17-81`, `frontend/src/pages/settings/SupportDetail.tsx:27-60`.
- 관리자 답변은 push/in-app event를 만들지 않는다: `backend/app/routers/admin_api/support.py:153-174`.
- 지원·상세·FAQ fetch 실패는 빈 화면/목록으로 보인다.

요구: 사용자 reply, reopen/state transition, 양측 unread, 답변 알림, loading/error/empty/retry, 중복 제출 방지.

## P1-17. 지도 데이터·GPS worker 정합성

상세 구현 요구와 수용 기준은 [`260722_map_service_launch_blockers_task.md`](./260722_map_service_launch_blockers_task.md) P1/P2를 따른다. 특히 다음은 독립 launch gate다.

- bbox 전에 최신 N건을 가져와 client filter하므로 화면 안 데이터가 누락됨.
- 오류를 0건으로 바꿔 “주변에 없음”처럼 보임.
- block/HIDDEN 상태가 지도·상세·DM에 일관되게 적용되지 않음.
- 위치 store가 좌표·지역명·계정·측정시각을 원자적으로 관리하지 않음.
- process-local device cache, 중복 GPS event, 처리 지연 기반 speed 계산으로 거리·퀘스트가 오염될 수 있음.

## P1-18. 다국어·접근성 핵심 경로 차단

- locale 변경 시 `<html lang>`이 갱신되지 않고 viewport가 확대를 막는다: `frontend/src/lib/i18n.ts:12-40`, `frontend/index.html:2,9`.
- Toggle에 접근 가능한 이름이 없고 OTP label/autocomplete도 없다.
- 지원·FAQ는 클릭 가능한 `div`라 키보드로 사용할 수 없다.
- 날씨 condition은 provider raw 문자열, 침수 `time_ago`는 서버 한국어로 섞일 수 있다.

요구: document lang 동기화, 확대 허용, control name/role/focus/state, OTP semantics, 키보드·스크린리더 자동 검사, locale-neutral DTO.

---

## 5. P2 — 미완성·오인·운영 부채

| ID | 사용자 관점 문제 | 근거/조치 |
|---|---|---|
| P2-1 | item 상세의 wishlist 하트가 아무 동작도 하지 않음 | `frontend/src/pages/shop/ItemDetail.tsx:143-144`; 구현하거나 제거 |
| P2-2 | 시즌 premium upsell과 claim이 보이지만 동작하지 않음 | `frontend/src/pages/season/SeasonPass.tsx:127-155`; route 자체를 숨기거나 종단 구현 |
| P2-3 | IAP·광고 wrapper만 있고 receipt 검증·restore·서버 entitlement 없음 | `frontend/src/lib/plugins/IAP.ts`, `frontend/src/lib/plugins/Ad.ts`; 출시 기능으로 노출 금지 |
| P2-4 | story가 만료 시간 없이 영구 노출 | `backend/app/routers/feed.py:144-156`; TTL 필터 추가 |
| P2-5 | 매물 조회수·사업자 view-ping이 중복/위조 가능 | `backend/app/routers/market.py:370-383`, `backend/app/routers/biz.py:611-621`; unique/session 기준 정의 |
| P2-6 | 매물 설명·사진·위치를 수정/삭제할 수 없어 민감정보 회수가 어려움 | `backend/app/routers/market.py:541-597`; owner edit/soft-delete와 거래 snapshot 분리 |
| P2-7 | 닉네임 중복 확인의 역순 응답이 최신 입력 상태를 덮을 수 있음 | `frontend/src/pages/auth/ProfileSetup.tsx:54-72`; cancel/request-id 검사 |
| P2-8 | 랭킹은 구현 경로가 없고 Mission은 사용자 진입·등록이 없으며 season은 direct route만 남음 | 미완성 feature는 route/API까지 닫기 |
| P2-9 | 공개 랜딩의 product/security/solutions/how-it-works/pricing/resources/contact 7개 route가 모두 같은 Home alias | `landing/apps/client/src/pages/home/Index.tsx:284-290`; 실제 페이지 구현 또는 route 제거 |
| P2-10 | 번역·날씨·침수 시간 문자열이 locale-neutral하지 않음 | provider raw/서버 한국어 제거, locale은 client 표시층에서 적용 |

---

## 6. Phase별 구현 순서

## Phase 0 — 24시간 내 피해 차단

- [ ] `/auth/register` 기존 번호 재설정과 `[DBG] /quests/{id}/complete` 운영 노출 차단.
- [ ] 쿠폰 목록/redeem, client-authoritative ride reward 비활성화.
- [ ] 공개 feed 원본 좌표 제거, 위치 기본 OFF, 자동 GPS 중단.
- [ ] OpenWeather mock 응답 중단. 안전정보 장애는 unavailable로 표시.
- [ ] flood predictor가 실패 snapshot으로 기존 테이블을 지우지 않게 차단.
- [ ] 제3자 listing context DM/약속을 서버에서 차단.
- [ ] 현재 credential/session/device-map을 회전할 incident plan 작성.

검증: 외부에서 curl로 기존 공격 시나리오가 모두 실패하고, 숨긴 기능은 direct API 호출도 거부한다.

## Phase 1 — 인증 principal과 소유권 복구

- [ ] 서버 session store/cookie/token 검증과 principal dependency 통일.
- [ ] body/query `user_id` 전수 제거 또는 strict mismatch 403.
- [ ] profile/feed/DM/quest/market/content/device-map owner·participant guard.
- [ ] 차단·정지·삭제 사용자의 모든 보호 API 공통 정책.

검증: A/B 교차 사용자 음성 테스트를 모든 mutation endpoint에 table-driven으로 적용.

## Phase 2 — 위치·지도·안전·거래

- [ ] 지도 SoT PR-2~PR-4 수행.
- [ ] 날씨/침수 snapshot과 stale/source 계약.
- [ ] 거래 role/state/active appointment/snapshot/locking.
- [ ] 차단·신고·증거 snapshot.

검증: 실제 사용자 위치, provider 장애, A/B/C 강제 예약, 동시 약속, 차단 후 DM 종단 시나리오.

## Phase 3 — 재화와 보상

- [ ] completion outbox와 Gold/EXP/RP/item 통합 idempotency.
- [ ] RP ledger/reconcile.
- [ ] gacha/coupon request id와 result replay.
- [ ] 실제 coupon partner fulfillment·refund.
- [ ] 특가 DTO와 season 계약.

검증: commit 직후 연결 단절, retry, worker crash, duplicate callback을 주입해 정확히 한 번의 잔액·아이템 변화 확인.

## Phase 4 — 앱 생존성·네이티브·법적 경로

- [ ] timeout/error/empty/stale 공통 상태와 ErrorBoundary.
- [ ] installed version/force update, remote origin recovery.
- [ ] deep link login round-trip, FCM refresh/retry.
- [ ] public legal pages, consent version, purge/export 계약.
- [ ] 접근성 기본선.

검증: offline/DNS/TLS/5xx/구버전/cold-start/warm-start/비로그인 deep link 실기기 매트릭스.

## Phase 5 — 신뢰·운영·지원

- [ ] 고객센터 양방향 reply와 알림.
- [ ] content upload lifecycle·GC.
- [ ] business 재심사·review 정책·광고 상품 계약.
- [ ] 미완성/죽은 CTA 제거 또는 구현.
- [ ] dev seed 분리와 fresh DB release gate.

---

## 7. 필수 회귀 테스트 매트릭스

| 영역 | 반드시 자동화할 시나리오 | 성공 기준 |
|---|---|---|
| 인증 | UUID만, 위조 token, 만료 token, 기존 번호 register | 모두 계정 접근/credential 변경 불가 |
| 소유권 | A token + B profile/feed/quest/DM/content ID | 모든 mutation 403, B 데이터 불변 |
| 위치 | feed 작성 진입·기본 게시·비로그인 feed 조회 | 자동 GPS 0회, 원본 좌표 0개 |
| 지도 | bbox 500+건, provider 500, block/HIDDEN, 권한 거절 | 누락/가짜 0건/가짜 위치 없음 |
| 길찾기 | GPS 성공·거절·HCMC 밖, ko/en/vi | 실제/수동 origin만 사용, mode·locale 정합 |
| 거래 | A/B/C 제3자 context, 동시 약속 2건, 취소·완료·재판매 | 잘못된 상태전이·이중거래 없음 |
| 리뷰 | fresh DB 1~5점, 비거래자, self review | 정상 거래자만 1회, DDL 오류 없음 |
| 퀘스트 | 0m submit, debug route, duplicate callback, item reward | 서버 증빙 없이는 0 지급, 정상은 정확히 1회 |
| 가챠 | commit 후 response drop, 화면 reload, 같은 request id | 1회 차감, 같은 결과 replay |
| 쿠폰 | partner timeout/decline, response drop, 월 경계, 만료 | 1회 차감 또는 전액 복구, 실제 수납 가능 |
| 안전정보 | weather 401/429/timeout, flood district 부분 실패 | fake weather/위험 삭제/안전 오인 없음 |
| 앱 부팅 | session verify pending/offline | 정해진 시간 내 오류·재시도·logout 표시 |
| 업데이트 | 구버전/동일/신버전/조회 실패 | 정책대로 차단·통과·복구 |
| 딥링크 | logout 상태 DM/매물 link → login | 원 목적지로 정확히 1회 복귀 |
| 알림 | 설정 GET 지연+토글, token refresh, FCM 실패 | 설정 유실 없음, retry/DLQ와 새 token 사용 |
| 법적/계정 | 동의 version, delete, export | 고지와 실제 보존·파일 범위 일치 |
| 지원 | admin 질문→user reply→admin 재답변 | 한 ticket에서 왕복·알림·unread 정합 |
| 배포 | 빈 volume compose + migrations + smoke | DEV 데이터 0건, readiness와 핵심 API 정상 |

### 현재 테스트 공백

- BFF 자동화 테스트 디렉터리를 찾지 못했다.
- 소비자 frontend 테스트는 `frontend/src/components/quest/quest-card-map.test.ts` 1개뿐이며 `frontend/package.json`에 test script가 없다.
- Engine 테스트 4개는 anti-abuse/event bus/잔액 일부만 다루며 위 사용자 여정을 검증하지 않는다.
- landing에는 auth/infra/smoke 테스트가 있지만 소비자 앱의 계정·거래·재화·안전 경로를 대신하지 못한다.

P0를 코드로 고친 것만으로 완료 처리하지 말고 위 회귀 테스트와 fresh DB/실기기 gate까지 통과시킨다.

---

## 8. 반증·등급 하향·오탐 방지 메모

- `GRANT_RP -> current_balance` 오매핑은 코드에 있지만 기본 최신 DB의 관련 `MILEAGE_XP` 정책이 비활성이다. 현재 피해가 아니라 재활성화 시 발현하는 잠복 결함이다: `engine/app/services/policy_engine.py:109-117`, `engine/alembic/versions/042_mileage_exp_only.py:23`.
- gacha DB function은 단일 호출 내부 원자성은 있다. 문제는 **논리적 요청을 식별하는 멱등 키가 없어 두 번째 호출이 새 구매가 되는 것**이다.
- Dockerfile 기본 build arg는 `VITE_USE_MOCK=false`다. 문제는 다른 build 경로가 env를 빠뜨리면 코드 기본값이 mock이라는 release 구성 위험이다.
- 시즌/IAP/광고/랭킹은 현재 핵심 메뉴에서 숨겨진 부분이 있어 P0로 올리지 않았다. direct route/API가 남은 미완성 기능은 출시 manifest에서 닫아야 한다.
- `native/android`, `native/ios`가 비어 있어 네이티브 구현 부재 자체를 확정 결함으로 단정하지 않았다. JS bridge와 config에서 확인된 계약만 기록했다.

---

## 9. 완료 정의

다음 조건을 모두 만족해야 이 태스크를 완료로 바꾼다.

- [ ] P0 공격·피해 시나리오 전부 자동화되고 수정 전 실패/수정 후 통과 기록이 있다.
- [ ] endpoint별 principal/owner/participant 표가 있고 누락 route가 없다.
- [ ] 위치·안전정보는 unknown/stale/unavailable을 정상/0건과 구분한다.
- [ ] 거래 상태와 재화 지급은 DB 제약·멱등 키·원장으로 복구 가능하다.
- [ ] 실제 제휴 쿠폰 수납과 환불 테스트 전에는 coupon redeem이 노출되지 않는다.
- [ ] cold start·offline·force update·deep link·FCM을 iOS/Android 실기기에서 검증한다.
- [ ] 빈 운영 volume에서 migration/seed/readiness/E2E가 통과하고 DEV 데이터가 없다.
- [ ] 사용자에게 보이는 약속(보상·알림·다운로드·삭제·버튼)이 실제 동작과 일치한다.
- [ ] 코드 변경 후 codebase-memory 재인덱싱과 `/code-review` gate를 완료한다.
