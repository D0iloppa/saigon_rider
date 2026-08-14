# 위치 게이트 구현 태스크 (2026-08-13)

> **SoT** — 이 문서가 상세 내용의 단일 출처다.
> **정책 근거**: [`ai-docs/260813_location_gate_policy.md`](../../260813_location_gate_policy.md) (결정 D-1~D-6, 결함 14건, 테스트 매트릭스)
> **발단**: 대표 지시 2026-08-13 11:28~11:32 (경로안내 GPS 강제 시작 시 지도 튐 / 권역 밖 서비스 제한)
> **티켓**: `doil-context` main `2026-08-13-location-gate` (sub: `p1-gate` ~ `p6-test`)
> **착수 방법**: `/doil-supervise` — Phase 별로 서브에이전트 라우팅

---

## 목적

위치 데이터의 **역할**(조회 기준점 / 입력값 / 저장값)에 따라 폴백 정책을 3계층으로 분할하고, 실행형·기록형 화면에서 중심가 폴백을 제거해 차단 게이트로 대체한다.

**해결하는 것**: 대표 보고 결함(카메라 튐·시작 즉시 오류) + 미보고 데이터 오염(권역 밖 제보가 DB 에 저장됨) + 판정 로직 11곳 분산.

**해결하지 않는 것**: 탐색형 화면(홈·마켓·동네지도·정보 목록)의 폴백 동작 — 2026-08-06 대표 확인 사항이므로 **그대로 둔다**.

---

## 제약사항

1. **탐색형 화면 동작을 바꾸지 않는다.** `resolveServiceLocation`(중심가 폴백)의 기존 호출부 5곳(`SaigonMapV5`, `FeedList` 등)은 손대지 않는다. 건드리면 2026-08-06 회귀("목록이 통째로 빈다")가 재발한다.
2. **새 위치 SoT 를 만들지 않는다.** `useLocationStore` 가 단일 SoT(`service-rules.md` 원칙 2·4). 게이트는 스토어를 대체하지 않고 실행형·기록형 호출부가 쓰는 별도 유틸이다.
3. **사유 분류 체계를 새로 만들지 않는다.** `classifyLocationError`(3분류)를 재사용하고 `inaccurate` 만 추가한다.
4. **차단 문구를 화면마다 쓰지 않는다.** 공통 컴포넌트 1개 + 사유 prop.
5. **i18n 필수** — 신규 문구는 vi/ko/en 3개 로케일 모두. 하드코딩 금지.
6. **`native.*` 직접 호출 금지** — `native.ts`(NativeInterface) 경유 (ESLint error 강제). 설정 앱 딥링크도 NativeInterface 에 메서드를 추가해서 쓴다.
7. **머니 경로 주의** — P4(퀘스트)는 보상이 걸린 경로다. 클라 완료 판정 금지, 신뢰경계 = 서버 불변식 유지.

---

## Phase 구성

### P1. 게이트 신설 (순수 추가 — 기존 화면 무영향)

| ID | 서브태스크 | 검증 |
|---|---|---|
| P1-1 | `lib/serviceLocation.ts` 에 `requireServiceLocation()` + `LocationGateReason` 5종 추가. `resolveServiceLocation` 은 손대지 않음 | 신규 contract test — 5개 사유가 각각 올바르게 반환되는지 (`/dev/gps` 오버라이드로 좌표·정확도 주입) |
| P1-2 | 정확도 게이트 편입 — `accuracy > 35m` → `reason:'inaccurate'`. 임계값은 `RideNav` 의 `GPS_ACCURACY_LIMIT_M` 를 상수로 승격해 공유(중복 정의 금지) | 34m → ok, 36m → `inaccurate` 어서션 |
| P1-3 | `components/location/LocationGateBlock.tsx` — 사유 5종별 문구 + 액션 버튼(재시도 / 설정 앱 / Google). D-1 미승인 상태이므로 Google 버튼은 **prop 으로 제어**하고 기본값은 권고안(권역 밖=숨김, 측위 실패=표시) | 5개 사유 렌더 스냅샷, 사유별 버튼 구성 어서션 |
| P1-4 | `native.ts` 에 OS 설정 앱 딥링크 메서드 추가(iOS `app-settings:` / Android `ACTION_APPLICATION_DETAILS_SETTINGS`). 미지원 플랫폼은 버튼 자체를 숨김 | 웹에서 호출 시 no-op + 버튼 미표시 확인 |
| P1-5 | i18n 3로케일(vi/ko/en) 문구 등록 | `npm run lint` + 누락 키 검사 |

**Phase 검증**: 기존 화면 동작 무변화 — `npm run build` + 기존 contract test 전건 PASS.

---

### P2. 데이터 오염 차단 (P0 — 최우선)

> 결함 #7 은 **시간이 갈수록 복구 비용이 커진다**(어드민 수동 삭제). P3 보다 먼저 배포한다.

| ID | 서브태스크 | 검증 |
|---|---|---|
| P2-1 | `InfoFloodReport.tsx` — `native.getLocation()` 직접 호출을 `requireServiceLocation()` 으로 교체. `ok:false` 면 `LocationGateBlock` 표시 + 제출 버튼 비활성 | 권역 밖 좌표 주입 → 제보 API 가 **호출되지 않음** 어서션 |
| P2-2 | `InfoRepairList.tsx:140`, `InfoGasList.tsx:195` 동일 적용 | 동일 |
| P2-3 | `FeedEdit.tsx:165-177` 위치 태그 — 권역 밖이면 태그를 붙이지 않고 사유 토스트 | 권역 밖 → `location` state 가 `null` 유지 |
| P2-4 | **기존 오염 데이터 점검** — `flood_hotspot` 등 제보 테이블에 권역 밖 좌표가 이미 있는지 조회. 있으면 목록만 보고(삭제는 대표 확인 후) | 권역 밖 레코드 건수 리포트 |

**Phase 검증**: 5개 사유 × 4개 제보 경로에서 DB 쓰기가 발생하지 않음.

---

### P3. 경로안내 결함 (대표 보고분)

| ID | 서브태스크 | 검증 |
|---|---|---|
| P3-1 | **#1 카메라 튐** — `fetchRoute` 의 폴백 분기(`RideNav.tsx:366-369`) 제거 → `requireServiceLocation()`. `origin`/`dotPos` 출처 일치 불변식 확립 | `origin` 과 `dotPos` 가 동일 출처임을 어서션하는 회귀 테스트(좌표값이 아니라 불변식 검증) |
| P3-2 | **#2 watch 이탈 판정 게이트** — 권역 밖 tick 에서 이탈 판정 스킵(`useLocationStore.ts:272` 와 동일 처리). **안내 자체는 중단하지 않음**(D-4) | 안내 중 권역 밖 이동 → 이탈 배너 미표시 + 안내 유지 |
| P3-3 | **#3 `rerouteFrom` 권역 검사** 추가 — 권역 밖 좌표면 재탐색 API 호출하지 않음 | 권역 밖에서 이탈 확정 시 `routeApi.getRoute` 호출 0회 |
| P3-4 | **#4** 최초 측위 정확도 게이트 (P1-2 로 해소됨을 확인) | 36m 정확도 → 차단 화면 |
| P3-5 | **#5** 목적지 40m 내 진입 시 시작 버튼이 사라지는 문제 — `arrived` 초기 판정 시점 분리(안내 시작 전에는 도착 판정하지 않음) | 목적지 30m 지점 진입 → 시작 버튼 표시 |
| P3-6 | **#6** 권한 거부 시 설정 앱 버튼 배선 (P1-4 사용) | `permission` 사유 → 버튼 표시 + 탭 시 딥링크 호출 |

**Phase 검증**: 권역 안 정상 경로 회귀 무영향 + `resolveOriginParity.contract.test.mjs` PASS 유지(원칙 13 회귀 방지).

---

### P4. 퀘스트 게이트 (D-6)

| ID | 서브태스크 | 검증 |
|---|---|---|
| P4-1 | `QuestDetail.tsx:97` "수행 시작" 전 `requireServiceLocation()` 게이트. `ok:false` 면 세션 생성(`apiStartRide`) 자체를 하지 않음 | 권역 밖 → `startRide` API 호출 0회, 서버에 고아 세션 없음 |
| P4-2 | `RideNav` quest 분기 방어 — 딥링크로 직접 진입한 경우도 게이트 통과 필요 | quest URL 직접 진입 + 권역 밖 → 차단 화면 |

**주의**: 머니 경로. 클라가 완료를 판정하지 않는 기존 불변식을 건드리지 않는다.

---

### P5. 정리 + 문서 개정

| ID | 서브태스크 | 검증 |
|---|---|---|
| P5-1 | **#10** `useProximityAlerts` 권역 게이트 — 권역 밖이면 watch 시작하지 않음 | 권역 밖 → `watchLocation` 미호출 |
| P5-2 | **#13** `DEV_DONGTAN_PIN` 우회 코드 제거 (`RideNav.tsx:23, 141-147, 357-373` + `devDongtanPin.contract.test.mjs`) | 제거 후 빌드·테스트 PASS, `devRaw` 파라미터 무효 확인 |
| P5-3 | **#11** `native.getLocation()` 직접 호출 9곳 정리 — 실행형·기록형은 P2/P3 에서 이미 교체됨. 남은 탐색형 호출부는 **목록만 보고**하고 이번 범위에서 제외(원칙 4 위반이지만 동작 결함은 아님) | 잔존 호출부 목록 + 각각의 계층 분류 |
| P5-4 | `context/service-rules.md` §폴백 정책에 계층 분할 절 삽입 (정책안 §6 문안 그대로) + 원칙 8 개정 | 문서 diff |
| P5-5 | `context/frontend-page-map.md` + `manage_adr` 동기화 (CLAUDE.md 규약: ADR 과 md 는 항상 함께 갱신) | ADR get 으로 반영 확인 |

---

### P6. 테스트 매트릭스 17칸

| ID | 서브태스크 | 검증 |
|---|---|---|
| P6-1 | nav 진입 5축 (권역 밖 / 권한거부 / 타임아웃 / 저정확도 — 권역 안은 기존) | 4칸 |
| P6-2 | 안내 시작 3축 (권역 밖 / 저정확도) + 카메라 불변식 | 2칸 + #1 회귀 |
| P6-3 | 안내 중 권역 이탈 3축 (D-4 검증 — 안내 유지) | 3칸 |
| P6-4 | quest 수행 시작 4축 | 4칸 |
| P6-5 | 제보 저장 4축 × (침수/주유/정비/피드) | 4칸 |

**하네스**: `/dev/gps` 좌표 오버라이드(`localStorage.__dev_gps`, 호스트 허용목록 2중 게이트, heading/speed 주입 지원 `88bd487`). 신규 하네스를 만들지 않는다.

**Phase 검증**: 매트릭스 23칸 전건 PASS (기존 ✅ 6 + 신규 17).

---

## 미결 항목

| ID | 내용 | 필요한 결정 |
|---|---|---|
| D-1 | 권역 밖 차단 화면에 Google 지도 핸드오프 버튼 존치 여부 | **대표 승인** — 권고: 권역 밖 제거 / 측위 실패 유지. 미승인 시 권고안 기본값으로 구현(P1-3 이 prop 제어라 승인 후 1줄 변경) |
| D-7 | P2-4 에서 기존 오염 데이터가 발견될 경우 삭제 여부 | 대표 확인 (조회·보고까지만 이번 범위) |

---

## 리빌드

```bash
docker compose --env-file .env up --build -d frontend
```

백엔드 변경 없음(전부 프론트 게이트). P2-4 데이터 점검은 조회 전용.
