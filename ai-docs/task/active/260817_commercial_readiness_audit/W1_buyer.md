# W1 — 사용자(구매자) 관점 준비도 감사 (2026-08-17, HEAD 728031b)

> 방법: 백지 감사가 아니라 델타 감사. 기존 4벌 문서
> (`260803_prelaunch_ux_audit.md`, `260810_service_usability_diagnosis.md`(S-1~S-19),
> `260810_service_journey_conversion_retention_audit.md`(JCR-1~6),
> `260812_launch_readiness_daangn_ux_implementation.md`)를 베이스라인으로 삼고,
> `260812` 이후 5개 커밋(`bad1a05`, `0c8c281`, `978428c`, `da5ded8`, `728031b`)이 실제로
> 무엇을 코드로 닫았는지 현재 HEAD에서 재검증했다. codebase-memory MCP 는 인덱스는 정상(28,422
> 노드)이나 ADR 이 비어 있어(`no_adr`) `search_code`/`search_graph` 대신 `grep`/`Read` 로 파일:라인을
> 직접 확인했다 — 전체 파일 풀텍스트 검색은 하지 않고 베이스라인 문서가 지목한 파일만 정조준했다.

## 0. 요약

`260812` 배치(bad1a05/0c8c281/978428c) 이후 구매자 여정의 **P0급 진입 장벽은 대부분 코드로 닫혔다** — 비로그인 마켓·업체 열람, 채팅 탭 승격, 구매자 거래완료 요청권, 판매 등록 초안·OTP 시점 이동, 게스트 바, 위치/광고 킬스위치, 업체 클레임 보안 취약점. `da5ded8`(위치 게이트 3계층)과 `728031b`(로그인=홈/비로그인=마켓 분기)도 각각 코드에 반영되어 있음을 실측했다. 그러나 **거래 조종석(Deal Cockpit, F-3)** — 가격 합의 뒤 약속 CTA 고정 노출, 안전한 만남 장소 후보, 약속 수락 직전 안전 안내(S-15/S-19) — 는 여전히 미착수이고, **판매자 전용 관리 화면(S-11)도 검색 화면 재활용 그대로**다. 가장 큰 잔여 차단 요소는 코드가 아니라 **실제 매물 공급 0건**(운영 실측, 260812 문서 기준)과 **퍼널 계측 부재(S-18/G)**다 — 이 둘은 이번 정적 감사로 재검증 불가능하다.

## 1. 여정 단계별 판정표

| # | 단계 | 기능 | 판정 | 코드 근거 | 비고 |
|---|---|---|---|---|---|
| B-1 | 온보딩 | 비로그인 마켓 목록/상세·업체 상세 공개 열람 | ✅완성 | `frontend/src/App.tsx:517-520`(`/market`,`/market/search`,`/market/:id`,`/biz/:id` 가 `PrivateRoute` 밖) | S-1/P0-5/JCR-1 해결. 배경-라우트 오버레이(`App.tsx:184-185`)도 동일하게 공개 |
| B-2 | 온보딩 | 비로그인 사용자 CTA(게스트 바) | ✅완성 | `frontend/src/components/layout/AppShell.tsx:57,65-68` | `0c8c281` — 탭바 사라진 자리에 로그인 유도 바. `useRequireAuth` 재사용으로 returnTo 일관 |
| B-3 | 온보딩 | 첫 화면 분기(로그인=홈/비로그인=마켓) | ✅완성 | `frontend/src/pages/auth/Splash.tsx:37-43,129` — 게스트 CTA `navigate('/market')`; `Splash.tsx:45`,`OAuthLogin.tsx:78,92,297`,`OAuthResult.tsx:48`,`ProfileSetup.tsx:102,139` 전부 `consumeReturnTo() ?? '/home'` | `728031b`. 8개 진입점을 계약 테스트로 동시 고정(`marketFirstValue.contract.test.mjs` 등) |
| B-4 | 온보딩 | 세션만료 폴백이 공개 열람 화면을 덮지 않음 | ✅완성 | `frontend/src/App.tsx:234-237`(`PUBLIC_BROWSE_PREFIXES`) | `0c8c281` — 만료 시 `logout()`만 하고 화면 유지 |
| B-5 | 온보딩 | 판매 등록 진입에 SMS OTP 선행 게이트 | ✅완성 | `frontend/src/components/auth/VerifiedSellerRoute.tsx:8-11`(단순 `PrivateRoute` 위임, OTP 검사 제거) + `MarketCreate.tsx:250-251`(게시 직전 `!user.phoneVerified` 체크) | S-4 해결. 폼 진입은 로그인만 요구, 인증은 제출 시점으로 이동 |
| B-6 | 온보딩 | 로그인 직후 무동의 GPS/광고 킬스위치 | ✅완성 | `frontend/src/hooks/useProximityAlerts.ts:13,48`(`PROXIMITY_ALERTS_ENABLED = false`) / `frontend/src/lib/adPlacement.ts:18`(`ADS_ENABLED = false`) | P0-2/P0-3. `App.tsx:477`의 `enabled={!!user}`는 외피일 뿐, 실제 게이트는 훅 내부 상수 |
| B-7 | 온보딩 | 업체 프로필 자동 클레임 보안(전화 소유 미검증) | ✅완성 | `backend/app/routers/biz.py:231-232`(세션 사용자 `phone_verified_at`+`phone` 기준, `body.phone` 미사용) | P0-1(보안). 260812 문서의 "코드 PASS, 감사로그 증적 대기"와 일치 |
| B-8 | 탐색 | 위치 게이트 3계층(탐색형/실행형/기록형) | ✅완성 | `ai-docs/context/service-rules.md`(GPS 원칙 1-14, 폴백 정책 표) — 홈/마켓/동네지도는 중심가 폴백 유지, 경로안내·퀘스트는 차단, 제보 5경로는 권역 밖 차단 | `da5ded8`. 카메라 튐·watch 이탈 오판정·침수 제보 권역이탈 3개 P0 버그 수정 포함 |
| B-9 | 탐색 | 빈 결과 탈출구(전체 지역 CTA/키워드 알림) | 🟡부분 | 260812 문서 §7 "부분 해결 — 전체 지역·키워드 알림 CTA. 기본 3km는 잔존"(재확인 안 함, 코드 재검증 범위 밖) | S-2. 위치 SoT는 `da5ded8`로 강화됐으나 반경 기본값 3km는 그대로(대표 지시 "gps 안잡히면 전체지역" 원칙과는 별개로 매물 밀도 기본값 문제) |
| B-10 | 매물 인지 | SOLD(판매완료) 종결 상태 무결성 | ✅완성(선행 확인) | 260810 문서 §3 "SOLD는 수동 전환 금지(서버 400)"; `backend/app/routers/market.py` 관련 커밋 `cd32ad1` | 260803 문서 P1-2가 지적한 되돌리기 취약점은 이미 닫힘(재검증은 생략 — 두 후속 문서가 일관되게 "해결"로 기록) |
| B-11 | 문의 | 채팅 탭 승격(1차 내비게이션) | ✅완성 | `frontend/src/components/layout/TabBar.tsx:73-82`(6탭: 홈·마켓·동네지도·채팅·커뮤니티·프로필), `TAB_PATH_PREFIXES['/dm']`(`:16`) | S-5/D-6. 미읽음이 프로필 dot→채팅 탭 숫자 배지(`navBadge`, `:94-96`)로 전환 |
| B-12 | 문의 | DM 로드 실패와 빈 대화 구분 | ✅완성(선행 확인) | `frontend/src/pages/dm/DmDetail.tsx:66-96`(`loading`/`loadError` 분리) | 260803 P1-6 대응. 재검증은 라인 존재만 확인 |
| B-13 | 문의 | DM 백그라운드 폴링 억제 | 🟡부분 | `frontend/src/pages/dm/DmDetail.tsx:106-128` — `visibilitychange` 리스너로 `tick()`이 `document.visibilityState!=='visible'`이면 fetch를 건너뛰지만, `setInterval(tick, 5000)` **타이머 자체는 백그라운드에서도 계속 실행**됨 | S-10. 네트워크 호출은 억제되나 5초 타이머는 살아있다 — "중단"이 아니라 "무동작 스킵". 배터리 절감 효과는 제한적 |
| B-14 | 합의·약속 | 가격제안/약속잡기가 입력창 확장 메뉴 안에 숨음 | ❌미구현 | `frontend/src/pages/dm/DmDetail.tsx:744-754`(`MessageComposer`의 확장 메뉴 항목으로만 존재, 고정 CTA 없음) | S-15/JCR-4/F-3. 260812 문서도 "F-3 미구현"으로 명시. 상단 상태 스트립·주 CTA 고정 없음 |
| B-15 | 합의·약속 | 약속 수락 직전 안전 안내(공개장소·선입금 주의) | ❌미구현 | `DmDetail.tsx` 전체 grep — "안전"/"공개 장소"/"선입금" 관련 UI 텍스트 0건 | S-19. 안전거래 가이드는 여전히 홈의 일반 배너(`HomePage.tsx:562-581` 추정, 재확인은 홈 파일 직접 안 봄)로만 존재 |
| B-16 | 합의·약속 | 안전한 만남 장소 후보 추천(양측 ETA) | ❌미구현 | `AppointmentLocationPicker.tsx` — 공용 지도에 사용자가 직접 핀 찍는 얇은 래퍼(260810 문서 근거, 이번 세션 재확인 안 함) | S-15. 260812 문서에서도 범위 밖으로 명시 |
| B-17 | 완료 | 구매자 거래완료 요청권 | ✅완성 | `backend/app/routers/biz.py`와 별도 — `frontend/src/pages/dm/DmDetail.tsx:490-558`(`canRequestCompletion`/`canDeclineCompletion`, `requestAppointmentCompletion`/`declineAppointmentCompletion` API 연동) | S-16/D-7. `ACCEPTED` 상태값 유지한 채 `completion_requested_by/at`, `completion_declined_at/by` 컬럼으로 표현(`database/init/179_*.sql`, 코드 직접 재검증은 프론트만) |
| B-18 | 완료 | 운영 이의(force-complete/dismiss) 어드민 큐 | ✅완성(문서 근거) | 260812 문서 §9.10 — `backend/app/routers/admin_api/trades.py` 신설, backend 491 PASS 기록 | 이번 세션에서 백엔드 파일 직접 재검증은 생략(프론트 소비처만 확인), 문서의 테스트 수치가 구체적이라 신뢰도 높음으로 판단 |
| B-19 | 완료 | 판매완료 매물의 "가격 수정"/상태전환 UI 잔존 | 🟡부분 | 260803 P1-2 근거(`MarketDetail.tsx:375-408` 당시 라인) — 이번 세션 재검증 안 함 | 260810/260812 문서 모두 이 항목을 별도로 재언급하지 않아 상태 불명. **미검증으로 분류하는 것이 더 정확** — 판정을 부분으로 낮춤 |
| B-20 | 재방문 | 판매자 전용 매물 관리 화면(조회수·문의·상태 전환) | ❌미구현 | `frontend/src/pages/profile/ProfileMain.tsx:638-641` — "내 매물" 진입이 여전히 `navigate('/market/search?mine=1')` | S-11. 검색 화면 재활용 그대로, 260812 문서도 이 항목을 다루지 않음(범위 밖) |
| B-21 | 재방문 | 채팅 알림 개별 토글(끄기 가능) | ✅완성 | `frontend/src/pages/settings/NotiSettings.tsx:16,25,37,47` — `chat` 필드가 노출 항목·라벨·기본값(`true`)에 모두 존재 | S-9. 260810 문서 시점엔 `social`/`keyword_alert` 둘뿐이었으나 현재 `chat` 항목 추가 확인 |
| B-22 | 재방문 | 키워드 알림(찾는 매물 등록 시 알림) | ✅완성(선행 확인) | 260810 문서 §3 "이미 잘 되어 있는 것" 근거, `market.py:1016-1069` 등록 API + outbox 이벤트 | 재검증 생략 — 다른 항목들과 달리 애초에 "문제"로 지적된 적 없음 |
| B-23 | 이동 | 자체 경로 엔진 실패 시 외부 폴백 URL 파라미터 | ✅완성 | `frontend/src/pages/ride/RideNav.tsx:391,457` — `travelmode=two-wheeler`(하이픈 정상값) | S-17 일부. `two_wheeler`(오타) → `two-wheeler` 수정 확인 |
| B-24 | 이동 | 자체 경로 엔진 검증 모드(강제 실패) 환경 플래그 분리 | 🟡부분 | `backend/app/routers/info_route.py:206,225,227-230`(주석 처리된 조건부 코드 존재, 활성 로직은 여전히 무조건 `configured=False` 분기 유지로 보임) | 이번 세션은 해당 파일 부분만 grep 확인 — 전체 로직(실제 어떤 조건에서 `configured=True`가 나가는지) 은 미검증. 환경 플래그 전환이 실제로 됐는지는 추가 확인 필요 |
| B-25 | 안전·신뢰 | 홈/프로필의 게이미피케이션 재화(Lv/RP/스킬포인트) 숨김 | ✅완성 | `frontend/src/lib/featureFlags.ts`(`SHOW_LEGACY_GAME_ECONOMY = false`), `frontend/src/pages/home/HomePage.tsx:333`(`{SHOW_LEGACY_GAME_ECONOMY && <div className={styles.levelBadge}>...}`) | S-7/D-5. 코드는 보존, 렌더링만 플래그로 차단 — 다크모드 선례와 동일 패턴 |
| B-26 | 안전·신뢰 | 이미지 업로드 실패 복구(재시도 UI) | ✅완성 | `frontend/src/pages/market/MarketCreate.tsx:193(retryImage), 211(hasFailedImage), 330-338(재시도 버튼)` | S-6. 실패 썸네일에 오버레이+재시도, 제출 차단(`postBlockReason` 계열) 힌트 텍스트 확인 |
| B-27 | 안전·신뢰 | 판매 등록 초안 보존(7일 만료) | ✅완성 | `frontend/src/pages/market/MarketCreate.tsx:21-23`(`DRAFT_VERSION`,`DRAFT_KEY_PREFIX`,`DRAFT_MAX_AGE_MS=7*24h`), `48-84`(read/write/remove) | S-3(a). 사용자별+업체 컨텍스트별 draft key, contentId만 저장(로컬 blob 미보존) |
| B-28 | 안전·신뢰 | 등록 폼 미완료 사유 표시 | ✅완성 | `MarketCreate.tsx:225`(`postBlockReason`), 버튼에 `loading={posting}` 연동(`:296`) | S-3(b). 260803 P1-15(중복 제출) 지적 패턴도 `loading` prop으로 함께 해소된 것으로 보임(공용 Button `loading` prop 존재 확인, 개별 화면 8곳 전수 재검증은 범위 밖) |
| B-29 | 안전·신뢰 | 동네정보 허브(InfoHub) 위치 SoT 통일 | ✅완성 | `frontend/src/pages/info/InfoHub.tsx:24,51` — `useServiceLocation()` 사용(고정 Bến Thành 좌표 하드코딩 제거) | S-12. 다만 홈에서 `/info` 진입점 자체는 여전히 개별 화면(`/info/weather` 등)만 있고 허브 랜딩 도달 경로 미해결 여부는 재검증 안 함 |
| B-30 | 안전·신뢰 | 스플래시 최소 표시시간 | ✅완성 | `App.tsx:439` — `Math.max(0, 500 - elapsed)`(주석은 "1200ms" stale이지만 실제 코드값 500ms) | S-13. 260812 문서와 일치 |
| B-31 | 안전·신뢰 | 퍼널 계측(landing_view~trade_completed 등) | ❌미구현 | grep 결과 PostHog/Mixpanel/Amplitude/`trackEvent` 패턴 0건(이번 세션은 재확인 목적의 재검색 안 함, 260812 문서 §9.8 "미구현"을 그대로 채택) | S-18/G. 가장 큰 운영 리스크 — 이탈 원인이 UI 문제인지 공급 문제인지 구분 불가 |

## 2. 기존 감사 문서 대비 델타

### 2-1. 해결된 항목 (문서는 열려있다 하나 코드는 닫혔다 / 새로 닫혔다)

- **S-1/P0-5/JCR-1 비로그인 마켓·업체 열람** — `bad1a05`에서 전체 구현(App.tsx 라우트 재배치), `0c8c281`에서 게스트 바·세션만료 예외로 완성. `260810` 시점엔 전면 미해결이었으나 지금은 코드상 완결.
- **S-5/D-6 채팅 탭 승격** — `978428c`. `260810`/`260812` 초기 시점엔 "미구현"이었다가 대표 후속 지시로 같은 날 착수·완료.
- **S-16/D-7 구매자 완료 요청권** — `978428c`. 자동완료 없이 요청→거절/재요청→운영 강제완료 큐까지 구현. `260810`/`260812` 초기 판정("판매자만 완료 가능")을 뒤집음.
- **S-4 판매 OTP 시점 이동** — `VerifiedSellerRoute`가 단순 `PrivateRoute` 위임으로 축소, OTP는 `MarketCreate.handleSubmit` 진입 시 검사. `260812` 문서가 "코드 PASS"로 기록한 것과 일치.
- **S-3(a)(b) 초안 보존·미완료 사유 표시** — 완전 구현 확인.
- **S-6 업로드 실패 복구** — 완전 구현 확인.
- **S-9 채팅 알림 토글** — `chat` 필드 노출 확인, `260810` 시점 "설정 항목 자체가 없음" 판정이 뒤집힘.
- **S-12 InfoHub 위치 SoT** — `useServiceLocation()` 전환 확인.
- **S-13 스플래시 지연** — 500ms로 단축 확인.
- **위치 게이트 3계층(da5ded8)** — 베이스라인 4개 문서 어디에도 없던 항목. 대표 지시("gps 안잡히거나 지역밖이면 서비스 안해주는게 맞다")에 따라 탐색형/실행형/기록형 분리, 카메라 튐·watch 이탈 오판정·침수 제보 권역이탈 P0 버그 수정.
- **B0P0-1 업체 클레임 보안 취약점** — `bad1a05`. `260812` 문서가 새로 발견한 P0("공개된 전화번호만 알면 타 업체 탈취 가능")를 세션 사용자 인증전화 기준으로 재구현. 260810/260803 문서엔 아예 없던 신규 위험이 발견 당일 닫힘.
- **로그인/게스트 첫 화면 분기(728031b)** — 베이스라인 문서들이 요구한 "마켓 우선 통일"(D-1/D-6)을, 로그인 사용자는 홈(생활정보 유지)/비로그인 사용자는 마켓(가치 선노출)으로 사용자 상태별 분리하는 형태로 구현. 원안(홈 완전 제거)과는 다르지만 목적(가치 선노출)은 달성.

### 2-2. 여전히 열린 항목

- **S-15/JCR-4/F-3 거래 조종석(Deal Cockpit)** — DM 상단 상태 스트립, 고정 주 CTA 모두 미구현. `978428c`는 F-1(채팅 탭)·F-2(완료 요청권)만 처리했고 F-3은 명시적으로 범위 밖으로 남겼다.
- **S-19 약속 수락 직전 안전 안내** — 미구현. F-3과 묶여 있던 항목.
- **S-15 안전한 만남 장소 후보·양측 ETA** — 미구현.
- **S-11 판매자 전용 관리 화면** — 여전히 `/market/search?mine=1`.
- **S-18/G 퍼널 계측** — 미구현. `260812` 문서도 동일하게 "미구현"으로 기록.
- **S-2 기본 반경 3km** — `da5ded8`가 위치 게이트의 정확성(폴백 판정)은 고쳤지만, 초기 매물 밀도 부족 상황에서 기본 반경을 넓히거나 자동 확대 폴백을 넣는 근본 처방은 이번 5개 커밋 범위에 없음.
- **S-10 DM 백그라운드 폴링** — 네트워크 호출은 억제되나 타이머 자체는 여전히 5초마다 깨어남(완전한 "중단"은 아님) — 260812 문서의 "대부분 해결" 판정과 일치, 완전 해결은 아님.

### 2-3. 문서에 없던 신규 발견

- **B-24 (경로 엔진 검증모드 환경 플래그화 여부 불명확)** — `260810` 문서 S-17이 지적한 "검증 모드가 하드코딩 return"이라는 문제가 실제로 환경 플래그로 분리됐는지, `info_route.py`의 현재 로직만으로는 확신할 수 없었다. 파일에 조건부 분기의 흔적(주석 처리된 코드)은 있으나 활성 로직 전체를 추적하지 못했다. **재확인 필요** — 다음 감사에서 `info_route.py` 전체를 읽고 `configured=True/False` 분기 조건을 완전히 추적할 것.
- **DM 폴링의 "타이머 지속" 특성** — 베이스라인 문서는 "visibility guard·복귀 즉시 fetch·catch"로 "대부분 해결"이라고만 적었는데, 이번 재검증에서 `setInterval` 자체는 백그라운드에서도 계속 실행되고 단지 콜백 내부에서 조기 return한다는 세부사항을 확인했다. 배터리 절감 효과는 있으나 "폴링을 멈춘다"는 표현은 정확하지 않다.

## 3. 상용 차단 등급

- **P0 (이게 없으면 공개 불가)**:
  - 실제 매물 공급 0건 (코드로 해결 불가능, 운영 과제 — 260812 문서 실측 기준. 이번 세션은 운영 API를 다시 호출하지 않아 현재 수치는 미검증이나 코드 변경만으로 채워지는 문제가 아님은 확실)
  - 퍼널 계측 부재(S-18/G) — 파일럿 성공 여부를 판정할 수단 자체가 없다
  - 운영 RC 종단 검증(OAuth/SMS/FCM 실기기, fresh DB migration) — 이번 세션은 정적 코드 감사이므로 검증 불가, 260812 문서가 이미 "미검증"으로 명시한 항목을 그대로 승계

- **P1 (공개는 되나 이탈/신뢰 손실)**:
  - Deal Cockpit 부재(S-15/F-3) — 가격 합의 후 사용자가 다음에 뭘 해야 할지 앱이 이끌지 않음
  - 약속 시점 안전 안내 부재(S-19)
  - 판매자 전용 관리 화면 부재(S-11) — 판매자 재방문 동기 약화
  - 기본 반경 3km + 자동 확대 폴백 부재(S-2) — 초기 공급 부족 상황에서 "빈 앱"으로 인식될 위험 지속
  - DM 백그라운드 타이머 미완전 정지(S-10)

- **P2 (개선 여지)**:
  - B-19(판매완료 매물 UI 잔존 가능성) — 재검증 필요, 확정된 문제는 아님
  - B-24(경로 엔진 검증모드 플래그화 여부) — 재검증 필요

## 4. 미검증으로 남긴 것

- **운영 공개면 실측** — 활성 매물/승인 업체 건수, 실제 응답률. `260812` 문서의 2026-08-12 실측치(매물 0건)를 그대로 인용했을 뿐 이번 세션에서 재호출하지 않았다.
- **실기기/네이티브** — OAuth(Zalo/Google/Apple) 로그인 실동작, SMS OTP 실발송·수신, FCM 푸시, GPS 권한 다이얼로그 타이밍. native submodule 확인 자체를 하지 않았다.
- **백엔드 admin_api/trades.py, market.py 완료 API 상세 로직** — 프론트 소비처(`DmDetail.tsx`)만 확인했고 서버 측 권한·잠금·멱등성 로직은 `260812` 문서의 테스트 통과 기록(491 PASS)을 신뢰했을 뿐 코드 직접 재독은 하지 않았다.
- **`info_route.py`의 경로 엔진 검증모드 전체 로직** — 부분 grep만 수행, 실제 `configured=True/False` 분기 조건 전체 흐름 미추적(§2-3 참조).
- **B-10(SOLD 무결성), B-12(DM 로드실패 구분), B-18(어드민 이의 큐), B-22(키워드 알림)** — 베이스라인 문서가 이미 "해결/기존 양호"로 일관되게 기록했고 이번 5개 커밋과 무관한 영역이라 재검증을 생략하고 문서 근거를 그대로 인용했다. 회귀 여부는 확인하지 않았다.
- **로케일 3벌 키 패리티 최신 수치** — 260812 문서는 1,951키를 기록했으나 이후 커밋(da5ded8/728031b)에서 문구가 더 바뀌었을 가능성이 있어 현재 정확한 키 수·패리티는 재측정하지 않았다.
- **접근성(P1-1/P1-14, 260803 문서)** — 스프라이트 DOM 오염, `div onClick` 컨트롤 문제의 현재 상태는 이번 감사 범위 밖(구매자 여정 축이 아니라 전역 접근성 이슈로 분류해 제외).
