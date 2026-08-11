# 상용 서비스 감사 착수 — 저위험 7항목 작업지시서

> 작성: 2026-08-10 · **다른 스레드에서 단독 실행 가능하도록 자기완결로 작성됨**
> 근거 문서: [`../../260810_service_usability_diagnosis.md`](../../260810_service_usability_diagnosis.md) (S-번호) · [`../../260810_service_journey_conversion_retention_audit.md`](../../260810_service_journey_conversion_retention_audit.md) (JCR-번호)
> 실측 기준 커밋: `e7ab46e` (`HEAD`, 2026-08-10)

---

## 1. 범위 결정 (사용자 확정 사항 — 그대로 기록)

- 이번 착수는 **대표 결정이 필요 없는 저위험 7항목만**. D-1~D-9 종속 항목(§3)은 명세만 하고 결정 대기.
- 감사문서 2종은 `ai-docs/` 로 복귀 완료, `ai-docs/INDEX.md` "✅ 점검 / QA" 절에 반영 완료.

---

## 2. 착수 항목 7건

실측은 서브에이전트가 현재 HEAD `e7ab46e` 기준으로 재검증 완료. 감사문서 작성 시점(`a758251`) 대비 커밋이 하나 더 얹혀 일부 줄번호가 밀렸으나 판정은 전부 유효.

| 항목 | 판정 | 현재 코드 근거 | 최소 변경안 | 수용 기준 (Acceptance Criteria) |
|---|---|---|---|---|
| **S-2** 빈 결과 탈출구 부재 | 유효 | 백엔드 키워드알림 API 실재 `backend/app/routers/market.py:1022-1073`, 등록 이벤트 `market.py:583-591`. 프론트 빈 상태 `frontend/src/pages/market/MarketMain.tsx:688-694` 는 문구만 있고 CTA 없음. `DisplayScopeSheet`(`locationBtn` `:477`)·키워드알림 시트(`:490`)는 헤더에만 있고 빈 상태와 미연결 | 빈 상태 블록에 기존 시트를 여는 CTA 버튼 추가. 신규 컴포넌트/API 불필요 | 3km 반경 0건 매물 좌표로 진입 시 빈 상태 블록에 "전체 지역 보기" 또는 "알림 받기" CTA가 보이고, 탭하면 기존 `DisplayScopeSheet`/키워드알림 시트가 열린다. 신규 API 호출 없음 |
| **S-6** 이미지 업로드 실패 미표시 | 유효 | `frontend/src/pages/market/MarketCreate.tsx:82-84` catch 가 toast 1회만, `contentId` null 유지. 렌더 `:161-173` 에 실패 오버레이·재시도 없음. 제출 시 `:97` 에서 조용히 필터링돼 빠짐 | images state 에 `error` 필드 + 실패 오버레이 + 재시도(기존 업로드 함수 재호출) | 업로드 API 를 강제 실패시켰을 때 해당 썸네일에 오류 오버레이(재시도 버튼 포함)가 남고, 재시도 탭 시 같은 업로드 함수가 재호출돼 성공하면 오버레이가 사라진다. 실패분이 있으면 완료 버튼 옆에 경고 문구 노출 |
| **S-9** 채팅 알림 끄기 부재 | 유효 | 프론트 `frontend/src/pages/settings/NotiSettings.tsx:16,18-28` 항목 2개(social/keyword_alert)뿐. 백엔드 `backend/app/schemas.py:706-724` 필드 6개에 chat/dm 없음. `backend/app/routers/dm.py:419-423` 이 무조건 enqueue | 스키마 필드 1개 + DB 컬럼 1개 + enqueue 전 설정 체크 + 프론트 항목 1개 | 설정에서 채팅 알림을 끄면(기본값 ON) `dm.py` 의 enqueue 가 실행되지 않고, 다시 켜면 정상 발행된다. 마이그레이션 1개로 컬럼 추가, 기존 사용자 기본값 ON 유지(회귀 없음) |
| **S-10** DM 백그라운드 5초 폴링 | 유효 | `frontend/src/pages/dm/DmDetail.tsx:101-112` `setInterval(...,5000)`, visibilityState 검사 없음, async 콜백 try/catch 없음 | visibility 가드 1줄 + 복귀 시 즉시 1회 fetch + catch | 앱을 백그라운드로 내리면 폴링 타이머가 멈추고, 포그라운드 복귀 시 즉시 1회 fetch 가 실행된 뒤 5초 주기가 재개된다. 강제 네트워크 실패 주입 시 unhandled rejection 없이 catch 로 처리 |
| **S-12** `/info` 도달불가 + 고정좌표 (좌표 SoT 교체만) | 유효 | 라우트는 생존 `frontend/src/App.tsx:562`. 진입점이던 `GameHubSheet.tsx:22` 는 마운트 제거(`AppShell.tsx:6-10`). 홈은 `/info/weather`·`/flood`·`/gas`·`/repair` 하위만 링크, `/info` 자체 navigate 는 코드 전체에 없음. 고정좌표 `frontend/src/pages/info/InfoHub.tsx:33 INFO_FALLBACK_COORDS`, `:48-50 useGeolocation()` 이 상시 고정값 반환(폴백이 아님) | **좌표 SoT 교체만 착수**(`useServiceLocation` 로). 허브 존치/진입점 재연결은 제품 결정 → 보류 | `InfoHub.tsx` 의 `useGeolocation()` 호출이 `useServiceLocation`(홈·상세가 쓰는 것과 동일 SoT)으로 교체되고, 날씨·침수·주유소·정비소 조회가 실제 사용자 위치(또는 그 표준 폴백)를 쓴다. `/info` 진입점을 새로 연결하지 않는다(범위 밖) |
| **S-13** 스플래시 1.2초 강제 | 유효 | `frontend/src/App.tsx:413` 주석, `:417 Math.max(0, 1200 - elapsed)`, `:419 delay + 600` | 상수 조정 | 최소 표시 시간 상수가 300~500ms 로 낮아지고, 재실행(세션 유지) 시 체감 대기가 눈에 띄게 줄어든다. 페이드 로직·600ms 자체는 변경 범위 밖(요청 시 별도 판단) |
| **JCR-5** 파생 `two_wheeler` 오타 | 유효 | `frontend/src/pages/ride/RideNav.tsx:404,462` 외부 Google Maps 딥링크가 `travelmode=two_wheeler`. 공식 값은 `two-wheeler`. **주의: `backend/app/routers/info_route.py:90`·`frontend/src/api/info.ts:594` 의 `route_mode:"two_wheeler"` 는 자체 엔진 내부 파라미터라 별개 — 건드리면 안 됨** | 외부 URL 문자열 2곳만 하이픈으로 | `RideNav.tsx:404`·`:462` 두 곳의 외부 Google Maps URL 파라미터가 `travelmode=two-wheeler` 로 바뀐다. `info_route.py:90`, `api/info.ts:594` 의 내부 `route_mode` 값은 무변경. 실기기에서 외부 지도 오토바이 모드로 열리는지 확인 |

### 줄번호 드리프트 (감사문서 → 실측, 라인 시프트일 뿐 — 결론은 전부 유효)

- **S-2**: 문서 `market.py:583-588,1016-1069` → 실제 `583-591,1022-1073`.
- **S-13**: 문서 `App.tsx:416-420` → 실제 `413-419`.
- **JCR-5**: 문서 `RideNav.tsx:447,505` → 실제 `404,462`.

### 검증 중 새로 발견된 사실

- `frontend/src/components/layout/AppShell.tsx:7-9` 주석은 "`/info` 는 홈에서 이미 직접 접근 가능"이라 쓰여 있으나, 실제로 홈은 `/info/weather`·`/info/flood`·`/info/gas`·`/info/repair` 같은 **하위 페이지만** 링크하고 허브(`/info`) 자체의 진입점은 코드 어디에도 없다. **주석과 실제 동작 불일치** — S-12 좌표 SoT 교체 작업 중 이 주석을 정정할지, 별도 이슈로 남길지는 담당자 판단.

---

## 3. 보류 항목 — 대표 결정 요청서 (D-1~D-9)

아래는 [`260810_service_usability_diagnosis.md`](../../260810_service_usability_diagnosis.md) §5 표에 **잠금 대상 S-번호와 지연 비용**을 덧붙인 것이다. 대표가 이 표만 보고 결정할 수 있어야 한다.

| # | 결정 사항 | 선택지 | 권고 | 잠그는 항목 | 결정 지연 비용 |
|---|---|---|---|---|---|
| D-1 | 제품의 첫 약속 | 마켓 우선 / 퀘스트 우선 | 현 구상서 기준 **마켓 우선** | S-14 (스플래시·가입 문구 통일), 사실상 D-2~D-6 전부가 이 결정에 종속 | 결정이 없으면 스플래시·가입 화면이 계속 "퀘스트 앱"과 "마켓 앱"을 동시에 약속해 신규 가입자의 첫 인상이 흐려진다. 이후 모든 IA/카피 변경이 재작업 위험을 안고 진행됨 |
| D-2 | 비로그인 열람 범위 | 전면 개방 / 마켓만 / 현행 유지 | **마켓 목록·상세 + 업체 상세** 개방, 행동 시 로그인 | S-1 (가입 전 매물 열람) | 설치 직후 최대 이탈 지점(S-1)이 계속 열린 채로 파일럿을 시작하게 됨 — 신규 유입의 첫 인상 데이터가 왜곡됨 |
| D-3 | 초기 기본 반경 | 3km 유지 / 10km / 전체 | 밀도가 쌓일 때까지 **전체**, `내 주변`은 사용자 선택 | S-2 자동확대 폴백(오늘 착수하는 CTA 연결과는 별개로, 반경 상수 자체 조정은 이 결정 대기) | 파일럿 구 매물 밀도가 낮은 상태에서 3km 기본값을 유지하면 S-2 CTA를 넣어도 빈 화면 노출 빈도 자체는 줄지 않음 |
| D-4 | 판매 전화인증 시점 | 현행 / 게시 직전 / 첫 응답 시 | 신뢰를 유지하며 **게시 직전**으로 이동 | S-4 (SMS OTP 게이트 위치) | 등록 폼 진입 전 인증 벽이 계속 남아 판매 등록 3중 마찰(S-3)의 근본 원인 중 하나가 미해소로 남음 |
| D-5 | 게이미피케이션 표시 | 현행 노출 / 숨김 / 재개 | 효과 검증 전까지 **상용 핵심 면에서 숨김** | S-7 (홈·프로필의 RP·레벨·스킬포인트 노출) | "미완성 앱" 신호가 계속 상용 핵심 화면 최상단에 남아 신뢰 구축에 역행 |
| D-6 | 1차 IA | 홈 유지 / 홈 제거 | **마켓·동네가게·채팅·커뮤니티·나**, 기본 진입은 마켓 | S-5 (채팅 탭 신설), S-8 (홈 역할 재정의) | 채팅이 프로필 안쪽에 묻힌 채로 남아 응답 지연에 따른 거래 이탈(S-5)이 계속됨. 홈 재설계 작업이 이 결정 전까지 착수 불가 |
| D-7 | 구매자 완료 참여 | 판매자 전용 / 요청권 / 양측 즉시 완료 | **구매자 요청 + 판매자 확인·운영 이의 절차** | S-16 (판매자 단독 완료 권한) | 판매자가 앱을 재방문하지 않으면 구매자의 거래·리뷰가 영구 정체됨. 신뢰 데이터(리뷰·거래건수)가 누락된 채 파일럿이 진행됨 |
| D-8 | 운영 경로 정책 | 자체 엔진 단독 / 이중 폴백 | 성공률 입증 전 **이중 폴백** | S-17 (자체 라우팅 엔진 fail-closed) | 현재 Google 폴백이 검증 목적으로 비활성 상태(`a758251` 대표 지시) — 자체 엔진 일시 장애가 곧바로 핵심 차별점(이동 안내) 전면 중단으로 이어짐 |
| D-9 | 파일럿 지역 | 대학가 / 신도심 / 전통 주거지 | 코드가 아닌 공급팀 결정. **한 곳만 선택** | S-18 (퍼널 계측의 `ward_id` 세그먼트 설계), 부록 A 전체(공급 시딩 전략) | 계측(S-18)과 공급 시딩(부록 A)은 대상 구가 정해져야 설계·착수 가능 — 이 결정이 없으면 두 트랙 모두 시작할 수 없음 |

---

## 4. Wave 1 / Wave 2 백로그 (이번 세션 착수 대상 아님 — 후속 세션용)

[`260810_service_usability_diagnosis.md`](../../260810_service_usability_diagnosis.md) §4 와 [`260810_service_journey_conversion_retention_audit.md`](../../260810_service_journey_conversion_retention_audit.md) §7 을 합쳐 중복 제거한 단일 목록. S-/JCR- 번호는 역참조.

1. 채팅함을 1차 내비게이션으로 올리고 DM 상단에 거래 단계 스트립(Deal Cockpit: 문의→가격 합의→약속→만남→완료, 상태별 주 CTA 1개) 도입 — **S-5, S-15, JCR-4** (D-6 종속)
2. 구매자 완료 요청권 + 약속 후 리마인더 — **S-16, JCR-6** (D-7 종속)
3. 안전 안내를 홈 배너에서 약속 수락 시점으로 이동 — **S-19, JCR-5**
4. 판매 등록 초안 보존(localStorage) + 완료 비활성 사유 안내 — **S-3**
5. 이미지 업로드 실패 복구(오늘 착수 S-6과 동일 근본 원인, 등록 필수항목 안내는 별건) — **S-3(b)(c)**
6. 채팅 알림 설정 노출(오늘 착수 S-9의 프론트 노출은 완료되나 quest_*·ride_result 등 죽은 항목 정리는 별건) — **S-9**
7. 홈의 매물 로딩을 비핵심 정보 API(날씨·침수 등)와 분리해 독립 로드 — **S-8, JCR-3**
8. 백그라운드 DM 폴링 중단(오늘 착수 S-10과 동일 파일, 미읽음 30초 폴링 별도 검토는 후속) — **S-10**
9. 안전한 공개 장소 후보 3개 + 양측 ETA 제안 — **S-15, JCR-5** (Wave 2 핵심 차별점)
10. 약속 카드에 출발·도착 상태 연결 — **S-15, JCR-5**
11. 판매중/예약중/완료 탭 + 조회·문의 수를 보는 판매자 전용 관리 화면 — **S-11, JCR-6**
12. `/info` 위치 SoT 교체(오늘 착수) 이후 허브 진입점 재연결 여부 최종 결정 — **S-12**
13. 파일럿 데이터가 효과를 증명한 뒤 퀘스트·광고·추가 홈 카드 투자 판단 — **S-7 후속, JCR-3**
14. 최소 계측 이벤트 배포(`landing_view`, `auth_prompted`, `market_results_loaded`, `chat_started`, `offer_accepted`, `appointment_accepted`, `route_result`, `trade_completed`, `review_submitted` 등) — **S-18, JCR-6** (D-9 종속)
15. 업체 매물 등록 경로 신설(부록 A-2a, S-4 우회 부수효과 포함) — 부록 A (D-9 종속, 영업 트랙과 병행)
16. "삽니다(WANTED)" 매물 타입 신규 — 부록 A-3

---

## 5. 이번 세션에서 하지 않은 것 / 미검증

정직하게 남긴다.

- **실기기 검증 없음** — S-13 체감 개선, JCR-5 `two-wheeler` 실기기 동작 확인 모두 코드 변경만이고 실기기 검증은 별도.
- **운영 데이터 없음** — 매물 밀도·DAU·문의→응답 전환율 등 실제 운영 지표 미상. S-2 CTA 의 실제 이탈 감소 효과는 파일럿 전까지 알 수 없음.
- **운영 `.env` `SMS_PROVIDER_API_KEY` 미확인 (S-4)** — 로컬에서 볼 수 없음. 서버에서 직접 키 존재 여부 + 실제 번호 수신 테스트 필요. D-4(인증 시점 이동) 와는 별개로 선행 확인 대상.
- **퍼널 계측(S-18)은 D-9 파일럿 지역 결정 종속이라 미착수** — `ward_id` 세그먼트가 필요한 이벤트 설계는 파일럿 구가 정해지기 전에는 완성할 수 없음.

---

### 근거 문서

- [`ai-docs/260810_service_usability_diagnosis.md`](../../260810_service_usability_diagnosis.md)
- [`ai-docs/260810_service_journey_conversion_retention_audit.md`](../../260810_service_journey_conversion_retention_audit.md)
- [`ai-docs/INDEX.md`](../../INDEX.md) (본 세션에서 두 문서 색인 반영)
