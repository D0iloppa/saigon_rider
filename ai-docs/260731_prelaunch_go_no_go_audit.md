# 2026-07-31 공개 출시 GO/NO-GO 감사

> 작성일: 2026-07-31
> 상태: **NO-GO — P0 해소 및 재검증 전 공개 출시 금지**
> 출시 판단: **NO-GO**
> 대상: 최신 pull 완료 상태 `main@c8bc67c` 및 2026-07-31 확인한 `app.saigon-rider.com` 배포면
> 재검증: 2026-07-31 19:14 KST `git pull --ff-only origin main` fast-forward 후 `HEAD == origin/main == c8bc67c` 확인
> 범위: 기능 완성도와 서비스 운영·보안·배포 준비도를 분리 평가
> 최신 판정 SoT: 이 문서. 2026-07-22 감사의 구현 이력은 유지하되, 공개 출시 판정은 이 문서를 우선한다.
> 보안 주의: 민감값의 원문·일부 마스킹·길이·실제 인증 헤더 값은 기록하지 않는다. 파일과 행 위치만 참조한다.

---

## 0. 결론

현재 공개 출시는 불가하다. 가능한 범위는 실제 보상·운영 비밀값·실사용자 개인정보를 사용하지 않는 **격리된 사내 개발 데모**까지다. 외부 초대형 베타도 이 문서의 P0 출시 차단 항목을 해소하고 실배포·실기기 검증을 완료한 뒤 재판정해야 한다.

| 관점 | 판정 | 핵심 근거 |
|---|---|---|
| 기능 | **HOLD** | 핵심 사용자 흐름은 코드상 연결됐지만 침수 안전정보, 동의·탈퇴, GPS·FCM·OAuth 실기기 흐름과 최신 UI 회귀가 미완료 또는 미검증 |
| 서비스 | **NO-GO** | Engine 특권 인증 노출, 추적된 OAuth 민감정보, 구버전 실배포, 불완전한 migration/readiness, 법무·백업·관측성 결함 |
| 종합 | **NO-GO** | 단순 사용성 문제가 아니라 임의 보상 조작, 비밀 유출, 개인정보 계약 위반 및 무복구 운영 장애 가능성이 존재 |

기존 감사 문서의 “코드상 출시 차단(P0/High) 처리 완료” 표현은 현 HEAD와 실배포면에 대한 유효한 출시 승인 근거가 아니다. 기존 감사 기준 커밋 이후 대규모 변경이 있었고, 기존 적용 요약 자체에도 침수 예측기가 `PARTIAL/OPEN`으로 남아 있다.

- 기존 판정: [`260722_service_user_full_launch_audit_task.md`](./260722_service_user_full_launch_audit_task.md#L3)
- 기존 OPEN 기록: [`260722_audit_applied_summary.md`](./260722_audit_applied_summary.md#L133)

---

## 1. 평가 기준과 증거 범위

### 1.1 확인 대상

- 저장소: 2026-07-31 19:14 KST 실제 원격 pull 후 `main@c8bc67c`, `origin/main`과 동일
- 최신 pull 증분: `3d5d28a..c8bc67c`, 26개 커밋, 119개 파일, `+12,678/-3,308`줄
- 로컬 코드·설정·출시 문서·테스트 계약
- 실제 앱 도메인 `app.saigon-rider.com`의 공개 HTTP 응답, readiness, OpenAPI, CORS 및 보안 헤더
- Android/iOS native 저장소 연결 상태와 Docker 기반 검증 가능 여부

루트 `saigon-rider.com`이 마케팅 landing을 제공하는 것은 의도된 구성이다. 실제 앱 배포면은 `app.saigon-rider.com`으로 구분해서 판단했다.

### 1.2 안전 원칙

- 운영 데이터 변경, 보상 지급, 계정 생성, 인증 우회 및 파괴적 요청을 수행하지 않았다.
- 공개 확인은 GET·OPTIONS·OpenAPI 등 비파괴 요청으로 제한했다.
- 발견한 비밀값은 출력하거나 문서에 복제하지 않았다.
- 외부 서비스·DB·파일 시스템의 제품 상태를 변경하지 않았다.

---

## 2. 기능 관점 — HOLD

### 2.1 코드상 제공 가능한 범위

가입·OAuth·홈·지도·마켓·검색·등록·상세·찜·비즈니스·피드·DM·알림·프로필·거래·정보·라이드·지원·설정의 주요 프런트 라우트와 BFF 라우터는 연결돼 있다.

- 프런트 라우트: [`frontend/src/App.tsx`](../../../frontend/src/App.tsx#L361)
- BFF 라우터: [`backend/app/main.py`](../../../backend/app/main.py#L161)

가챠·상점·인벤토리·시즌·쿠폰·차고 등 fulfillment가 준비되지 않은 기능은 진입점이 차단돼 있다. 이는 안전한 방향이지만 출시 기능으로 안내하거나 홍보해서는 안 된다.

- 프런트 차단 경계: [`frontend/src/App.tsx`](../../../frontend/src/App.tsx#L414)
- BFF 차단 경계: [`backend/app/main.py`](../../../backend/app/main.py#L183)

### 2.2 P0 기능 차단 항목

#### F-01. 침수 예측 실패가 “안전”으로 표시될 수 있음

외부 제공자 오류 또는 비정상 응답을 위험도 `0.0`으로 변환하고, 실행 후 기존 예측을 무조건 삭제한다. 부분 장애가 발생하면 마지막으로 확인된 위험 정보를 보존하지 못하고 사용자에게 0% 또는 경보 없음으로 보일 수 있다.

- 오류의 `0.0` 변환: [`backend/app/jobs/predict_flood_risk.py`](../../../backend/app/jobs/predict_flood_risk.py#L34)
- 기존 예측 삭제: [`backend/app/jobs/predict_flood_risk.py`](../../../backend/app/jobs/predict_flood_risk.py#L80)

**출시 조건:** 실패를 명시적인 unavailable 상태로 전달하고 지역별 마지막 성공 snapshot을 보존한다. 출시 전 완료할 수 없다면 예측 위험도 노출을 비활성화한다.

#### F-02. 가입 동의와 탈퇴·내보내기 계약이 일치하지 않음

OAuth 로그인 화면의 약관·개인정보 문구는 실제 링크나 명시적 동의 수단이 아니며, 동의 문서 버전도 저장하지 않는다. 탈퇴는 일부 사용자 필드만 가명화하고, 공개 문구가 약속하는 삭제·보존 범위와 데이터 export 범위를 충족하지 못한다.

- 로그인 전 동의 UI: [`frontend/src/pages/auth/OAuthLogin.tsx`](../../../frontend/src/pages/auth/OAuthLogin.tsx#L307)
- 탈퇴 및 export 구현: [`backend/app/routers/users.py`](../../../backend/app/routers/users.py#L230)
- 개인정보 삭제 안내 문구: [`frontend/src/locales/ko/translation.json`](../../../frontend/src/locales/ko/translation.json#L1438)

**출시 조건:** 로그인 전에 약관을 열람·동의할 수 있어야 하며, 동의 버전과 시각을 기록한다. 삭제·보존·export의 실제 범위를 법률 문서와 동일하게 맞춘다.

#### F-03. 실기기 핵심 흐름 미검증

다음 항목은 코드 존재 여부가 아니라 서명된 Android/iOS 빌드와 실제 운영형 설정에서의 성공·실패 증거가 필요하다.

- 위치 권한 허용·거부·재요청
- 백그라운드 GPS와 장시간 이동
- FCM 최초 등록·토큰 회전·알림 탭 딥링크
- Google/Apple/Zalo OAuth 성공·취소·오류·앱 복귀
- 오프라인 전환과 외부 provider 지연·장애

기존 출시 감사도 이 항목들을 외부 게이트로 남기고 `HOLD`를 명시한다.

- [`260722_service_user_full_launch_audit_task.md`](./260722_service_user_full_launch_audit_task.md#L35)

#### F-04. 최신 UI에 대한 출시 회귀 증거 부족

기존 감사 기준 커밋 `3755179` 이후 현재 HEAD까지 380개 파일, `+33,407/-7,944`줄이 변경됐다. 이번 최신 pull만 119개 파일, `+12,678/-3,308`줄 규모이며 지도·침수·업체·광고·OTP·DB migration이 포함된다. TypeScript 검사는 통과했지만 최신 화면의 브라우저 E2E·시각 회귀·실기기 검증은 없다.

### 2.3 중위험 기능 제한

- Google Directions 운영 키가 없어 인앱 길안내가 준비 중 안내 후 외부 Google Maps로 폴백한다.
- 번역 provider 인증 오류 시 원문으로 폴백한다. 사용자에게 제한 상태를 명확히 안내해야 한다.
- 알림 더보기 실패 시 오류·재시도 경로가 부족하다.
- 강제 업데이트 메타데이터는 앱 시작 흐름에서 소비되지 않고 설정 화면 조회에 의존한다.
- FCM token refresh listener는 정의돼 있으나 서버 재등록 흐름의 호출 증거가 부족하다.
- 광고 성과 화면·API·DDL은 추가됐지만 실제 광고 노출은 꺼져 있고 이벤트 수집·롤업도 미구현이라 지표가 항상 0인 단계다. 광고주용 성과 서비스로 판매·홍보하면 안 된다.

### 2.4 최신 pull에서 추가 확인한 사업자 기능 결함

#### F-05. 미검증 업체 광고의 상세 조회 게이트 우회 — P1

광고 목록과 통계는 소유 업체의 `verification_status='verified'`를 요구하지만, 개별 광고 상세 조회는 `is_active`와 `APPROVED`만 검사한다. 미검증 업체의 승인 광고 UUID를 직접 공유하면 목록 게이트를 우회해 상세 화면을 열 수 있다.

- 정상 목록 게이트: [`backend/app/services/ad_gating.py`](../../../backend/app/services/ad_gating.py#L31)
- 개별 상세 조회: [`backend/app/modules/ads/application.py`](../../../backend/app/modules/ads/application.py#L232)
- 프런트 상세 라우트: [`frontend/src/App.tsx`](../../../frontend/src/App.tsx#L386)

사업자 검증이 법률·계약상 필수이면 이 항목은 P0로 승격한다.

#### F-06. 사업자 검증 문서의 content 소유권 미확인 — P1

사업자등록증·간판 문서 제출은 content UUID의 존재만 확인하고 신청자 소유 여부를 검사하지 않는다. UUID가 유출되면 다른 사용자의 content를 자신의 검증 신청에 연결할 수 있다.

- 존재 여부만 확인하는 helper: [`backend/app/routers/biz.py`](../../../backend/app/routers/biz.py#L115)
- 검증 문서 연결: [`backend/app/routers/biz.py`](../../../backend/app/routers/biz.py#L240)

또한 일반 content 상세 API는 인증 없이 owner 정보·파일 경로·imgproxy URL을 반환한다. 사업자등록증 같은 민감 문서는 일반 공개 이미지와 분리해 private ACL, 신청자 소유권 검사, 관리자용 단기 서명 URL을 적용해야 한다.

- 공개 content 상세: [`backend/app/routers/contents.py`](../../../backend/app/routers/contents.py#L188)

---

## 3. 서비스 관점 — NO-GO

### 3.1 P0-1. Engine 서비스 키 신뢰 경계 붕괴

모바일 앱의 GPS 전송과 BFF의 내부 Engine 호출이 동일한 전역 `ENGINE_SERVICE_KEY` 경계를 공유한다. Nginx는 공개 `/api/sre/*`를 Engine `/v1/*` 전체로 전달하고, Engine은 하나의 전역 키 비교만 수행한다.

- 모바일·BFF 호출 구조: [`ai-docs/context/architecture.md`](../../context/architecture.md#L93)
- 공개 Engine 프록시: [`nginx/conf.d/default.conf`](../../../nginx/conf.d/default.conf#L113)
- 전역 키 비교: [`engine/app/deps.py`](../../../engine/app/deps.py#L12)
- RP 변경 API: [`engine/app/routers/balance.py`](../../../engine/app/routers/balance.py#L20)

앱 패키지에서 키가 추출되면 임의 사용자 식별자와 금액을 지정하는 특권 변경 API에 접근할 수 있는 구조다. 공개 OpenAPI에서도 RP 지급·가챠·상점 구매 등 변경 엔드포인트가 확인된다. 실제 인증값 사용이나 변경 요청은 수행하지 않았다.

- 실배포 OpenAPI: <https://app.saigon-rider.com/api/sre/openapi.json>

**즉시 조치:**

1. 공개 `/api/sre/*`에서 특권·경제 변경 경로를 우선 차단한다.
2. 노출 가능성이 있는 Engine 전역 키를 회전한다.
3. BFF·worker 전용 특권 identity를 모바일 패키지에서 완전히 분리한다.
4. GPS ingest는 사용자·기기·용도·만료에 묶인 단기 토큰과 정확한 endpoint allowlist로 재설계한다.
5. 다른 사용자·다른 기기·재전송·rate-limit 회귀 테스트와 새 모바일 빌드를 배포한다.

### 3.2 P0-2. 추적된 OAuth 민감정보

[`database/init/104_oauth_zalo_config.sql`](../../../database/init/104_oauth_zalo_config.sql#L4)에 실제 형식의 Zalo app secret이 추적돼 있다. 이 문서에는 값을 인용하지 않는다. 함께 확인한 Google·Apple·Google Maps·landing 예제는 runtime reference, 공개 식별자 또는 placeholder였다.

**즉시 조치:** 해당 secret을 폐기·재발급하고 secret store로 이전한다. 현재 tree뿐 아니라 Git 전체 이력, CI artifact, 배포 로그와 공유 문서를 secret scanner로 감사한다.

### 3.3 P0-3. 실배포 artifact와 HEAD 불일치

2026-07-31 비파괴 확인 결과 BFF와 Engine health는 응답하지만 readiness는 모두 404다. 실배포 OpenAPI에는 현재 코드의 OAuth exchange와 일부 신고 API가 없고, Engine health 응답도 현행 구현보다 오래된 형태다.

- BFF readiness: <https://app.saigon-rider.com/api/bff/ready>
- Engine readiness: <https://app.saigon-rider.com/api/sre/ready>
- 현재 BFF readiness 구현: [`backend/app/main.py`](../../../backend/app/main.py#L208)
- 현재 Engine readiness 구현: [`engine/app/main.py`](../../../engine/app/main.py#L164)

추가로 실배포 preflight가 임의 Origin을 반사하면서 credentials를 허용했고, 현재 저장소 Nginx에 정의된 HSTS·CSP·`X-Content-Type-Options`·`Referrer-Policy` 등이 공개 응답에서 확인되지 않았다. OpenAPI·metrics·개발 테스트 경로도 공개돼 있다.

**출시 조건:** 현재 운영 artifact의 commit·image digest를 먼저 식별·보존한 뒤, 보안 조치된 정확한 commit을 immutable image로 배포한다. readiness 200, 비허용 Origin 거부, 보안 헤더, OpenAPI·metrics·개발 경로 비공개를 외부에서 재검증한다.

### 3.4 P0-4. 기존 DB 업그레이드와 readiness 불완전

최신 pull에서 Compose의 기존 BFF 볼륨 migration에 150–156이 추가된 것은 개선이다. 하지만 실행 목록은 145·146·148–156으로 시작하므로, 118–144 또는 `admin_accounts.role`을 추가하는 147을 아직 받지 못한 기존 볼륨에는 이를 보완할 자동 경로가 없다. BFF readiness도 147–156의 광고·사업자·관리자 schema version을 검증하지 않아 필요한 스키마가 빠진 DB에서 성공할 수 있다.

- migration 실행 목록: [`docker-compose.yml`](../../../docker-compose.yml#L77)
- 누락된 role migration: [`database/init/147_admin_accounts_role.sql`](../../../database/init/147_admin_accounts_role.sql#L1)
- readiness 검사 범위: [`backend/app/readiness.py`](../../../backend/app/readiness.py#L8)

**출시 조건:** 빈 볼륨과 운영 백업 복제본 모두에서 전체 SQL·Alembic migration을 적용하고 schema diff, 멱등 재실행, rollback 또는 forward-fix를 검증한다.

### 3.5 P0-5. 법률 문서와 실제 개인정보 처리 불일치

공개 정책에는 운영자 정보 placeholder와 실제 처리 항목의 누락·과잉 기재가 남아 있다. 로그인 전 약관 접근, OAuth·위치·FCM 처리, 보존기간, 탈퇴 purge 및 export 범위를 구현과 문서에서 하나의 계약으로 맞추지 못했다.

법률 검토 자체는 이 코드 감사 범위 밖이지만, 구현과 고지의 명백한 불일치는 출시 전에 제거해야 한다.

### 3.6 P0-6. 복구 가능한 운영 체계 미입증

저장소에서 다음 운영 증거를 확인하지 못했다.

- Postgres·contents·Redis의 암호화된 외부 백업과 보존 정책
- 실제 restore drill과 측정된 RPO/RTO
- migration 전 snapshot 및 rollback/forward-fix 절차
- BFF 5xx·latency·readiness, worker heartbeat, DLQ/outbox lag, 디스크·백업·인증서 경보
- 장애 시 온콜 담당자와 기능별 중단·복구 기준

실행 절차 문서만으로는 통과가 아니며, 실제 복원 로그·경보 발화·롤백 결과가 필요하다.

### 3.7 P1. 운영 신뢰성 후속

- FCM credential이 없어도 Engine이 시작되고 readiness가 성공할 수 있다.
- production 구성에 `--reload`, bind mount, floating image tag 및 비고정 의존성이 남아 재현성이 낮다.
- 알림 worker는 DB commit과 provider 호출 사이 crash에서 push를 유실할 수 있다.
- Admin cookie 보안 속성과 명시적인 CSRF 방어를 재검토해야 한다.
- 게시물·DM·업로드의 사용자 단위 abuse quota가 부족하다.
- 업로드의 이미지 폭탄 방어, 사용자 quota, orphan 정리 및 DB 실패 시 파일 rollback 증거가 부족하다.
- 사업자 검증 문서가 일반 공개 contents 체계를 사용하며 소유권·비공개 ACL을 강제하지 않는다.
- 검증 업체 전용 광고 정책을 개별 광고 상세 조회가 우회한다.

---

## 4. 실행 검증 결과

| 검증 | 결과 | 해석 |
|---|---|---|
| `npx tsc --noEmit --pretty false -p tsconfig.json` | **PASS** | 프런트 TypeScript 정적 검사는 통과 |
| `npx eslint src/` | **FAIL** | 2 errors, 238 warnings. 출시 lint gate 미통과 |
| 프런트 핵심 `.mjs` 계약 테스트 | **PASS 8/8** | OAuth·정보 안전·쿠폰/차고 gate의 선택된 계약만 통과 |
| `requestPolicy.test.mjs` | **미실행** | 로컬 `esbuild` 실행 파일 부재 |
| backend·engine `compileall` | **PASS** | 문법·import compile 수준의 증거이며 서비스 동작 증거는 아님 |
| production seed safety 검사 | **PASS** | production seed 차단 계약 통과 |
| migration prefix 검사 | **PASS** | 파일명 중복 규칙 통과. migration 적용 완전성 통과를 의미하지 않음 |
| backend·engine 전체 테스트 | **미실행** | 호스트 Python 의존성과 pytest 환경 부재 |
| 최신 pull 신규 backend 테스트 10개 | **미실행** | 테스트 파일은 추가됐으나 현재 환경에 pytest가 없어 실행 불가 |
| Docker fresh/existing-volume E2E | **미실행** | 현재 Windows 환경에 Docker 및 WSL 배포판 부재 |
| Android/iOS clean build·실기기 E2E | **미실행** | private submodule이 초기화되지 않아 native 구성 검증 불가 |
| 실배포 HTTP | **FAIL** | readiness 404, 배포 drift, CORS·보안 헤더·운영 endpoint 노출 확인 |

공식 테스트 진행표는 2026-05-15 이후 갱신되지 않았고 전체 약 37%, Engine과 시스템 영역은 각각 0%로 기록돼 있다. 이 수치가 현 코드의 실제 테스트량을 정확히 나타낸다고 단정할 수는 없지만, 현 HEAD의 출시 증거로 사용할 수도 없다.

- [`ai-docs/TEST/progress.md`](../../TEST/progress.md#L3)

---

## 5. 공개 출시 필수 게이트

아래 순서는 의존관계를 반영한다. 앞 단계의 차단이 끝나기 전에 외부 베타를 시작하지 않는다.

| 순서 | 게이트 | 수용 기준 | 현재 |
|---:|---|---|---|
| 1 | Engine 긴급 차단 | 공개 특권 경로 차단, 전역 키 회전, 모바일·BFF identity 분리, 새 앱 배포 | **FAIL** |
| 2 | Secret 대응 | Zalo secret 폐기·재발급, secret store 이전, Git 이력·artifact·로그 감사 | **FAIL** |
| 3 | 안전정보 | 침수 실패 상태 분리와 마지막 성공 snapshot 보존 또는 기능 비활성화 | **FAIL** |
| 4 | 개인정보·검증문서 계약 | 로그인 전 약관, 명시 동의·버전 기록, purge·export·retention 일치, 사업자 문서 private ACL·소유권 검사 | **FAIL** |
| 5 | DB upgrade | fresh DB와 운영 백업 복제본에서 전체 migration·schema diff·복구 통과 | **FAIL** |
| 6 | 정확한 배포 | commit/image digest 증명, readiness 200, strict CORS·보안 헤더, 운영 endpoint 비공개 | **FAIL** |
| 7 | Native·외부 연동 | 서명된 Android/iOS에서 GPS·FCM·OAuth·deep link·offline/provider failure 통과 | **FAIL** |
| 8 | 자동 회귀 | lint 0 error, typecheck, backend·engine 테스트, 사업자 검증·광고 상세 gate, 브라우저 E2E·시각 회귀를 CI에서 통과 | **FAIL** |
| 9 | 운영 복구 | 외부 백업, 실제 restore drill, RPO/RTO, 경보·온콜·rollback 훈련 통과 | **FAIL** |

---

## 6. 단계적 출시 권고

1. **즉시:** 외부 출시 동결, Engine 특권 경로 차단, 관련 key·secret 회전.
2. **Release Candidate:** P0 수정 후 정확한 commit/image로 production-like 환경을 재구성하고 전체 게이트 증적을 남긴다.
3. **초대형 베타:** P0 0건, 실기기·migration·복원·경보 검증 후 제한된 사용자와 제한된 기간으로 운영한다. 미완성 경제 기능은 계속 비공개로 유지한다.
4. **공개 출시:** 초대 베타에서 보안·데이터 정합성·핵심 흐름·운영 경보가 안정적임을 확인하고 GO/NO-GO 감사를 새로 작성한다.

코드가 존재하거나 health가 200이라는 사실은 출시 승인 기준이 아니다. **사용자 흐름의 검증, 특권 경계, 법적 고지와 실제 처리, 복구 가능성, 정확한 artifact 배포가 함께 통과해야 GO다.**

---

## 7. 감사 한계

- codebase-memory MCP가 현재 세션에 제공되지 않아 선택적 문서·파일 조회로 대체했다.
- Orca runtime이 `stale_bootstrap` 상태여서 내장 서브에이전트 교차검증으로 대체했으며 Orca orchestration provenance를 주장하지 않는다.
- Docker·WSL·운영 자격증명·초기화된 native submodule이 없어 fresh-volume, 전체 통합 테스트 및 실기기 검증을 수행하지 못했다.
- 외부 계약, 앱스토어 심사 및 정식 법률 자문은 범위에 포함하지 않았다.
- 이 한계들은 추가적인 미확인 위험을 의미한다. 이미 코드·배포면에서 확인된 P0만으로도 `NO-GO` 결론은 유지된다.

## 8. 재판정 완료 정의

다음을 모두 만족하고 증적 경로·실행 시각·대상 commit/image digest를 이 문서 또는 후속 판정 문서에 연결해야 한다.

- P0 미해결 0건
- 9개 출시 게이트 전부 PASS
- 비밀값을 제외한 CI·migration·restore·실기기·배포 검증 로그 확보
- 초대형 베타에서 중대 보안·데이터 손상·핵심 흐름 차단 0건
- 롤백 책임자와 공개 출시 승인자 명시

그 전까지 출시 상태는 **NO-GO**로 유지한다.
