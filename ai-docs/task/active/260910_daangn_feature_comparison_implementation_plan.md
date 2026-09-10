# 당근 기능 비교 후속 구현 원장 — 약속에서 길안내까지

- 문서일: 2026-09-10
- 상태: `READY` (외부 게이트 충족 전 구현 착수 금지)
- 구현 범위: PDF 비교표의 F030–F033만
- 실행 방식: T3 구현 → T4 독립 검증의 직렬 처리
- 성공 기준: C2C 거래 당사자가 수락된 약속의 목적지를 확인하고, 명시적 위치 동의 뒤 오토바이 ETA/경로를 조회해 길안내로 넘기며, 동의한 사용자에게만 출발·도착 알림이 전달된다.

## 1. 결정 원장

아래 분류는 이번 실행의 고정 입력이다. 상태 변경은 본 문서에 결정자·날짜·근거를 먼저 기록한 뒤에만 허용한다.

| 처리 | PDF 기능 ID | 이번 결정 | 실행 규칙 |
|---|---|---|---|
| **IMPLEMENT** | F030–F033 | 약속 → 목적지 → 오토바이 ETA/경로 → 길안내/출발·도착 흐름만 완성 | 기존 약속·경로·알림 자산을 우선 재사용하고, 누락 계약만 최소 변경한다. |
| **DEFER** | F003, F011, F054, F062, F065–F066, F080 | 현재 구현하지 않음 | 의존성·효과를 기록할 수는 있으나 코드·스키마·UI를 만들지 않는다. |
| **SKIP** | F018–F020, F042, F063, F069, F076–F079 | 제품 방향과 맞지 않거나 이번 비교 후속에서 제외 | 티켓 생성, 숨은 플래그, 선행 추상화까지 금지한다. |
| **BLOCK** | F034–F037, F052 | 별도 제품/법무/운영 결정 전 금지 | 아래 중단 조건을 해소하는 승인 기록 없이는 설계·구현하지 않는다. |
| **DONE** | F061 | 현행 완료로 간주 | 회귀 검증만 허용하며 재구현하지 않는다. |

### D-ROUTE-1 — 2026-09-10 대표 결정 (P0-3)

- 운영 제공자는 **자체 호스팅 Valhalla 단독**이다. Google Routes는 장애 폴백이나 운영 제공자로 사용하지 않는다.
- 사용자 선택 enum은 `motorcycle`(기본), `car`, `walking`이다. Valhalla 전송값은 각각 `motorcycle`, `auto`, `pedestrian`으로 고정 변환한다. `motor_scooter` 및 임의 costing은 노출하지 않는다.
- 현재 BFF 계약은 `two_wheeler` 응답값과 고정 `motorcycle` costing만 가진다. 이 결정은 현재 UI 구현을 뜻하지 않으며, 선택값 수용·검증·캐시 격리·응답 모드 반영은 P1-3의 최소 변경 범위다.

## 2. 범위 가드레일

- 서비스는 **호치민 지역 기반 오토바이 이용자 간 C2C 대면 직거래**다. 앱의 역할은 당사자의 약속과 이동을 돕는 데서 끝난다. 제3자 라이더, 자체 배송망, 보관·인수 대행, 배송 SLA를 만들지 않는다. 근거: [서비스 정의와 비개입 원칙](../../spec/service-concept-260726.md#L11), [확정된 경량 픽업 범위](../../spec/service-concept-260726.md#L223).
- **배송·에스크로·소비자 결제는 범위 밖**이다. 기존 거래/QR 코드가 발견돼도 F030–F033 작업에서 확장·결합·재설계하지 않는다. 돈·보험·분쟁에는 개입하지 않는다는 확정 원칙을 따른다. 근거: [범위 한계](../../spec/service-concept-260726.md#L168).
- 앱이 제안한 장소는 편의 정보이며 안전을 **보증**하지 않는다. 안전 문구·책임 경계가 확정되지 않으면 장소 추천 랭킹은 구현하지 않고 사용자가 지정한 목적지만 취급한다. 근거: [장소 제안 책임의 미결 사항](../../spec/service-concept-260726.md#L194).
- 새 위치 SoT·화면별 GPS 워처·좌표 영속화를 만들지 않는다. 전역 위치 SoT와 단일 워처를 사용하고, 실행형 길안내에는 탐색용 Bến Thành 폴백 좌표를 넣지 않는다. 근거: [위치 단일 SoT 원칙](../../context/service-rules.md#L14), [실행형 기능의 폴백 금지](../../context/service-rules.md#L35).
- 약속의 정밀 좌표는 서버 정책을 우회해 노출하지 않는다. 현재 응답은 상태/시각에 따라 `none/approx/exact`를 서버에서 판정한다. 근거: [약속 응답 정밀도 판정](../../../backend/app/routers/market.py#L1707).

## 3. 현재 자산과 외부 게이트

현재 `marketplace_appointments`에는 시각·장소명·좌표·상태가 있고([모델](../../../backend/app/models.py#L1778), [API 스키마](../../../backend/app/schemas.py#L1397)), 약속 카드는 좌표가 있을 때 길안내 버튼을 `/ride-nav`로 연결한다([DM 길안내 핸들러](../../../frontend/src/pages/dm/DmDetail.tsx#L832), [약속 카드 액션](../../../frontend/src/pages/dm/DmDetail.tsx#L1363)). `RideNav`는 위치 게이트 후 경로 API를 호출하며([경로 조회 흐름](../../../frontend/src/pages/ride/RideNav.tsx#L417)), BFF의 경로 계약은 오토바이 모드·거리·시간·폴리라인·스텝을 제공한다([프론트 계약](../../../frontend/src/api/info.ts#L585), [BFF 계약](../../../backend/app/routers/info_route.py#L88)). 따라서 기본 방침은 새 도메인 구축이 아니라 현행 배선의 계약 보강과 증거 확보다.

외부 게이트는 다음 두 가지다.

1. **라우팅/API 가용성:** `ROUTING_ENGINE_URL` 또는 승인된 외부 경로 제공자가 실제 HCMC 오토바이 경로를 반환해야 한다. 현재 BFF는 둘 다 없으면 `configured:false`이고, 자체 엔진 실패 시 Google 폴백도 임시 차단돼 있다([현행 게이트와 임시 차단](../../../backend/app/routers/info_route.py#L193)). 운영 키/URL, 과금·쿼터, 허용 지역, 장애 폴백 결정을 증거로 남겨야 한다.
2. **위치·알림 동의:** 길안내는 실제 위치 권한이 있어야 하고, 출발·도착 푸시는 OS 알림 동의 및 앱 내 알림 설정을 존중해야 한다. 위치 거부 시 목적지 표시는 가능하되 현재 위치 기반 ETA/안내는 실행하지 않는다. 실시간 위치 채널 참가를 알림 동의로 간주하지 않는다.

## 4. 순차 실행 체크리스트

체크박스는 위에서 아래로만 진행한다. 각 항목의 `완료기록`에는 커밋 SHA 또는 diff 링크, 실행 명령, 결과 요약, 증거 파일/스크린샷 경로를 적는다.

### Phase 0 — 발견 및 아키텍처 확인

- [x] **P0-1 / 담당 T3 / 대상: 발견 — PDF F030–F033 원문과 현행 코드 매핑표를 이 문서 부록에 추가.** 각 ID별 사용자 행위, 입력, 출력, 제외 범위를 한 줄씩 확정한다. **수락 증거:** 네 ID 모두 하나의 현행 진입점 또는 명시적 갭에 매핑되고 추정 문구가 없다. `진행중` 종료: T3/2026-09-10 10:31 KST. **완료기록:** `ai-docs/task/active/260910_daangn_feature_comparison_implementation_plan.md`에 부록 A 추가. T4 독립 검증(2026-09-10 KST): `python3 -c "from pypdf import PdfReader; print(PdfReader('docs/saigon_rider_daangn_feature_page_comparison_2026-09-09 copy.pdf').pages[9].extract_text())"`로 PDF 10쪽 원문을 확인하고, 부록의 인용 위치를 `sed`/`rg`로 대조했다. F030–F033 모두 PDF 행의 행위·입출력·경계와 현행 진입점에 일치하며 IMPLEMENT 범위 밖 ID를 구현 대상으로 매핑하지 않는다 → 통과. `git diff --check` 및 `git diff --no-index --check /dev/null ai-docs/task/active/260910_daangn_feature_comparison_implementation_plan.md` → 통과. 증거: PDF 10쪽(F030–F033) 및 부록의 현행 코드 링크. 잔여 위험: 없음(P0-1 독립 검증 완료).
- [x] **P0-2 / 담당 T3 / 대상: `backend/app/models.py`, `backend/app/schemas.py`, `backend/app/routers/market.py`, `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/pages/ride/RideNav.tsx`.** 약속 상태별 좌표 정밀도, 길안내 노출 조건, 취소/완료 후 접근을 호출 흐름으로 기록한다. **수락 증거:** `PROPOSED/ACCEPTED/CANCELLED/COMPLETED`별 목적지·CTA 표가 작성되고 서버가 원좌표 노출의 SoT임이 확인된다. `진행중` 종료: T3/2026-09-10 10:36 KST/9ffa3907. **완료기록:** `ai-docs/task/active/260910_daangn_feature_comparison_implementation_plan.md`에 부록 B 추가(코드 변경 없음). 검증: `git diff --check` → 통과. 증거: `MarketplaceAppointment` 저장 필드와 `AppointmentOut` 계약, `market._appt_out()`의 서버 정밀도 분기, `dm.get_messages()`의 참여자 인증 뒤 `_appt_out()` 호출, `DmDetail` CTA 조건, `RideNav.fetchRoute()` 실행형 위치 게이트. 잔여 위험/명시적 갭: 카드의 길안내 노출은 현재 `hasCoords && status !== 'CANCELLED'`여서 `PROPOSED`/`COMPLETED`의 approximate 좌표에도 표시된다. `RideNav`는 출발 위치를 게이트하지만 약속 상태·참여자·exact 목적지 자체를 재검증하지 않는다. P1-2에서 `ACCEPTED + exact + participant` 서버 계약으로 결정·검증할 사항이다. **T4 독립 검증(2026-09-10 KST):** cited source regions and `service-rules.md` location-gate rules independently re-read; state/precision/CTA rows, `_appt_out()` coordinate-disclosure SoT, participant check, and RideNav revalidation gap all match current code. `git diff --check` and `git diff --no-index --check /dev/null ai-docs/task/active/260910_daangn_feature_comparison_implementation_plan.md` pass. `git diff --name-only -- backend frontend database` returned no application-code changes, so no out-of-scope F030–F033 implementation diff was found. **T4 판정: PASS.**
- [x] **P0-3 / 담당 T3 / 대상: 발견 — 경로 API, `ROUTING_ENGINE_URL`, 캐시·HCMC 커버리지.** 운영 경로와 장애 정책을 결정한다. **수락 증거:** 실행 중 Valhalla가 실제 HCMC 샘플 3쌍에서 선택 모드별 경로·ETA를 반환하고, 제공자/모드 변환/장애 정책이 기록된다. `진행중` 종료: T3/2026-09-10 KST/71504f69. **완료기록:** D-ROUTE-1에 따라 self-hosted Valhalla를 운영 제공자로 확정했고 Google Routes는 사용하지 않는다. `docker compose --env-file .env ps routing_engine bff`에서 `saigon_routing_engine`과 `saigon_bff` 모두 Up(각 6일/10시간), BFF에는 `ROUTING_ENGINE_URL`만 값 비공개로 확인했다. BFF 컨테이너 내부에서 해당 URL의 Valhalla `/route`를 읽기 전용 호출했다. 모든 프로브는 `endpoint=Valhalla /route`; `error_class=null`: p1 `motorcycle` 200/5.994km/458s, `auto` 200/6.003km/449s, `pedestrian` 200/4.448km/3162s; p2 `motorcycle` 200/3.306km/257s, `auto` 200/3.306km/257s, `pedestrian` 200/2.888km/2050s; p3 `motorcycle` 200/3.884km/312s, `auto` 200/3.884km/312s, `pedestrian` 200/3.248km/2319s. 쌍의 좌표·엔진 URL·키는 기록하지 않았다. p1의 두 차량 모드는 거리/ETA가 달라 Valhalla costing 구분도 관측했다. 현재 BFF `/api/info/route`의 무인증 경계는 `mode=car` 및 `mode=motorcycle` 모두 419(`error_class=auth_required`)였다. 인증된 BFF 성공응답은 이 P0 작업에서 만들지 않았으며, 소스상 요청 mode enum이 없고 `RouteOut.route_mode`/`_COSTING`이 각각 `two_wheeler`/`motorcycle`으로 고정돼 있어 현재 BFF는 세 사용자 모드를 반환할 수 없다([라우터](../../../backend/app/routers/info_route.py#L88), [엔진 어댑터](../../../backend/app/services/routing_engine.py#L22)). 엔진 장애는 `configured:false`로 fail-closed이며 Google 폴백은 차단 상태([라우터](../../../backend/app/routers/info_route.py#L221)); 이는 D-ROUTE-1과 일치한다. **P1-3 인계:** enum 검증 및 `car→auto`, `walking→pedestrian` 변환, mode 포함 캐시 키, 응답 선택모드, 3×3 인증 BFF 계약 테스트를 구현·검증한다. 코드 변경 없음; 체크박스는 T4 독립 검토 전 완료 확정으로 간주하지 않는다. **T4 독립 검증(2026-09-10 KST):** `saigon_routing_engine`/`saigon_bff`가 모두 healthy/Up 상태에서 별도 HCMC 좌표 3쌍을 사용해 Valhalla `/route`를 재호출했다. 각 쌍의 `motorcycle`/`auto`/`pedestrian` 모두 HTTP 200·`trip.status=0`·거리·ETA를 반환했고, p2에서 `motorcycle` 11.074km/745.759s 대 `auto` 11.072km/744.590s로 실제 차량 costing 차이를 확인했다(모든 좌표·URL·키는 기록하지 않음). Valhalla costing 명칭과 응답 재현으로 사용자 선택 `motorcycle`/`car`/`walking` → 엔진 `motorcycle`/`auto`/`pedestrian` 매핑은 타당하다. BFF `/api/info/route?...&mode=car` 무인증 호출은 419 `Session expired`; 소스 재검토상 `RouteOut.route_mode=two_wheeler`, `_COSTING=motorcycle`, 캐시 키에 mode 없음으로 현재 BFF가 mode-fixed임을 확인했다. P1-3 수락기준에 변환, mode-aware 캐시, 응답 mode, 인증 3×3 계약 테스트가 모두 기재되어 있다. `git diff --check` 및 문서 신규 diff check 통과. **T4 판정: PASS.**
  - T3 검증: `docker compose --env-file .env ps routing_engine bff`, BFF 컨테이너 내부 Valhalla `/route` 3쌍×3 costing 읽기 전용 프로브, 무인증 BFF 경계 프로브; `git diff --check` 및 `git diff --no-index --check /dev/null ai-docs/task/active/260910_daangn_feature_comparison_implementation_plan.md` 모두 통과. 임시 BFF 응답 파일은 검증 직후 삭제했다.
- [x] **P0-4 / 담당 T4 / 대상: 본 문서와 P0 산출물.** IMPLEMENT 외 ID가 설계·경로·스키마에 섞이지 않았는지 독립 검토한다. **수락 증거:** F030–F033 추적표와 DEFER/SKIP/BLOCK/DONE 위반 0건의 리뷰 기록. **완료기록:** T4 독립 리뷰(2026-09-10 KST): PDF 비교표 10쪽 원문을 다시 대조해 부록 A의 F030 약속, F031 만남·이동 연결, F032 거래 진행 전용 화면, F033 QR·수동 입금 표시 매핑이 각각 PDF 사용자 행위·입출력·제외 경계와 일치함을 확인했다. 제품 SoT `spec/service-concept-260726.md`의 당사자 간 경량 대면거래·돈/보험/배달망 비개입 원칙 및 거래 라이프사이클의 약속→이동 갭과도 정합하다. 부록 B의 상태별 `none/approx/exact` 흐름과 `_appt_out()` 서버 정밀도 SoT, 참여자 인증, 취소·완료 후 접근 제한 기록을 재검토했으며 P1-2로 명시된 잔여 갭을 새 범위로 끌어올리지 않았다. P0-3의 외부 게이트 증거와 D-ROUTE-1을 재검토해 자체 호스팅 Valhalla 단독, 사용자 `motorcycle`/`car`/`walking` → 엔진 `motorcycle`/`auto`/`pedestrian` 매핑, HCMC 3쌍 실측 및 mode-fixed BFF의 P1-3 인계를 확인했다. 이후 제안 범위(P1–P5)의 설계·경로·스키마·UI 항목에는 IMPLEMENT인 F030–F033만 연결되어 있고, DEFER(F003/F011/F054/F062/F065–F066/F080), SKIP(F018–F020/F042/F063/F069/F076–F079), BLOCK(F034–F037/F052), DONE(F061)는 분류표·중단 조건·제외 경계 언급 외에 구현 대상/선행조건/신규 계약으로 유입되지 않았다. F034 안심결제·대금보관도 F033의 수동 표시와 명시적으로 분리되어 있다. 변경 대상 F030–F033 코드 경로의 현재 diff는 없고, `git diff --check` 및 문서 신규 diff의 `git diff --no-index --check /dev/null ai-docs/task/active/260910_daangn_feature_comparison_implementation_plan.md`에서 whitespace 오류가 없음을 확인했다. **T4 판정: PASS.**

### Phase 1 — API 및 데이터 계약

- [x] **P1-1 / 담당 T3 / 대상: 발견 후 `database/init/*`, `backend/app/models.py`, `backend/app/schemas.py`.** F030–F033 원문이 요구하는데 현행 약속 모델에 없는 최소 필드만 설계한다. 이동 방향 필드가 필요하면 허용값·기본값·기존 행 마이그레이션을 먼저 결정하고, 필요 없으면 “스키마 변경 없음”을 기록한다. **수락 증거:** 각 추가 필드가 특정 F-ID에 역추적되며 nullable/default/backfill 계약이 문서화된다. `진행중` 종료: T3/2026-09-10 11:02 KST/71504f69. **완료기록:** **스키마 변경 없음.** 부록 C의 datum별 추적표로 F030–F033 필요 데이터와 현재 표현을 대조했다. 약속 목적지명·원좌표는 `MarketplaceAppointment.place_name/place_lat/place_lng`과 `AppointmentProposeRequest`에 이미 있으며, 공개 응답은 `_appt_out()`의 기존 정밀도 경계를 유지한다. 약속 상태(`PROPOSED/ACCEPTED/COMPLETED/CANCELLED`) 및 F032/F033 수동 결제 표시는 기존 `MarketplaceAppointment.status`·별도 `MarketplaceTransaction.payment_status`로 표현된다. `motorcycle`(기본)/`car`/`walking`은 사용자별 경로 요청의 일시적 선택으로 P1-3의 request/response/cache 계약에만 속하며, 두 당사자가 합의하거나 상대에게 보여야 한다는 F030–F033/SoT 근거가 없어 appointment에 저장하지 않는다. 출발점·이동 방향도 실제 위치에서 각 사용자가 계산하는 실행 시점 값이므로 저장하지 않는다. 출발/도착 알림의 발생·수신자·멱등 기준은 아직 미결정(P4-1)이며, 현행 generic `notification_outbox`/`notifications.source_event_id`가 적재·전달 상태를 담당하므로 사전 appointment 컬럼을 만들지 않는다. 위치 채널의 `arrived_at/left_at`는 동의된 실시간 위치공유의 별도 SoT여서 약속 상태·알림 상태로 재사용하지 않는다. nullable/default/backfill 대상 없음. 검증: `git diff --check` 및 `git diff --no-index --check /dev/null ai-docs/task/active/260910_daangn_feature_comparison_implementation_plan.md` → 통과; `git diff --name-only -- backend/app/models.py backend/app/schemas.py database/init` → 출력 없음. 코드·스키마 변경이 없으므로 신규 테스트 및 변경 후 재인덱싱은 불필요(탐색 전 graph가 없어서 codebase-memory fast index는 수행됨). 잔여 인계: P1-2는 `ACCEPTED + exact + participant` 목적지 재검증 계약, P1-3은 mode enum/엔진 변환, P4-1은 출발/도착 이벤트 상태기계·멱등키를 각각 별도로 결정한다. **T4 독립 검증(2026-09-10 KST):** Appendix C를 `105_marketplace_appointments.sql`, `232_marketplace_transactions.sql`, `models.py`/`schemas.py`/`market.py`의 인용 구간과 대조해 목적지·상태·수동 결제의 기존 표현, route mode의 개인 실행값, 실행 시점 origin/direction, 위치채널 `arrived_at/left_at`의 별도 SoT를 확인했다. `146_notification_outbox.sql` 및 `145_notifications_event_idempotency.sql`을 재확인해 이벤트·수신자·멱등 설계가 P4-1/P4-2 선행임을 확인했다. `git diff --check`, 신규 문서 `git diff --no-index --check /dev/null ...`, 그리고 `git diff --name-only -- backend/app/models.py backend/app/schemas.py database/init`(출력 없음)을 통과했다. `.codebase-memory/`는 untracked 인덱스 산출물이며 애플리케이션 변경으로 세지 않았다. **T4 판정: PASS.**
- [x] **P1-2 / 담당 T3 / 대상: `backend/app/routers/market.py`, `backend/app/schemas.py`.** 길안내 가능한 약속 계약을 `ACCEPTED + 유효한 exact 목적지 좌표 + 대화 참여자`로 고정하고 취소·완료·권한 밖 접근 응답을 명시한다. **진행중:** T3/2026-09-10 11:07 KST/71504f69. **수락 증거:** 상태/권한/정밀도 행렬의 각 케이스가 HTTP 상태와 응답 필드로 결정돼 있다. **완료기록:** T3 구현 완료(2026-09-10 KST, T4 검증 완료). 변경: `backend/app/routers/market.py`에 `GET /market/appointments/{appointment_id}/navigation`, `backend/app/schemas.py`에 성공 계약 `AppointmentNavigationOut` 및 제안 좌표 pair/range 검증, `backend/app/tests/test_appointment_navigation_authorization.py`에 행렬 테스트, 본 부록 D. 성공은 `appointment_id/place_name/place_lat/place_lng/precision:"exact"`만 반환하며 모든 거부 응답은 좌표 없는 안정 `detail.code`다. **T4 독립 최종 검증(2026-09-10 KST):** `python3 -m py_compile backend/app/tests/test_appointment_navigation_authorization.py` → `PY_COMPILE_PASS`; `python3 -m ruff check backend/app/tests/test_appointment_navigation_authorization.py backend/app/routers/market.py backend/app/schemas.py` → `All checks passed!`; BFF 컨테이너 `docker compose --env-file .env --profile backend exec -T bff python -m unittest -v app.tests.test_appointment_navigation_authorization app.tests.test_marketplace_transaction` → **Ran 17 tests in 0.062s, OK** (P1-2 8건 + 인접 marketplace transaction 9건). blocked participant 회귀는 HTTP 403 + `{"code":"appointment_navigation_blocked"}`를 확인하고 응답 detail에 `place_lat/place_lng` 값이 없음을 확인했다. `git diff --check` → 통과. production diff 확인: `git diff --name-only -- backend frontend database`는 `backend/app/routers/market.py`, `backend/app/schemas.py`만 출력했으며, 해당 diff는 승인된 navigation authorization contract(라우트·성공 스키마·좌표 pair/range 검증)로 제한되고 P1-3 변경은 없다. 테스트 파일은 `backend/app/tests/test_appointment_navigation_authorization.py` 신규이며 production 코드가 아니다. 호스트 pytest는 Python 3.8의 `datetime.UTC` 미지원, BFF 이미지에는 pytest 미설치여서 unittest를 컨테이너 authoritative runner로 사용했다. `codebase-memory` 재인덱싱은 이번 검증에서 수행하지 않았다(코드 변경자는 T3 기록 참조).
- [ ] **P1-3 / 담당 T3 / 대상: `backend/app/routers/info_route.py`, `backend/app/services/routing_engine.py`, `frontend/src/api/info.ts`.** D-ROUTE-1의 사용자 enum `motorcycle`(기본)/`car`/`walking`만 수용해 각각 Valhalla `motorcycle`/`auto`/`pedestrian`으로 변환하고, 성공·미설정·권역 밖·제공자 장애·쿼터 초과 계약을 구분한다. **수락 증거:** 각 모드×HCMC 샘플 3쌍의 인증 BFF 계약 테스트가 거리·ETA·요청과 같은 응답 mode를 반환하며, mode별 캐시가 격리되고 각 실패는 사용자 조치 가능한 안정 코드(좌표/비밀키 비노출)로 반환된다. **완료기록:** —
- [ ] **P1-4 / 담당 T4 / 대상: Phase 1 diff 및 신규 테스트.** BFF가 Engine DB에 직접 접근하지 않는지, timezone-aware 시각과 좌표 범위 검증이 유지되는지 검토한다. **수락 증거:** 아키텍처 위반 0건, API 계약 테스트 전부 통과. **완료기록:** —

### Phase 2 — UI 및 약속 목적지

- [ ] **P2-1 / 담당 T3 / 대상: 발견 — 약속 제안 폼/장소 피커 소비처, `frontend/src/pages/dm/DmDetail.tsx`.** 장소명과 좌표가 함께 저장되는 흐름, 좌표 없는 텍스트 약속의 처리, 수락 전 정밀도 표시를 정리한다. **수락 증거:** 제안→수락→카드 갱신 E2E에서 목적지명/좌표가 소실되지 않고 비참여자에게 노출되지 않는다. **완료기록:** —
- [ ] **P2-2 / 담당 T3 / 대상: `frontend/src/pages/dm/DmDetail.tsx` 및 관련 스타일/i18n.** 길안내 CTA는 수락된 활성 약속과 exact 좌표에만 노출하고, 위치 권한 확인 중·거부·서비스 밖·경로 미가용 사유를 인라인으로 표시한다. **수락 증거:** 상태/권한별 렌더 계약 테스트와 ko/vi/en 키 누락 0건. **완료기록:** —
- [ ] **P2-3 / 담당 T3 / 대상: 발견 — 기존 장소/가게 피커.** F-ID가 장소 제안을 요구할 때만 기존 가게 핀을 후보로 재사용하되 “추천”이 아닌 “장소 후보”로 표기한다. **수락 증거:** 안전 보증 문구가 없고, 별도 배송/보관 주체가 생성되지 않으며, 미확정 책임 경계면 기능 플래그 없이 보류된다. **완료기록:** —
- [ ] **P2-4 / 담당 T4 / 대상: Phase 2 UI 및 접근성.** 저사양 Android 화면에서 로딩·빈 좌표·긴 베트남어 장소명·키보드·스크린리더를 검증한다. **수락 증거:** CTA 오동작 0건, 탭 타깃/포커스/라벨 확인 기록과 스크린샷. **완료기록:** —

### Phase 3 — 길안내 인계

- [ ] **P3-1 / 담당 T3 / 대상: `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/pages/ride/RideNav.tsx`.** 약속 ID·목적지명·좌표를 타입 안전한 navigation state/검증된 파라미터로 전달하고 새로고침·뒤로가기를 보존한다. **수락 증거:** 변조/누락 좌표는 안내를 시작하지 않고, 정상 약속은 동일 목적지를 표시하는 라우팅 테스트. **완료기록:** —
- [ ] **P3-2 / 담당 T3 / 대상: `frontend/src/pages/ride/RideNav.tsx`, `frontend/src/api/info.ts`.** 실제 위치 획득 후 경로 개요(거리·ETA)를 먼저 표시하고 사용자 탭 뒤 안내 추종을 시작한다. **수락 증거:** “화면 진입=즉시 추적 시작”이 아니며, 성공 응답의 거리·시간·폴리라인이 일관되게 렌더된다. **완료기록:** —
- [ ] **P3-3 / 담당 T3 / 대상: `frontend/src/pages/ride/RideNav.tsx`, `frontend/src/lib/native.ts`.** 외부 지도 인계는 `NativeInterface.openUrl`만 사용하고 목적지 및 오토바이 이동 모드를 보존한다. **수락 증거:** 직접 `window.open`/`navigator.*` 호출 0건, Android/iOS 인계 URI 캡처와 목적지 일치. **완료기록:** —
- [ ] **P3-4 / 담당 T4 / 대상: Phase 3 diff와 계약 테스트.** 경로 미설정·API 429·네트워크 단절·위치 거부에서 지도/목적지 컨텍스트가 유지되고 복구 동작이 명확한지 검증한다. **수락 증거:** 실패 행렬 전 케이스 통과 및 무한 재시도/자동 외부 앱 실행 0건. **완료기록:** —

### Phase 4 — 출발·도착 알림

- [ ] **P4-1 / 담당 T3 / 대상: 발견 — F030–F033 원문과 현행 약속/위치 채널 이벤트.** “출발”과 “도착”의 명시적 사용자 행위 또는 서버 판정 기준, 재실행 가능 여부, 수신자를 결정한다. **수락 증거:** 이벤트별 상태기계·멱등 키·오탐 방지 기준이 승인되고 백그라운드 위치 추적 없이 성립한다. **완료기록:** —
- [ ] **P4-2 / 담당 T3 / 대상: `backend/app/routers/market.py` 또는 확정된 도메인 라우터, `backend/app/services/noti_events.py`, 필요 시 최소 마이그레이션.** 도메인 변경과 같은 트랜잭션에 출발/도착 outbox 이벤트를 적재한다. **수락 증거:** 롤백 시 알림 0건, 재시도 시 사용자별 중복 0건, 비참여자 수신 0건의 백엔드 테스트. **완료기록:** —
- [ ] **P4-3 / 담당 T3 / 대상: `backend/app/noti_worker/__main__.py`, 알림 설정/다국어 소비처.** 이벤트 핸들러·인앱 알림·푸시 딥링크를 추가하고 알림 동의/설정을 적용한다. **수락 증거:** 알림 거부 사용자는 푸시 0건, 허용 사용자는 정확한 대화/약속으로 이동, ko/vi/en 메시지 스냅샷 통과. **완료기록:** —
- [ ] **P4-4 / 담당 T4 / 대상: Phase 4 diff, `notification_outbox`, Redis stream, noti_worker.** at-least-once 전달과 멱등 소비를 장애 주입으로 검증한다. 현행 outbox는 도메인 트랜잭션과 원자 적재되고([발행 계약](../../../backend/app/services/noti_events.py#L28)), 워커는 `event_id` 멱등성을 전제로 한다([릴레이 계약](../../../backend/app/noti_worker/__main__.py#L1008)). **수락 증거:** Redis 중단→복구, 워커 재시작, 중복 배치에서 알림 유실/중복 0건. **완료기록:** —

### Phase 5 — 테스트 및 실기기 운영 증거

- [ ] **P5-1 / 담당 T3 / 대상: `backend/app/tests/*appointment*`, 신규 경로/알림 테스트.** 권한, 상태 전이, 좌표 정밀도, 라우팅 실패, outbox 멱등 회귀 테스트를 추가한다. **수락 증거:** 변경 관련 백엔드 테스트 명령과 0 failure 로그. **완료기록:** —
- [ ] **P5-2 / 담당 T3 / 대상: `frontend/src/pages/dm/*.test.*`, `frontend/src/pages/ride/*.test.*`.** 약속 카드→경로 개요→외부 길안내와 권한/장애 분기를 계약 테스트한다. **수락 증거:** 정상·거부·미설정·오프라인 시나리오가 자동화되고 0 failure. **완료기록:** —
- [ ] **P5-3 / 담당 T4 / 대상: Android 실기기.** 베트남어 로케일, 위치 `prompt/granted/denied`, 알림 허용/거부, 포그라운드/백그라운드, 외부 지도 인계를 점검한다. **수락 증거:** 시나리오별 기기/OS/build SHA, 타임스탬프 영상 또는 스크린샷, 서버 로그 상관 ID. **완료기록:** —
- [ ] **P5-4 / 담당 T4 / 대상: iOS 실기기.** P5-3과 같은 행렬 및 APNs 전달·딥링크 복귀를 점검한다. **수락 증거:** 시나리오별 기기/OS/build SHA와 영상 또는 스크린샷; Mac/APNs 미가용이면 완료 처리하지 않는다. **완료기록:** —
- [ ] **P5-5 / 담당 T4 / 대상: 운영 관측 — BFF 경로 오류율/지연, noti_worker backlog/DLQ, 푸시 실패율.** 배포 전 임계치와 롤백 기준을 확정하고 파일럿 관측을 수행한다. **수락 증거:** 최소 24시간 파일럿 대시보드 링크, 임계치 위반 0건 또는 롤백 기록. **완료기록:** —
- [ ] **P5-6 / 담당 T4 / 대상: 본 원장 전체.** 모든 체크박스의 증거를 대조하고 IMPLEMENT 외 변경이 없는지 최종 리뷰한다. **수락 증거:** 미완료/증거 누락 0건, F030–F033별 코드·테스트·실기기 증거 링크, 배포 GO 서명. **완료기록:** —

## 5. Stop-the-line 조건

다음 중 하나라도 발생하면 현재 체크박스를 완료 처리하지 말고, 구현을 멈춘 뒤 이 원장에 `BLOCKED` 사유·관측값·필요 결정자를 기록한다.

- F030–F033의 PDF 원문 의미가 둘 이상으로 해석되거나 다른 분류 ID 구현이 필요해진다.
- 라우팅 제공자/키/과금/쿼터/HCMC 오토바이 커버리지가 확인되지 않거나, 자체 엔진 실패 시 폴백 정책이 승인되지 않는다.
- 위치 또는 알림 동의 없이 정밀좌표 수집, 추적, 푸시 발송이 필요해진다.
- 탐색용 Bến Thành 폴백 좌표가 길안내 출발점이나 저장 좌표로 들어간다.
- 서버 정밀도 정책을 우회해 약속 원좌표가 비참여자·허용 시간 밖에 노출된다.
- 배송·보관·라이더 대행·에스크로·소비자 결제·안전 보증이 요구된다.
- `BLOCK` ID(F034–F037/F052)의 제품·법무·운영 승인 없이 그 기능이 선행조건이 된다.
- Android/iOS 중 한 플랫폼이라도 위치·알림·딥링크 실기기 증거를 만들 수 없다.
- 기존 약속 완료/취소, 위치 채널, 알림 멱등성 또는 BFF↔Engine 경계에 회귀가 발생한다.

## 6. 한 번에 한 워커 프로토콜

1. 동시 구현을 금지한다. 활성 워커는 항상 1명이며 순서는 **T3(한 체크박스 구현) → T4(그 체크박스 검증) → 원장 갱신 → 다음 체크박스**다.
2. 워커는 시작 전에 해당 체크박스에 `진행중: <워커>/<시각>/<기준 SHA>`를 적고, 종료 시 `완료기록`에 변경 파일·검증 명령·결과·증거 경로·잔여 위험을 적는다. 실패나 보류도 지우지 않고 누적한다.
3. T4는 T3의 자기 판정을 그대로 승인하지 않는다. 수락 증거를 재현하고 범위 밖 diff를 확인한 뒤에만 `[x]`로 바꾼다.
4. 소스 코드·스키마·테스트를 변경한 워커는 검증 후 같은 세션에서 `codebase-memory.index_repository(repo_path=/mnt/c/DEV/saigon_rider, mode=fast|moderate)`를 실행하고 재인덱싱 결과를 해당 `완료기록`에 남긴다. 구조 변경이 크면 `full`을 사용한다. 문서만 바꾼 이번 T2 단계에는 재인덱싱하지 않는다.
5. 워커 교대 시 다음 워커는 이 문서만으로 기준 SHA, 마지막 완료 항목, 외부 게이트, 다음 미체크 항목을 복원할 수 있어야 한다. 별도 채팅 요약을 SoT로 삼지 않는다.

## 7. 근거 요약

- 제품의 구조적 차별점은 오토바이 이동의 거리·소요시간·동선·만남 지원이다: [서비스 구상 §2.1](../../spec/service-concept-260726.md#L25), [핵심 가치 제안](../../spec/service-concept-260726.md#L74).
- 약속 데이터는 이미 있고 실제 갭은 합의→이동의 얇은 층이다: [거래 라이프사이클과 기존 자산](../../spec/service-concept-260726.md#L132).
- 경로/API 키와 실기기 권한·GPS·FCM은 외부 의존이다: [현재 차단 요인](../../spec/service-concept-260726.md#L244).
- 현행 약속 수락은 `ACCEPTED`와 매물 `RESERVED`를 함께 전이한다: [약속 수락 API](../../../backend/app/routers/market.py#L2009). 취소/완료 계약을 바꾸지 않고 길안내 층을 얹는다.

## 부록 A. P0-1 — PDF F030–F033 현행 매핑

PDF의 이 네 행은 [비교표 10쪽](../../../docs/saigon_rider_daangn_feature_page_comparison_2026-09-09%20copy.pdf)에서 확인했다. 표의 “사용자 행위”는 해당 PDF 행의 기능·목적 문구를 축약한 것이며, 새 요구사항이 아니다.

| PDF ID / 쪽 | PDF의 사용자 행위 | 현행 진입점 또는 명시적 갭 | 입력 → 출력 | 제외 경계 |
|---|---|---|---|---|
| F030 / 10 | 채팅에서 거래 약속을 제안·수락·취소하고 약속 카드를 본다. | 진입점: [DmDetail 약속 카드·행동](../../../frontend/src/pages/dm/DmDetail.tsx#L1232), [약속 제안 API](../../../backend/app/routers/market.py#L1741), [수락 API](../../../backend/app/routers/market.py#L2010). | 대화 ID, 시각, 장소명·좌표, 참여자 행동 → `PROPOSED` 약속/DM 카드, 수락 시 `ACCEPTED` 및 매물 `RESERVED`. | 제3자 라이더·배송·보관·안전 보증을 만들지 않으며, 서버 좌표 정밀도 정책을 변경하지 않는다. |
| F031 / 10 | 채팅의 장소/목적지를 `/ride-nav` 등 이동 기능과 연결한다. | 진입점: [DmDetail 길안내 핸들러](../../../frontend/src/pages/dm/DmDetail.tsx#L836)와 [약속 카드 CTA](../../../frontend/src/pages/dm/DmDetail.tsx#L1363), [RideNav 경로 요청](../../../frontend/src/pages/ride/RideNav.tsx#L398). | 약속 카드의 위도·경도 → `/ride-nav?type=nav&lat=…&lng=…`; 실제 기기 위치가 허용되면 경로 API의 거리·시간·폴리라인. | 목적지 외 금융/QR 흐름을 결합하지 않는다. 위치 거부 시 탐색용 폴백 좌표로 길안내를 시작하지 않으며, 라우팅 제공자 가용성은 P0-3 외부 게이트다. |
| F032 / 10 | 약속별 거래 진행 화면에서 금액 스냅샷·QR·진행 상태를 본다. | 진입점: [거래 라우트](../../../frontend/src/App.tsx#L637), [TradeTransaction](../../../frontend/src/pages/dm/TradeTransaction.tsx#L23), [거래 상세 API 호출](../../../frontend/src/api/dm.ts#L412). | 대화 ID·약속 ID → 매물명, 금액 스냅샷, QR 메시지 참조, 약속/수동입금 진행 상태. | 소비자 결제 실행·에스크로·자동 정산·배송 화면으로 재설계하지 않는다. |
| F033 / 10 | 판매자가 QR을 등록하고, 구매자가 송금 완료를 표시하며, 판매자가 수령을 표시한다. | 진입점: [TradeTransaction의 QR 등록·상태 변경](../../../frontend/src/pages/dm/TradeTransaction.tsx#L75), [송금 표시/수령 표시 API](../../../frontend/src/api/dm.ts#L416). | QR 이미지와 참여자별 표시 행동 → QR 메시지 및 `PAYMENT_REPORTED`/`PAYMENT_CONFIRMED` 상태. | 앱이 은행송금을 실행·확인하거나 대금을 보증하지 않는다. F034 안심결제/대금보관은 `BLOCK`으로 이 항목에 포함하지 않는다. |

## 부록 B. P0-2 — 약속 상태·좌표·CTA 호출 흐름 (현행)

`marketplace_appointments`는 원 장소좌표를 `Numeric(9,6)`로 저장하고 상태는 기본 `PROPOSED`인 문자열 필드다([모델](../../../backend/app/models.py#L1778)). 공개 응답은 `AppointmentOut.place_lat/lng`([스키마](../../../backend/app/schemas.py#L1397))이지만, 원값을 그대로 직렬화하지 않는다. 모든 약속 응답은 서버 `market._appt_out()`이 `resolve_precision_level()` 결과로 exact/ward-centroid approx/none을 고른다([직렬화 경계](../../../backend/app/routers/market.py#L1707), [정밀도 판정](../../../backend/app/services/location_privacy.py#L76)). DM 목록도 먼저 `require_participant`·차단 검사를 거친 뒤 이 함수를 통해 카드를 만든다([메시지 조회](../../../backend/app/routers/dm.py#L627), [카드 결합](../../../backend/app/routers/dm.py#L708)). 따라서 클라이언트의 `m.appointment.placeLat/Lng`에는 원좌표가 아닌 서버 결정값만 도달한다.

| 저장 상태 / 실제 보조상태 | 목적지 좌표 노출 (서버) | 참여자·외부자 권한 | 카드 CTA 현행 조건 | 취소·완료 접근 / 서버 전이 |
|---|---|---|---|---|
| `PROPOSED` | `approx` (ward centroid; ward 미해결이면 좌표 없음). | 제안·조회 경로는 대화 참여자와 비차단 관계를 서버에서 요구한다. 외부자는 `require_participant`에서 거부된다. | 좌표가 있으면 **길안내 표시** (`hasCoords && status !== 'CANCELLED'`); 제안자가 아닌 참여자만 수락, 양 참여자 취소. | 수락은 제안자가 아닌 참여자만 가능하며 `ACCEPTED`로 전이; 취소는 `CANCELLED`로 전이. 새 제안은 기존 `PROPOSED`를 `CANCELLED`로 supersede한다. |
| `ACCEPTED` | 기본 `approx`; 약속 시각 T-30분~T+60분 또는 완료요청 보조상태면 `exact`. | 상태변이 API는 `_load_appointment()`에서 참여자·차단·대화↔매물 정합성을 검증하고 매물 행을 잠근다. | 좌표가 있으면 길안내 표시; 판매자만 완료, 구매자만 완료 요청, 판매자만 요청 거절, 양 참여자 취소. 거래 화면도 표시. | 수락 시 매물 `ON_SALE→RESERVED`; 판매자 완료 시 `COMPLETED`와 `SOLD`; 결제 신고/확인 뒤에는 취소 409. |
| `CANCELLED` | `none` (두 좌표 모두 `null`). | 기존 참여자에게 카드 이력은 반환될 수 있으나, 외부자는 위 참여자 검사로 읽기·변이 불가. | 길안내 미표시; 수락·완료·취소 버튼도 미표시. | 취소는 참여자 누구나 가능하고 멱등; 수락 상태였다면 `RESERVED→ON_SALE`. 완료된 약속 취소는 409. |
| `COMPLETED` | `approx` (거래 이력용); exact는 종료한다. | 기존 참여자만 약속 API/DM 카드에 접근한다. | 현행 조건상 approximate 좌표가 있으면 **길안내 표시**; 거래 화면은 표시. 취소·완료 CTA는 미표시. | 판매자만 `ACCEPTED→COMPLETED`를 수행하며 매물은 `SOLD`; 취소는 409. |
| 그 밖의 문자열 | `none` (fail-closed). 모델의 `status`는 자유 문자열이라 DB enum/체크 제약은 이 대상 코드에서 확인되지 않았다. | 판정 불가 — API별 참여자 검사는 유지한다. | `DmDetail`의 라벨 맵에 없음; 길안내는 좌표가 없으므로 미표시. | 지원 전이로 증명되지 않음; 새 상태를 추가하려면 서버 정밀도·프론트 CTA를 함께 결정해야 한다. |

호출 흐름은 `POST /market/appointments` → `MarketplaceAppointment` 원좌표 저장 → `_appt_out()` 정밀도 축소 → `DmMessageOut.appointment` → `DmDetail` 카드다([제안](../../../backend/app/routers/market.py#L1740), [카드 조건](../../../frontend/src/pages/dm/DmDetail.tsx#L1232)). 카드 길안내는 현재 `lat/lng`를 `/ride-nav?type=nav`로 넘긴다([핸들러](../../../frontend/src/pages/dm/DmDetail.tsx#L836)). `RideNav.fetchRoute()`는 실제 출발 위치를 `requireServiceLocation()`으로 막고, 통과한 좌표로만 경로 API를 호출한다([실행형 위치 게이트](../../../frontend/src/pages/ride/RideNav.tsx#L398)). 다만 이 화면은 약속 ID를 받지 않으므로 목적지의 약속 상태·참여자·exact 여부를 서버에서 재검증하는 호출 흐름은 현재 증명되지 않았다.

## 부록 C. P1-1 — F030–F033 최소 약속 데이터 계약 판정

판정 기준은 “해당 F-ID의 두 거래 당사자에게 지속적으로 같은 사실이어야 하는가”다. 그렇지 않은 화면 세션·개인 선택·향후 이벤트 정책을 약속 행에 저장하지 않는다. 따라서 이 작업의 결론은 **스키마 변경 없음**이며, 신규 nullable/default/backfill 계약도 없다.

| 필요 datum | F-ID / 목적 | 현행 SoT·표현 | P1-1 결정 | 근거·후속 경계 |
|---|---|---|---|---|
| 약속 목적지명 | F030 약속 카드, F031 목적지 표기 | `MarketplaceAppointment.place_name` (`TEXT`, nullable) → `AppointmentOut.place_name`; 제안 입력 `AppointmentProposeRequest.place_name` | 기존 필드 사용, 변경 없음 | 이름 없는 좌표 약속도 이미 허용된다. 장소 선택 UX·표시 정책은 P2-1이다. |
| 약속 목적지 좌표 | F030 약속 장소, F031 길안내 목적지 | `place_lat/place_lng` (`NUMERIC(9,6)`, nullable) → `_appt_out()`의 `none/approx/exact` 축소 응답 | 기존 필드 사용, 변경 없음 | 원좌표는 약속 SoT이나 외부/시간외에는 노출하지 않는다. P1-2가 `ACCEPTED + exact + participant` 서버 재검증 계약을 정한다. |
| 약속/거래 진행 상태 | F030 수락·취소, F032 진행 화면, F033 송금·수령 표시 | 약속 `status` 4값 및 완료요청 보조필드; 수동 결제 표시는 별도 `MarketplaceTransaction.payment_status` | 기존 분리 모델 유지, 변경 없음 | 결제 표시는 약속 완료와 별도다. F034 에스크로를 유입시키지 않는다. |
| 선택한 경로 mode (`motorcycle` 기본, `car`, `walking`) | F031 이동 경로 계산 | 현행 route API/엔진 호출 시 값(현재 고정값은 P1-3에서 교체 예정); 약속·위치채널 모델에는 없음 | **약속에 저장하지 않음** | mode는 각 사용자의 현재 경로 요청·ETA를 바꾸는 개인 UI 선택이지, 장소/시간처럼 합의된 사실이 아니다. F030–F033과 서비스 SoT 어디에도 상대방 가시성·재접속 후 복원·공동 합의 요구가 없다. P1-3에서 request enum, 응답 echo, mode별 cache만 다룬다. |
| 출발점/이동 방향 | F031 경로 안내에서만 파생 | `RideNav`가 실행 시점의 허용된 실제 위치를 출발점으로 사용; 약속에는 목적지만 저장 | **약속에 저장하지 않음** | 방향은 사용자마다 다르고 GPS/경로 재계산마다 변한다. 저장하면 위치 동의·정밀도 보관 범위를 불필요하게 넓힌다. 동의된 위치공유 채널의 heading/위치값은 별도 수명주기 SoT다. |
| 출발·도착 알림 상태 | F030–F033에는 명시되지 않으며 Phase 4의 별도 후보 | generic `notification_outbox(event_type,payload,published_at)` 및 사용자별 `notifications(source_event_id,is_read)`; 위치공유 채널에는 동의 기반 `arrived_at/left_at` | **appointment 컬럼을 선행 추가하지 않음** | 이벤트 정의·수신자·명시 행위/서버판정·멱등 키가 미결정이다. P4-1이 이를 결정하고 P4-2가 도메인 트랜잭션 outbox를 적재한다. 위치채널 도착값은 약속 알림 상태로 재사용하지 않는다. |

검증 근거: [약속 테이블 생성](../../../database/init/105_marketplace_appointments.sql#L9), [ORM 모델](../../../backend/app/models.py#L1778), [요청/응답 스키마](../../../backend/app/schemas.py#L1397), [서버 좌표 정밀도 경계](../../../backend/app/routers/market.py#L1707), [별도 수동 결제 모델](../../../backend/app/models.py#L1810), [알림 outbox](../../../backend/app/models.py#L1503), [위치채널 도착 상태](../../../backend/app/models.py#L1871), [현행 mode 고정 경로 계약](../../../backend/app/routers/info_route.py#L88).

## 부록 D. P1-2 — 약속 길안내 목적지 권한 계약

`GET /api/market/appointments/{appointment_id}/navigation`은 카드의 approximate 좌표를 재사용하지 않는 전용 읽기 경계다. 먼저 세션 참여자를 확인하고, 그 뒤 약속 상태·저장 좌표쌍·서버 시각의 `resolve_precision_level()`을 확인한다. 성공한 요청만 원 목적지 좌표를 받는다.

| 우선 조건 | 결과 | HTTP / `detail.code` | 응답 좌표 |
|---|---|---|---|
| 약속 없음 | 거부 | `404` / `appointment_not_found` | 없음 |
| 대화 없음 또는 호출자가 참여자 아님 (상태·정밀도와 무관) | 거부 | `403` / `appointment_navigation_not_participant` | 없음 |
| 참여자이나 대화가 차단됨 (상태·정밀도와 무관) | 거부 | `403` / `appointment_navigation_blocked` | 없음 |
| 참여자 + `CANCELLED` | 거부 | `409` / `appointment_navigation_cancelled` | 없음 |
| 참여자 + `COMPLETED` | 거부 | `409` / `appointment_navigation_completed` | 없음 |
| 참여자 + `PROPOSED` 또는 지원하지 않는 상태 | 거부 | `409` / `appointment_navigation_not_accepted` | 없음 |
| 참여자 + `ACCEPTED` + 좌표 하나/둘 다 없음 | 거부 | `409` / `appointment_navigation_destination_missing` | 없음 |
| 참여자 + `ACCEPTED` + 좌표 범위 밖 | 거부 | `409` / `appointment_navigation_destination_invalid` | 없음 |
| 참여자 + `ACCEPTED` + 유효 좌표쌍 + 서버 판정 `approx` | 거부 | `409` / `appointment_navigation_destination_not_exact` | 없음 |
| 참여자 + `ACCEPTED` + 유효 좌표쌍 + 서버 판정 `exact` | 허용 | `200` / `AppointmentNavigationOut` | `place_lat`, `place_lng`, `precision: "exact"` |

새 약속 제안은 위도 `[-90, 90]`, 경도 `[-180, 180]` 및 좌표쌍 동시 입력을 검증한다. 기존 행도 읽기 경계에서 다시 범위를 검사하므로 과거/우회 데이터가 길안내 좌표로 나가지 않는다. route mode 선택, UI, 출발 위치, 알림은 이 계약에 포함하지 않는다.

최종 source 재인덱싱: `codebase-memory.index_repository(mode=moderate)` → indexed (36,630 nodes/105,698 edges); `manage_adr(get)` 재확인은 `no_adr`였다.

T4 지적 보정(2026-09-10 KST, T4 재검증 대기): `require_unblocked()`의 기존 문자열 `403`을 이 계약에서만 `appointment_navigation_blocked` 안정 코드로 정규화했고, 차단된 참여자도 좌표를 받지 않는 회귀 테스트를 추가했다. `python -m unittest app.tests.test_appointment_navigation_authorization app.tests.test_marketplace_transaction` (BFF 컨테이너) → 17 OK; Ruff 및 `git diff --check` → 통과. fast 재인덱싱 뒤 MCP 조회가 프로젝트를 일시 누락해 moderate를 재실행했고 `indexed` (36,631 nodes/105,756 edges), ADR은 `no_adr`로 재확인했다. 체크박스는 T4 독립 재검증 전까지 유지한다.

T4 재지적 보정(2026-09-10 KST, T4 재검증 대기): 회귀 테스트의 괄호형 multi-context `with`가 `as raised` 뒤 trailing comma로 컴파일 불가였음을 T4 증거로 재현했다. 같은 테스트 파일에서 표준 단일 `with context1, context2 as raised:` 문법으로만 고쳤다. `python -m py_compile backend/app/tests/test_appointment_navigation_authorization.py` → 통과; `docker compose --env-file .env exec -T bff sh -lc 'cd /app && python -m unittest app.tests.test_appointment_navigation_authorization app.tests.test_marketplace_transaction'` → 17 OK; `uv run --with ruff ruff check backend/app/routers/market.py backend/app/schemas.py backend/app/tests/test_appointment_navigation_authorization.py` 및 `git diff --check` → 통과. `codebase-memory.index_repository(mode=fast)` → indexed (36,631 nodes/105,531 edges), ADR `no_adr`. 체크박스는 유지한다.
