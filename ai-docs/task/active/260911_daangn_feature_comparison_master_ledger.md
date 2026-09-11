# 당근 기능 비교 마스터 구현장부 — F001~F089 단일 SoT

- 문서일: 2026-09-11
- 상태: `ACTIVE` (검증 루프 미착수 — 전 항목 Verify `NOT-RUN`)
- 목적: PDF 비교표 89항목 각각에 대해 **코드에 있는가(Impl)·우리가 할 것인가(Disposition)·동작이 확인됐는가(Verify)** 를 한 곳에서 관리한다. 대표 지적("두 번의 루프를 돌았는데도 완료됐는지 신뢰할 수 없다")에 대한 응답으로, 완료 주장 대신 **증거·검증 절차·통과 기준**을 항목마다 남긴다.
- 출처 PDF: `docs/saigon_rider_daangn_feature_page_comparison_2026-09-09 copy.pdf` (조사일 2026-09-09, 40쪽, 89항목, SR 라우트 174개 수록)
- 기준 커밋:
  - PDF 는 `main / 8c5c7493` (2026-09-09 18:06 KST) 기준.
  - 이 장부의 증거는 현재 HEAD `8d6b2e25` (2026-09-11, `feat(market): add appointment travel notifications`) 기준. **두 커밋 사이에 15개 커밋**이 있으며, 그중 `c5353e9c`(가게 쿠폰 추가), `7bac26c7`(운영자 QR 거래 콘솔 추가)는 PDF 서술과 코드가 어긋나는 직접 원인이다(§4 참조).
- 증거 출처: 독립 워커 5명이 기존 문서를 읽지 않은 상태로 레포를 직접 조사한 `evidence_A~E` (F001–F020 / F021–F039 / F040–F058 / F059–F078 / F079–F089) + 집필자의 교차검증 grep/git 조회. 워커 판정은 입력이며, 최종 판정은 집필자(이 문서)가 내렸다.
- 승계 문서: [`260910_daangn_feature_comparison_implementation_plan.md`](260910_daangn_feature_comparison_implementation_plan.md) — **결정·정책(IMPLEMENT/DEFER/SKIP/BLOCK/DONE 분류, D-ROUTE-1, 범위 가드레일)만** 승계했다. 그 문서의 구현 완료 주장은 이 장부의 근거로 쓰지 않았다.
- 연결 문서(실행서): [`260911_daangn_f030_f033_user_device_qa_ledger.md`](260911_daangn_f030_f033_user_device_qa_ledger.md) — F030–F033 실기기 QA 케이스(`QA-F030-01` ~ `QA-NOTI-02`). **이 장부가 "무엇을 검증하나"(SoT), QA 장부가 "어떻게 실행하나"(절차)** 다. 두 문서의 불일치는 §4-B 에 기록했고, 결과 반영 규약은 §7-7 에 있다. QA 장부는 이 장부 초안 완성 **후** 읽고 반영했다(사전정보 편향 차단).
- **선언: 이 문서는 F001~F089 89항목 전체의 단일 SoT 다.** 항목의 Impl/Disposition/Verify 상태 변경은 이 문서에 결정자·날짜·근거를 먼저 기록한 뒤에만 유효하다. 다른 문서(260910 포함)의 분류가 이 문서와 어긋나면 이 문서가 우선한다.

---

## 1. 읽는 법 — 세 축의 상태값 정의

항목마다 서로 **독립인 세 축**을 기록한다. 축을 혼동하면 이 장부는 무의미해진다.

### 1-1. 구현상태 (Impl) — *코드에 있느냐*

| 값 | 정의 |
|---|---|
| `IMPLEMENTED` | 사용자가 도달 가능한 라우트/화면 **과** 그 화면이 호출하는 API/로직이 모두 코드에서 확인됨. 파일 존재만으로는 부족하다. |
| `PARTIAL` | PDF 가 서술한 기능의 일부만 확인됨, **또는** 코드가 있어도 도달 경로가 막혀 있음(주석 처리·`display:none`·메뉴 미노출), **또는** 핵심 동작이 열어보지 않은 모듈(네이티브 서브모듈)에 있음. |
| `ABSENT` | 기능 코드가 없음. 부재를 확인한 grep 키워드를 항목에 남김. |
| `UNVERIFIABLE` | 정적 코드로는 판정 자체가 불가능한 경우에만 사용. 이번 장부에서는 0건 — 네이티브·외부키 의존은 Impl 이 아니라 Verify 축에서 `BLOCKED` 로 표현한다. |

집필자 재정렬 원칙: 워커 5명은 "네이티브 미검증", "주석 처리 코드"를 각각 다르게 판정했다(예: 워커 B 는 F028 을 PARTIAL, 워커 E 는 F087 을 IMPLEMENTED). 이 장부는 위 표 기준으로 통일했다 — **의도적으로 숨긴 코드는 PARTIAL** 이다(F086–F088). 이는 "잘못 구현됐다"는 뜻이 아니라 "현재 사용자가 도달할 수 없다"는 뜻이며, 코멘트에 의도적 비활성임을 명시했다.

### 1-2. 처리결정 (Disposition) — *우리가 할 것이냐*

| 값 | 정의 | 출처 |
|---|---|---|
| `IMPLEMENT` | 구현 또는 정비를 해야 한다. §6 후속 조치 큐에 오른다. | 260910 §1 + 이 장부 신규 배정 |
| `DEFER` | 지금 하지 않는다. 코드·스키마·UI 를 만들지 않는다. | 260910 §1 + 신규 |
| `SKIP` | 제품 방향과 맞지 않아 제외. 티켓·플래그·선행 추상화 금지. | 260910 §1 + 신규 |
| `BLOCK` | 제품/법무/운영 결정 전 설계·구현 금지. **BLOCK 은 부재를 뜻하지 않는다** — F037 처럼 코드가 있어도 확장을 금지하는 경우가 있다. | 260910 §1 |
| `DONE` | 현행 완료로 간주. 회귀 검증만 허용, 재구현 금지. **DONE 이 Verify PASS 를 뜻하지 않는다.** | 260910 §1 + 신규 |
| `N-A` | 당근 확장 기능이며 SR 서비스 정의(호치민 C2C 오토바이 대면 직거래 — 배송·에스크로·결제대행·구인·부동산 범위 밖) 상 검토 대상 자체가 아님. | 이 장부 신규 |

260910 이 배정한 27건은 그대로 승계했고(F061 은 근거를 재검토한 뒤 유지 — §4 C1), 나머지 62건은 집필자가 배정하며 각 항목 코멘트에 한 줄 근거를 남겼다.

### 1-3. 검증상태 (Verify Status) — *동작이 확인됐느냐*

| 값 | 정의 |
|---|---|
| `NOT-RUN` | 아무도 Action 을 실행하지 않았다. **현재 89건 전부 이 상태.** |
| `PASS` | 항목의 Action 을 실행해 Goal 문장이 관찰됐다. Feedback 에 실행자·일시·증거 경로를 적는다. |
| `FAIL` | Action 을 실행했으나 Goal 이 관찰되지 않았다. Feedback 에 **관찰된 실제 값·재현 절차·추정 원인** 을 적고, Impl 재판정이 필요하면 §4 에 충돌로 추가한다. |
| `BLOCKED` | 실기기·외부 API 키·운영 데이터 부재로 Action 실행이 불가능하다. Feedback 에 무엇이 없어서 막혔는지 적는다. |

**세 축은 독립이다.** `IMPLEMENTED` + `DONE` + `NOT-RUN` 인 항목은 "코드가 있고 더 만들 계획은 없지만 **동작은 아직 아무도 확인하지 않았다**"는 뜻이다. "코드에 있다"는 "동작한다"를 뜻하지 않는다.

### 1-4. 항목 필드 규약

- **코멘트**: 현재 실태. IMPLEMENTED 여도 관찰된 제약·주의점을 비우지 않는다.
- **증거**: `path:line` — 무엇. 워커 증거 파일 또는 집필자 grep 에 실재하는 경로만 적는다.
- **격차**: 없으면 "없음".
- **Action**: 누가·무엇을 실행하는가. 명령어·URL·화면 경로.
- **Goal**: 무엇이 관찰되면 PASS 인가. 단일 문장.
- **Status**: 위 1-3 값.
- **Feedback**: `—` 로 시작. PASS/FAIL/BLOCKED 로 바뀔 때 1-3 규약대로 기입.

---

## 2. 요약 대시보드 (89항목, 집필자 직접 집계)

### 2-1. Impl 분포

| Impl | 건수 | 항목 |
|---|---|---|
| IMPLEMENTED | **61** | 아래 PARTIAL/ABSENT 를 제외한 전부 |
| PARTIAL | **11** | F003, F014, F028, F048, F051, F065, F079, F081, F086, F087, F088 |
| ABSENT | **17** | F013, F018, F019, F020, F034, F035, F036, F042, F052, F054, F062, F063, F069, F076, F077, F078, F080 |
| UNVERIFIABLE | **0** | — |

### 2-2. Disposition 분포

| Disposition | 건수 | 항목 |
|---|---|---|
| IMPLEMENT | **6** | F016, F030, F031, F032, F033, F051 |
| DEFER | **10** | F003, F011, F054, F062, F065, F066, F080, F086, F087, F088 |
| SKIP | **11** | F018, F019, F020, F042, F063, F069, F076, F077, F078, F079, F081 |
| BLOCK | **5** | F034, F035, F036, F037, F052 |
| N-A | **1** | F013 |
| DONE | **56** | 나머지 전부 |

### 2-3. Verify 분포

| Verify | 건수 |
|---|---|
| NOT-RUN | **89** |
| PASS / FAIL / BLOCKED | 0 / 0 / 0 |

**Verify 는 전부 NOT-RUN 에서 출발한다.** 바뀌는 조건: 검증 담당자(T4 역할 — 구현자와 다른 사람/세션)가 항목의 Action 을 실제로 실행하고, Goal 문장이 관찰됐는지 Feedback 에 실행 일시·명령·관찰값·증거 경로(스크린샷/로그)를 적은 뒤 Status 를 갱신한다. 정적 코드 재확인은 Verify 를 바꾸지 못한다. 실행 순서 권고: §6 큐 상위 → IMPLEMENT 항목 → DONE 중 머니 경로(F032·F033·F068) → 나머지.

---

## 3. 승계한 결정·정책 (260910 에서 가져온 것)

- **분류 승계**: IMPLEMENT F030–F033 / DEFER F003·F011·F054·F062·F065·F066·F080 / SKIP F018–F020·F042·F063·F069·F076–F079 / BLOCK F034–F037·F052 / DONE F061.
- **D-ROUTE-1 (2026-09-10 대표 결정)**: 운영 경로 제공자는 자체 호스팅 Valhalla 단독. Google Routes 는 폴백으로도 쓰지 않음. 사용자 모드 enum `motorcycle`(기본)/`car`/`walking` → Valhalla `motorcycle`/`auto`/`pedestrian`. F031·F075 Action 에 반영.
- **범위 가드레일**: 호치민 C2C 대면 직거래. 제3자 라이더·배송망·보관대행·에스크로·소비자 결제·안전 보증 없음. 이 원칙이 F013·F034–F036·F052 의 Disposition 근거다.
- **Stop-the-line**: BLOCK ID 승인 없이 선행조건으로 유입 금지 / 탐색용 Bến Thành 폴백 좌표를 길안내 출발점에 넣지 않음 / 서버 정밀도 정책(`none/approx/exact`) 우회 금지.
- 260910 의 Phase 체크박스 완료 기록은 **이 장부의 Verify 로 승계하지 않았다.** F030–F033 은 여기서도 NOT-RUN 이다.

---

## 4. PDF 와 코드가 어긋나는 항목 (핵심 섹션)

워커 5명이 보고한 충돌과 집필자가 교차검증에서 발견한 것을 전부 모았다. **C1~C3 이 대표가 지목한 3건**이다.

### C1. F061 가게 쿠폰 — PDF "미발견" vs 코드 5개 엔드포인트 → **커밋 시차. PDF 오기재 아님. 260910 의 DONE 은 유지하되 근거를 교체**

- PDF 원문(F061 행): "단골·팔로우·소식은 구현. **활성 가게 쿠폰 발행/사용 검증 흐름은 미발견.** … 레거시 CouponShop 을 가게 쿠폰 관리로 계산하지 않음."
- 현재 코드: `backend/app/routers/biz.py:1515`(발행 POST /coupons) `:1550`(오너 목록) `:1580`(중단) `:1611`(사용 처리 redeem) `:1653`(공개 목록) `:1742`(고객 보관함 /coupons/mine), `frontend/src/pages/biz/BizCouponManage.tsx:10,61`(`createBizCoupon` 호출), `frontend/src/pages/map/MapCoupons.tsx:11`(`fetchMyBizCoupons` 고객 보관함), `frontend/src/App.tsx:600,621`(`/map/coupons`, `/biz/coupons` 라우트).
- 집필자 git 조회: `git grep -c coupons 8c5c7493 -- backend/app/routers/biz.py frontend/src/pages/biz/` → **0건**. `git ls-tree 8c5c7493 -- frontend/src/pages/biz/ | grep -i coupon` → 없음. 쿠폰은 `c5353e9c` (2026-09-09 23:35 KST, `feat(trust,biz,dm): close report wiring gaps and add shop coupons`) 에서 추가 — PDF 기준 커밋(18:06) 보다 **5시간 29분 뒤**.
- **판정**: PDF 는 자기 기준 커밋에서 정확했다. 260910(09-10 작성)이 F061 을 DONE 으로 분류한 시점엔 이미 `c5353e9c` 가 있었으므로 분류 자체는 결과적으로 옳다. 다만 260910 은 근거 커밋을 적지 않았고, PDF 만 보면 "미발견"인 항목을 DONE 이라 적은 셈이라 신뢰를 잃었다. **이 장부는 DONE 을 유지하되 근거를 `c5353e9c` 로 명시하고, 발행→보관→매장 제시→redeem 왕복은 아직 아무도 실행하지 않았음(NOT-RUN)을 기록한다.** PDF 의 "레거시 CouponShop 미계산" 원칙은 여전히 유효 — `frontend/src/App.tsx:666` 의 `/shop/coupons` 주석 라우트는 F087 소속이며 F061 과 무관.

### C2. F016 초안·게시 전 인증 — `VerifiedSellerRoute` 가 이름과 달리 인증을 강제하지 않음

- PDF 는 정직하게 적었다: "VerifiedSellerRoute 자체는 PrivateRoute 래퍼."
- 코드(`frontend/src/components/auth/VerifiedSellerRoute.tsx` 전문 12줄): `return <PrivateRoute>{children}</PrivateRoute>;` — 로그인만 검사. 주석: "작성 화면은 로그인 사용자에게 먼저 열고, 전화 인증은 MarketCreate 의 게시 직전에 검사한다. 입력 전에 인증으로 보내면 OTP 실패·앱 전환 시 공급자가 폼에도 도달하지 못한다." 실제 강제는 `frontend/src/pages/market/MarketCreate.tsx:254-256,282` (`!user.phoneVerified` → `navigate('/auth/phone-verify')`).
- **판정**: 기능(초안 보존 + 게시 직전 인증)은 IMPLEMENTED 이고 UX 의도도 타당하다. 그러나 **컴포넌트 이름이 보장하지 않는 것을 약속**하고 있어, 이 라우트를 다른 화면에 재사용하는 개발자는 인증이 강제된다고 오해한다(유지보수 함정). 또한 `businessProfileId` 가 있으면(`:254` 조건) 전화 인증을 건너뛴다 — 업체 명의 등록은 전화 인증 없이 게시 가능하다는 정책이 문서화돼 있는지 확인 필요. Disposition `IMPLEMENT`(P3, 리네임 또는 강제 로직을 래퍼로 이동 — 대표 선택).

### C3. F003 지역·위치 확인 — "부분 대응"이 아니라 **개념 부재**

- PDF: "부분 대응 — 위치 선택·GPS 사용만으로 실거주 인증 보유를 뜻하지 않음."
- 코드: GPS 기반 동네 폴백(`frontend/src/pages/market/MarketMain.tsx:81`), 좌표 기반 지도(`frontend/src/pages/map/NeighborhoodMap.tsx`)는 있음. 워커 A grep "동네인증/실거주 인증/신뢰 점수" → 0건. 집필자 재grep `동네인증|neighborhood_verif|residence_verif` (frontend/src, backend/app) → **0건**.
- **판정**: SR 은 "사용자가 지금 어디 있는가"(GPS)만 다루고, 당근의 "이 사용자가 이 동네에 실제 거주함을 N회 인증했다"(신뢰 지표)는 데이터 모델·API·UI 어디에도 없다. 같은 "위치" 단어를 쓰지만 목적이 다른 두 기능이며, PDF 의 "부분 대응"은 관대한 표기다. Impl `PARTIAL`(GPS 절반만), Disposition `DEFER`(260910 승계 — 호치민 밀집 도시에서 동네인증의 제품 가치는 별도 판단).

### C4. F055 운영자 거래 콘솔 — PDF 이후 추가된 코드 (`7bac26c7`)

- `backend/app/routers/admin_api/transactions.py:1-6` 헤더: "당근 비교 트리아지(260909)에서 기능은 있으나(8c5c7493) 운영자 조회 화면이 없다고 지적된 부분." 집필자 git 조회: `7bac26c7` (2026-09-09 23:33 KST) 는 PDF 기준 커밋 **이후**.
- **판정**: PDF F055 행 자체는 "완료 요청 이견·신고·문의 처리용 운영자 화면 존재"라 적어 틀리지 않았지만, 수동 QR 거래의 운영자 조회·메모 콘솔은 PDF 가 볼 수 없었던 코드다. F033/F055 의 증거가 PDF 보다 앞서 있다는 점을 기록한다. 이 콘솔은 "조회 + 메모까지만"(`payment_status` 변경 경로 없음) — 가드레일과 일치.

### C5. F051 거래 위험·금지품목 — PDF-SR "사용자 경고"는 **사후 토스트만** 존재

- PDF-SR: "매물 신고·관리자 금지어 및 의심 판매자 조사 화면. 사용자 경고·서류 불일치 안내."
- 코드: 금칙어는 서버가 400 으로 거절(`backend/app/routers/market.py:845-846,1494-1540`)하고 프론트는 그 뒤 토스트(`frontend/src/pages/dm/DmDetail.tsx:533,991`, `frontend/src/locales/ko/translation.json:1050` "금지된 표현이 포함되어 있습니다"). 위험 점수(`backend/app/services/listing_risk.py:1-40`)는 검수 큐 정렬용으로 사용자 비노출("탐지 ≠ 차단"). 당근식 **등록 전** 경고 배너·위험 카테고리 채팅 주의 문구는 `MarketCreate.tsx`, `DmDetail.tsx`, 로케일 어디에도 없음(워커 C 확인).
- **판정**: "서류 불일치 안내"는 F022 로 실재하나 "사용자 경고"는 반응형 에러만이다. Impl `PARTIAL`, Disposition `IMPLEMENT`(사전 경고 UI — 안전거래 정책과 직결, 소규모).

### C6. F014 가격 제안·매물 상태 — PDF-SR "판매 결과 확인" UI 미증빙

- PDF-SR: "…철회/재등록, **판매 결과 확인**." 워커 A 는 "4가지 입력 UI 는 라인 단위로 추가 확인 필요"라 적었고, 집필자 grep `sale_result|saleResult|sold_survey|outcome|sold_via` → `backend/app/routers/market.py:992` 의 에러코드 `sold_via_appointment` 1건만 매치, 프론트 매치 없음. 철회 모달(`frontend/src/pages/market/MarketDetail.tsx:23,69-70,177`)은 실재.
- **판정**: 가격 제안·상태 전이·철회/재등록은 IMPLEMENTED. "판매 결과 확인" 화면은 증거 없음 → 전체 Impl `PARTIAL`. 코드 부재인지 증거 누락인지 Action 에서 판별한다.

### C7. F048 나의 장소 활동 — PDF-SR "장소 제안 접점" 미증빙

- `frontend/src/pages/map/NeighborhoodProfile.tsx:58,62,67,72,84` 에 저장(`/map/favorites`)·단골(`/map/follows`)·쿠폰(`/map/coupons`)·업체 상태(`/biz/status`)·정비 후기(`/info/repair`) 진입은 확인. `suggest|Suggest` grep → 0건, `frontend/src/App.tsx` 에 `place-suggest*` 라우트 없음. (운영자 측 `/admin/map/place-suggestions` 는 F085 에서 확인됨 — 사용자 제출 진입점이 어디인지 불명.)
- **판정**: Impl `PARTIAL`. 코드 부재인지 다른 화면(`NeighborhoodMap`, `info_gas` 제보 등)에 있는지 Action 에서 판별.

### C8. F050 차단·신고 — PDF 의 미결("피드 상세 직접 신고는 별도 확인 필요")을 **코드가 해소**

- `frontend/src/pages/feed/FeedDetail.tsx:12-13,46-47,80` — `reportFeedPost`, `reportFeedComment`, 게시글/댓글 신고 모달 상태·핸들러 실재(집필자 grep). PDF 가 유보한 지점이 SR 쪽에 유리하게 확정됨.

### C9. F067 전자계약 — 워커 D 의 "약관 버전 필드 부재" 지적을 **집필자가 기각**

- 워커 D: `AdContract` 모델에 `terms_version` 없음. 집필자 grep: `backend/app/routers/ad_contract.py:140,151,201-205,231,247,374-390` — `contract_text_version` 을 스냅샷(`contract_snapshot.contract_text_version`)에 저장·대조하고, 제시 버전과 다르면 `409 contract_version_changed`. PDF-SR "서버 약관 버전·동의·견적 스냅샷"과 일치. Impl `IMPLEMENTED` 유지.

### C10. F040·F044 — PDF 가 옛 문서를 정정한 지점, 코드가 PDF 편

- F040: PDF "SR 가입 승인 UI 가 현재 존재한다. 과거 문서의 미구현 기록을 정정" → `frontend/src/api/community_groups.ts:117,124`(`approveMember`, `removeGroupMember`), `GroupDetail.tsx:256-259` 로 확인.
- F044: PDF "매물·피드 목록 3탭이 있다는 옛 설명은 현행 아님" → `NeighborhoodMap.tsx:58,182` 의 `?view=map` 토글 구조로 확인.

### C11. F086–F088 잠정 보류 — 코드 존재 ≠ 도달 가능. Impl 을 PARTIAL 로 통일

- F086 `/quests*` 라우트는 살아 있으나(`frontend/src/App.tsx:622-625`, 주석 "하단 네비 비활성(메뉴 제거). 라우트는 딥링크·직접접근용 보존") 탭바 진입 없음. F087 게임 8개 라우트 JSX 주석(`App.tsx:659-675`). F088 스킬트리·통계 `display:none`(`ProfileMain.tsx:550-552`, `ProfileMain.module.css:871`).
- 워커 E 는 F087·F088 을 IMPLEMENTED 로 적었다. 이 장부는 §1-1 원칙에 따라 셋 모두 `PARTIAL`(의도적 비활성) 로 통일한다. PDF 의 "잠정 보류"와 의미상 동일.

### C12. F076 알바 — PDF "미발견"은 유효하나 파일럿 주석 존재

- `backend/app/routers/market.py:111,802` 에 "알바 등록 건당 지급 구조", "알바 파일럿" 정책 주석. 전용 라우터·화면·지원자 관리는 없음. PDF 판정(당근 확장/ABSENT) 유지하되, 마켓 카테고리로 알바를 취급할 계획 흔적이 있음을 기록.

### C13. F037 — 260910 BLOCK 이지만 Impl IMPLEMENTED (장부 내부 정합성 주의)

- 완료 요청·거절·운영자 승인 콘솔이 모두 실재(`backend/app/routers/market.py:2427-2432,2466-2468`, `admin-frontend/src/App.tsx:153`, `admin-frontend/src/api/trades.ts:36-56`). BLOCK 은 "당근식 구매확정·분쟁조정 제도로 확장하지 말라"는 뜻이며 부재가 아니다. 두 축이 독립임을 보여주는 대표 사례.

### C14. 네이티브 서브모듈 — PDF 의 "받지 못함" 한계는 현재 체크아웃에서 해소 가능

- PDF 40쪽: "iOS/Android 서브모듈은 원격 접근 오류로 받지 못함." 집필자 확인: `.gitmodules` 에 `native/ios`, `native/android`, `d_modules/WalkieTalkie` 3개 등록, 현재 워킹트리에 셋 모두 체크아웃돼 있음(`native/ios/App`, `native/android/App`, `d_modules/WalkieTalkie/packages`). **그러나 워커 5명 모두 열어보지 않았다.** F027·F028·F075 의 네이티브 판정은 여전히 웹 배선 기준이며, F028 은 이 때문에 PARTIAL 이다.

### C15. F031·F075 — `RideNav.tsx` 주석이 D-ROUTE-1 과 어긋남 (코드 vs 대표 결정)

- `frontend/src/pages/ride/RideNav.tsx:68-69` 주석: "경로 API(**Google Routes**)는 호출당 과금이므로 이탈 재탐색은 안내 1회당 이 횟수까지만 허용하고, 소진 후에는 재탐색 대신 Google 지도 딥링크로 유도한다." D-ROUTE-1(2026-09-10)은 운영 제공자를 **자체 호스팅 Valhalla 단독**으로 확정하고 Google Routes 는 폴백으로도 쓰지 않는다.
- **판정**: 재탐색 횟수 제한의 *근거*(과금)가 낡았다. 로직 자체가 D-ROUTE-1 위반인지(Google Routes 호출 경로가 남아 있는지)는 이 장부 증거로 판정 불가 — 260910 P0-3 은 "Google 폴백 임시 차단"이라 기록. 외부 **Google Maps 앱 딥링크 인계**(QA-F031-04)는 경로 *제공자*가 아니라 *인계 대상*이므로 D-ROUTE-1 위반이 아니다. 두 개념을 코드 주석에서 분리해야 한다. F031·F075 Action 에 반영.

---

## 4-B. 마스터 장부 vs F030–F033 실기기 QA 장부 — 불일치 기록

QA 장부(`260911_daangn_f030_f033_user_device_qa_ledger.md`, 217줄, 케이스 15개)는 이 장부 초안 완성 후 읽었다. 어긋나는 지점은 결함이 아니라 발견이므로 고치지 않고 기록한다. **발견 8건.**

| # | 지점 | 마스터 장부 | QA 장부 | 처리 |
|---|---|---|---|---|
| D1 | SoT 참조 | 89항목 SoT 는 이 장부 | 헤더 "원장 SoT" 가 260910 을 가리킴 | QA 장부 상단에 "상위 SoT: 마스터 장부" 1줄 추가(본문 무수정). 260910 에 SUPERSEDED 1줄 추가. |
| D2 | 판정 어휘 | `PASS / FAIL / BLOCKED / NOT-RUN` | `PASS / Feedback needed / Not met` | 매핑 규약 §7-7: `Not met`→`FAIL`, `Feedback needed`→환경 원인이면 `BLOCKED`, 그 외 `NOT-RUN` 유지 + Feedback 기입. |
| D3 | F030 검증 범위 | 상태기계(ON_SALE↔RESERVED) + 카드 문구 | 좌표 정밀도 게이트(approx 에서 길안내 비노출, exact 재확인), 취소·완료·**차단** 후 exact 차단, 좌표 없는 텍스트 약속 | **QA 가 더 엄격** → F030 Goal 통일. 단 마스터의 DB 상태 전이 확인은 QA 에 없어 유지(합집합). |
| D4 | F031 이동수단 UI | Goal 이 `route_mode=motorcycle` 응답만 확인 | `오토바이/자동차/도보` 3종 **UI 선택** 후 각각 경로 요청 | **QA 가 더 엄격** → F031 Goal 통일. **발견**: 260910 P1-3 완료기록은 "UI selector/호출부는 변경하지 않았다"고 적었고 이 장부 증거(워커 B·D)에도 모드 선택 UI 의 `path:line` 이 없다. QA 케이스는 이 장부가 증빙하지 못한 UI 를 전제한다 → F031 Action 에 선택 UI 실재 확인을 선행 단계로 추가. |
| D5 | 출발·도착 알림 | F031 Goal 에 알림 검증 없음 | QA-F031-02/03, QA-NOTI-01/02: 상대방 전용, 멱등(재시도 시 중복 0), 도착 임계(40m·정확도 35m·출발 선행·포그라운드), `event` 설정 게이트, 푸시 딥링크 | **QA 가 더 엄격** → F031 Goal 에 통합. 이 장부에는 알림 전용 F-ID 가 없어 F031(발송)·F005(`event` 설정 게이트) 두 항목의 Action 에 QA-NOTI 를 연결. |
| D6 | F032 격리 | 금액 스냅샷 일치 + `AWAITING_PAYMENT` | 두 당사자 화면 일치, **다른 약속/대화 정보 혼입 없음**, 결제 실행·에스크로·자동정산 CTA 부재 | 서로 다른 축에서 엄격 → **합집합**으로 F032 Goal 통일. |
| D7 | F033 검증 깊이 | DB `payment_status` 3단계 전이 조회 | 화면 상태 전이 + A/B 화면 일치, DB 조회 없음 | **마스터가 더 엄격**(DB 관측) → 마스터 유지, QA 의 A/B 일치를 추가. QA `PASS` 만으로 F033 을 PASS 처리하지 않는다 — DB 조회가 함께 있어야 한다. |
| D8 | 외부 지도 인계 | 언급 없음 | QA-F031-04: Google Maps 앱 인계, 모드(two-wheeler/운전/도보) 보존 | 마스터 F031 Action 에 추가. C15 와 함께 "제공자 ≠ 인계 대상" 구분을 명시. |

### 4-B-1. QA 장부가 "실기기 QA 로 대체 불가"라고 밝힌 게이트 → F-ID 매핑

QA 장부 §7 이 PASS 처리하지 않는 260910 체크박스 4개를 이 장부 항목에 건다. 해당 F 항목의 Verify 는 **실기기 QA PASS + 아래 엔지니어링 증거**가 모두 있어야 PASS 다.

| 260910 게이트 | 내용 | 걸리는 F-ID | 필요한 별도 증거 |
|---|---|---|---|
| P4-4 | `notification_outbox`·Redis stream·`noti_worker` 장애 주입(중단·복구·재시작·중복 배치) | **F031** (출발·도착 알림 발송 경로) | 장애 주입 결과 + `event_id` 별 유실·중복 0건 기록 |
| P5-1 | 백엔드 회귀 테스트(권한·상태 전이·좌표 정밀도·outbox 멱등 전 조합) | **F030, F031, F032, F033** | `docker compose --env-file .env --profile backend exec -T bff sh -lc 'cd /app && python -m unittest -v app.tests.<대상>'` 0 failure 로그 |
| P5-2 | 프론트 계약 테스트(URL 파서·API 오류 분기·외부 지도 guard) | **F031, F075** (`RideNav` URL 파서·외부 지도 guard 는 F075 코드) | 프론트 계약 테스트 명령 + 0 failure 로그 |
| P5-5 | 24시간 운영 관측(경로 오류율·지연, `noti_worker` backlog/DLQ, 푸시 실패율) | **F031, F075** | 24h 파일럿 대시보드 + 임계치/롤백 기록 |

QA 장부 §7 이 "사용자 관찰 가능 부분은 원장 근거로 사용 가능"이라 한 P2-4(UI·접근성)·P3-4(길안내 인계)·P5-3(Android)·P5-4(iOS) 는 QA-F031-07·QA-F031-04·§6 플랫폼 세트로 이 장부 F030–F033 Action 에 흡수됐다.

---

## 5. 본체 — 89항목 체크리스트

### F001 — 첫 진입·둘러보기

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: `/splash` → 게스트 "둘러보기" → `/market`, 로그인 재진입 → `/home`. `/market`·`/biz`·`/map` 이 `PUBLIC_BROWSE_PREFIXES` 로 익명 열람 허용. 당근의 동네 기반 홈과 달리 SR 게스트 홈은 마켓이다. Disposition 근거: 갭 없음, 260910 미분류 → DONE.
- **증거**: `frontend/src/App.tsx:572` — `/splash` 라우트 / `frontend/src/App.tsx:586,592` — `/market`, `/map` PrivateRoute 미래핑 / `frontend/src/App.tsx:267` — `PUBLIC_BROWSE_PREFIXES = ['/market','/biz','/map']` / `frontend/src/pages/auth/Splash.tsx:40` — 게스트 CTA → `/market` 주석
- **격차**: 없음
- **Action**: 검증자가 로그아웃(쿠키 삭제) 상태에서 `http://<host>:18090/splash` 진입 → 둘러보기 버튼 클릭.
- **Goal**: 인증 리다이렉트 없이 `/market` 이 렌더되고 매물 카드가 1개 이상 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F002 — 회원가입·로그인

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: OAuth → `/auth/oauth-result` 에서 `is_new` 분기 → 신규는 `/auth/profile-setup`, 기존은 `returnTo ?? /home`. Zalo 로그인은 베트남 egress 프록시 VPS(SPOF) 에 의존 — 이 항목의 Verify 는 프록시 상태에 좌우된다. 당근 동네인증 동등 체계 없음(F003 참조).
- **증거**: `frontend/src/App.tsx:573-577` — `/auth/oauth`, `/auth/oauth-result`, `/auth/profile-setup` / `frontend/src/pages/auth/OAuthResult.tsx:48` — `navigate(result.is_new ? '/auth/profile-setup' : (consumeReturnTo() ?? '/home'))`
- **격차**: 없음
- **Action**: 검증자가 신규 테스트 계정으로 OAuth 로그인(Google 또는 Zalo) → 네트워크 탭에서 `/auth/oauth-result` 응답 확인.
- **Goal**: 응답 `is_new=true` 이고 브라우저가 `/auth/profile-setup` 으로 이동하며, 약관 동의 후 `/home` 에 도달한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F003 — 지역·위치 확인

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | DEFER |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C3. GPS 좌표 기반 동네 폴백·정렬만 존재. 당근 "동네인증(실거주 N회 인증 신뢰 지표)"은 모델·API·UI 어디에도 없는 **개념 부재**. Disposition 은 260910 DEFER 승계.
- **증거**: `frontend/src/pages/market/MarketMain.tsx:81` — "GPS 기반 동네(HCMC 밖이면 폴백)" / `frontend/src/pages/map/NeighborhoodMap.tsx` — 좌표 기반 탐색 / grep `동네인증|neighborhood_verif|residence_verif` (frontend/src, backend/app) → 0건
- **격차**: 실거주 인증·인증 횟수 신뢰 지표 전체 부재.
- **Action**: 검증자가 GPS 권한 허용 후 `/market?sort=distance` 진입, 이어서 `grep -rn "동네인증\|residence_verif" frontend/src backend/app` 재실행.
- **Goal**: 거리순 정렬 결과가 좌표에 따라 바뀌고, grep 은 0건이다(부재 재확정).
- **Status**: NOT-RUN
- **Feedback**: —

### F004 — 나의 활동·상대 프로필

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: `/profile`(본인)·`/profile/:userId`(상대, PrivateRoute). 매너온도는 F049 에서 별도 판정. 스킬트리·주행 통계는 숨김(F088).
- **증거**: `frontend/src/App.tsx:643` — `/profile` → `ProfileMain` / `frontend/src/App.tsx:209,646` — `/profile/:userId` → `UserProfile` / `frontend/src/pages/profile/UserProfile.tsx`, `ProfileMain.tsx` 실재
- **격차**: 없음
- **Action**: 검증자가 로그인 후 `/profile` 과 타 사용자 `/profile/<userId>` 진입.
- **Goal**: 두 화면 모두 거래 내역·게시물·후기 섹션이 렌더되고 상대 프로필에는 팔로우/신고 액션이 보인다.
- **Status**: NOT-RUN
- **Feedback**: —

### F005 — 알림·개인 설정

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: PDF 가 나열한 5개 라우트 전부 존재. 당근의 다크모드 설정 등 1:1 항목 비교는 미실시.
- **증거**: `frontend/src/App.tsx:642,694-698` — `/notifications`, `/settings/notifications|language|account|profile` / `frontend/src/pages/settings/NotiSettings.tsx`, `LangSettings.tsx`, `AccountSettings.tsx`, `ProfileEdit.tsx` 실재
- **격차**: 없음
- **Action**: 검증자가 `/settings/notifications` 에서 토글 1개 변경, `/settings/language` 에서 언어 전환. 추가로 `event` 알림 토글이 실제 푸시를 게이트하는지는 **QA-NOTI-01**(QA장부 §5) 로 확인 — 결과는 F031 Feedback 과 함께 여기에도 기록.
- **Goal**: 토글 변경이 PATCH 요청 200 으로 저장되고 새로고침 후 유지되며, 언어 전환 즉시 UI 문구가 바뀌고, `event` 를 끈 사용자는 출발 푸시를 받지 않되 인앱 알림은 남는다.
- **Status**: NOT-RUN
- **Feedback**: —

### F006 — 정지·탈퇴·복구 안내

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 확인 유보 |

- **코멘트**: 전용 화면 존재. 당근 측은 비공개라 비교 불가(PDF 유보 유지). 정지 계정의 문의 티켓 경로는 `backend/app/tests/test_support_suspended_ticket.py` 로 테스트 존재(워커 E grep 에서 우연 매치).
- **증거**: `frontend/src/App.tsx:576,580` — `/auth/restore`, `/suspended` / `frontend/src/pages/auth/Suspended.tsx`, `AccountRestore.tsx` 실재
- **격차**: 없음
- **Action**: 운영자가 어드민에서 테스트 계정을 정지 처리 → 검증자가 그 계정으로 로그인.
- **Goal**: 로그인 직후 `/suspended` 로 리다이렉트되고 화면에 정지 사유·문의 경로가 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F007 — 매물 목록·카테고리

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 최근·추천·거리·가격 정렬 + 카테고리 필터 + 무한스크롤. 카테고리 트리는 `database/init/092_marketplace_category_tree.sql`(오토바이 노드 포함, 자동차 없음 — F079).
- **증거**: `frontend/src/pages/market/MarketMain.tsx:54,75,105` — `ListingSort`, 추천순, `sort` state / `MarketMain.tsx:157,233` — `categoryId` fetch 파라미터
- **격차**: 없음
- **Action**: 검증자가 `/market` 에서 정렬 4종 전환 + 카테고리 1개 선택, 네트워크 탭에서 `GET /api/bff/market?...` 쿼리 확인.
- **Goal**: 각 전환마다 `sort`·`categoryId` 가 쿼리에 반영되고 목록 순서/구성이 바뀐다.
- **Status**: NOT-RUN
- **Feedback**: —

### F008 — 검색·가격 필터

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 검색어·분류·최저/최고가·정렬. 당근의 전국 바로구매 검색 확대는 SR 범위 밖(F013).
- **증거**: `frontend/src/App.tsx:587` — `/market/search` / `frontend/src/pages/market/MarketSearch.tsx:56,58` — `category`, `sort` state, `priceMin/priceMax` 필터
- **격차**: 없음
- **Action**: 검증자가 `/market/search` 에서 검색어 + 가격 범위(예: 1,000,000~3,000,000 VND) + 카테고리 조합 입력.
- **Goal**: 결과 카드 전부가 가격 범위 안에 있고 선택 카테고리에 속한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F009 — 매물 상세

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 공개 라우트(비로그인 열람 가능), 찜·채팅·가격제안 액션. 채팅/찜은 로그인 필요 — 게스트 클릭 시 동선은 Action 에서 확인. 바로구매(결제·배송)는 범위 밖.
- **증거**: `frontend/src/App.tsx:207,588` — `/market/:id` 공개 / `frontend/src/pages/market/MarketDetail.tsx:15` — `createConversation`, `proposePriceOffer` import / `MarketDetail.tsx:577,589-592` — 찜·채팅 버튼
- **격차**: 없음
- **Action**: 검증자가 게스트로 `/market/<id>` 열람 후 채팅 버튼 클릭, 이어 로그인 상태로 동일 버튼 클릭.
- **Goal**: 게스트는 로그인 유도로, 로그인 사용자는 `/dm/<conversationId>` 로 이동하며 대화가 생성된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F010 — 관심 매물 저장

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 상세 찜 + `/market/wishlist` + BFF API. `/map/favorites` 도 동일 `fetchWishlist` 를 재사용(F047).
- **증거**: `frontend/src/App.tsx:604` — `/market/wishlist` / `frontend/src/pages/market/MarketWishlist.tsx` 실재 / `backend/app/routers/market.py:1463` — `GET /wishlist` "내 찜 목록"
- **격차**: 없음
- **Action**: 검증자가 매물 상세에서 찜 → `/market/wishlist` 진입 → 찜 해제.
- **Goal**: 찜한 매물이 목록에 나타나고 해제 후 새로고침하면 사라진다.
- **Status**: NOT-RUN
- **Feedback**: —

### F011 — 키워드 알림

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DEFER |
| **PDF 판단** | 부분 대응 |

- **코멘트**: CRUD + 중복/금지어/길이/개수 검증은 완결. **DEFER 는 당근식 고급 조건(카테고리·가격·제외단어·동네범위) 확장에 대한 260910 결정**이며 기존 기능 유지에는 영향 없음. 키워드 매칭 시 실제 푸시가 발송되는지는 별도 확인 대상.
- **증거**: `frontend/src/App.tsx:605` — `/market/keyword-alerts` / `frontend/src/pages/market/MarketKeywordAlerts.tsx:1-45` — add/update/remove, `maxCount` / `backend/app/routers/market.py:1488-1530` — `_KEYWORD_ALERT_MAX_COUNT_DEFAULT`, `_banned_keywords_norm`, `_validate_keyword_alert_text`
- **격차**: 고급 조건 없음(DEFER).
- **Action**: 검증자 A 가 키워드 "xe máy" 등록 → 검증자 B 가 제목에 해당 단어를 포함한 매물 등록 → A 의 `/notifications` 확인. 별도로 금지어·중복 입력 시도.
- **Goal**: A 에게 키워드 알림 1건이 생성되고, 금지어/중복 입력은 에러 토스트로 거절된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F012 — 목록·지도 탐색

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: `/market` 지도 뷰(매물 마커, 뷰포트 bbox) + `/map` 업체 지도. 지도 대상이 당근(거래 희망 장소)과 다름.
- **증거**: `frontend/src/App.tsx:592` — `/map` / `frontend/src/pages/map/NeighborhoodMap.tsx:15,20,61-63` — `BizMapItem` / `frontend/src/pages/market/MarketMain.tsx:244` — "지도 뷰 마커 조회 — 현재 필터 + 뷰포트 bbox"
- **격차**: 없음
- **Action**: 검증자가 `/market` 지도 토글 후 지도 드래그, `/map` 에서 업체 카테고리 변경.
- **Goal**: 드래그 시 bbox 파라미터가 바뀐 마커 요청이 나가고, 카테고리 변경 시 마커 집합이 갱신된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F013 — 전국 배송 매물 검색

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | N-A |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 배송·체크아웃 자체가 SR 서비스 정의 밖(260910 가드레일 "배송·에스크로·소비자 결제는 범위 밖"). 260910 미분류 → 집필자 N-A 배정.
- **증거**: 워커 A grep `nationwide|전국|체크아웃|checkout|바로구매` (frontend/src/pages, backend/app/routers) → 무관 1건(`InfoGasList.tsx`)
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 `grep -rn "checkout\|전국 배송" frontend/src backend/app` 실행.
- **Goal**: 결제/배송 도메인 코드 0건(부재 재확정).
- **Status**: NOT-RUN
- **Feedback**: —

### F014 — 가격 제안·매물 상태

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C6. 가격 제안·상태 전이·철회(WITHDRAWN)/재등록(ON_SALE 복귀)·ACCEPTED 약속 시 철회 불가는 확인. PDF-SR 의 "판매 결과 확인" 화면은 증거 없음. Disposition DONE 인 이유: 결과 확인 UI 는 아무도 요구하지 않았고, 우선 실체를 확인해야 한다.
- **증거**: `frontend/src/pages/market/MarketDetail.tsx:15` — `proposePriceOffer` / `MarketDetail.tsx:23,69-70,177` — `withdrawListing`, 철회 모달 / `backend/app/routers/market.py:1008-1013` — "철회는 되돌릴 수 있는 상태 — ON_SALE 로만 복귀" / `market.py:1043-1044` — ACCEPTED 약속 시 철회 불가 / `market.py:992` — `sold_via_appointment` 에러코드
- **격차**: "판매 결과 확인" UI 미증빙(코드 부재 vs 증거 누락 미판별).
- **Action**: 검증자가 (1) 판매자 계정으로 매물 철회 → 재등록, (2) `grep -rn "판매 결과\|saleResult\|sold_via" frontend/src/pages/market frontend/src/api/market.ts` 실행해 결과 확인 UI 존재 여부 판별.
- **Goal**: (1) 상태가 ON_SALE→WITHDRAWN→ON_SALE 로 전이되고, (2) grep 결과로 결과 확인 UI 유무가 확정되어 이 항목의 Impl 이 IMPLEMENTED 또는 격차 명시로 갱신된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F015 — 판매글 작성·사진

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 사진·제목·설명·가격·분류 + 초안 저장. 당근의 "거래 희망 장소 설정"은 SR 에선 약속 단계(F030)로 이동.
- **증거**: `frontend/src/App.tsx:603` — `/market/new` (`VerifiedSellerRoute`) / `frontend/src/pages/market/MarketCreate.tsx:22,70-100` — `DRAFT_KEY_PREFIX`, `writeDraft()`, 입력 폼
- **격차**: 없음
- **Action**: 전화 인증된 검증자가 `/market/new` 에서 사진 1장 + 필수 필드 입력 후 게시.
- **Goal**: `POST /api/bff/market` 201 후 신규 `/market/<id>` 로 이동하고 업로드 사진이 `<AppImage>` 로 렌더된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F016 — 초안·게시 전 인증

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | IMPLEMENT |
| **PDF 판단** | 확인 유보 |

- **코멘트**: §4 C2. 기능은 동작하나 `VerifiedSellerRoute` 이름이 인증 강제를 약속하고 실제로는 `PrivateRoute` 만 감싼다. 업체 명의(`businessProfileId`) 등록은 전화 인증 분기를 건너뜀 — 의도된 정책인지 미확인. IMPLEMENT 근거: 유지보수 함정 제거(리네임 또는 강제 로직 이동, 대표 선택) — P3.
- **증거**: `frontend/src/components/auth/VerifiedSellerRoute.tsx:1-12` — `<PrivateRoute>` 래퍼 + 주석 / `frontend/src/pages/market/MarketCreate.tsx:99-100` — `draftKey` 초안 / `MarketCreate.tsx:254-256,282` — `!businessProfileId && !user.phoneVerified` → `/auth/phone-verify`
- **격차**: 네이밍-동작 괴리. 업체 명의 인증 예외 정책 문서 부재.
- **Action**: 검증자가 전화 미인증 계정으로 `/market/new` 진입(성공해야 함) → 폼 작성 → 게시 클릭 → 인증 완료 후 복귀. 이어서 개발자가 리네임/이동 중 택1 한 PR 을 올린다.
- **Goal**: 게시 클릭 시 `/auth/phone-verify` 로 이동하고 복귀 후 localStorage `market-listing-draft:*` 로 폼 값이 복원된다; PR 머지 후 컴포넌트 이름과 동작이 일치한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F017 — 매물 수정·판매 관리

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 편집 라우트·화면 + 계약 테스트 2건. 당근 편집 UI 는 PDF 도 미실사.
- **증거**: `frontend/src/App.tsx:606` — `/market/:id/edit` / `frontend/src/pages/market/MarketEdit.tsx` 실재 / `marketEditServerImagePreview.contract.test.mjs`, `marketEditUserSelector.contract.test.mjs`
- **격차**: 없음
- **Action**: 검증자가 본인 매물 상세 → 수정 → 가격 변경 → 저장.
- **Goal**: `PATCH /api/bff/market/<id>` 200 후 상세 화면 가격이 변경값으로 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F018 — AI 판매글 자동 작성

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | SKIP |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 260910 SKIP 승계. 사진 분석 기반 생성 코드 없음.
- **증거**: 워커 A grep `AI 생성|auto generat|사진 분석|이미지 분석|vision` (frontend/src/pages/market, backend/app/routers/market.py, backend/app/services) → 0건
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 0건(부재 재확정).
- **Status**: NOT-RUN
- **Feedback**: —

### F019 — 사진 기반 예상 가격

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | SKIP |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 260910 SKIP 승계. 가격 정렬/필터는 가격 추정과 무관.
- **증거**: 워커 A grep `price estimat|예상가|가격추정|시세` → 0건
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F020 — AI 스마트폰 시세

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | SKIP |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 260910 SKIP 승계. `iphone|galaxy` 매치 4건은 아이콘/브리지 코드 오탐.
- **증거**: 워커 A grep `스마트폰|아이폰|갤럭시|iphone|galaxy` → 무관 4건(`WalkieTalkieFloatingButton.tsx`, `bizCategoryIcons.ts`, `SaigonMapV5.tsx`, `native.ts`)
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 시세 조회 로직 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F021 — 업체 명의 매물 등록

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: `MarketCreate` 재사용, `location.state.profileId` → `business_profile_id`. 개인 폼 재사용이라 당근 주문 도구와 UX 다름. 전화 인증 예외 분기는 F016 참조.
- **증거**: `frontend/src/App.tsx:619` — `/biz/listings/new` → `MarketCreate` / `frontend/src/pages/market/MarketCreate.tsx:96-99,254,272` — `profileId` 초안 키·인증 분기·등록 바디 / `backend/app/routers/market.py:178,730,772,1024` — `business_profile_id`
- **격차**: 없음
- **Action**: 승인된 사업자 계정으로 `/biz/listings/new` 등록, 요청 바디 확인.
- **Goal**: 바디에 `business_profile_id` 가 채워지고 `/biz/<id>` 매물 탭에 해당 매물이 노출된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F022 — 오토바이 서류·명의 안내

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | SR 특화 |

- **코멘트**: 명의 상태(MATCH/MISMATCH/NONE)·번호판 지역 입력, MISMATCH 경고, SOLD 후 명의이전 체크리스트. 오토바이 카테고리에서만 노출.
- **증거**: `frontend/src/pages/market/MarketCreate.tsx:412-426` — 명의 상태 select·번호판 지역 / `frontend/src/pages/market/MarketDetail.tsx:385,464-469` — `paperStatus === 'MISMATCH'` 경고, SOLD 체크리스트
- **격차**: 없음
- **Action**: 검증자가 오토바이 카테고리 매물을 MISMATCH 로 등록 → 상세 확인 → 거래 완료 처리 후 상세 재확인.
- **Goal**: 상세에 서류 불일치 경고가, SOLD 후 명의이전 체크리스트 블록이 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F023 — 1대1 채팅

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 목록·상세·안읽음 배지·대화 생성 API. 전달 지연/실시간성은 미측정.
- **증거**: `frontend/src/App.tsx:630,638` — `/dm`, `/dm/:conversationId` / `frontend/src/pages/dm/DmList.tsx:51,70,92,281` — `refreshUnread`, `unreadCount` 배지 / `backend/app/routers/dm.py:241,399,519` — 대화 목록·상세·생성
- **격차**: 없음
- **Action**: 두 계정으로 DM 개설, A 가 메시지 전송 후 B 의 `/dm` 목록 확인.
- **Goal**: B 의 대화 카드에 안읽음 배지 1 이 표시되고 대화 진입 후 0 으로 갱신된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F024 — 사진·음성 소통

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 이미지 업로드 + 음성 캡슐(워키토키 딥링크 `?voice=1`). 레거시 voice 와 현재 워키토키 흐름은 별개(PDF 구분 동일).
- **증거**: `frontend/src/pages/dm/DmDetail.tsx:583` — `handleImageSelect` / `DmDetail.tsx:156-157,332-337,1494-1499` — `voiceItems`, `?voice=1`, `VoiceMessageBubble` / `frontend/src/components/dm/VoiceMessageBubble.tsx` 실재
- **격차**: 없음
- **Action**: 검증자가 DM 에서 이미지 첨부 전송, `/dm/<id>?voice=1` 진입.
- **Goal**: 이미지가 상대에게 `<AppImage>` 로 렌더되고, voice 진입 시 음성 캡슐 UI 가 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F025 — 그룹 채팅

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 팔로잉 후보 중 초대, 서버측 `require_invite_eligible` 검증, owner/member role. 아파트/모임 단위 권한 체계와 구조 다름.
- **증거**: `frontend/src/App.tsx:631` — `/dm/group/new` / `frontend/src/pages/dm/DmGroupCreate.tsx:18-20` — 팔로잉 후보 / `backend/app/routers/dm.py:1452-1481` — `create_group_conversation`, `require_invite_eligible`, `DmConversationMember` role
- **격차**: 없음
- **Action**: 검증자가 팔로우하지 않은 사용자 ID 를 포함해 그룹 생성 API 호출(curl 또는 화면 조작).
- **Goal**: 서버가 403/404 로 거절하고, 팔로잉 사용자만으로는 201 과 owner role 이 부여된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F026 — 방 안의 게시판

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 대화방 단위 게시판(목록·작성·상세) + 안읽음 카운트. 당근카페와 달리 독립 서비스가 아님(F081).
- **증거**: `frontend/src/App.tsx:634-636` — `/dm/:conversationId/board`, `/board/new`, `/board/:postId` / `backend/app/routers/dm.py:1423` — `_board_unread` / `frontend/src/pages/dm/dmBoard.contract.test.mjs`
- **격차**: 없음
- **Action**: 검증자가 그룹방 `/board/new` 에서 글 작성 → 상세 진입 → 타 멤버 계정으로 대화 목록 확인.
- **Goal**: 글이 목록·상세에 렌더되고 타 멤버 대화 카드에 게시판 안읽음 표시가 뜬다.
- **Status**: NOT-RUN
- **Feedback**: —

### F027 — 실시간 위치 공유

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | SR 특화 |

- **코멘트**: 동의 모달·초대/핀 메시지 타입·위치 채널 멤버십 서비스(강제 퇴장 포함)까지 웹+BFF 배선 완결. **실기기 실시간 마커 갱신은 네이티브 위치 브리지 의존 — Verify 는 BLOCKED 가 될 수 있다.** 서버 정밀도 정책(`none/approx/exact`) 우회 금지 가드레일 적용 대상.
- **증거**: `frontend/src/components/dm/LocationShareConsentModal.tsx` 실재 / `frontend/src/pages/dm/DmDetail.tsx:872,874` — `location_share_invite`, `location_pin` / `backend/app/services/location_channel_membership.py` (호출: `backend/app/routers/dm.py:56,1628,1652,1797`) — `force_leave`
- **격차**: 없음(웹 기준). 네이티브 실시간 동작 미검증.
- **Action**: 실기기 2대(Android 1 + iOS 1)에서 동일 DM 진입 → A 가 위치 공유 동의 → B 화면 관찰. 실기기 불가 시 BLOCKED 로 기록.
- **Goal**: A 이동 후 30초 내 B 지도의 A 마커 좌표가 갱신되고, A 가 공유 종료하면 마커가 사라진다.
- **Status**: NOT-RUN
- **Feedback**: —

### F028 — 워키토키·PTT

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | DONE |
| **PDF 판단** | SR 특화 |

- **코멘트**: 동의·채널 선택·플로팅/진입 버튼 UI 는 실재. **핵심(오디오 캡처·전송)은 `@d-modules/walkie-talkie`(`d_modules/WalkieTalkie` 서브모듈, 현재 체크아웃됨 — §4 C14) 안에 있고 워커 누구도 열지 않았다.** PARTIAL 은 "UI 만 확인"이라는 뜻. Disposition DONE: 추가 개발 요구 없음, 확인이 필요.
- **증거**: `frontend/src/components/dm/WalkieTalkieConsentModal.tsx`, `WalkieTalkieFloatingButton.tsx`, `WalkieChannelPickerSheet.tsx`, `WalkieTalkieEntryButton.tsx` 실재 / `frontend/src/App.tsx:8` — 전역 import / `frontend/package.json:19` — `"@d-modules/walkie-talkie": "file:../d_modules/WalkieTalkie/packages/client"` / `.gitmodules` — `d_modules/WalkieTalkie`
- **격차**: 네이티브 PTT 오디오 구현 미열람·미검증.
- **Action**: (1) 개발자가 `d_modules/WalkieTalkie/packages` 를 열어 오디오 송수신 진입점을 이 항목 증거에 추가, (2) 실기기 2대로 같은 채널 참여 후 PTT 송신.
- **Goal**: (1) 증거에 네이티브 진입점 `path:line` 이 추가되고, (2) 송신 기기 발화가 3초 내 수신 기기에서 재생된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F029 — 대화 번역·메시지 편집

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 확인 유보 |

- **코멘트**: 번역·수정·삭제·리액션 배선 완결. **번역은 키 미발급 시 원문 반환 stub** (`backend/app/routers/translate.py:99-109`, stub 결과는 캐시 안 함). 운영 `.env` 에 번역 키가 있는지가 실질 동작을 결정한다.
- **증거**: `frontend/src/pages/dm/DmDetail.tsx:857-867` — `handleTranslateMsg` 캐시 / `frontend/src/api/translate.ts:19-24` — `POST /translate` / `backend/app/routers/translate.py:99-109` — env→DB 키 해석, 키 없으면 stub / `DmDetail.tsx:40-43` — `editMessage`, `deleteMessage`, `addReaction`, `removeReaction`
- **격차**: 없음(코드). 키 설정 여부 미확인.
- **Action**: 운영자가 `.env` 번역 키 설정 여부 확인(값 비공개) → 검증자가 베트남어 메시지에 번역 클릭.
- **Goal**: 키가 있으면 한국어 번역문이 표시되고 `cached=false→true` 로 2회차 응답이 바뀐다; 키가 없으면 원문 그대로 반환됨을 확인하고 BLOCKED 로 기록한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F030 — 거래 약속

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | IMPLEMENT |
| **PDF 판단** | 공통 |

- **코멘트**: 제안(기존 PROPOSED supersede)→수락(매물 RESERVED)→취소(RESERVED→ON_SALE 복귀) 상태기계와 약속 카드 액션 실재. 260910 IMPLEMENT 범위(약속→목적지→ETA→길안내→알림)의 출발점. 260910 Phase 체크 완료 기록은 이 장부 Verify 로 승계하지 않음.
- **증거**: `backend/app/routers/market.py:1755-1799` — `propose_appointment` / `market.py:2252-2268` — `accept_appointment` / `market.py:2499-2524` — `cancel_appointment` / `frontend/src/pages/dm/DmDetail.tsx:23-28,646,1658,1706` — `proposeAppointment`, `acceptAppointment`, `cancelAppointment` 호출
- **격차**: 없음(약속 자체). 이동 연결 층은 F031.
- **Goal 통일 메모**: QA 장부(QA-F030-02/03/04)가 좌표 정밀도 게이트·취소/완료/차단 후 exact 차단·좌표 없는 약속을 요구해 **더 엄격** → QA 쪽으로 통일하고, 마스터의 DB 상태 전이 확인은 QA 에 없어 유지(§4-B D3).
- **Action**: (1) 실기기 2대(A·B)로 **QA-F030-01 → 02 → 03 → 04** 수행 — QA장부 §2 절차·증거 규약 따름. (2) 각 단계마다 `GET /api/bff/market/<id>` 로 매물 상태 조회(QA 장부 미포함, 이 장부 고유). (3) 엔지니어링 게이트 **P5-1**(백엔드 회귀 테스트) 0 failure 로그 — 실기기 QA 로 대체 불가(§4-B-1).
- **Goal**: 매물 상태가 ON_SALE→RESERVED→ON_SALE 로 전이되고; approx 상태에서는 길안내 CTA·외부 지도가 열리지 않으며 exact 허용 시에만 CTA 가 나타나고; 취소·완료·차단된 약속에서는 exact 목적지가 표시되지 않고; 좌표 없는 텍스트 약속은 수락되되 길안내/출발 버튼이 없고; 배송·보관·에스크로 UI 가 어디에도 나타나지 않는다.
- **Status**: NOT-RUN
- **Feedback**: —

### F031 — 만남·이동 연결

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | IMPLEMENT |
| **PDF 판단** | SR 특화 |

- **코멘트**: 채팅 좌표 → `/ride-nav?lat&lng` 이동 배선 실재. D-ROUTE-1 에 따라 모드 enum(`motorcycle/car/walking`)이 BFF 에 반영돼야 하며, HEAD 커밋 메시지("appointment travel notifications")가 이 흐름의 최신 변경이다. 탐색용 Bến Thành 폴백 좌표를 출발점에 넣으면 Stop-the-line.
- **증거**: `frontend/src/pages/dm/DmDetail.tsx:1016,1022` — `navigate('/ride-nav?...lat=&lng=')` / `frontend/src/App.tsx:687` — `/ride-nav` / `frontend/src/pages/ride/RideNav.tsx` 실재
- **격차**: 없음(배선). **미증빙**: 이동수단 선택 UI(오토바이/자동차/도보)의 `path:line` 이 이 장부 증거에 없다(§4-B D4) — QA-F031-01 은 이를 전제한다. `RideNav.tsx:68-69` 주석은 Google Routes 과금을 근거로 재탐색을 제한 — D-ROUTE-1 과 어긋남(§4 C15).
- **Goal 통일 메모**: QA 장부(QA-F031-01~07, QA-NOTI-01/02)가 3모드 UI 선택·명시적 안내 시작·출발/도착 알림 멱등·도착 임계(40m/정확도 35m/출발 선행/포그라운드)·외부 지도 인계·URL 변조·권한 거부·접근성까지 요구해 **더 엄격** → QA 쪽으로 통일(§4-B D4·D5·D8).
- **Action**: (0) 개발자가 `grep -n "walking\|car\|motorcycle" frontend/src/pages/ride/RideNav.tsx` 로 모드 선택 UI 실재를 먼저 확인해 증거에 추가(없으면 QA-F031-01 은 실행 불가 → 이 항목 격차로 기록). (1) 실기기 2대로 **QA-F031-01 → 07** 및 **QA-NOTI-01 → 02** 수행 — QA장부 §3·§5·§6 플랫폼 세트 따름. (2) 네트워크 탭에서 `GET /api/info/route?...&mode=<선택값>` 응답의 `route_mode` 가 선택값과 같은지 확인(이 장부 고유). (3) 개발자가 `RideNav.tsx:68-69` 주석을 D-ROUTE-1 기준으로 정정(C15). (4) 엔지니어링 게이트 **P4-4**(outbox/Redis/worker 장애 주입), **P5-1**, **P5-2**(URL 파서·외부 지도 guard 계약 테스트), **P5-5**(24h 관측) — **실기기 QA 로 대체 불가, 엔지니어링 증거 필요**(§4-B-1).
- **Goal**: 3개 이동수단 각각 선택 후 `경로 찾기` 시에만 위치 확인·경로 요청이 발생하고 응답 `route_mode` 가 선택값과 일치하며; 안내 추적은 명시 탭 뒤에만 시작되고 B 만 출발 알림을 1회 받으며 재시도로 중복 알림이 생기지 않고; 도착 알림은 출발 후 포그라운드에서 40m 이내·정확도 35m 이하일 때만 B 에게 1회 도착하며 문구에 원시 좌표가 없고; Google Maps 인계는 목적지·모드를 보존하고 잘못된 URL 에서는 자동 실행되지 않으며; 권한 거부·권역 밖·제공자 오류는 인라인 복구 안내만 보이고 폴백 좌표·무한 재시도가 없다. `configured:false` 면 BLOCKED 로 기록.
- **Status**: NOT-RUN
- **Feedback**: —

### F032 — 거래 진행 전용 화면

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | IMPLEMENT |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 금액 스냅샷·QR·진행 상태 화면. 수동 송금 안내 중심이며 PG 결제 아님(F033·F034). 260910 IMPLEMENT 범위이나 가드레일상 "확장·결합·재설계 금지" — 즉 여기서의 IMPLEMENT 는 검증·증거 확보 성격.
- **증거**: `frontend/src/App.tsx:637` — `/dm/:conversationId/trade/:appointmentId` / `frontend/src/pages/dm/TradeTransaction.tsx:9-19,33-45` — `fetchMarketplaceTransaction`, `registerMarketplacePaymentQr`, `confirmMarketplacePayment`, `reportMarketplacePayment`
- **격차**: 없음
- **Goal 통일 메모**: 마스터(금액·상태값)와 QA-F032-01(당사자 화면 일치·타 약속 정보 혼입 없음·결제/에스크로 CTA 부재)이 서로 다른 축에서 엄격 → **합집합**으로 통일(§4-B D6).
- **Action**: (1) 실기기 2대로 **QA-F032-01** 수행 — QA장부 §4 따름(QR·계좌 마스킹 규약 포함). (2) 약속이 2개 이상인 대화에서 각 `/dm/<id>/trade/<appointmentId>` 를 열어 정보 격리 확인. (3) 엔지니어링 게이트 **P5-1** 0 failure 로그 — 실기기 QA 로 대체 불가(§4-B-1).
- **Goal**: A·B 화면 모두에서 매물명·금액 스냅샷(매물 가격 또는 수락된 제안가)·QR 참조·진행 상태 `AWAITING_PAYMENT` 가 일치하고, 다른 약속/대화 정보가 섞이지 않으며, 앱 내 결제 실행·에스크로·자동 정산 CTA 가 없다.
- **Status**: NOT-RUN
- **Feedback**: —

### F033 — QR 등록·수동 입금 표시

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | IMPLEMENT |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 판매자 QR 등록(사설 이미지·`AWAITING_PAYMENT` 에서만)→구매자 "보냈어요"→판매자 "받았어요". **앱 내부 상태 기록일 뿐 금융기관 확인이 아님** — 코드 docstring 과 사용자 고지 문구(`tradeBoundaryNotice: "...not PSP verification or escrow"`)가 이를 명시. 운영자 콘솔은 조회+메모만(§4 C4).
- **증거**: `backend/app/routers/dm.py:913-960` — `register_payment_qr`, "This creates no payment state" / `frontend/src/pages/dm/TradeTransaction.tsx` — `reportMarketplacePayment`, `confirmMarketplacePayment` / `backend/app/models.py:1859` — `payment_status` default `AWAITING_PAYMENT` / `frontend/src/locales/en/translation.json:1024` — `tradeBoundaryNotice`
- **격차**: 없음
- **Goal 통일 메모**: 마스터(DB `payment_status` 관측)가 QA-F033-01(화면 전이만)보다 **더 엄격** → 마스터 유지, QA 의 A/B 화면 일치를 추가. **QA `PASS` 단독으로는 이 항목을 PASS 처리하지 않는다**(§4-B D7).
- **Action**: (1) 실기기 2대로 **QA-F033-01** 수행 — QA장부 §4 따름(실제 은행 송금 없이 표시만). (2) 각 단계 후 DB `SELECT payment_status FROM marketplace_transactions WHERE id=...` 조회(이 장부 고유, 필수). (3) 엔지니어링 게이트 **P5-1** 0 failure 로그 — 실기기 QA 로 대체 불가(§4-B-1).
- **Goal**: `payment_status` 가 DB 에서 3단계로 순차 전이되고, A·B 화면의 진행 상태가 매 단계 서로 일치하며, 화면에 경계 고지 문구(PSP 검증·에스크로 아님)가 항상 표시되고, 앱이 은행 송금을 실행·검증·보관하는 UI 가 없다.
- **Status**: NOT-RUN
- **Feedback**: —

### F034 — 안심결제·대금 보관

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | BLOCK |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 에스크로·자동정산 코드 없음. 유일한 관련 문자열은 "에스크로가 아님"을 고지하는 문구. 토스페이먼츠는 광고비 결제 전용. 260910 BLOCK — 제품/법무 승인 전 설계 금지.
- **증거**: `frontend/src/locales/en/translation.json:1024` — `tradeBoundaryNotice` / 워커 B grep `안심결제|escrow|Escrow` (backend/app, frontend/src) → 위 1건 외 0건
- **격차**: 기능 전체 부재(BLOCK).
- **Action**: 검증자가 `grep -rn "escrow\|PSP\|안심결제" backend/app frontend/src` 실행.
- **Goal**: 고지 문구 외 로직 0건(부재 재확정).
- **Status**: NOT-RUN
- **Feedback**: —

### F035 — 바로구매·택배 일괄 처리

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | BLOCK |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 배송지·배송비·송장 코드 없음. 260910 BLOCK.
- **증거**: 워커 B grep `택배|shipping|delivery.*fee|송장` → 무관 1건(`frontend/src/components/maps/bizCategoryIcons.ts` 아이콘명)
- **격차**: 기능 전체 부재(BLOCK).
- **Action**: 검증자가 `grep -rn "택배\|shipping\|송장" backend/app frontend/src` 실행.
- **Goal**: 배송 도메인 코드 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F036 — e쿠폰 전용 거래

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | BLOCK |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 두 갈래 쿠폰(RP 교환 `coupons.py`, 업체 발행 `biz.py`)은 모두 C2C 재판매가 아님. 레거시 CouponShop 라우트는 주석(F087). 260910 BLOCK.
- **증거**: `backend/app/routers/coupons.py:1-21` — "쿠폰/기프티콘 (RP 교환)" / `backend/app/routers/biz.py:1516` — `business_coupon` / `frontend/src/App.tsx:666` — `/shop/coupons` 주석
- **격차**: e쿠폰 리스팅 타입·사용가능 검증·정산 전체 부재(BLOCK).
- **Action**: 검증자가 `grep -n "listing_type\|category" backend/app/models.py` 로 쿠폰 리스팅 타입 유무 확인.
- **Goal**: 쿠폰 관련 리스팅 타입 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F037 — 구매자 완료 요청·이견

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | BLOCK |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C13. 완료 요청·판매자 거절·운영자 승인/거절 콘솔 실재. BLOCK 은 "당근식 구매확정·분쟁조정 제도로 확장 금지"이며 현행 기능 사용은 허용.
- **증거**: `backend/app/routers/market.py:2427-2432` — `completion_requested_by/at` / `market.py:2466-2468` — decline / `admin-frontend/src/App.tsx:153` — `/trades/completion-requests` / `admin-frontend/src/api/trades.ts:36-56` — 승인/거절 API / `frontend/src/pages/dm/completionRequest.contract.test.mjs`
- **격차**: 없음(확장 금지)
- **Action**: 구매자 완료 요청 → 판매자 미응답 → 운영자가 `/admin/trades/completion-requests` 에서 승인.
- **Goal**: 요청 건이 콘솔 목록에 나타나고 승인 후 매물 상태가 SOLD 로 전이된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F038 — 동네 피드·게시글

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 4개 라우트 + CRUD 전부. 게시글/댓글 신고는 F050 에서 확인.
- **증거**: `frontend/src/App.tsx:626-629` — `/feed`, `/feed/new`, `/feed/edit/:postId`, `/feed/post/:postId` / `backend/app/routers/feed.py:130-131,310-311,460-461,508-509` — GET/POST/PUT/DELETE
- **격차**: 없음
- **Action**: 검증자가 사진·위치 첨부 글 작성 → 타 계정 공감·댓글 → 수정 → 삭제.
- **Goal**: 각 단계가 목록·상세에 즉시 반영되고 삭제 후 상세 URL 은 404/빈 상태를 보인다.
- **Status**: NOT-RUN
- **Feedback**: —

### F039 — 피드 필터·모임 탐색

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 5종 필터(all/neighborhood/friends/hot/groups) + 그룹 탐색·생성. 추천 알고리즘·운영 정책 미비교.
- **증거**: `frontend/src/pages/feed/FeedList.tsx:25-26,77-86` — `FilterKey` 5종, 필터별 fetch / `frontend/src/App.tsx:639-640` — `/community/groups`, `/community/groups/new` / `frontend/src/pages/community/GroupList.tsx`, `GroupDetail.tsx`
- **격차**: 없음
- **Action**: 검증자가 5개 필터 탭 순회, 네트워크 탭에서 요청 파라미터 확인.
- **Goal**: 탭마다 다른 필터 파라미터가 전송되고 최소 2개 탭의 결과 집합이 서로 다르다.
- **Status**: NOT-RUN
- **Feedback**: —

### F040 — 모임 개설·가입 승인

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C10. `joinPolicy open/approval/invite`, 승인·강퇴 API 와 UI 실재. 운영진 등급 세분화는 미확인.
- **증거**: `frontend/src/App.tsx:639-641` — 그룹 라우트 3개 / `frontend/src/api/community_groups.ts:51,111,117,124` — `createGroup(joinPolicy)`, `joinGroup`, `approveMember`, `removeGroupMember` / `frontend/src/pages/community/GroupDetail.tsx:256-259` — 승인 UI / `backend/app/routers/community_groups.py` 실재
- **격차**: 없음
- **Action**: A 가 `join_policy=approval` 그룹 생성 → B 가입 요청 → A 가 멤버 탭에서 승인.
- **Goal**: B 상태가 PENDING→ACTIVE 로 바뀌고 B 화면에 게시판 탭이 열린다.
- **Status**: NOT-RUN
- **Feedback**: —

### F041 — 모임 게시판·채팅·회원

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: board/chat/members 3탭. chat 탭이 DM 그룹방으로 어떻게 연결되는지(자동 생성 vs 수동)는 Action 에서 확인.
- **증거**: `frontend/src/pages/community/GroupDetail.tsx:20` — `type Tab = 'board'|'chat'|'members'` / `frontend/src/api/community_groups.ts:144` — `listGroupPosts` / `frontend/src/App.tsx:631` — `/dm/group/new`
- **격차**: 없음
- **Action**: 검증자가 `/group/<slug>` 에서 3탭 전환, chat 탭 진입.
- **Goal**: board 는 `listGroupPosts`, members 는 멤버 API 가 호출되고 chat 탭은 실제 DM 대화방으로 이동한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F042 — 아파트 주민 인증 공간

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | SKIP |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 단지 검색·실거주 증빙·주민 채팅 없음. 일반 그룹 비공개 옵션은 대체가 아님. 260910 SKIP.
- **증거**: 워커 C grep `apartment|아파트|정부24|실거주` (backend/app, frontend/src) → 0건
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F043 — 사용자 팔로우·친구·QR

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | SR 특화 |

- **코멘트**: 4개 라우트 + QR 표시/스캔(`html5-qrcode`). **스캔은 카메라 접근 — `native.ts` 경유 규칙(navigator.* 직접 호출 금지) 준수 여부를 Action 에서 함께 본다.**
- **증거**: `frontend/src/App.tsx:648-651` — `/followers/:userId`, `/following/:userId`, `/friends/:userId`, `/friends/add` / `frontend/src/pages/profile/FriendAdd.tsx:4-5,21-22,193-218` — `QRCodeCanvas`, `Html5Qrcode`, 탭 구조 / `backend/app/routers/follows.py` 실재
- **격차**: 없음
- **Action**: 검증자가 `/friends/add` QR 탭에서 본인 QR 표시 → 다른 기기로 스캔.
- **Goal**: 스캔 기기가 상대 프로필로 이동하고 친구 요청/팔로우가 생성된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F044 — 업체 목록·지도

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: §4 C10. `/map` 공개 열람, `?view=map` 토글로 목록/지도 전환.
- **증거**: `frontend/src/App.tsx:45,592,267` — lazy import, 라우트, `PUBLIC_BROWSE_PREFIXES` / `frontend/src/pages/map/NeighborhoodMap.tsx:58,182` — `searchParams.get('view') === 'map'`, `next.set('view','map')`
- **격차**: 없음
- **Action**: 게스트로 `/map` 과 `/map?view=map` 접속.
- **Goal**: 전자는 업체 목록, 후자는 업체 핀이 있는 지도가 인증 없이 렌더된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F045 — 업체 검색·분류

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 검색·업종 그리드 화면과 `fetchBizMapItems`/`fetchBizCategories` 배선(집필자 추가 확인). 검색 품질 미검증.
- **증거**: `frontend/src/App.tsx:46,51,596,601` — `MapSearch`, `NeighborhoodCategories` / `frontend/src/pages/map/MapSearch.tsx:16,45,66` — `fetchBizCategories`, `fetchBizMapItems` / `frontend/src/pages/map/NeighborhoodCategories.tsx:5,23` — `fetchBizCategories`
- **격차**: 없음
- **Action**: 검증자가 `/map/search` 에서 업체명 일부 검색, `/map/categories` 에서 업종 1개 클릭.
- **Goal**: 검색 결과에 해당 업체가 포함되고 업종 클릭 시 그 업종 업체만 있는 결과 화면으로 이동한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F046 — 가게 상세·가격·후기

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 5탭(home/news/price/listings/reviews) — 2026-08-18 대표 재지시로 가격 탭 복원된 이력 주석 있음. 전화·채팅·공유·지도 카드 실재.
- **증거**: `frontend/src/pages/biz/BizPublic.tsx:63-65` — `DETAIL_TABS` + T-2/T-3 주석 / `BizPublic.tsx:409-428` — `handleCall`, `handleChat`, `handleShare` / `BizPublic.tsx:557-563` — 탭 렌더 / `BizPublic.tsx:588-621` — `SaigonMapV5` 지도 카드
- **격차**: 없음
- **Action**: 검증자가 `/biz/<id>` 에서 5탭 순회, 하단 CTA 전화·채팅, 헤더 공유 클릭.
- **Goal**: 5탭이 순서대로 렌더되고 전화는 `tel:` 링크, 채팅은 `/dm/<id>`, 공유는 네이티브 시트(웹은 클립보드) 가 동작한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F047 — 장소 저장·단골 소식

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: `/map/favorites`(매물 찜 `fetchWishlist` + 업체 저장 `fetchBizFavorites`), `/map/follows`(`fetchBizFollows`). 집필자가 API 배선 추가 확인. 찜과 단골은 별도 개념.
- **증거**: `frontend/src/App.tsx:48-49,598-599` — 라우트·import / `frontend/src/pages/map/MapFavorites.tsx:11,47,55` — `fetchWishlist`, `fetchBizFavorites` / `frontend/src/pages/map/MapFollows.tsx:17,34` — `fetchBizFollows`
- **격차**: 없음
- **Action**: 검증자가 업체 상세에서 저장·단골 등록 → 두 화면 진입 → 단골 해제.
- **Goal**: 각 화면에 해당 업체가 표시되고 해제 후 `/map/follows` 에서 사라지며 새 소식이 단골 화면에 나열된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F048 — 나의 장소 활동

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C7. 저장·단골·쿠폰·업체 상태·정비 후기(`/info/repair`) 5개 진입 확인. PDF-SR 의 "장소 제안 접점"은 `NeighborhoodProfile.tsx` 에 없음(사용자 제출 진입점 위치 불명). 정비 후기 범위는 당근 일반 가게 후기와 다름.
- **증거**: `frontend/src/App.tsx:47,597` — `NeighborhoodProfile` / `frontend/src/pages/map/NeighborhoodProfile.tsx:58,62,67,72,84` — `/map/favorites`, `/map/follows`, `/map/coupons`, `/biz/status`, `/info/repair` / grep `suggest|Suggest` 동 파일 → 0건
- **격차**: 장소 제안 진입점 미증빙.
- **Action**: 검증자가 `/map/profile` 렌더 확인 + `grep -rn "place.suggest\|placeSuggest\|장소 제안" frontend/src` 로 진입점 위치 판별.
- **Goal**: 5개 진입점이 렌더되고, grep 결과로 장소 제안 진입점의 실재 여부·위치가 확정돼 Impl 이 갱신된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F049 — 판매자 신뢰 정보

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 매너온도(`manner_temp`)→신뢰 등급(`trust_tier`) 산출, 매물 상세 `TrustTierChip`. 산식은 `users.py:404` 주석대로 프론트 `trustTier.ts` 와 미러링 — 양쪽 수정 시 동기화 필요(회귀 위험). 당근 산식·제재 체계와 동등성은 미비교.
- **증거**: `backend/app/routers/users.py:404,494` — 미러링 주석, `trust_tier=_get_trust_tier(user.manner_temp)` / `frontend/src/lib/trustTier.ts` 실재 / `frontend/src/pages/market/MarketDetail.tsx:362` — `<TrustTierChip tier={detail.seller.trustTier} />` / `backend/app/tests/test_user_public_profile_expansion.py`
- **격차**: 없음
- **Action**: `docker compose --env-file .env --profile backend exec -T bff sh -lc 'cd /app && python -m pytest app/tests/test_user_public_profile_expansion.py -q'` 실행 + 매물 상세에서 칩 확인.
- **Goal**: 테스트 전부 통과하고 상세 화면 판매자 영역에 신뢰 등급 칩·전화 인증 표시가 보인다.
- **Status**: NOT-RUN
- **Feedback**: —

### F050 — 차단·신고·증거

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C8. 매물·프로필·채팅·**피드 게시글/댓글** 신고, 내 신고 목록/취소, 차단 목록, 어드민 처리 API, 중복 신고 가드 테스트. PDF 의 피드 신고 미결은 코드로 해소.
- **증거**: `frontend/src/App.tsx:697` — `/settings/blocked` / `frontend/src/pages/settings/BlockedUsers.tsx` / `backend/app/routers/support.py:148-179` — 내 신고 목록·취소 / `backend/app/routers/admin_api/reports.py` — `list_reports`, `update_report_status`, `assign_report` / `frontend/src/pages/feed/FeedDetail.tsx:12-13,46-47,80` — `reportFeedPost`, `reportFeedComment` / `backend/app/tests/test_report_duplicate_guard.py`, `test_feed_block_boundaries.py`
- **격차**: 없음
- **Action**: 검증자가 매물·프로필·DM·피드 글 각 1건 신고(증거 이미지 첨부) → 같은 대상 재신고 → `/settings/blocked` 에서 차단·해제.
- **Goal**: 4개 신고가 어드민 `/admin/reports` 에 나타나고, 재신고는 중복 거절되며, 차단 해제 후 목록에서 사라진다.
- **Status**: NOT-RUN
- **Feedback**: —

### F051 — 거래 위험·금지품목

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | IMPLEMENT |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C5. 금칙어는 서버 400 + 사후 토스트만. 위험 점수는 운영자 검수 큐 정렬 전용("탐지 ≠ 차단"). 당근식 **등록 전** 경고·위험 카테고리 채팅 주의 문구 없음. IMPLEMENT 근거(집필자): 안전거래 정책과 직결되고 UI 배너 수준의 소규모 작업 — P2.
- **증거**: `backend/app/services/listing_risk.py:1-40` — 위험 점수 수식·"자동 차단 금지" 주석 / `backend/app/routers/market.py:87,845-846,1494-1540` — `banned_keywords`, `_reject_if_banned` / `frontend/src/locales/ko/translation.json:1050` — `bannedKeyword` / `frontend/src/pages/dm/DmDetail.tsx:533,991`, `DmBoardCompose.tsx:75` — 토스트 / `frontend/src/pages/market/MarketCreate.tsx:285` — `toast.error(extractDetail(...))`
- **격차**: 사전 경고 UI(작성 중 배너, 위험 카테고리 선택 시 안내) 부재.
- **Action**: 검증자가 `/market/new` 에 금칙어 포함 제목 입력 → 게시 → 반응 관찰. 이후 개발자가 사전 경고 배너 PR.
- **Goal**: 현행은 서버 400 후에만 토스트가 뜨는 것이 관찰되고(FAIL 아님 — 현재 실태 기록), PR 머지 후에는 입력 중 금칙어 감지 시 게시 전 경고가 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F052 — 사기 계좌 탐지·송금 차단

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | BLOCK |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 계좌 위험조회·FDS·송금 차단 없음. 운영자 콘솔은 "조회+메모까지만 — 플랫폼은 결제를 보증하지 않는다"(설계 주석). 260910 BLOCK.
- **증거**: `backend/app/routers/admin_api/transactions.py:1-8` — 조회+메모 한정 주석 / 워커 C grep `사기|fraud|scam|계좌.*위험|송금.*차단|remit` → 무관 2건(`admin_api/reports.py`, `guide/SafeTradeGuide.tsx`)
- **격차**: 기능 전체 부재(BLOCK).
- **Action**: 검증자가 `grep -rn "FDS\|계좌.*위험\|송금.*차단" backend/app` 실행.
- **Goal**: 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F053 — 문의·공지·FAQ

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 6개 라우트 + 티켓 CRUD/답글 API + 공지·어드민 지원 라우터. 응답 SLA 는 코드 밖.
- **증거**: `frontend/src/App.tsx:690,697,699-706` — `/guide/safe-trade`, `/settings/support(/:id)`, `/notices(/:id)`, `/faq` / `backend/app/routers/support.py:46-118` — 티켓 등록·목록·상세·답글 / `backend/app/routers/notices.py`, `admin_api/support.py`
- **격차**: 없음
- **Action**: 검증자가 `/settings/support` 에서 문의 등록 → 운영자가 `/admin/support/<id>` 에서 답글 → 사용자 상세 재확인.
- **Goal**: 답글이 사용자 `/settings/support/<id>` 에 표시되고 `/notices`·`/faq` 목록이 1건 이상 렌더된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F054 — 고객센터 AI 답변

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | DEFER |
| **PDF 판단** | 당근 확장 |

- **코멘트**: FAQ 검색은 로드된 배열에 대한 클라이언트 substring 필터(베트남어 성조 정규화 포함)이며 생성·요약 없음. 0건 시 사람 문의로 유도. LLM 호출 코드 0건. 260910 DEFER.
- **증거**: `frontend/src/pages/faq/FaqList.tsx:14-21,26,31-40,60-66,124-135` — `normalizeSearch`, `fetchFaqs`, 로컬 필터, 빈 상태→`/settings/support` / 워커 C grep `openai|anthropic|gpt|llm|embedding` (support.py, admin_api/support.py, notices.py, pages/faq) → 0건
- **격차**: 정책 기반 요약 답변 부재(DEFER).
- **Action**: 검증자가 `/faq` 검색창에 FAQ 에 없는 문장 입력.
- **Goal**: 요약 답변 없이 "결과 없음" 상태와 문의 유도 버튼만 표시된다(현행 실태 확정).
- **Status**: NOT-RUN
- **Feedback**: —

### F055 — 중고거래 분쟁 조정

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C4. 완료 요청 콘솔(F037) + 수동 QR 거래 조회·운영자 메모 콘솔(`7bac26c7`, PDF 이후). 자금 상태 변경 권한 없음. 전문 조정 인력·제도는 코드로 증명 불가 — PDF 판단 유지.
- **증거**: `backend/app/routers/admin_api/transactions.py:1-6,44-70` — 헤더 주석, `AdminTransactionDetail`, `MemoRequest` / `backend/app/tests/test_admin_transactions.py`
- **격차**: 없음(도구 범위 내)
- **Action**: `docker compose --env-file .env --profile backend exec -T bff sh -lc 'cd /app && python -m pytest app/tests/test_admin_transactions.py -q'` + 어드민에서 거래 건에 메모 등록.
- **Goal**: 테스트 통과, 메모가 상세에 표시되며 `payment_status` 변경 UI 는 존재하지 않는다.
- **Status**: NOT-RUN
- **Feedback**: —

### F056 — 업체 신청·상태·인증

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 신청(`POST /apply`)·상태·검증 문서 제출(`POST /verification` → `docs_submitted`) 배선(집필자 추가 확인). 전화 소유 확인과 사업자 실체 확인은 별도 절차.
- **증거**: `frontend/src/App.tsx:607-611` — `/biz/intro|apply|status|manage|verification` / `frontend/src/pages/biz/BizApply.tsx:14,33` — `applyBusinessProfile`, `reapplyProfile` / `backend/app/routers/biz.py:230,374,383,392` — `/apply`, `/verification`, `verification_status`
- **격차**: 없음
- **Action**: 검증자가 `/biz/apply` 제출 → `/biz/verification` 문서 제출 → 운영자가 `/admin/biz/accounts/<id>` 승인 → `/biz/status` 확인.
- **Goal**: 상태가 신청→`docs_submitted`→승인으로 순차 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F057 — 업체 관리 공간

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 라운지(프로필·후기·성과 탭) + 쿠폰·가격·광고 관리 화면. **CRM 채팅은 BizManage 에 없음**(집필자 grep `dm|chat` 0건) — 업체 채팅은 공개 프로필의 `handleChat`(F046) 으로 고객이 시작하는 일반 DM.
- **증거**: `frontend/src/App.tsx:610` — `/biz/manage` / `frontend/src/pages/biz/BizManage.tsx:23,163` — `DashboardFocus`, `performance` 탭 / `BizCouponManage.tsx`, `BizPriceManage.tsx`, `BizAdsManage.tsx` 실재
- **격차**: 없음(SR 범위). 당근식 CRM 채팅은 대상 아님.
- **Action**: 승인 사업자가 `/biz/manage` 에서 탭 순회, 쿠폰·가격·광고 진입.
- **Goal**: 각 탭·하위 화면이 에러 없이 렌더되고 성과 탭에 `BizDashboard` 지표가 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F058 — 소식 작성·관리

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 등록·수정·삭제(오너) + 공개 조회. 도달률 측정 없음(PDF 동일).
- **증거**: `frontend/src/App.tsx:615-617` — `/biz/news(/new|/:id)` / `backend/app/routers/biz.py:1309,1362,1420` — POST/PATCH/DELETE `/news` / `biz.py:1153,1257` — 공개 조회
- **격차**: 없음
- **Action**: 오너가 소식 작성 → 수정 → 단골 고객 계정으로 `/map/follows` 확인.
- **Goal**: 수정된 소식이 공개 프로필 news 탭과 단골 화면에 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F059 — 가격표·업체 매물

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 가격표 CRUD + 공개 노출 + 업체 명의 매물(F021). 주문 접수·정산 도구 없음(당근 확장, 범위 밖).
- **증거**: `frontend/src/pages/biz/BizPriceManage.tsx:1-40` — `fetchBizPublicPrices/createBizPrice/deleteBizPrice` / `backend/app/routers/biz.py:1438,1465,1497` — 조회·등록·삭제 / `frontend/src/App.tsx:619-620`
- **격차**: 없음
- **Action**: 오너가 `/biz/prices` 에서 항목 등록 → 게스트로 `/biz/<id>` price 탭 확인.
- **Goal**: 등록 항목이 공개 가격 탭에 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F060 — 가게 후기·사장님 답글

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 답글 등록·삭제, 미답변 필터, 이의제기 UI.
- **증거**: `backend/app/routers/biz.py:2019-2052` — reply PUT/DELETE / `biz.py:1864` — `get_owner_reviews` 미답변 필터 / `frontend/src/pages/biz/BizPublic.tsx:975` — appeal UI
- **격차**: 없음
- **Action**: 고객이 후기 작성 → 오너가 답글 → 오너가 이의제기 제출.
- **Goal**: 공개 reviews 탭에 답글이 표시되고 이의제기가 어드민 `/admin/reviews/<id>` 에 나타난다.
- **Status**: NOT-RUN
- **Feedback**: —

### F061 — 가게 쿠폰·단골 관리

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C1. PDF "미발견"은 기준 커밋에서 정확했고, 쿠폰은 5.5시간 뒤 `c5353e9c` 에서 추가됨. 발행(승인 업체만)→오너 목록→중단→고객 보관함(`/map/coupons`)→매장 제시 redeem 전 흐름이 API·화면 모두 연결. 260910 DONE 유지, **근거를 `c5353e9c` 로 교체**. 왕복 실행은 아무도 하지 않았다.
- **증거**: `backend/app/routers/biz.py:1515,1525,1550,1580,1611,1653,1742` — 발행·승인 검증·목록·중단·redeem·공개 목록·보관함 / `frontend/src/pages/biz/BizCouponManage.tsx:10,61` — `createBizCoupon` / `frontend/src/pages/map/MapCoupons.tsx:11` — `fetchMyBizCoupons` / `frontend/src/App.tsx:600,621` — `/map/coupons`, `/biz/coupons` / git: `c5353e9c` (2026-09-09 23:35)
- **격차**: 없음
- **Action**: 오너가 `/biz/coupons` 발행 → 고객이 `/biz/<id>` 에서 받기 → `/map/coupons` 확인 → 오너가 redeem 처리 → 오너가 발행 중단.
- **Goal**: 고객 보관함에 쿠폰이 나타나고 redeem 후 상태가 사용됨으로, 중단 후 공개 목록에서 사라진다.
- **Status**: NOT-RUN
- **Feedback**: —

### F062 — 예약·견적·포장주문

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | DEFER |
| **PDF 판단** | 당근 확장 |

- **코멘트**: DM·전화·가격표만. 260910 DEFER.
- **증거**: 워커 D grep `reservation|예약|estimate|견적|pickup.*order|포장주문` (biz.py, pages/biz) → 0건
- **격차**: 기능 전체 부재(DEFER).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F063 — 브랜드·여러 지점 통합

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | SKIP |
| **PDF 판단** | 당근 확장 |

- **코멘트**: `brand` 매치는 CSS 토큰(`--brand-500`)뿐. 260910 SKIP.
- **증거**: 워커 D grep `brand|multi.*location|다지점|franchise` → CSS 변수만
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 기능 코드 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F064 — 광고 제작·운영

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 티어·등록·목록·상세·중지·재개 6 엔드포인트, 소재→티어→게시 UI. 당근 예산 과금 모델과 다름(티어형).
- **증거**: `backend/app/routers/biz.py:431,436,465,476,489,502` / `frontend/src/App.tsx:612-614` — `/biz/ads(/new|/:id)` / `frontend/src/pages/biz/BizAdsNew.tsx:40-42,144-149` — `tierId`
- **격차**: 없음
- **Action**: 오너가 `/biz/ads/new` 소재 업로드+티어 선택 등록 → `/biz/ads` 에서 중지 → 재개.
- **Goal**: 상태가 대기→(승인 후)게시→중지→게시로 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F065 — 광고 지면·타기팅

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | DEFER |
| **PDF 판단** | 부분 대응 |

- **코멘트**: `district_id` 지역 타기팅 + 결제 상태 게이팅(`is_payment_ok`, `pending_payment` 제외) + 공개 프로필 광고 영역 플래그. 키워드/카탈로그/정밀 타기팅 없음. 260910 DEFER.
- **증거**: `backend/app/routers/biz.py:554,935` — `district_id` / `biz.py:589,599,616` — `is_payment_ok()`, `subscription_status != "pending_payment"`
- **격차**: 정밀 타기팅·키워드 광고(DEFER).
- **Action**: 검증자가 `district_id` 다른 두 광고 등록(하나는 `pending_payment`) → 각 지역 홈 접속.
- **Goal**: 결제 완료 광고만 해당 district 홈에 노출되고 다른 district 에는 노출되지 않는다.
- **Status**: NOT-RUN
- **Feedback**: —

### F066 — 광고 성과 화면

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DEFER |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 요약·시계열·노출/클릭 UI·API 배선 실재. DEFER 는 당근식 지역/키워드별 세분 보고 확장에 대한 260910 결정. 실데이터 정확성은 운영 데이터 필요.
- **증거**: `frontend/src/pages/biz/BizDashboard.tsx:23-24,162,182` — `fetchBizAdStatsSummary/Series` / `BizDashboard.tsx:58,298-307` — impressions/clicks
- **격차**: 세분 보고 없음(DEFER).
- **Action**: 광고 게시 후 검증자가 노출 화면 5회 진입·클릭 2회 → `/biz/manage` 성과 탭 확인.
- **Goal**: 시계열에 노출≥5, 클릭≥2 가 당일 데이터로 반영된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F067 — 전자계약·기간별 견적

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: §4 C9. `AdContract`(개월·금액·토큰·서명자·IP·스냅샷·기간) + 계약 텍스트 버전 스냅샷·대조(`409 contract_version_changed`). 워커 D 의 "약관 버전 부재" 지적은 집필자 grep 으로 기각.
- **증거**: `backend/app/models.py:1138-1170` — `AdContract` 필드 / `backend/app/routers/ad_contract.py:140,151,201-205,231,247,374-390` — `contract_text_version`, `presented_text_version` 대조 / `backend/app/routers/admin_api/biz_contracts.py:30-36,193-209`
- **격차**: 없음
- **Action**: 사업자 웹 `/apply` 에서 계약 동의 → DB `SELECT contract_snapshot->>'contract_text_version', accepted_at, signer_ip FROM ad_contracts WHERE id=...`.
- **Goal**: 스냅샷에 버전 문자열이, `accepted_at`·`signer_ip` 가 채워져 있다.
- **Status**: NOT-RUN
- **Feedback**: —

### F068 — 광고비 입금·카드 연동

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 은행 수동 입금 대조(`AdDeposit`, 미매칭 원장) + Toss 카드 레일 + 테스트 3종. 워커 D 는 PARTIAL 로 적었으나 코드 존재는 확인됐으므로 §1-1 원칙상 IMPLEMENTED — **실결제는 Toss 키 의존이라 Verify 가 BLOCKED 될 가능성이 높다.** 머니 경로 — 검증 우선순위 높음.
- **증거**: `backend/app/models.py` — `AdDeposit`(`contract_id` nullable) / `backend/app/services/ad_payments/rails/toss_card.py` 실재 / `backend/app/tests/test_ad_toss_config.py`, `test_ad_toss_rail.py`, `test_ad_toss_boundary.py`
- **격차**: 없음(코드). 운영 키 하 성공/실패/환불 미검증.
- **Action**: `docker compose --env-file .env --profile backend exec -T bff sh -lc 'cd /app && python -m pytest app/tests/test_ad_toss_config.py app/tests/test_ad_toss_rail.py app/tests/test_ad_toss_boundary.py -q'` + 스테이징 Toss 테스트 키로 `/apply` 카드결제 성공·실패 각 1회.
- **Goal**: 테스트 통과; 성공 시 `/apply/pay/return`, 실패 시 `/apply/pay/fail` 로 복귀하고 계약 상태가 각각 반영된다. 테스트 키 없으면 BLOCKED.
- **Status**: NOT-RUN
- **Feedback**: —

### F069 — POS·오프라인 연동

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | SKIP |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 260910 SKIP.
- **증거**: 워커 D grep `\bPOS\b|point.*of.*sale` (routers, services, pages/biz) → 0건
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F070 — 생활 정보 홈

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 날씨·침수·주유·정비 위젯 + 피드 진입. 위젯 실데이터 신선도는 각 F071–F074 에서 확인.
- **증거**: `frontend/src/pages/home/HomePage.tsx:12,16` — `weatherApi, floodApi, gasApi, repairApi`, `fetchFeed` / `frontend/src/App.tsx:595` — `/home`
- **격차**: 없음
- **Action**: 검증자가 `/home` 에서 4개 위젯 각각 클릭.
- **Goal**: `/info/weather`, `/info/flood`, `/info/gas`, `/info/repair` 로 각각 이동한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F071 — 날씨 화면

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | SR 특화 |

- **코멘트**: 위치 기반 조회. 데이터 신선도는 외부 제공자 의존.
- **증거**: `frontend/src/pages/info/InfoWeather.tsx:62` — `weatherApi.get(coords.lat, coords.lng)` / `backend/app/routers/info_weather.py` / `frontend/src/App.tsx:679`
- **격차**: 없음
- **Action**: 위치 허용 후 `/info/weather` 진입, 응답 JSON 의 관측 시각 필드 확인.
- **Goal**: 관측 시각이 현재로부터 3시간 이내이고 화면 지역명이 현 위치 구(district)와 일치한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F072 — 침수 지도·제보

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | SR 특화 |

- **코멘트**: 활성·제보·확인·지도 데이터·핫스팟 5 엔드포인트 + 마커 렌더.
- **증거**: `backend/app/routers/info_flood.py:114,168,209,306,467` / `frontend/src/pages/info/InfoFloodMap.tsx:96-141` / `frontend/src/App.tsx:680-681`
- **격차**: 없음
- **Action**: 검증자가 `/info/flood/report` 제보 → 타 계정으로 `/info/flood` 확인 → 확인(confirm) 누르기.
- **Goal**: 제보 마커가 지도에 나타나고 confirm 후 확인 수가 1 증가한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F073 — 주유소·유가

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | SR 특화 |

- **코멘트**: 근처·대기 제보·신고·오늘 유가·운영자 갱신/등록·상세 7 엔드포인트. 운영자 유가 관리는 `/admin/map/fuel-prices`(F085).
- **증거**: `backend/app/routers/info_gas.py:106,191,234,263,269,277,303` / `frontend/src/App.tsx:682` — `/info/gas`
- **격차**: 없음
- **Action**: 운영자가 `/admin/map/fuel-prices` 에서 유가 갱신 → 검증자가 `/info/gas` 및 `/home` 유가 위젯 확인.
- **Goal**: 갱신 값이 두 화면에 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F074 — 정비소·정비 후기

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 근처·제보·내 리뷰·상세·리뷰 목록·작성 6 엔드포인트 + 4 라우트.
- **증거**: `backend/app/routers/info_repair.py:68,136,159,208,287,329` / `frontend/src/App.tsx:683-686` — `/info/repair(/:shopId|/write|/reviews)`
- **격차**: 없음
- **Action**: 검증자가 정비소 상세 → `/write` 후기 작성 → `/reviews` 확인 → `/map/profile` 정비 후기 진입.
- **Goal**: 작성 후기가 리뷰 목록과 내 정비 후기에 표시된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F075 — 오토바이 길 안내

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | SR 특화 |

- **코멘트**: 경로 조회·재탐색·GPS 폴링·폴리라인. D-ROUTE-1(Valhalla 단독, 모드 enum) 적용 대상이며 F031 IMPLEMENT 와 맞물림. 네이티브 GPS·백그라운드·음성 안내 실기기 동작은 미검증 — Verify BLOCKED 가능.
- **증거**: `frontend/src/pages/ride/RideNav.tsx:22,180,211,259` — `routeApi`, reroute 카운터, `native.getDeviceUUID()`, GPS 폴링 / `backend/app/routers/info_route.py:203` — `RouteOut` / `frontend/src/App.tsx:687`
- **격차**: 없음(웹 배선). `RideNav.tsx:68-69` 주석의 Google Routes 과금 근거는 D-ROUTE-1 과 어긋남(§4 C15).
- **Action**: (1) 실기기에서 `/ride-nav?type=nav&lat=<HCMC>&lng=<HCMC>` 진입 → 경로에서 100m 이탈. (2) URL 변조·새로고침·뒤로가기·권한 거부·권역 밖·제공자 오류는 **QA-F031-05 / QA-F031-06**(QA장부 §3) 으로 실행 — RideNav 코드가 대상. (3) 엔지니어링 게이트 **P5-2**(URL 파서·API 오류 분기·외부 지도 guard 계약 테스트), **P5-5**(24h 경로 오류율·지연 관측) — **실기기 QA 로 대체 불가, 엔지니어링 증거 필요**(§4-B-1).
- **Goal**: 이탈 후 재탐색 요청이 발생하고 폴리라인이 갱신되며; 잘못된 URL 은 경로 요청·안내 시작·외부 지도 실행 없이 안전 화면에 머물고; 실패 상태는 목적지·선택 수단을 유지한 인라인 안내만 보인다. 실기기 불가 시 BLOCKED.
- **Status**: NOT-RUN
- **Feedback**: —

### F076 — 알바·구인구직

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | SKIP |
| **PDF 판단** | 당근 확장 |

- **코멘트**: §4 C12. 전용 기능 없음. `market.py` 에 "알바 파일럿" 정책 주석만 존재. 260910 SKIP.
- **증거**: `backend/app/routers/market.py:111,802` — 알바 관련 주석 / 워커 D grep `job_posting|알바|recruit|hiring` → 위 주석 2건만
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 전용 라우터·화면 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F077 — 부동산 매물·인증

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | SKIP |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 260910 SKIP.
- **증거**: 워커 D grep `real_estate|realestate|부동산|property_listing` → 0건
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F078 — 단지·시세·부동산 도구

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | SKIP |
| **PDF 판단** | 당근 확장 |

- **코멘트**: F077 과 동일 검색 범위. 260910 SKIP.
- **증거**: 워커 D grep (F077 동일) → 0건
- **격차**: 기능 전체 부재(의도적).
- **Action**: 검증자가 F077 grep 재실행.
- **Goal**: 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F079 — 자동차 전용 거래

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | SKIP |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 카테고리 트리에 `MOTORCYCLE` 만 있고 자동차 없음. 오토바이 서류 필드(F022)가 유일한 차량 관련 자산. 260910 SKIP — 오토바이 집중 제품 방향.
- **증거**: `database/init/092_marketplace_category_tree.sql:22` — `MOTORCYCLE` 노드 / `frontend/src/pages/market/MarketCreate.tsx:120,413,420-422` — `paperStatus`
- **격차**: 자동차 카테고리·검증 플로우 부재(SKIP).
- **Action**: 검증자가 DB `SELECT code FROM marketplace_categories WHERE parent_id IS NULL;` 실행.
- **Goal**: 자동차 계열 코드 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F080 — 동네걷기·방문 보상

| | |
|---|---|
| **Impl** | ABSENT |
| **Disposition** | DEFER |
| **PDF 판단** | 당근 확장 |

- **코멘트**: 만보기·보물상자 없음. 퀘스트 잔존 코드(F086)는 별개. 260910 DEFER.
- **증거**: 워커 E grep `pedometer|만보기|걸음|step_count|보물상자` (frontend/src, backend/app, engine) → 무관 1건(`test_support_suspended_ticket.py`)
- **격차**: 기능 전체 부재(DEFER).
- **Action**: 검증자가 위 grep 재실행.
- **Goal**: 기능 코드 0건.
- **Status**: NOT-RUN
- **Feedback**: —

### F081 — 관심사 카페

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | SKIP |
| **PDF 판단** | 부분 대응 |

- **코멘트**: 모임(그룹)과 DM 방 게시판이 가장 가까운 대응. 그룹과 무관한 독립 관심사 게시판 단위는 없음. Disposition SKIP(집필자): 별도 카페 서비스 신설은 제품 방향 밖, 그룹 게시판이 대체.
- **증거**: `frontend/src/pages/community/GroupList.tsx`, `GroupDetail.tsx`, `GroupCreate.tsx` / `frontend/src/pages/dm/DmBoard.tsx` / `frontend/src/App.tsx:634-641` — 그룹·게시판 라우트
- **격차**: 독립 카페 단위 없음(SKIP).
- **Action**: 검증자가 `grep -n "cafe\|카페" frontend/src/App.tsx` 실행.
- **Goal**: 카페 라우트 0건(현행 구조 확정).
- **Status**: NOT-RUN
- **Feedback**: —

### F082 — 신고·이슈·계정 관리

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 확인 유보 |

- **코멘트**: 어드민 라우트 11개 + 컴포넌트 import 확인. 당근 내부 콘솔은 비공개라 비교 불가(PDF 유보 유지). Impl 은 SR 측 코드 존재 기준.
- **증거**: `admin-frontend/src/App.tsx:142-152` — `/reports(/:id)`, `/reviews/:id`, `/issues(/weekly-summary|/reporter-trust)`, `/users(/:id)`, `/listings(/dealer-candidates|/:id)` / `admin-frontend/src/App.tsx:10-20` — 페이지 컴포넌트 import
- **격차**: 없음(SR 측)
- **Action**: 운영자가 `/admin/reports` 로그인 접속 → F050 에서 생성한 신고 건 상태 변경.
- **Goal**: 신고 건이 목록에 있고 상태 변경이 사용자 `/support/reports` 목록에 반영된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F083 — 고객지원·콘텐츠 관리

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 확인 유보 |

- **코멘트**: 지원·피드·공지·FAQ·배지·금지어 관리 라우트 전부 실재.
- **증거**: `admin-frontend/src/App.tsx:156-173` — `/support(/:id)`, `/community/feed(...)`, `/cms/notices(...)`, `/cms/faqs`, `/cms/badges`, `/settings/banned-keywords` / `admin-frontend/src/App.tsx:24-25` — `SupportListPage`, `SupportDetailPage`
- **격차**: 없음(SR 측)
- **Action**: 운영자가 `/admin/cms/faqs` 에서 FAQ 1건 추가 → 사용자 `/faq` 확인; `/admin/settings/banned-keywords` 에 단어 추가 → F051 Action 재실행.
- **Goal**: 추가 FAQ 가 사용자 화면에 보이고 추가 금칙어가 매물 등록에서 400 을 유발한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F084 — 사업자·광고·계약 관리

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 확인 유보 |

- **코멘트**: 계정·광고·계약·티어 라우트 + 계약 승인/대조 백엔드.
- **증거**: `admin-frontend/src/App.tsx:183-190` — `/biz/accounts(...)`, `/biz/ads(...)`, `/biz/contracts(...)`, `/biz/ad-tiers` / `backend/app/routers/admin_api/biz_contracts.py:388-899`
- **격차**: 없음(SR 측)
- **Action**: 운영자가 `/admin/biz/contracts/<id>` 에서 F067 계약 승인.
- **Goal**: 계약 상태가 승인으로 전이되고 사업자 `/biz/ads` 에서 광고 게시 가능 상태가 된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F085 — 분석·지도·시스템

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 확인 유보 |

- **코멘트**: 분석 6·지도 8·감사로그·시스템 3 라우트, 구 `/sre/*` 리다이렉트. **화면 존재 ≠ 실데이터** — 집계가 더미/빈값인지 확인 필요.
- **증거**: `admin-frontend/src/App.tsx:158-163` — `/analytics/*` 6종 / `App.tsx:175-182` — `/map/*` 8종 / `App.tsx:174,191-194` — `/audit-logs`, `/system/*`, `/sre/*` → `engine-settings?tab=` 리다이렉트
- **격차**: 없음(SR 측)
- **Action**: 운영자가 `/admin/analytics/overview`, `/admin/analytics/funnel` 접속 후 표시 수치를 DB 카운트(`SELECT count(*) FROM marketplace_listings`)와 대조.
- **Goal**: 화면 수치가 DB 카운트와 일치하거나 차이 원인이 설명된다(빈 화면/0 이면 FAIL 후 원인 기록).
- **Status**: NOT-RUN
- **Feedback**: —

### F086 — 퀘스트·체크 화면

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | DEFER |
| **PDF 판단** | 잠정 보류 |

- **코멘트**: §4 C11. 라우트는 활성이나 탭바 진입 없음(딥링크·직접 URL 전용, 의도적). TabBar 의 `/quests` 는 `/home` 탭 활성 표시용 매핑일 뿐. Disposition DEFER(집필자): SGR-287 마켓 피벗에 따른 숨김 — 재활성은 대표 결정.
- **증거**: `frontend/src/App.tsx:622-625` — 주석 "하단 네비 비활성(메뉴 제거). 라우트는 딥링크·직접접근용 보존" + 3 라우트 / `frontend/src/components/layout/TabBar.tsx:18` — `'/home': [..., '/quests']`
- **격차**: 메뉴 진입 없음(의도적).
- **Action**: 검증자가 하단 탭 전체 순회 후 주소창에 `/quests` 직접 입력.
- **Goal**: 탭에 퀘스트 진입이 없고 직접 입력 시 퀘스트 목록이 정상 렌더된다.
- **Status**: NOT-RUN
- **Feedback**: —

### F087 — 게임·상점·인벤토리

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | DEFER |
| **PDF 판단** | 잠정 보류 |

- **코멘트**: §4 C11. 8개 라우트(gacha 2·shop 3·inventory 2·season 1) JSX 주석, `GachaMain` import 도 주석. 워커 E 는 IMPLEMENTED 로 적었으나 도달 불가이므로 PARTIAL 로 재정렬. PDF "8개 주석"과 정확히 일치.
- **증거**: `frontend/src/App.tsx:659-660,664-666,670-671,675` — 주석 `<Route>` 8건 / `frontend/src/App.tsx:122` — `// import GachaMain` / `frontend/src/App.tsx:705` — `path="/*"` NotFound
- **격차**: 전부 비활성(의도적).
- **Action**: 검증자가 `/gacha`, `/shop`, `/inventory`, `/season` 직접 접속 + `grep -c "^\s*{/\* <Route" frontend/src/App.tsx`.
- **Goal**: 4개 URL 모두 NotFound 렌더, grep 결과 8.
- **Status**: NOT-RUN
- **Feedback**: —

### F088 — 스킬·RP·주행 통계

| | |
|---|---|
| **Impl** | PARTIAL |
| **Disposition** | DEFER |
| **PDF 판단** | 잠정 보류 |

- **코멘트**: §4 C11. 스킬트리 `display:none`(렌더 트리에는 남음), 통계 카드 CSS 숨김, GOLD/XP 지갑 API 는 Engine 경유로 살아 있음. 게임 재화이며 당근머니(결제)와 용도 다름.
- **증거**: `frontend/src/pages/profile/ProfileMain.tsx:550-552` — "SGR-287 마켓 피벗으로 임시 숨김" + `display:'none'` / `frontend/src/pages/profile/ProfileMain.module.css:871` — `.statsCard { display: none }` / `backend/app/routers/wallet.py:13-31` — `/api/wallet/me` GOLD/XP (`engine_client.get_wallet`)
- **격차**: UI 비노출(의도적).
- **Action**: 검증자가 `/profile` 육안 확인 + `curl -b <session> http://<host>:18090/api/bff/wallet/me`.
- **Goal**: 화면에 스킬트리·이번 달 통계가 없고 API 는 `gold_balance`, `xp_balance` 를 반환한다.
- **Status**: NOT-RUN
- **Feedback**: —

### F089 — 공개 소개·사업자 웹

| | |
|---|---|
| **Impl** | IMPLEMENTED |
| **Disposition** | DONE |
| **PDF 판단** | 공통 |

- **코멘트**: 단일 dist 를 호스트명으로 분기(business. 접두 → 사업자 페이지). 사업자 `/apply`·결제 반환/실패 페이지 실재. 배포는 정적 복사(`랜딩배포` 절차).
- **증거**: `landing/apps/client/src/App.tsx:68,72-74` — 사업자 호스트 `/`, `/apply`, `/apply/pay/return`, `/apply/pay/fail` / `App.tsx:70-71,79,81-82` — 일반 호스트 `/`, `/ko`, `/en` / `App.tsx:13-15` — lazy import / `landing/apps/client/src/pages/apply/Index.tsx`
- **격차**: 없음
- **Action**: 검증자가 `https://saigon-rider.com/ko` 와 `https://business.saigon-rider.com/apply` 접속.
- **Goal**: 전자는 한국어 소개 페이지, 후자는 광고 신청 폼이 렌더된다.
- **Status**: NOT-RUN
- **Feedback**: —

---

## 6. 후속 조치 큐

### 6-1. Disposition = IMPLEMENT (다음 작업 지시서)

| 우선순위 | ID | Impl | 무엇을 | 근거 | 규모 |
|---|---|---|---|---|---|
| P1 | F030–F033 | IMPLEMENTED | 260910 Phase 5(실기기 운영 증거) 완주 후 이 장부 Verify 를 PASS/BLOCKED 로 갱신. 코드 추가는 260910 잔여 체크박스 범위 내에서만. | 대표 지정 IMPLEMENT 범위. 머니 경로(F032·F033) 포함. HEAD 가 이 흐름의 최신 변경. | 검증 중심 |
| P2 | F051 | PARTIAL | 매물 작성·DM 입력 중 금칙어/위험 카테고리 **사전 경고 UI** (배너 또는 인라인 안내). 서버 차단 로직은 변경하지 않음. | 안전거래 정책 직결. 현행은 사후 토스트만. | 소 (프론트 UI + 로케일 3종) |
| P3 | F016 | IMPLEMENTED | `VerifiedSellerRoute` 리네임(예: `SellerRoute`) **또는** 전화 인증 강제를 래퍼로 이동 — 대표 택1. 업체 명의 등록의 인증 예외 정책 문서화. | 네이밍-동작 괴리(유지보수 함정). | 소 |

### 6-2. Impl PARTIAL 이나 Disposition DONE — 증거 보완이 먼저 (재판정 대상)

| ID | 무엇이 미증빙인가 | 판별 방법 |
|---|---|---|
| F014 | "판매 결과 확인" UI | Action 의 grep. 부재 확정 시 격차로 기록하고 IMPLEMENT 여부를 대표에게 질의. |
| F048 | "장소 제안" 사용자 진입점 | Action 의 grep. 다른 화면에 있으면 증거 추가 후 IMPLEMENTED 로 승격. |
| F028 | 네이티브 PTT 오디오 구현 | `d_modules/WalkieTalkie/packages` 열람 + 실기기 2대. |

### 6-3. 검증 우선순위 (Disposition DONE 중 먼저 돌릴 것)

1. 머니 경로: F068(Toss 레일 테스트 + 스테이징 결제), F067(계약 스냅샷), F061(쿠폰 왕복).
2. 신뢰·안전: F050(4경로 신고 + 중복 가드), F049(테스트 실행), F037(완료 요청 콘솔).
3. 외부 의존 조기 판별(BLOCKED 확정용): F029(번역 키), F027·F075(실기기), F085(실데이터).

---

## 7. 이 장부의 한계

1. **정적 코드 확인의 한계.** 89항목의 Impl 은 전부 파일·라인 존재와 배선 확인이다. 실기기(GPS·PTT·Live Activity·푸시), 외부 API 키(번역·Toss·라우팅 엔진·Zalo 프록시), 실서비스 데이터(매물·가게·광고 수, 분석 집계)는 코드로 판정할 수 없다. 이 한계는 PDF 40쪽이 밝힌 것과 동일하며, 이 장부도 그 위에 있다.
2. **Verify 가 전부 NOT-RUN 이라는 것은 아직 아무것도 검증되지 않았다는 뜻이다.** 61건의 IMPLEMENTED 는 "코드에 있다"이지 "동작한다"가 아니다. 대표의 신뢰 문제는 이 장부를 작성한 것으로 해소되지 않고, §6-3 순서로 Action 을 실행해 PASS/FAIL/BLOCKED 가 채워질 때 해소된다.
3. **네이티브 서브모듈은 체크아웃돼 있지만 아무도 열지 않았다**(§4 C14). F027·F028·F075 의 판정은 웹 배선 기준이다.
4. **워커 증거의 한계.** 5명의 워커는 파일 내부를 전부 읽지 않고 grep·라인 발췌로 판정한 항목이 있다(F045·F047·F048·F056 등은 라우트 레벨 증거였고 집필자가 API 배선을 추가 확인해 보강했다). 집필자 교차검증도 전 항목이 아닌 의심 항목 위주(약 20건)였다.
5. **커밋 시차.** PDF(`8c5c7493`)와 이 장부(`8d6b2e25`) 사이 15개 커밋이 있어 PDF 서술과 코드가 어긋나는 항목이 생겼다(§4 C1·C4). 이 장부 이후에도 커밋이 쌓이면 같은 문제가 재발하므로, Verify 실행 시 반드시 실행 시점 커밋 SHA 를 Feedback 에 남긴다.
6. **당근 측은 원리상 비교 불가.** 확인 유보 항목(F006·F016·F029·F082–F085)은 당근 내부 화면이 비공개라 동등성 판단이 불가능하며, 이 장부는 SR 측 실태만 판정한다. PDF 의 경고("페이지 수를 비교 점수로 쓰지 말 것")를 승계한다.
7. **QA 장부와의 역할 분담·갱신 규약.** `260911_daangn_f030_f033_user_device_qa_ledger.md` 는 초안 완성 후 2단계에서 반영했다(§4-B). 역할: **마스터(이 문서) = 무엇을 검증하나·판정·SoT**, **QA 장부 = 어떻게 실행하나·증거 규약·Verdict 기록지**. QA 장부는 F030–F033 만 다루므로 나머지 85항목의 실행 절차는 이 장부 Action 이 유일하다. 갱신 규약:
   1. QA 담당자는 QA 장부의 Verdict/Notes/Evidence 만 채운다. 마스터를 직접 수정하지 않는다.
   2. 판정자(QA 실행자와 다른 사람/세션)가 QA 장부 결과를 읽고 마스터 F030–F033 의 Status 를 갱신한다. 매핑: 케이스 전부 `PASS` **+ §4-B-1 엔지니어링 증거 첨부** → `PASS`; 하나라도 `Not met` → `FAIL`; `Feedback needed` 가 기기·권한·네트워크·제공자 등 환경 원인이면 `BLOCKED`, 그 외에는 `NOT-RUN` 유지하고 Feedback 에 사유 기입.
   3. Feedback 에는 QA 케이스 ID·실행 일시·기기·빌드 SHA·증거 경로를 적는다. FAIL 이면 §1-3 규약대로 관찰값·재현 절차·추정 원인을 적고, Impl 재판정이 필요하면 §4 에 충돌 항목을 추가한다.
   4. QA 장부 케이스가 추가·변경되면 마스터 해당 항목의 Action/Goal 을 같은 커밋에서 맞춘다. 두 문서가 어긋난 채로 두지 않는다 — 단, 마스터 Goal 은 항상 더 엄격한 쪽을 유지한다(§4-B D3~D8 원칙).
   5. F033 은 QA `PASS` 단독으로 PASS 처리하지 않는다(DB `payment_status` 관측 필수, D7).
