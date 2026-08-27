# 거래중 위치공유 기능 강화 — 설계서 (2026-08-27)

> **SoT.** 발단: 대표 인터뷰 2026-08-27 — "거래중 위치공유를 강화하고, 워키토키와 세트로 거래 DM에 붙인다".
>
> **상태**: **설계 단계 — 구현 미착수.** §3 정밀도 매트릭스와 §10 미결 사항은 **대표 확정 대기**. 확정 전 구현 착수 금지.
>
> **관련**: [`260813_location_gate_policy.md`](../../260813_location_gate_policy.md)(위치 게이트 3계층), [`context/service-rules.md`](../../context/service-rules.md)(GPS 불변식), 법률 리서치 [`research/260827_walkie_talkie_location_privacy/SYNTHESIS.md`](../../research/260827_walkie_talkie_location_privacy/SYNTHESIS.md)

---

## 1. 목적/배경

현재 "거래중 위치공유"라는 이름으로 불리는 기능의 실체는 **약속 장소 지정**이다 — 사용자가 지도를 탭해 찍은 마커 좌표 1개를 `marketplace_appointments` 레코드에 1회 영속 저장할 뿐, GPS 실측도 아니고 갱신도 없다. 따라서 이번 과업의 "강화"는 기존 기능에 옵션을 얹는 일이 아니라 **정적 핀 → 거래 상태 연동 동적 정밀도 시스템으로의 재구축**이다. 핵심 축은 세 가지: (a) 거래 진행 상태에 따라 노출 정밀도가 단계적으로 열리고 종료 시 자동 닫히는 정밀도 전환, (b) 실측 GPS 실시간 공유(거래 상대방 1인 한정 unicast), (c) 베트남 PDPL 2025 상 민감정보(위치) 처리 요건(목적고지·동의·옵트아웃·보관기간·삭제권)의 설계 내 반영.

---

## 2. 확정 요구사항 (대표 인터뷰 260827)

1. **정밀도는 거래 상태에 따라 전환된다.** 예약/제안 단계엔 근사(블러) 위치만, 거래 확정(약속 성사) 임박 시점부터 정확좌표, 거래 종료 시 공유 자동 차단. 구체적 상태↔정밀도 매핑은 **본 설계서가 제안하고 대표가 확정**한다(§3).
2. **워키토키와 세트로 노출된다.** 두 기능은 **별개 독립 모듈**로 제작하되, **같은 거래 DM 화면**에 함께 노출된다 — 위치공유 중 "도착했어요" 같은 음성 커뮤니케이션이 가능한 UX.
3. **불특정다수 브로드캐스트가 아니다.** 워키토키가 유니캐스트(1:1/그룹)인 것과 대칭으로, 위치공유도 **해당 거래의 상대방 한정 공유**다. 공개 피드/지도에 노출되지 않는다.
4. **위치정보는 베트남 법상 민감정보로 취급한다.** 목적고지·목적별 동의·옵트아웃·보관기간·삭제권을 설계에 반영한다(§9 리서치 근거).

---

## 3. 거래 상태별 정밀도 전환 매트릭스 — **핵심 섹션 (제안, 대표 확정 필요)**

`MarketplaceAppointment.status` 는 실제 코드상 `PROPOSED` / `ACCEPTED` / `COMPLETED` / `CANCELLED` 4종이며(`market.py` L1705~1966), `completion_requested_*` 필드가 ACCEPTED 내 하위 상태를 표현한다.

정밀도 레벨을 3단으로 정의한다.

| 레벨 | 의미 | 구현 |
|---|---|---|
| `none` | 좌표 미노출 | API가 `null` 반환 |
| `approx` | 근사(블러) — 행정동 중심점 | ward centroid 치환 (§4-C) |
| `exact` | 실측 좌표 그대로 | 소수 6자리 |

**제안 매트릭스**

| 거래 상태 | 약속장소 핀(`place_lat/lng`) | 실시간 내 위치(신규) | 근거 |
|---|---|---|---|
| 약속 없음 / 대화만 | `none` | `none` | 거래 성립 전 위치 노출 사유 없음 |
| `PROPOSED` | `approx` | `none` | 제안 수락 여부 미정 — "이 동네에서 만나자" 수준이면 충분 |
| `ACCEPTED` (약속시각 T-30분 초과) | `approx` | `none` | 확정됐어도 당일 이동 전엔 정확좌표 불필요 |
| `ACCEPTED` (T-30분 ~ T+60분) | `exact` | `exact` (양측 동의 시) | 실제 만남 구간 — 정확좌표의 효용이 발생하는 유일한 창 |
| `ACCEPTED` + 완료요청됨(`completion_requested_at`) | `exact` | `exact` 유지 | 아직 대면 중일 수 있음 |
| `COMPLETED` | `approx` (기록 열람용) | **즉시 차단 + 데이터 삭제** | 거래 종료 = 목적 소멸 |
| `CANCELLED` | `none` | **즉시 차단 + 데이터 삭제** | 목적 소멸 |
| 상대방 차단/신고 발생 | `none` | **즉시 차단** | 안전 우선 |

> ⚠️ **이 매핑은 제안이며 대표 확정이 필요하다.** 특히 (a) T-30분이라는 창 폭, (b) `COMPLETED` 후 약속 핀을 `approx`로 남길지 `none`으로 지울지, (c) `PROPOSED` 단계에서 `approx`조차 감출지는 판단이 갈릴 수 있다.

**공통 불변식 (매핑이 바뀌어도 유지)**

- 정밀도 판정은 **서버에서만** 한다. 프론트에 exact를 보내고 화면에서 흐리게 그리는 방식은 금지(네트워크 응답에 원좌표가 남는다).
- `exact` 창은 **시간 기반으로 자동 닫힌다.** 사용자 액션이 없어도 T+60분에 만료.
- 실시간 공유는 **양측 각각의 명시적 동의**가 있어야 시작된다. 한쪽만 켜도 그쪽 위치만 상대에게 간다(대칭 강제 아님) — 단 상대가 꺼져 있음을 UI에 명시.
- **언제든 즉시 중단(옵트아웃) 가능** — 중단 시 저장된 실시간 좌표는 즉시 삭제.

---

## 4. 아키텍처

### 4-A. 프론트 — 기존 GPS 인프라 재사용

- `frontend/src/lib/native.ts` 의 `watchLocation(handler)`(L166-244) / `getLocation()`(L124-164) 가 이미 존재한다. **신규 네이티브 브리지를 만들지 않는다.**
- `frontend/src/store/useLocationStore.ts` 의 `ensureLocation()` / `startWatching()` 이 앱 전역 단일 워처를 관리한다(`App.tsx` 에서만 호출, 거리 게이트 `WATCH_MIN_MOVE_M=30m`).
- **불변식**: 거래 위치공유 화면은 `native.getLocation()` / `watchLocation()` 을 **직접 호출하지 않는다** — 반드시 `useLocationStore` 경유. (`service-rules.md` 원칙 4. 현재 9곳 위반이 위치 게이트 정책 결함 #11로 기록돼 있다 — **신규 구현이 이 위반을 반복하면 안 된다.**)
- 정확도 게이트 `GPS_ACCURACY_LIMIT_M=35m` 와 `classifyLocationError`(permission/timeout/unavailable/inaccurate, `frontend/src/lib/serviceLocation.ts`)를 그대로 재사용한다. 저정확도 tick 은 **전송하지 않는다**(상대에게 2km 오차 좌표를 "정확 위치"로 보여주는 것은 거짓 정보).
- 전역 워처는 30m 거리 게이트라 거래 상황(도보 접근)엔 다소 성긴다 — 거래 세션 전용 게이트 값(예: 10m)이 필요한지는 §10 미결.

### 4-B. 신규 API 초안 (BFF)

| 메서드 | 경로 | 용도 |
|---|---|---|
| `POST` | `/api/bff/market/appointments/{id}/location-share` | 공유 시작 — 동의 기록 + 세션 개설. body: `{consent_version}` |
| `DELETE` | `/api/bff/market/appointments/{id}/location-share` | 공유 즉시 중단(옵트아웃) + 내 좌표 삭제 |
| `PUT` | `/api/bff/market/appointments/{id}/location-share/ping` | 내 최신 좌표 업서트. body: `{lat, lng, accuracy_m}` |
| `GET` | `/api/bff/market/appointments/{id}/location-share` | 양측 상태 + **정밀도 적용된** 상대 좌표 조회 |

**전송 방식 제안: 폴링.** 현재 `frontend/src/pages/dm/DmDetail.tsx` L121 이 이미 5초 폴링으로 대화를 갱신하고 있고, 프로젝트에 WebSocket/SSE 인프라가 없다(백엔드 라우터에 websocket 사용처 0건). **기존 DM 폴링 tick에 위치 페이로드를 얹는 방식**이 신규 인프라 0으로 목표를 달성한다. 서버푸시(SSE/WS) 도입은 이 과업의 범위를 크게 넘고, 5초 지연은 도보 접근 유스케이스에서 실질 문제가 되지 않는다.

- 업로드는 별도 tick(예: 10초 + 10m 이동 게이트)으로 하되, 다운로드는 DM 폴링에 편승.
- `exact` 창 밖에서는 프론트가 아예 ping을 보내지 않는다(서버도 거부 — 이중 게이트).

### 4-C. 블러 로직 — 기존 ward-centroid 패턴 재사용

피드 쪽에 이미 검증된 블러가 있다: `backend/app/routers/feed.py` 의 `_public_coordinates()` 가 원좌표를 **ward centroid로 치환**하고, ward 미해결 시 `null` 을 반환한다(레거시 행은 `_nearest_ward()` 로 해결 시도). 계약은 `backend/app/tests/test_feed_location_privacy.py` 가 고정하고 있다.

**제안**: 이 함수를 공용 유틸로 승격(예: `app/services/location_privacy.py::to_approx_coords()`)하고 거래 위치공유가 재사용한다. 새 블러 알고리즘(반경 랜덤 오프셋 등)을 만들지 않는다 — 이미 있는 패턴 + 테스트를 쓴다.

---

## 5. 데이터 모델 변경안

**원칙: 실시간 좌표를 `MarketplaceAppointment` 에 넣지 않는다.** 약속 핀(사용자가 지정한 영속 기록)과 실시간 실측 좌표(휘발성 민감정보)는 **수명주기도 삭제 정책도 다르다** — 같은 행에 두면 거래 종료 시 선택적 삭제가 어려워진다.

신규 테이블 `marketplace_location_shares` (제안):

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | UUID PK | |
| `appointment_id` | UUID FK → `marketplace_appointments` ON DELETE CASCADE | |
| `user_id` | UUID FK → `users` | 공유 주체 (약속당 최대 2행) |
| `lat` / `lng` | `Numeric(9,6)` | 최신 좌표 1개만 (**이력 미보관**) |
| `accuracy_m` | `Integer` | 35m 초과분은 애초에 저장 안 함 |
| `consented_at` | `timestamptz` | 동의 시각 |
| `consent_version` | `String` | 고지문 버전 (재동의 판정용) |
| `expires_at` | `timestamptz` | 자동 만료 시각 (§3 창 종료 시점) |
| `revoked_at` | `timestamptz \| null` | 옵트아웃 시각 |
| `updated_at` | `timestamptz` | |

- **UNIQUE(appointment_id, user_id)** — 업서트로 최신 1건만 유지. 이동 궤적을 남기지 않는 것이 보관 최소화의 핵심.
- **자동 차단/삭제**: (a) `expires_at` 경과, (b) status → `COMPLETED`/`CANCELLED` 전이 시점, (c) 차단·신고 발생 시 행 삭제. (b)는 상태 전이 핸들러에서 동기 삭제하고, (a)는 조회 시 만료 판정 + 주기 정리(cron/배치) 이중.
- Engine DB 아님 — BFF 소유 테이블(`backend/app/models.py`). Engine 접근 없음.
- `MarketplaceAppointment` 자체 스키마 변경은 **불필요**. `place_lat/lng` 는 그대로 두고 `_appt_out`(`market.py` L1656-1672)에 **정밀도 적용 계층만 추가**한다.

---

## 6. 위치 게이트 정책 신규 계층 판정 제안

`260813_location_gate_policy.md` 의 3계층(탐색형/실행형/기록형) 중 거래 위치공유는 명시적으로 다뤄지지 않았다. `service-rules.md` 원칙 8("여전히 유효한 GPS 경로: 경로안내, 제보")에도 없다.

**판정 제안: 기존 3계층에 새 계층을 만들지 않고 "기록형(record)"으로 편입한다.**

- 근거: 실측 좌표가 **DB에 영속(단기라도)되고 타인에게 전달**된다 — 폴백 좌표가 저장·전달되면 그것은 데이터 위조이자 상대방 기만이다. 이는 제보와 정확히 같은 성격이다.
- 따라서 **중심가 폴백 금지, 측위 실패·권역 밖은 차단**. `requireServiceLocation()`(정책 §3-B) 을 그대로 사용하고 `BEN_THANH_FALLBACK` 을 import 하지 않는다.
- 다만 기존 기록형과 다른 점 하나: **"차단"의 의미가 다르다.** 제보는 화면 자체를 막지만, 거래 위치공유는 **공유만 못 켜고 DM 대화는 계속돼야 한다** — 차단 UI는 전체 화면 블록이 아니라 공유 카드 내 인라인 사유 표시여야 한다. 이 예외를 정책 문서에 명기한다.
- **문서 갱신 필요**: `260813_location_gate_policy.md` §6 개정 문안의 계층표에 "거래 위치공유 → 기록형(인라인 차단)" 행 추가, `service-rules.md` 원칙 8 의 유효 GPS 경로 목록에 "거래 위치공유" 추가. 구현 Phase 마지막에 함께 반영한다.

---

## 7. 워키토키 티켓과의 관계

- **모듈은 완전히 별개다.** 위치공유는 좌표 업서트/폴링, 워키토키는 오디오 파일 업로드/재생 — 코드·테이블·API를 공유하지 않는다. 한쪽이 없어도 다른 쪽이 동작해야 한다.
- **화면은 세트다.** 거래 DM(`frontend/src/pages/dm/DmDetail.tsx`)의 약속 카드 영역에 두 기능이 함께 노출된다. 공통되는 것은 **배치와 진입 동선뿐**이며, 공용 컨테이너 컴포넌트(예: `DealLiveActions`) 하나로 슬롯을 잡되 그 안의 두 위젯은 서로를 모른다.
- **법적 결합 이슈 없음**: 리서치 결과 "위치+음성 결합" 자체에 가중 의무 조항은 발견되지 않았고, **데이터 유형별 개별 준수**(각각 목적고지·동의·옵트아웃·보관기간·삭제권)면 충분한 것으로 소스가 수렴한다(§9). 따라서 동의도 **기능별로 각각** 받는다 — 하나의 뭉뚱그린 "실시간 기능 동의"를 만들지 않는다.
- 워키토키 쪽 설계/티켓은 별도 문서. 본 설계서는 화면 슬롯 계약만 정의한다.

---

## 8. 현재 코드베이스 실태 (조사 완료 260827)

**핵심: 실시간 위치추적이 전혀 아니다 — 정적 핀 1회 전송이다.**

| 영역 | 파일 | 실태 |
|---|---|---|
| 장소 선택 UI | `frontend/src/pages/dm/AppointmentLocationPicker.tsx` | 공용 `frontend/src/components/maps/MarkerLocationPicker.tsx` 로 지도 탭해 마커 1개 지정. **GPS 실측 아님** — 사용자가 임의 지정한 좌표 |
| 전송 | `frontend/src/api/dm.ts` L190-206 `proposeAppointment` | `place_lat`/`place_lng`/`place_name`/`when_at` **1회 전송**, 갱신 없음 |
| 수신/저장 | `backend/app/routers/dm.py` `propose_appointment` L1675~ | `backend/app/models.py` L1371 `MarketplaceAppointment` 에 `Numeric(9,6)` 영속 저장. 주기 재전송·watch 없음 |
| 출력 | `backend/app/routers/market.py` `_appt_out` L1656-1672 | **블러 없이 원좌표 그대로**, **상태 무관 항상 반환** |
| 노출 게이트 | `market.py` `_appointment_unlocked()` L1621 | "약속 기능 자체를 볼 수 있는가" 판정뿐 — **상태별 정밀도 분기 로직은 존재하지 않는다** |
| 매물 등록 위치 | `frontend/src/pages/market/LocationPickerSheet.tsx` | 동일 패턴(정적 핀) |
| 재사용 가능 GPS | `frontend/src/lib/native.ts` L124-244, `frontend/src/store/useLocationStore.ts`, `frontend/src/lib/serviceLocation.ts` | `watchLocation`/`getLocation`, 전역 단일 워처, 35m 정확도 게이트, 4종 에러 분류 — **전부 재사용 가능** |
| 참고 블러 선례 | `backend/app/tests/test_feed_location_privacy.py`, `feed.py::_public_coordinates` | 공개 좌표를 ward centroid로 치환하는 패턴이 이미 있고 테스트로 고정돼 있음 |
| 실시간 채널 | `frontend/src/pages/dm/DmDetail.tsx` L121 | DM은 **5초 setInterval 폴링**. WebSocket/SSE 인프라 없음 |

---

## 9. 리서치 문서 포인터 (원문 복붙 금지 — 필요 시 열어볼 것)

- [`ai-docs/research/260827_walkie_talkie_location_privacy/SYNTHESIS.md`](../../research/260827_walkie_talkie_location_privacy/SYNTHESIS.md) — 요지: 2026-01-01부로 PDPL 2025(Law 91/2025/QH15) + Decree 356/2025 가 구 Decree 13/2023 을 대체했고, **위치정보는 명시적 민감정보**라 목적고지·목적별 동의·옵트아웃이 요구된다. 위치+음성 "결합" 자체에 가중 의무 조항은 발견되지 않아, 데이터 유형별 개별 준수면 충분한 쪽으로 소스가 수렴한다.
- `sources/A_decree13_sensitive_data.md` — 민감정보 열거 범위(위치 포함, 음성은 불명확).
- `sources/B_recording_correspondence_secrecy.md` — 통신비밀/도청 규제 적용 범위. 조사 신뢰도 가장 낮음.
- `sources/C_pdpl2025_transition.md` — 신법 전환·유출통지 기한.

> 리서치는 법률 판단이 아니다. **출시 전 베트남 현지 변호사 확인 필요**(특히 음성 민감정보 해당 여부, 도청법 적용 범위).

---

## 10. 대표 판단이 필요한 미결 사항

| # | 항목 | 선택지 | 기본 권고 |
|---|---|---|---|
| M-1 | **§3 정밀도 매트릭스 확정** | 표 그대로 / 창 폭 조정 / 단계 축소 | 표 그대로 |
| M-2 | `exact` 창 폭 (T-30분 ~ T+60분) | 15/30/60분 전 · 사후 30/60/120분 | T-30 / T+60 |
| M-3 | `COMPLETED` 후 약속 핀 잔존 | `approx` 유지(거래이력 열람) / `none` | `approx` 유지 |
| M-4 | **백그라운드 위치 추적 허용 여부** | 포그라운드 한정 / 백그라운드 허용 | **포그라운드 한정** — 백그라운드는 스토어 심사·배터리·법적 부담 모두 급증하며, 거래 만남은 앱을 열고 있는 상황이다 |
| M-5 | 배터리 정책 (ping 주기/이동 게이트) | 5s/10s/30s, 10m/30m | 10초 + 10m |
| M-6 | 실시간 공유 대칭 강제 | 한쪽만 켜도 허용 / 양측 동시에만 | 한쪽만도 허용(UI에 상대 상태 명시) |
| M-7 | 동의 UX | 최초 1회 / 거래마다 / 세션마다 | **거래(약속)마다** — 목적별 동의 요건에 가장 안전 |
| M-8 | 실시간 좌표 보관 | 최신 1건만(궤적 없음) / 단기 이력 | **최신 1건만** |
| M-9 | 워키토키와 동의 통합 여부 | 통합 1회 / 기능별 각각 | **기능별 각각**(§7) |

---

## 11. Phase별 서브티켓 초안 (제목만 — 발행은 감독이 별도)

1. **P1** — 정밀도 판정 서버 계층 신설(`location_privacy` 유틸 승격 + `_appt_out` 상태별 분기)
2. **P2** — `marketplace_location_shares` 테이블 + 마이그레이션 + 자동 만료/삭제 로직
3. **P3** — 위치공유 API 4종(시작/중단/ping/조회) + 정밀도·시간창 서버 게이트
4. **P4** — 프론트 공유 위젯(스토어 경유 watch, 인라인 차단 UI, DM 폴링 편승)
5. **P5** — 동의/고지 플로우(고지문 i18n vi/ko/en, `consent_version`, 옵트아웃 동선, 삭제권)
6. **P6** — `DealLiveActions` 슬롯 컨테이너(워키토키 위젯과 세트 배치)
7. **P7** — 테스트 매트릭스(상태×정밀도 계약 테스트, 만료 자동차단, 저정확도 미전송, 차단/신고 시 즉시 차단)
8. **P8** — 정책 문서 갱신(`260813_location_gate_policy.md` 계층표, `service-rules.md` 원칙 8)
