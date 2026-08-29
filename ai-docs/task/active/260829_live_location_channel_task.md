# 실시간 위치공유 채널(Live Location Channel) 설계 — 2026-08-29

> **SoT** — 실시간 위치공유 채널의 단일 출처. 구현 스레드는 이 문서만 읽고 착수할 수 있어야 한다.
> **상태**: 설계 확정(대표 결정 D1~D5, 2026-08-29) / **구현 미착수**.
> **확정 경위**: 대표 지시(2026-08-29 실기기 리뷰) + D1~D5 답변 + 서브에이전트 3종 조사(워키토키 채널 인프라·자체 라우팅 엔진·개인정보법). **재질문 금지 — §2 는 결정사항이다.**
> **대체 관계**: 2026-08-27 `260827_deal_location_sharing_task.md`(약속 기반 정밀도 매트릭스 위젯)의 **UI 모델(바텀시트 위젯·7초 폴링)을 폐기**하고 채널 모델로 대체한다. 그 문서의 백엔드 조각(테이블·동의 기록·삭제 트리거) 일부는 재사용한다(§6).
> **분리 관계**: **현재위치 카드(단순 위치공유, `location_pin`)는 이 문서 범위 밖** — 이미 구현 완료(2026-08-29, `DmDetail.tsx handleSendCurrentLocation`). 실시간 채널과 코드·정책을 공유하지 않는다.
> **착수 방법**: `/doil-supervise` — Phase 별 서브에이전트 라우팅(§8).

---

## 1. 목적 / 배경

대면 거래·공동 라이딩에서 참가자들이 **하나의 공통 목적지**를 향해 이동하는 동안 서로의 위치·거리·도착예정시간(ETA)을 실시간으로 공유한다. 핵심은 "위치가 보인다"가 아니라 **"모두가 같은 곳으로 가고 있다"** 를 전자적으로 보장하는 것이다 — 한 사람이 이미 목적지에 있어도(대기), 둘 다 이동 중이어도, 채널에는 목적지가 항상 1개 있어야 의미가 성립한다. 목적지 변경은 대화로 하던 조율을 **제안→상호 수락** 으로 시스템화한다.

2026-08-27 구현(약속에 종속된 바텀시트 위젯)은 실기기 리뷰에서 다음이 확인돼 폐기한다: 시트를 닫으면 사라져 채널 감각이 없음, 목적지 개념 부재, 거리·ETA 없음, Live Activity 에 `peerDistanceText: ''` 빈 placeholder 만 존재.

---

## 2. 확정 요구사항 (재논의 대상 아님)

| # | 결정 | 근거 |
|---|---|---|
| D1 | **목적지는 참가자 누구나 최초 설정 가능.** 이후 변경은 **변경 신청 → 다른 참가자 전원(1:1 이면 상대 1명) 수락 시** 반영. 거절/타임아웃(5분)이면 기존 목적지 유지. | 대면거래는 목적지가 계속 바뀔 수 있으나 임의 변경은 금지 — 실시간 조율을 전자화 |
| D2 | **1:1 + 그룹방 모두 지원.** 그룹은 "공통 목적지로 함께 라이딩" 유스케이스. | 사이공라이더 정체성 |
| D3 | **워키토키와 별도 채널.** 전송 패턴은 워키토키와 동일한 **SSE(알림) + HTTP(정합성)** 하이브리드를 복제하되, 위치 이벤트는 **SSE 페이로드에 좌표를 직접 싣는다**(워키토키의 "무페이로드" 원칙은 이 채널에 적용하지 않음). 새 WebSocket 인프라 도입 금지. | §4 트레이드오프 |
| D4 | **ETA/거리는 자체 라우팅 엔진(Valhalla)** — API 비용 0. **서버가** 계산해 채널에 방송(클라이언트가 라우팅 API 를 직접 두드리지 않음). | §5 |
| D5 | **채널 참가 = 명시적 동의. 참가 중엔 항상 정밀좌표.** 2026-08-27 정밀도 매트릭스(none/approx/exact)는 이 채널에서 **폐기**. 개인정보 정책은 §7 권고안을 그대로 채택. | 단순화 |

추가 확정(대표 지시 원문에서 도출):
- **플로팅 버튼 모델**: 채널 참가 중 화면 어디서나 🗺️ 플로팅 버튼(최소화). 탭 → 모달(지도·참가자 위치·거리·ETA·경로안내·목적지 변경). 워키토키 플로팅(`WalkieTalkieFloatingButton`)과 **나란히 공존**(두 채널 동시 참가 가능).
- **Live Activity(iOS)/ongoing 알림(Android)**: 배달앱 스타일 — 상대와의 거리, **참가자 각자의 목적지 ETA**, 도착자는 "대기 중". 기존 `deal` Live Activity(약속 상태 카드)를 **확장**하는 것이 아니라 별도 `location` 종류를 추가한다(약속 없는 채널도 있으므로).
- **디버그 권역**: 경기도 bbox 는 dev 서버(`is_dev`)에서 서비스 권역으로 허용(`DEV_GYEONGGI_BYPASS`, 이미 구현). 라우팅 타일도 경기도 포함(이미 빌드됨) → 한국 실기기에서 ETA 까지 검증 가능.

---

## 3. 도메인 모델

### 3-1. 채널 (`location_channels`)

| 컬럼 | 타입 | 의미 |
|---|---|---|
| id | UUID PK | |
| conversation_id | UUID FK dm_conversations | 채널이 속한 대화방(1:1/그룹). **대화방당 활성 채널 최대 1개**(partial unique `WHERE ended_at IS NULL`) |
| appointment_id | UUID FK nullable | 약속에서 열린 채널이면 연결(목적지 초기값 = 약속 장소). 없어도 됨 |
| dest_lat / dest_lng | NUMERIC(9,6) nullable | **현재 확정 목적지**. NULL = 미설정(채널은 열렸지만 아직 목적지 없음 → UI 가 설정 유도) |
| dest_name | VARCHAR(120) nullable | 표시명(약속 장소명 / 사용자가 찍은 지점의 역지오코딩 or "지도에서 찍은 위치") |
| created_by | UUID FK users | |
| created_at / ended_at | TIMESTAMPTZ | ended_at 채워지면 종료. 종료 사유는 `end_reason`('ttl'/'all_arrived'/'members_left'/'manual') |
| expires_at | TIMESTAMPTZ | 세션 TTL = created_at + 3h (§7-2) |

### 3-2. 참가자 (`location_channel_members`)

| 컬럼 | 의미 |
|---|---|
| channel_id, user_id | PK |
| consented_at, consent_version | 참가 동의 기록(§7-1). 재참가 시 갱신 |
| lat, lng, accuracy_m, heading, speed_mps, located_at | **최신 1건만**(궤적 미보관). 채널 종료·이탈 시 즉시 NULL/행 삭제 |
| eta_s, distance_m, eta_computed_at | 서버가 계산한 목적지까지 ETA/거리(§5). 목적지 NULL 이면 NULL |
| arrived_at | 목적지 반경 `ARRIVAL_RADIUS_M=40`(경로안내와 동일 상수) 진입 시각. 채워지면 "대기 중" |
| left_at | 이탈 시각. 이탈 즉시 lat/lng 삭제 |

### 3-3. 목적지 변경 제안 (`location_channel_dest_proposals`)

| 컬럼 | 의미 |
|---|---|
| id, channel_id, proposed_by | |
| lat, lng, name | 제안 목적지 |
| status | `pending` / `accepted` / `rejected` / `expired` |
| created_at, resolved_at, expires_at | expires_at = created_at + 5min |
| `location_channel_dest_votes`(proposal_id, user_id, accept bool, voted_at) | 참가자별 응답. **제안자 제외 전원 accept → 채널 목적지 갱신 + `accepted`**. 1명이라도 reject → `rejected`. |

**불변식**
- 활성 채널당 `pending` 제안은 최대 1개(새 제안은 기존 pending 이 끝나야 가능).
- 목적지 최초 설정(NULL → 값)은 제안 없이 즉시 반영(D1 "누구나 설정"). 두 번째부터가 제안 절차.
- 참가자가 1명뿐이면 목적지 변경도 즉시 반영(수락할 상대가 없음).

### 3-4. 이벤트 (SSE 페이로드 스키마)

```
{ type: 'member_joined' | 'member_left' | 'location' | 'eta' | 'arrived'
      | 'dest_set' | 'dest_proposed' | 'dest_vote' | 'dest_resolved' | 'channel_ended',
  channelId, at, actorId?, payload }
```
- `location`: `{ userId, lat, lng, accuracyM, heading?, speedMps? }`
- `eta`: `{ userId, etaS, distanceM }` — 서버 계산 후 별도 이벤트(위치 이벤트를 라우팅 지연에 묶지 않기 위해 분리)
- `dest_*`: 제안/투표/확정 상태 전이
- 수신측은 이벤트를 **낙관적으로 반영**하고, 재연결 시 `GET /state` 로 전량 재동기화(정합성 기준선 = HTTP, 워키토키 원칙 계승).

---

## 4. 전송 아키텍처 — 왜 별도 채널·왜 SSE 인가

조사 결과(2026-08-29): 워키토키는 소켓이 아닌 **SSE + HTTP 커서 폴링**이며, SSE 로는 `voice|presence|speaking` 이벤트 **이름만** 흘리고 페이로드는 HTTP 로 재조회한다. 브로드캐스터는 프로세스 내 메모리(`InProcessBroadcaster`, 다중 워커 불가).

| 관점 | 워키토키 SSE 에 얹기 | 별도 채널(채택) |
|---|---|---|
| 좌표 push | 무페이로드 원칙과 충돌 — 매번 HTTP 재조회면 지연 2배 | 페이로드 직접 push |
| 이벤트 타입 | 3종 리터럴 하드코딩(`broadcast.py:21`, `hybrid.ts:117`) | 자체 discriminator |
| 채널 정체성 | DM방 1:1 고정(`WtChannel.external_ref` unique) | 목적지 단위 lifecycle |
| 장애 격리 | 음성↔위치 상호 전파 | 격리 |
| 재사용 | 멤버십 어댑터 패턴 | 클라 `hybrid.ts`/`eventStream.ts`(SSE+폴링+백오프+포그라운드 재연결), nginx SSE 블록(`default.conf:135-155`), Redis TTL presence 패턴 |

**결정**: 별도 채널, SSE+HTTP 패턴 복제, 좌표는 페이로드 포함. WebSocket 신설 금지(nginx·재연결·인증 헤더 문제를 다시 풀 이유 없음 — SSE 는 `fetch` 기반 커스텀 리더로 세션 헤더 전달 이미 해결됨).
**공통 부채**: 다중 워커 브로드캐스트(Redis pub/sub)는 워키토키와 공통 과제 — Phase 3 에서 두 채널이 같은 브로드캐스터 추상을 쓰도록 승격(그때까지 bff 워커 1개 전제).
**정정**: 기존 문서에 "위치공유·워키토키 코드 미공유(§7)" 결정이 있다고 인용된 적 있으나 **그런 문구는 존재하지 않는다**. 이 문서가 그 결정을 처음 기록한다.

---

## 5. ETA/거리 계산 — 자체 라우팅 엔진

조사 결과(`backend/app/routers/info_route.py`, `services/routing_engine.py`, `ai-docs/context/routing-engine.md`):
- Valhalla `/route` 응답에 `distance_m`/`duration_s` 있음. costing `motorcycle`. 타일 = HCMC + **경기도 bbox**(126.5,36.9,127.9,38.3) 병합 → 한국 디버그 가능. Google 폴백은 현재 **주석 비활성**(TEMP 2026-08-07).
- 그대로 쓰면 막히는 것: ① 캐시 키 출발지 100m 단위 → 이동 중 매번 미스 ② 사용자당 10회/분 rate-limit → 10초 갱신과 충돌 ③ `/sources_to_targets`(matrix) 서버에 활성화돼 있으나 미사용.

**설계**
1. **서버 계산·서버 방송.** 클라이언트 `PUT /members/me/location` → 서버가 위치 저장 + `location` 이벤트 즉시 방송 → 백그라운드로 ETA 계산 → `eta` 이벤트 방송. 클라이언트는 라우팅 API 를 호출하지 않는다(rate-limit·비용·일관성 모두 해결).
2. **ETA 전용 내부 서비스** `services/location_eta.py`: `info_route.py` 의 사용자 rate-limit 을 타지 않음. 출발지를 **250m 격자**로 라운딩 + 목적지 키로 Redis 캐시 60초. 격자가 바뀌지 않았고 캐시가 살아 있으면 `이전 ETA − 경과시간` 으로 보간(호출 0).
3. **그룹은 matrix 1회**: 참가자 N ≥ 3 이면 `/sources_to_targets`(N 출발지 → 1 목적지) 신규 구현. N ≤ 2 는 `/route`.
4. **도착 판정은 ETA 와 무관하게 거리로**: 목적지 반경 40m 진입 → `arrived_at`. 도착자는 ETA 계산 생략.
5. **커버리지 밖**(Valhalla 400): ETA NULL 로 방송, UI 는 "—" 표시 + 직선거리만. Google 폴백 원복은 대표 승인 대기 항목(별건).
6. **부하**: `routing_engine` 컨테이너 리소스 제한·동시성 실측이 전무 → Phase 2 에 **부하 테스트 티켓 필수**(참가자 20명 × 10초 갱신 가정).

---

## 6. 재사용 / 폐기 대상

| 기존 조각 | 처리 |
|---|---|
| `marketplace_location_shares` 테이블 + `/appointments/{id}/location-share*` + `/conversations/{id}/location-share*` (2026-08-27/29) | **폐기 예정**(Phase 3 에서 삭제). 채널 테이블이 대체. 마이그레이션은 DROP 이 아니라 rename→보관 후 다음 릴리즈에 DROP |
| `LocationShareWidget.tsx`, `DealLiveActions.tsx`, `LocationShareConsentModal.tsx` | 위젯 폐기. **동의 모달은 문구 갱신 후 재사용**(§7-1) |
| `location_share_invite` 메시지 카드 + `lib/locationShareInvite.ts` | 재사용 — `channelId` 를 meta 에 추가. "참여하기" 버튼이 채널 참가(동의 모달 경유) |
| `useLocationStore` 전역 워처(30m 게이트) | 재사용. 채널 전용 게이트(10초+10m, M-5)는 채널 훅이 추가로 얹음 |
| `native.liveActivity` (`kind: 'deal'`) | `kind: 'location'` 추가. iOS `LiveActivityAttributes.swift`/위젯 뷰, Android `LiveActivityPlugin.java` 확장 |
| 워키토키 `hybrid.ts`/`eventStream.ts`/nginx SSE 블록 | 복제(패키지 경계 유지 — d_modules 를 import 하지 않고 `frontend/src/lib/sse/` 로 이식) |
| `DEV_GYEONGGI_BYPASS` | 유지(검증 완료 후 제거) |

---

## 7. 개인정보 정책 (대표 위임 → 권고안 채택)

법적 사실(리서치 `ai-docs/research/260827_walkie_talkie_location_privacy/`): 위치정보는 Decree 13/2023 Art.2.4 → PDPL 2025("정밀 위치정보") 공통 **민감정보**. PDPL 2025 는 위치정보에 **수집 고지 + 옵트아웃 제공** 명시, 유출 시 72시간 통지. 그룹(N명) 노출은 리서치 미분석 → 본 문서가 정한다. 출시 전 현지 변호사 검토 유보는 유지.

1. **동의 단위 = 채널 참가 1회.** 참가 시 고지: 공유 대상(이 채널 참가자만)·정밀좌표·자동 종료 조건·즉시 중단 가능. `consent_version` 기록(`LOCATION_SHARE_CONSENT_VERSION` 을 `2026-08-29-v2` 로 올리고 문구 갱신). 재참가 = 재동의.
2. **정밀좌표 상시(참가 중).** 자동 종료 3중: (a) TTL 3시간 (b) 전원 `arrived_at` 후 15분 (c) 활성 참가자 ≤ 1명. 종료 시 `channel_ended` 방송.
3. **이력 미보관, 최신 1건만.** 종료·이탈 시 좌표 컬럼 **즉시 NULL**(행 삭제 대신 — 참가 기록은 남김). 채널·참가·목적지 제안 기록은 **30일 후 물리 삭제**(cron, 기존 `backup_db.py` 잡 패턴).
4. **옵트아웃**: 플로팅 버튼 → "나가기" 1탭 = 즉시 좌표 삭제 + `member_left` 방송. 앱 설정에 "실시간 위치공유 사용" 스위치(끄면 참가 진입점 비노출·기존 참가 자동 이탈).
5. **노출 상한**: 채널 참가자에게만. 같은 DM방 멤버라도 미참가자는 좌표를 받지 못한다(`GET /state`·SSE 모두 참가자 검증). 초대카드에 좌표 없음.
6. **차단·신고**: 차단 관계 발생 시 양쪽 모두 상대 좌표 이벤트 필터링(기존 `require_unblocked` 재사용) + 1:1 이면 채널 종료.
7. **백그라운드 추적 금지**(M-4 유지) — 포그라운드 워처만. Live Activity 갱신은 서버 APNs push(기존 outbox 경로) 로.

---

## 8. Phase 와 완료 기준

### Phase 1 — 채널 코어 (백엔드 + 최소 UI)
**범위**: §3 테이블 마이그레이션(223~), `routers/location_channels.py`(create/join/leave/state/location ping/SSE events), 목적지 최초 설정, 동의 기록, 자동 종료 3중, 좌표 즉시 삭제. 프론트: 플로팅 🗺️ 버튼 + 모달(지도·참가자 dot·직선거리), `+` 패널 '실시간위치' → 채널 생성/참가, 초대카드 참여 버튼.
**완료 기준**
1. 두 단말이 같은 채널에 참가하면 10초+10m 게이트로 상대 dot 이 갱신된다(SSE 수신, 폴링 아님 — 네트워크 탭으로 확인).
2. 나가기 즉시 서버 좌표 NULL, 상대 화면에서 dot 소멸(`member_left`).
3. TTL/전원도착/1명 이하 → `channel_ended` 자동 방송(단위 테스트 3케이스).
4. 미참가 방 멤버가 `GET /state` 호출 시 403.
5. 경기도 dev 서버에서 1~4 재현.

### Phase 2 — 목적지 협의 + ETA
**범위**: §3-3 제안/투표, §5 ETA 서비스(`/route`·matrix·격자 캐시·보간), 도착 판정, 모달에 목적지 카드·ETA·"길안내"(기존 `/ride-nav` 딥링크), 부하 테스트.
**완료 기준**
1. 참가자 A 제안 → B 수락 → 양쪽 목적지 갱신 + `dest_resolved`; B 거절 → 기존 유지. 5분 무응답 → expired(단위 테스트).
2. 참가자 1명일 때 제안 없이 즉시 변경.
3. ETA 가 이동 중 갱신되며 라우팅 엔진 호출이 **참가자당 60초에 1회 이하**(격자 캐시 로그로 확인).
4. 목적지 40m 진입 → `arrived_at` + UI "대기 중".
5. 부하: 참가자 20명 × 10초 갱신 5분간 → `routing_engine` p95 응답 < 1s, 오류 0(결과를 `ai-docs/context/routing-engine.md` §9 에 기록).

### Phase 3 — Live Activity + 정리
**범위**: `kind: 'location'` Live Activity(iOS ActivityKit/Android ongoing) — 상대 거리·각자 ETA·대기 중, outbox `live_activity.location_update` + APNs. 구 위젯·`marketplace_location_shares` 경로 폐기(rename 보관). 다중 워커 브로드캐스터 추상(Redis pub/sub) — 워키토키와 공유.
**완료 기준**
1. iOS 잠금화면 카드에 "상대 1.2km · 내 ETA 6분 · 상대 대기 중" 형태로 표시되고 서버 push 로 갱신된다(실기기, 위젯 타겟 포함 빌드).
2. 구 엔드포인트 호출 시 410 Gone(프론트에서 참조 0 확인 후).
3. `test_deal_location_sharing*.py` 는 폐기 엔드포인트와 함께 제거, 채널 테스트로 대체.

---

## 9. 비스코프 / 미결

- **비스코프**: 백그라운드 위치추적, 채널 녹화/궤적 재생, 공개 지도 노출, 워키토키와 채널 통합.
- **미결(대표 판단 대기)**: Google Routes 폴백 원복 여부(커버리지 밖 ETA), OSM ODbL 저작권 표기 위치(별건 부채), `routing_engine` 리소스 제한값.
- **문서 동기화 의무**: 구현 시 `ai-docs/context/service-rules.md` §GPS 원칙8 을 이 문서 기준으로 개정하고, `frontend-page-map.md` DM 행·Live Activity 행을 갱신한다.
