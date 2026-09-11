# F030–F033 사용자 실기기 QA 장부

- 문서일: 2026-09-11
- 상위 SoT: [`260911_daangn_feature_comparison_master_ledger.md`](260911_daangn_feature_comparison_master_ledger.md) — F001~F089 89항목 판정·검증상태의 단일 SoT. 이 장부는 F030–F033 의 실행 절차서이며, 마스터 §4-B 에 두 문서의 불일치와 결과 반영 규약(§7-7)이 있다.
- 대상: `8d6b2e25 feat(market): add appointment travel notifications`가 반영된 빌드
- 원장 SoT: [당근 기능 비교 후속 구현 원장](260910_daangn_feature_comparison_implementation_plan.md)
- 목적: QA 담당자가 소스 지식 없이 실제 Android/iOS 기기에서 관찰 가능한 F030–F033 결과를 판정한다.
- 판정값: `PASS` / `Feedback needed` / `Not met` 중 하나만 적는다. `PASS`는 각 Expected goal 전체와 Evidence가 있을 때만 가능하다.

## 1. 실행 환경·증거 헤더

테스트를 시작하기 전에 아래를 한 번 채운다. 두 당사자 계정(A=행동자, B=상대방)과 두 기기가 필요하다. 푸시는 B 기기에 실제 알림 권한과 로그인된 계정이 있어야 한다.

| 항목 | 기록 |
|---|---|
| 실행 일시·시간대 | |
| 환경 (DEV/운영 URL) | |
| 앱 build SHA / 버전 | |
| 기기 A (OS·버전·기기명) | |
| 기기 B (OS·버전·기기명) | |
| 앱 언어 (한국어/베트남어/영어) | |
| 위치 권한·알림 권한 상태 | |
| 약속 ID / DM 상대 식별값 (민감정보 제외) | |
| 증거 저장 위치 (스크린샷·영상·로그 링크) | |

공통 준비: A와 B가 같은 1:1 DM의 거래 당사자여야 한다. 목적지는 실제 테스트 가능한 서비스 권역 안의 장소로 지정한다. exact 목적지는 약속 시간이 허용 창(T-30분~T+60분)에 들어왔을 때만 기대한다. 테스트 중 원좌표·계정 식별자·푸시 토큰을 문서에 붙이지 않는다.

## 2. F030 — 약속·목적지 권한

### QA-F030-01 — 장소 포함 약속 제안·수락

- **ID:** QA-F030-01
- **Precondition:** A와 B의 1:1 거래 DM이 열려 있고, 거래 가능한 매물이 있다.
- **Action:** A가 약속 잡기에서 시간과 서비스 권역 안의 장소를 선택해 제안한다. B가 같은 DM에서 수락한다.
- **Expected goal:** 두 기기에서 같은 장소명과 약속 카드가 보이며 상태는 수락됨이다. 매물은 예약 상태가 된다. 제3자 배송·보관·에스크로 기능은 나타나지 않는다.
- **Evidence to attach:** A/B 약속 카드 스크린샷, 수락 직후 상태가 보이는 짧은 영상 또는 화면 기록.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F030-02 — exact 전에는 길안내 비노출, exact 재확인

- **ID:** QA-F030-02
- **Precondition:** QA-F030-01의 수락된 약속이 있으나 exact 허용 시간 밖이거나 서버가 정확한 목적지를 아직 허용하지 않는 상태다.
- **Action:** A가 약속 카드를 열어 길안내 노출을 확인한다. `정확한 장소 다시 확인`이 보이면 한 번 탭한다.
- **Expected goal:** approximate 장소 좌표로 길안내 화면이나 외부 지도가 열리지 않는다. 재확인은 카드 안에서 명확한 상태 문구를 갱신할 뿐, 전역 오류 토스트나 자동 재시도를 만들지 않는다. exact가 허용될 때만 길안내 CTA가 나타난다.
- **Evidence to attach:** 재확인 전/후 카드 스크린샷과, 외부 지도 앱이 열리지 않았음을 보여 주는 화면 기록.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F030-03 — 취소·완료·차단 후 exact 목적지 차단

- **ID:** QA-F030-03
- **Precondition:** 각각 (a) 취소된 약속, (b) 완료된 약속, (c) 상대방을 차단한 수락 약속을 준비한다. 한 케이스씩 별도 약속을 사용한다.
- **Action:** 각 케이스에서 이전 길안내 화면이 있으면 뒤로가기로 DM 카드로 돌아가고, 길안내 또는 `정확한 장소 다시 확인`을 시도한다.
- **Expected goal:** 취소·완료·차단 상태에서는 exact 목적지가 표시되거나 길안내로 넘어가지 않는다. 카드에는 현재 상태에 맞는 인라인 안내만 남고, 이전 목적지·외부 지도·경로가 자동으로 다시 열리지 않는다.
- **Evidence to attach:** 세 상태의 카드/인라인 메시지 캡처와 외부 지도 미실행 확인.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F030-04 — 좌표 없는 텍스트 약속

- **ID:** QA-F030-04
- **Precondition:** A와 B의 새 1:1 거래 DM이 있다.
- **Action:** A가 장소를 지정하지 않고 텍스트 약속을 제안하고 B가 수락한다.
- **Expected goal:** 약속 자체는 정상적으로 제안·수락되지만 목적지 좌표가 없으므로 길안내 CTA나 출발 알림 버튼은 나타나지 않는다.
- **Evidence to attach:** 수락된 텍스트 약속 카드 스크린샷.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

## 3. F031 — 경로 미리보기·안내·외부 지도

### QA-F031-01 — 이동수단별 경로 미리보기

- **ID:** QA-F031-01
- **Precondition:** exact가 허용된 수락 약속, A의 위치 권한 허용, 네트워크 연결이 있다.
- **Action:** A가 길안내를 열고 `오토바이`, `자동차`, `도보`를 각각 선택한 뒤 매번 `경로 찾기`를 탭한다.
- **Expected goal:** 각 선택 후에만 현재 위치 확인과 경로 요청이 실행된다. 성공한 경우 선택한 수단의 거리·예상 시간·경로선이 먼저 보인다. 화면 진입 또는 수단 선택만으로 위치 추적/안내가 시작되지 않는다.
- **Evidence to attach:** 세 수단의 미리보기 캡처(선택값·거리·시간이 함께 보이게), 가능하면 화면 기록.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F031-02 — 명시적 안내 시작과 출발 알림

- **ID:** QA-F031-02
- **Precondition:** QA-F031-01에서 경로 미리보기가 성공했고, B는 `event` 알림과 OS 푸시 권한을 허용했다.
- **Action:** A가 `경로 안내 시작` 또는 출발 알림 버튼을 한 번 탭한다. 같은 버튼을 다시 탭하거나 화면을 새로 열어 재시도한다.
- **Expected goal:** 안내 추적은 명시 동작 뒤에만 시작된다. B만 출발 인앱/푸시 알림을 받고 A는 자기 알림을 받지 않는다. 같은 약속·A·출발 종류의 재시도는 새 알림을 추가로 만들지 않는다.
- **Evidence to attach:** A의 안내 시작 화면, B의 알림 화면/알림함, 재시도 뒤 중복 알림이 없음을 보여 주는 캡처.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F031-03 — 자동 도착의 거리·정확도·출발 선행 조건

- **ID:** QA-F031-03
- **Precondition:** exact 목적지가 있고 B는 알림 허용 상태다. 가능한 경우 위치 정확도와 목적지 거리를 기기 지도/GPS 도구에서 확인할 수 있다.
- **Action:** (1) 출발 버튼을 누르지 않은 채 목적지 40m 이내로 이동한다. (2) 별도 새 약속에서 출발을 누른 뒤 목적지 밖 또는 정확도 35m 초과 상태를 유지한다. (3) 출발을 누른 뒤 앱을 포그라운드에 둔 채 목적지 40m 이내, 위치 정확도 35m 이하가 되도록 이동한다.
- **Expected goal:** (1)과 (2)에서는 B에게 도착 알림이 없다. (3)에서만 B에게 도착 알림이 한 번 도착한다. 앱을 백그라운드로 보내 도착 알림을 발생시키지 않으며, 원시 GPS 좌표가 알림 문구에 노출되지 않는다.
- **Evidence to attach:** 각 단계의 A 화면(출발 여부·거리/정확도 가능 시 포함), B의 도착 알림 시각, 짧은 위치 이동 영상. 거리/정확도를 수치로 관측할 수 없으면 `Feedback needed`로 적는다.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F031-04 — 외부 Google 지도 인계와 모드 보존

- **ID:** QA-F031-04
- **Precondition:** QA-F031-01의 성공한 미리보기가 있고 기기에 Google Maps가 설치되어 있다.
- **Action:** 오토바이·자동차·도보를 각각 선택하고 `Google 지도로 이동`을 탭한다. 가능하면 안내 중 경로 이탈 뒤 재안내 버튼에서도 한 번 반복한다.
- **Expected goal:** 외부 Google Maps가 열리며 동일한 목적지를 유지한다. 이동수단은 각각 two-wheeler/운전/도보에 해당하는 방식으로 전달된다. 유효하지 않은 목적지에서는 외부 앱이 자동 실행되지 않는다.
- **Evidence to attach:** 수단별 Google Maps 화면 캡처 또는 인계 URL 캡처, 재안내 케이스 캡처.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F031-05 — 변조·누락 URL, 새로고침, 뒤로가기

- **ID:** QA-F031-05
- **Precondition:** 테스트 빌드에서 `/ride-nav?type=nav&appointmentId=…&placeName=…&lat=…&lng=…` URL을 열 수 있다. 정상 exact URL과 `lat/lng` 누락·문자열·범위 밖 URL을 준비한다.
- **Action:** 정상 URL을 열고 화면을 새로고침한 뒤 뒤로가기를 한다. 이어서 각 잘못된 URL을 하나씩 연다.
- **Expected goal:** 정상 URL은 같은 목적지명을 유지하고 새로고침 뒤에도 경로 미리보기로 복귀할 수 있으며 뒤로가기는 안전하게 이전 화면으로 돌아간다. 잘못된 URL은 경로 요청·안내 시작·외부 지도 실행 없이 안전한 화면에 머문다.
- **Evidence to attach:** 정상 새로고침/뒤로가기 영상, 잘못된 URL별 화면 캡처와 외부 지도 미실행 확인.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F031-06 — 위치 권한 거부·서비스 권역 밖·경로 제공자 오류

- **ID:** QA-F031-06
- **Precondition:** exact가 허용된 수락 약속이 있다. 위치 권한을 거부할 수 있고, 테스트 환경에서 네트워크 단절 또는 제공자 미설정/429 상태를 재현할 수 있다.
- **Action:** (1) 위치 권한을 거부한 채 `경로 찾기`를 탭한다. (2) 서비스 권역 밖에서 반복한다. (3) 비행기 모드 또는 승인된 테스트 환경의 경로 제공자 오류/429에서 반복한다.
- **Expected goal:** 각 실패는 목적지 컨텍스트와 선택 수단을 유지한 인라인 복구 안내를 보여 준다. 무한 재시도, 탐색용 폴백 좌표 사용, 자동 외부 지도 실행, 자동 안내 시작은 없다.
- **Evidence to attach:** 실패 종류별 화면 캡처와 네트워크/권한 상태 캡처.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F031-07 — 저사양 Android·긴 베트남어·접근성

- **ID:** QA-F031-07
- **Precondition:** 저사양 Android 또는 성능 제한 Android, 베트남어 앱 언어, 긴 베트남어 장소명을 가진 exact 약속이 있다. TalkBack을 켤 수 있다.
- **Action:** DM 카드에서 길안내를 열고 키보드를 열고 닫는다. 긴 장소명을 확인하고 CTA·이동수단 선택·재확인 버튼을 TalkBack과 손가락으로 조작한다.
- **Expected goal:** 긴 장소명은 잘리거나 버튼을 밀어내지 않는다. 키보드가 카드의 주 동작을 가리지 않으며, 버튼/라디오 선택이 읽히고 탭할 수 있다. 로딩·빈 좌표에서 CTA가 오동작하지 않는다.
- **Evidence to attach:** 긴 베트남어 화면 캡처, 키보드 전/후 캡처, TalkBack 녹화 또는 읽힌 라벨 메모.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

## 4. F032–F033 — 거래 진행·수동 입금 경계

### QA-F032-01 — 약속별 거래 진행 정보

- **ID:** QA-F032-01
- **Precondition:** 수락된 약속과 연결된 거래가 있으며, 금액 스냅샷 또는 QR 등록 가능 상태다.
- **Action:** A와 B가 DM에서 거래 진행 화면을 각각 연다.
- **Expected goal:** 두 당사자는 해당 약속의 매물명·금액 스냅샷·QR 참조·진행 상태를 확인한다. 다른 약속이나 대화의 정보가 섞이지 않는다. 앱 내 결제 실행·에스크로·자동 정산 CTA는 나타나지 않는다.
- **Evidence to attach:** A/B 거래 진행 화면 캡처(민감 QR/계좌정보는 마스킹).
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-F033-01 — QR 등록과 송금 완료/수령 표시

- **ID:** QA-F033-01
- **Precondition:** 판매자 A와 구매자 B의 수락 약속 거래가 있다. 테스트용 QR 이미지를 준비한다.
- **Action:** 판매자 A가 QR을 등록한다. 구매자 B가 실제 은행 송금을 실행하지 않고 앱에서 송금 완료를 표시한다. 판매자 A가 수령을 표시한다.
- **Expected goal:** QR과 상태는 같은 거래에만 반영되며 진행 상태가 `송금 완료 표시 → 수령 표시` 순으로 바뀐다. 앱은 실제 은행 송금을 실행·검증하거나 돈을 보관/보증하지 않는다.
- **Evidence to attach:** 세 단계의 상태 변화 캡처(계좌/QR 내용 마스킹), A/B 화면의 상태 일치 캡처.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

## 5. 알림 수신·설정·딥링크

### QA-NOTI-01 — 상대방 전용과 event 설정 푸시 게이트

- **ID:** QA-NOTI-01
- **Precondition:** A가 출발할 exact 수락 약속이 있다. B는 첫 실행에서 `event` 알림과 OS 푸시를 허용한다.
- **Action:** A가 출발을 알린다. 다음 새 약속에서는 B가 `event` 알림을 끄고 같은 동작을 반복한다.
- **Expected goal:** 허용 상태의 B에게만 푸시와 인앱 알림이 생긴다. `event`를 끈 B는 푸시를 받지 않지만 인앱 알림은 남는다. A나 비참여자는 알림을 받지 않는다.
- **Evidence to attach:** 설정 전/후 화면, B의 시스템 푸시 및 인앱 알림함 캡처, A/비참여자 알림 없음 메모.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

### QA-NOTI-02 — 푸시 탭 딥링크와 앱 상태

- **ID:** QA-NOTI-02
- **Precondition:** B가 QA-NOTI-01의 출발 또는 도착 푸시를 받는다.
- **Action:** (1) 앱이 백그라운드인 상태에서 푸시를 탭한다. (2) 앱을 완전히 종료한 뒤 새 푸시를 탭한다.
- **Expected goal:** 두 경우 모두 B는 해당 A와의 DM으로 이동한다. 다른 대화·빈 화면·로그인 화면으로 잘못 이동하지 않는다.
- **Evidence to attach:** 백그라운드/종료 상태별 푸시 탭 영상 또는 캡처.
- **Verdict (PASS / Feedback needed / Not met):**
- **Notes:**

## 6. 플랫폼별 실행 최소 세트

Android는 QA-F030-01~04, QA-F031-01~07, QA-F032-01, QA-F033-01, QA-NOTI-01~02를 실행한다. iOS는 QA-F030-01~03, QA-F031-01~06, QA-F032-01, QA-F033-01, QA-NOTI-01~02를 실행한다. Android 전용 QA-F031-07을 iOS에서도 실행할 수 있으면 별도 Notes로 남긴다.

## 7. 실기기 QA로 대체할 수 없는 게이트

이 장부의 `PASS`는 사용자에게 보이는 동작을 확인할 뿐이며, 아래 엔지니어링 게이트를 대체하지 않는다. 이 항목들은 이 문서에서 PASS 처리하지 않는다.

| 원장 항목 | 실기기 QA가 대체할 수 없는 이유 | 필요한 별도 증거 |
|---|---|---|
| P4-4 | Redis 중단·복구, outbox relay, worker 재시작, 중복 배치의 유실/중복은 장애 주입과 저장소 관측이 필요하다. | Redis/outbox/worker 장애 주입 결과와 event_id별 유실·중복 0건 기록 |
| P5-1 | 모든 권한·상태 전이·좌표 정밀도·outbox 멱등 조합을 기기 수동 실행으로 포괄할 수 없다. | 백엔드 회귀 테스트 명령과 0 failure 로그 |
| P5-2 | URL 파서, API 오류 분기, 외부 지도 guard의 반복 회귀는 자동 계약 테스트가 필요하다. | 프론트 계약 테스트 명령과 0 failure 로그 |
| P5-5 | 24시간 오류율·지연·backlog/DLQ·푸시 실패율은 단발 기기 테스트로 관측할 수 없다. | 최소 24시간 파일럿 대시보드 및 임계치/롤백 기록 |

P2-4, P3-4, P5-3, P5-4의 사용자 관찰 가능 부분은 이 장부의 결과를 원장에 링크해 검증 근거로 사용할 수 있다. P5-6 최종 배포 GO는 위 비대체 게이트와 모든 필요한 실기기 증거를 함께 대조한 뒤에만 판단한다.

## 8. 피드백 제출 템플릿

실패 또는 애매한 경우 아래 형식으로 한 케이스씩 제출한다. 실제 좌표·계좌·토큰·개인정보는 가린다.

```text
QA ID:
Verdict: PASS / Feedback needed / Not met
기기·OS·앱 build SHA:
실행 시각·환경:
실제로 한 Action:
기대한 Expected goal:
실제 결과:
증거 링크/파일명:
재현성: 항상 / 간헐적 / 1회
추가 메모:
```
