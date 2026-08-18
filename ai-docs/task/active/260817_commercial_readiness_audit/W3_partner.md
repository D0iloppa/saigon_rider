# W3 — 비즈니스파트너(업체·광고주) 관점 준비도 감사 (2026-08-17, HEAD 728031b)

## 0. 요약

가입→사업자 검증→매물 등록→광고 등록→(웹)계약서명→관리자 수동 입금확인→광고 게시까지 **코드 경로는 실제로 끝까지 이어져 있다** — 이 부분은 사전 배경문서(D-1 우려, ad-performance-metrics.md)가 이미 낡았고, 현재 코드가 더 진전돼 있다. 다만 두 군데가 수익을 실질적으로 막는다: ① **유료 광고의 주 노출면(피드/홈 카드)이 `ADS_ENABLED=false` 로 꺼져 있어**, 광고를 사도 광고 상세 URL 과 업체 프로필 페이지에만 노출된다(발견 유입 경로 없음). ② **성과 계측은 스키마와 조회 API·대시보드 UI 까지 다 만들어졌지만, 이벤트를 실제로 채워 넣는 파이프라인(수집 엔드포인트·워커·롤업 배치)이 전무**해 `ad_daily_stats` 가 영구히 비어 있다 — 광고주가 대시보드를 열면 항상 "심사중/집계중" 류의 빈 상태만 본다. 결제는 계좌이체+관리자 수동 승인뿐이라 스케일 안 됨. 다운로드 리포트·이메일 리포트 발송 경로는 전무.

## 1. 여정 단계별 판정표

| # | 단계 | 기능 | 판정 | 코드 근거 | 비고 |
|---|---|---|---|---|---|
| P-1a | 인지·유입 | business.saigon-rider.com 랜딩 | 🟡부분 | `landing/apps/client/src/pages/business/Index.tsx:66,89,147,190` | 마케팅 페이지+FAQ 는 완성. 모든 CTA 가 `mailto:partner@saigon-rider.com` — 웹에서 셀프 가입/신청 불가, 영업사원 응대 전제 |
| P-1b | 인지·유입 | 앱 내 업체 가입 진입점 | ✅완성 | `frontend/src/pages/biz/BizIntro.tsx:99` (`navigate('/biz/apply')`) | |
| P-2a | 가입·검증 | 신청 폼(BizApply) | ✅완성 | `backend/app/routers/biz.py:204-269`(`apply`), `frontend/src/pages/biz/BizApply.tsx:41-66` | name/category/address/phone/photo 필수, intro 선택. 1계정 최대 3프로필(`biz.py:75`) |
| P-2b | 가입·검증 | 사업자 서류 검증(별도 축) | ✅완성 | `biz.py:348-372`(`submit_verification`), `admin_api/biz.py:607-655`(승인/반려) | 승인축(status)과 검증축(verification_status) 이원화(init/151). 광고 노출 게이트는 검증축을 봄(`ad_gating.py:43-45`) |
| P-2c | 가입·검증 | 어드민 심사 큐 | ✅완성 | `admin_api/biz.py:275-344,481-538`, `admin-frontend/src/pages/biz/BizAccountListPage.tsx`,`BizAccountDetailPage.tsx` | PENDING 상단 정렬, 승인/반려/정지/그룹지정 |
| P-2d | 가입·검증 | CSV 사전등록 자동 클레임(T-7) | ✅완성 | `biz.py:148-176`(`_find_claimable_profile`),`179-201`(락+재확인),`230-241`(apply 내 클레임 분기) | 전화번호 정규화 매칭, FOR UPDATE 락으로 이중클레임 방지 |
| P-2e | 가입·검증 | 재신청 | ✅완성 | `biz.py:333-337` (REJECTED→PENDING 재전환) | |
| P-3a | 프로필 운영 | 정보수정/사진/카테고리/위치 | ✅완성 | `biz.py:301-345`(`update_profile`), `frontend/src/pages/biz/BizManage.tsx`(saveEdit/handlePhotoChange) | |
| P-3b | 프로필 운영 | 영업시간(business_hours) 편집 | ❌미구현 | `BusinessProfileApplyRequest`/`UpdateRequest`(schemas.py) 에 필드 없음 — `business_hours` 는 `AdRead`(광고용, `modules/ads/application.py:58`) 에만 존재 | 업체가 자기 영업시간을 등록할 화면·API 자체가 없다 |
| P-3c | 프로필 운영 | 소식(news) 작성/삭제 | ✅완성 | `biz.py:1190-1246`, `frontend/src/pages/biz/BizNewsCreate.tsx` | 무료 기능 |
| P-3d | 프로필 운영 | 가격표 등록 | ✅완성 | `biz.py:1279-1323`, `frontend/src/pages/biz/BizPriceManage.tsx` | 무료 기능 |
| P-3e | 프로필 운영 | 후기 응대(오너 답글) | ❌미구현 | `biz.py:1330-1441` 에 사용자 작성/재작성(upsert)만 존재, 오너 응답 필드·엔드포인트 없음 | 업체가 후기에 답글을 달 수단이 없다 |
| **P-4** | **매물 등록** | **업체 계정→매물 등록 연결** | **✅완성** | 아래 §2 참조 — `market.py:602-644`, `MarketCreate.tsx:96-99,251,269-276`, `database/init/177_marketplace_listing_business_profile.sql` | **배경문서(D-1 우려)와 달리 이미 구현되어 있다.** 2026-08-11 커밋으로 추정 |
| P-5a | 광고 상품 | 티어 정의/CRUD | ✅완성 | `admin_api/biz.py:221-256`, `database/init/149_ads_tiers.sql`,`150_ad_tier_prices.sql` | 프리미엄 499K/일반 199K VND, `exposure_weight` |
| P-5b | 광고 상품 | 광고 소재 등록(BizAd) | ✅완성 | `biz.py:410-436`(`create_ad`), `frontend/src/pages/biz/BizAdsNew.tsx` | APPROVED 프로필만 등록 가능 |
| P-5c | 광고 상품 | 어드민 심사(승인/반려) | ✅완성 | `admin_api/biz.py:687-741`, `admin-frontend/src/pages/biz/BizAdListPage.tsx`,`BizAdDetailPage.tsx` | |
| P-5d | 광고 상품 | 노출 배치(surface) | 🟡부분 | §6 참조 | 로직은 있으나 주 지면 꺼짐 |
| P-5e | 광고 상품 | 근접광고 | 🟡부분(설계·백엔드 존재, 기본 OFF) | `database/init/174_proximity_policy.sql:27`(`is_enabled DEFAULT FALSE`), `backend/app/modules/proximity/application.py` | §6 참조 |
| P-6a | 계약·결제 | 웹 포털 계약 동의(전자서명 checkbox_v1) | ✅완성 | `backend/app/routers/ad_contract.py`(전체), `landing/apps/client/src/pages/apply/Index.tsx`, `database/init/176_ad_contract_web_gate.sql` | Apple 3.1.3(g) 회피 목적. IP·서명자명·시각 기록 |
| P-6b | 계약·결제 | 앱→웹 핸드오프 | ✅완성 | `frontend/src/pages/biz/BizManage.tsx:213-223`(`handleContractLink`) → `POST /biz/ads/{id}/contract-link`(`biz.py`/`ad_contract.py:83-95`) → `native.openExternalUrl` | |
| P-6c | 계약·결제 | 결제수단 | 🟡부분 | `ad_contract.py:42-44`(`_BANK_TRANSFER_INFO_PLACEHOLDER`), `modules/ads/application.py:426-435`(`activate_subscription`) | **계좌이체 오프라인 + 관리자 수동 확인뿐.** 결제 게이트웨이 없음. 안내 문구도 플레이스홀더("담당자가 카카오톡/이메일로 계좌번호를 안내") |
| P-6d | 계약·결제 | 구독 활성화 | ✅완성(수동) | `admin_api/biz.py:770-790`(`activate_biz_ad_subscription`) | 관리자 전용, 1건씩 수동 |
| P-6e | 계약·결제 | 갱신/자동결제 | ❌미구현 | 코드 전체에서 정기결제/자동갱신 로직 없음 (grep 무결과) | 매월 재확인 프로세스가 코드화돼 있지 않음 — 수작업 추정 |
| P-6f | 계약·결제 | IAP 리스크 회피 | ✅완성 | `ad_contract.py:1-9` 주석 — 계약/결제안내를 앱 밖 웹으로 뺀 설계가 그대로 구현됨 | |
| P-7 | 성과 측정 | §7 참조 | 🟡부분(스키마+조회+UI 완성, 파이프라인 없음) | | |
| P-8 | 정산·세금 | 인보이스/VAT/세금계산서 | ❌미구현 | 코드 전체 grep 무결과(`invoice`, VAT 계산 로직, 세금계산서 필드 전무). `BizApply`/`BizAccountCreateRequest` 에 사업자등록번호·세금 필드 없음(서류는 이미지 업로드 검증용일 뿐) | |
| P-9 | 고객지원 | 업체 전용 문의 채널 | 🟡부분 | `frontend/src/pages/biz/BizIntro.tsx:19`,`BizStatus.tsx:9`(`SUPPORT_EMAIL`) | 이메일 안내뿐 — 티켓 시스템·FAQ 인앱 화면 없음(랜딩 FAQ 는 있음) |

## 2. 최우선 확인 — 업체의 매물 등록 경로

**결론: 있다. 배경 문서(`260810_merchant_onboarding_with_listings_pricing.md`)의 "phone_verified_at 강제로 업체↔매물이 끊겨 있다"는 우려는 현재 코드에서 더 이상 사실이 아니다.** 코드 주석(`market.py:602-608`)이 스스로 "T-1: 업체 오너 계정도 매물 등록 시 개인 셀러와 동일한 인증 규칙을 강제했었으나, 지금은 검증된(APPROVED) 프로필로 신청하면 예외를 둔다(2026-08-11, 대표 지시로 추정)"라고 밝힌다.

- **DB 스키마**: `marketplace_listing.business_profile_id UUID REFERENCES business_profile(id)` — `database/init/177_marketplace_listing_business_profile.sql:12`. `docker-compose.yml` `bff_migrate` command 에 `-f /migrations/177_marketplace_listing_business_profile.sql` 실행 등록 **확인됨**(파일만 있고 미등록인 사례가 아님).
- **BFF**: `backend/app/routers/market.py:602-644`(`create_listing`) — `body.business_profile_id` 가 주어지면 (a) 소유권+`status='APPROVED'` 검증, (b) 프로필 단위 FOR UPDATE 락 + 활성 매물 상한(`_BUSINESS_LISTING_CAP`) 검사, (c) `seller.phone_verified_at` 요구를 **건너뜀**(`market.py:631-633`: `if business_profile is None and seller.phone_verified_at is None`).
- **프론트**: `frontend/src/pages/biz/BizManage.tsx:503-511` — "매물 등록" 행 → `navigate('/biz/listings/new', { state: { profileId, profileName } })`. 라우팅은 `App.tsx:544` `/biz/listings/new` → `<PrivateRoute><MarketCreate /></PrivateRoute>` (개인 매물 경로 `/market/new` 는 `VerifiedSellerRoute` 로 감싸져 폰인증을 강제하지만, 업체 경로는 감싸지 않음 — 의도적 분기).
- **MarketCreate.tsx**: `location.state.profileId` 를 `businessProfileId` 로 읽어(`96`), 제출 시 `businessProfileId` 를 요청 바디에 포함(`269`)하고, `businessProfileId` 가 있으면 폰인증 안내 리다이렉트 로직을 우회(`251,276`).
- **테스트**: `backend/app/tests/test_market_listing_edit_withdraw.py::CreateListingBusinessCapTest` (5건 상한, 6번째 422) — 업체 매물 상한 로직이 테스트로 커버됨.

**남은 갭**: 매물이 업체 소유임을 구매자에게 보여주는 표시(`business_name`, `get_listing` 응답에 존재 — `market.py`)는 있으나, 업체 매물을 광고 성과(§6/§7)와 연결하는 지표는 없음(매물 조회수는 `marketplace_listings.view_count` 뿐, 광고 이벤트와 별개).

## 3. 수익 경로 종단 점검

| 관문 | 상태 | 근거 |
|---|---|---|
| 인지 | 🟡 랜딩은 있으나 셀프 신청 불가(메일 응대 전제) | `business/Index.tsx` |
| 가입 | ✅ | §1 P-2 |
| 사업자 검증 | ✅ | §1 P-2b |
| 매물 등록(부업 수익) | ✅ | §2 |
| **광고 상품 신청** | ✅ | §1 P-5a/b |
| **광고 심사** | ✅ | §1 P-5c |
| **계약 서명(웹)** | ✅ | §1 P-6a/b |
| **결제** | 🟡 완전 수동(계좌이체+관리자 1건씩 확인) — 스케일 안 됨, 자동 갱신 없음 | §1 P-6c/e |
| **노출(serving)** | 🔴 **끊김** — 주 지면(피드/홈) `ADS_ENABLED=false`. 광고 URL 을 직접 아는 사람/업체 프로필 방문자만 봄 | §6 |
| **성과 확인(reporting)** | 🔴 **끊김** — 대시보드 UI 는 있으나 데이터 파이프라인 부재로 항상 빈 상태 | §7/§8 |
| 정산/세금 | ❌ | §1 P-8 |

**한 줄 결론**: 광고주가 결제까지는 실제로 할 수 있는 코드 경로가 있다(그것도 놀랍도록 완성도 높게). 그러나 **돈을 낸 뒤 "내 광고가 보이고 있다"는 것도, "효과가 있었다"는 것도 지금 코드로는 증명할 수 없다** — 신뢰 기반 재구매가 불가능한 상태.

## 4. 상용 차단 등급

- **P0 (이게 없으면 수익 0 또는 재구매 0)**:
  - `ADS_ENABLED=false` 로 유료 광고 주 노출면(S1~S4)이 전부 꺼짐(§6) — 광고를 사도 "발견"되지 않음
  - 성과 계측 파이프라인 부재(§7) — 광고주가 대시보드를 열어도 영구히 0/빈 상태. "돈 낸 게 아깝다" 체감으로 직결(대표가 명시적으로 지적한 리스크, `ai-docs/spec/ad-performance-metrics.md:5`)
  - 결제가 전량 수동(계좌이체+관리자 확인) — 광고주 수가 늘면 운영 병목. 자동 갱신 없음 → 매월 수작업 리마인드/재확인 필요(코드에 없음)
- **P1**:
  - 다운로드/이메일 리포트 없음(§8) — 대표가 명시 요구한 항목
  - 영업시간 편집 불가, 후기 답글 불가(§1 P-3b/e)
  - 인보이스/VAT/세금계산서 전무(§1 P-8) — 베트남 법인 광고주 정식 거래 증빙 불가
- **P2**:
  - 랜딩이 셀프 신청 불가(메일 응대만) — 영업 인력 의존
  - 업체 전용 지원 채널이 이메일뿐

## 5. 광고 노출(serving) 현황

**노출 지면(surface) — 코드/설계 기준 8종, 실제 CHECK 제약은 자유 문자열(`VARCHAR(24)`, CHECK 없음 — `database/init/153_ad_events.sql:17`).** 지면 카탈로그는 아직 이벤트가 안 쌓이므로 코드상 "정의"만 확인:

| 지면 | 근거 | 현재 활성? |
|---|---|---|
| 마켓 메인 피드 중간 카드 | `frontend/src/pages/market/MarketMain.tsx` (`AdCard`) | ❌ `ADS_ENABLED=false` |
| 마켓 메인 상단 고정 1건 | 동일 | ❌ |
| 홈(WorldMapV2) 상품카드 슬롯 | `frontend/src/pages/home/HomePage.tsx`/`WorldMapV2` | ❌ |
| 홈 근처상품 빈상태 대체 | 동일 | ❌ |
| 광고 상세 `/market/ad/:id` | `AdDetail.tsx` | ✅ (직접 URL/딥링크로만 도달) |
| 공개 비즈프로필 광고 목록 `/biz/:id` | `biz.py:1110-1148`(`get_public_profile` → `profile_public_ads`) | ✅ |
| 동네지도 업체 핀 | `biz.py:964-1040`(`get_public_map`) | ✅ 이지만 **광고 무관**(APPROVED 프로필 전체, 티어와 무관) |
| 근접광고(proximity) | `backend/app/modules/proximity/application.py` | ❌ `proximity_policy.is_enabled=FALSE`(기본값, `174_proximity_policy.sql:27`) |

**선택 로직 — 실제 함수 확인(`backend/app/services/ad_exposure.py`):** 결정적(deterministic) **smooth weighted round-robin**. `weight = max(1, tier.exposure_weight) * max(1, ad.ad_fee)`(`ad_exposure.py:18`). `ad_fee` 는 `149_ads_tiers.sql` 말미에서 전 행 1로 정규화돼 있어 사실상 **티어 가중치만** 순서를 결정한다. **경쟁/입찰 개념 없음** — 게이트(`launching_ad_conditions`, `ad_gating.py:26-50`: APPROVED+is_active+게시기간+검증 파트너)를 통과한 광고는 **전부 시퀀스에 포함**되고, 가중치가 높을수록 시퀀스 안에서 더 자주 등장할 뿐(최대 120건 반복 시퀀스, `MAX_SEQUENCE_LENGTH`). 즉 "낙찰"이 아니라 "다 보여주되 비율만 조정"하는 방식.

**인벤토리 배분**: 위와 동일 — 광고주가 많아져도 전부 시퀀스에 들어간다. 슬롯 부족으로 밀려나는 광고가 없다(공급 제약이 설계에 없음 — 광고 지면이 무한하다고 가정한 모델).

**빈도 제한(frequency cap)/쿨다운**: **일반 광고(S1~S6)에는 없다.** `ad_exposure.py`/`ad_gating.py` 어디에도 사용자별 노출 횟수 제한이 없다. **근접광고만 있다** — `proximity_policy.cooldown_hours DEFAULT 24`, `daily_notify_cap DEFAULT 2`(`174_proximity_policy.sql:22,23`), `proximity_hit` 테이블로 상태 추적(`ProximityApplication.find_candidate`/`find_candidates_near`, `application.py:85-153`).

**타겟팅 축**: `district_id`(지역, `ads/application.py:217-225` `public_ads(district_id)` — 요청구 일치 또는 전체구 NULL)만 실재. **카테고리 매칭·시간대·사용자 속성 타겟팅은 코드에 없다.**

**킬스위치·게이트 현재 상태(HEAD 728031b 기준)**:
- 전체 광고 노출 on/off: `frontend/src/lib/adPlacement.ts:18` — `export const ADS_ENABLED = false;` → **꺼짐**. 주석: "광고 노출 시기상조 — 대표 지시(2026-07-25)"
- 근접광고: `proximity_policy.is_enabled` 기본값 `FALSE`(DB row, `174_proximity_policy.sql:27-29`) → **꺼짐**
- 검증 게이트: `verification_status != 'verified'` 인 파트너의 광고는 소유 프로필이 있으면 무조건 노출 제외(`ad_gating.py:37-49`) — 이건 킬스위치가 아니라 상시 불변식

## 6. 광고 효과 측정(measurement) 현황 — ad-performance-metrics.md 체크리스트 재검증표

**DB(4건) — 재검증 결과: 2건 완료, 2건 미착수.**

| ID | 항목 | 2026-07-26 문서 상태 | 2026-08-17 재검증 |
|---|---|---|---|
| D-1 | `ad_events` 테이블+인덱스4종 | 미구현 | **✅완료** — `database/init/153_ad_events.sql` 존재 **+** `docker-compose.yml` bff_migrate 에 `177` 이전 `153` 등록 확인(파일+등록 둘 다). 단, 파일 자체 주석(`153_ad_events.sql:4-6`)이 "데이터 모델만 생성, 수집 엔드포인트/워커는 후속 단계"라고 명시 |
| D-2 | `ad_daily_stats` 테이블 | 미구현 | **✅완료** — `database/init/154_ad_daily_stats.sql`, 등록 확인. `backend/app/routers/biz.py:489-491` 주석: "수집·롤업 파이프라인은 후속 단계라 지금은 항상 빈 결과(0)가 정상" |
| D-3 | 90일 보존 삭제 배치 | 미구현 | **❌미구현** — `backend/app/jobs/` 에 관련 파일 없음(grep 무결과) |
| D-4 | 월 파티셔닝 전환 | 미구현 | **❌미구현**(트리거 임계값 미도달 — 애초에 데이터가 없음) |

**BFF(12건) — 재검증: 2건 완료(조회 API), 나머지 10건 미착수.**

| ID | 항목 | 재검증 |
|---|---|---|
| B-1 | `POST /market/ads/events` 수집 엔드포인트 | ❌미구현 (grep 무결과 — 라우터 전체에 없음) |
| B-2 | 필터 파이프라인(자기노출/dedup/nonce검증) | ❌미구현 (B-1 부재로 대상 자체 없음) |
| B-3 | 서버판정 CTA 훅(follow/favorite/review 3곳 이벤트 적재) | ❌미구현 — `biz.py:1460-1551`(favorite/follow), `1404-1441`(review) 어디에도 `ad_events`/`noti_events.enqueue("ad...")` 적재 없음 |
| B-4 | 어트리뷰션(클릭→CTA 24h 귀속) | ❌미구현 |
| B-5 | `ad:events` Redis Stream + 컨슈머 워커 | ❌미구현 — `backend/app/ad_worker/` 디렉터리 없음(noti_worker 만 존재) |
| B-6 | 신규 엔드포인트 레이트리밋 | ❌미구현(대상 엔드포인트 자체가 없음) |
| B-7 | 롤업 잡(5분 증분+00:20 전일 확정) | ❌미구현 — `backend/app/jobs/rollup_ad_stats.py` 없음. **대신 `backend/scripts/seed_ad_daily_stats.py`(DEV 전용 수동 시드 스크립트)가 존재** — 자체 주석(`8-11`): "rollup_ad_stats 배치가 아직 없어 ad_daily_stats 가 항상 비어 있고 대시보드가 늘 0/no_ads 로만 보여 차트를 눈으로 검증할 방법이 없다"(개발자가 직접 이 공백을 인지·우회 중이라는 정황 증거) |
| B-8 | `GET /biz/ads/{id}/stats` 광고 단건 조회 | 🟡부분 — 단건 전용 엔드포인트는 없으나 `ad-stats-series` 응답의 `by_ad`(`biz.py:769-786`)로 프로필 내 광고별 분해는 제공 |
| B-9 | `GET /biz/profiles/{id}/ad-stats-summary` | **✅완료** — `biz.py:533-636`. 상태머신(`no_ads/pending/warming_up/low_sample/normal`), CTR/CVR/CPM/CPC/CPA 계산, `MIN_SAMPLE_FOR_RATIO=100` 게이트(`biz.py:81`) 전부 구현. **다만 입력인 `ad_daily_stats`/`AdDailyStat` 가 항상 0행이므로 로직은 맞아도 실사용 시 산출값이 없음** |
| B-10 | 관리자 랭킹/self_impressions/원시감사 | ❌미구현 |
| B-11 | 익명 비중 모니터링 | ❌미구현 |
| B-12 | 엔진 Anti-Abuse 위임 | ❌미구현(P3, 의도적 보류) |

**추가로 `ad-stats-series`(`biz.py:639-811`)도 B-9 와 별도로 완전 구현돼 있음** — 문서에 없던 항목이지만 일별 시계열+기간비교+광고별 분해까지 구현된 상태. 즉 **조회 계층(BFF read API)은 문서 작성 시점(7/26) 이후 상당히 진전**됐으나, 그 아래 파이프라인(B-1~B-7)은 그대로 0.

**프론트(13건) — 재검증: 2건 완료(대시보드 UI, i18n), 나머지 미착수 또는 전제조건(F-1) 미해결.**

| ID | 항목 | 재검증 |
|---|---|---|
| F-1 | `ADS_ENABLED` 재개 | ❌ 여전히 `false`(`adPlacement.ts:18`) |
| F-2 | `useAdImpression` 노출 계측 훅 | ❌미구현(`frontend/src/hooks/` 에 파일 없음) |
| F-3 | 클릭 이벤트 전송 | ❌미구현 |
| F-4 | 전화 CTA 이벤트 전송 | ❌미구현 |
| F-5 | 대시보드 광고 성과 섹션 | **✅완료** — `frontend/src/pages/biz/BizDashboard.tsx`(전체) — `fetchBizAdStatsSummary`/`fetchBizAdStatsSeries` 연동, 트렌드 차트(`renderTrend`), 광고별 분해(`renderByAd`), 지출액(`renderSpendValue`) 렌더링 로직 전부 존재. 문서(7/26) 작성 당시 "대시보드에 광고 성과 한 줄도 없다"였던 것과 달리 **현재는 UI 골격이 완성**돼 있음 |
| F-6 | 빈 상태 A~G 분기 | **✅완료** — `BizDashboard.tsx:423-471` 에서 `no_ads`/`pending`/`warming_up` 상태 분기, `470-472` 에서 `low_sample`(표본 미달, D) vs `normal` 분기까지 확인(`seriesData.totals.impressions < seriesData.minSampleForRatio ? 'low_sample' : 'normal'`) |
| F-7 | 기간선택+증감 표시 | **✅완료** — 기간선택(7d/14d/30d, `RANGES`, `BizDashboard.tsx:32`), 증감 표시 `renderDelta(...)` 가 노출/클릭/문의 각각에 대해 `previous` 대비 렌더(`BizDashboard.tsx:484,492,500`) |
| F-8 | 퍼널 3단 바 | 미확인 |
| F-9 | Secondary CTA 이벤트 | ❌미구현 |
| F-10 | i18n 라벨 | ✅완료로 추정 — `biz.*` 키가 `t('biz.adStatusPending', ...)` 식으로 이미 전면 사용 중(BizManage.tsx 전역), 신규 대시보드 문자열도 동일 패턴 사용 확인 |
| F-11 | 관리자 콘솔 광고 성과 화면 | ❌미구현 — `admin-frontend/src/pages/biz/BizAdListPage.tsx`,`BizAdDetailPage.tsx` 를 "impression/클릭/click/노출" 키워드로 확인한 결과 **매치 0건** — 노출/클릭 등 성과 열이 전혀 없음(심사 큐 전용 화면) |
| F-12 | 면별 분해 아코디언 | 미확인 |
| F-13 | 길찾기 CTA | ❌미구현(설계 자체가 신규 기능 제안 단계) |

**정책(5건) — 전부 그대로 미해결.** X-1(ADS_ENABLED 재개 결정)·X-3(CPM/CPC/CPA 노출 여부)·X-5(개인정보 처리방침 문구) 모두 코드 근거 없음(대표 결정/법무 사안이므로 코드로 확인 불가 항목).

**광고비(과금액) 데이터 연결**: `monthly_price_snapshot_vnd`(신청 시점 티어가 스냅샷됨, `marketplace_ads` 컬럼) 와 게시기간(`starts_at`/`ends_at`)으로 `_ad_spend_for_period()`(`biz.py:517-530`)가 기간 안분 계산 — **이 산식 자체는 완성돼 있다.** CPM/CPC/CPA 계산 로직(`biz.py:600-611,789-795`)도 완성. 문제는 분모(노출/클릭/CTA)가 항상 0이라 산출식이 실행은 되지만 의미 있는 숫자를 내지 못함.

**봇/자기노출/중복 필터**: 설계(§3-3, `ad-performance-metrics.md`)만 있고 코드 없음 — 수집 엔드포인트 자체가 없으므로 필터를 걸 대상이 없다.

## 7. 광고주 리포팅(reporting) 현황

- **로그인 후 성과를 보는 화면 — 존재한다, 앱(in-app)에만.** `frontend/src/pages/biz/BizDashboard.tsx`, 호스트 탭 `BizManage.tsx:306-307`("대시보드" 탭). **웹 포털(business.saigon-rider.com)에는 없다** — 웹 포털은 `ad_contract.py`/`landing/.../pages/apply` 하나뿐이고 그 용도는 계약서명이지 성과 조회가 아니다. business.saigon-rider.com 홈(`business/Index.tsx`)에는 로그인 기능 자체가 없다(정적 랜딩).
- **다운로드 가능한 리포트(PDF/CSV) — ❌ 없다.** 코드 전체에 PDF/Excel 생성 라이브러리 미설치(`reportlab`/`weasyprint`/`pdfkit`/`openpyxl` 등 requirements 에 전무), CSV export 엔드포인트도 광고 도메인에 없음.
- **정기 이메일 리포트 발송 — ❌ 없다.** 이 코드베이스에는 **이메일 발송 인프라 자체가 없다**(`smtplib`/`sendgrid`/SES 클라이언트 grep 전무) — 알림은 전부 인앱 push/`noti_events` 경유이지 이메일이 아니다. 만들려면: (a) 이메일 발송 채널 신규 구축(현재 0 → 벤더 선정+SDK 통합 필요), (b) 리포트 본문 생성(HTML 템플릿 또는 PDF), (c) 스케줄러 — 이건 이미 있음(`AsyncIOScheduler`, `backend/app/main.py:63,75` — `repair_shop_stats`/`flood` 잡에 이미 사용 중이라 패턴 재사용 가능), (d) 구독자(광고주) 목록·발송 주기 설정 UI. 즉 **스케줄러 인프라만 재사용 가능하고, 이메일 채널·리포트 생성 로직은 전무.**
- **빈 상태 처리(노출 0일 때)** — `BizDashboard.tsx` 에 `no_ads`/`pending`/`warming_up` 상태 분기가 실제로 구현돼 있어(§6 F-6/F-5) `ad-performance-metrics.md` §7-3 설계의 A~C 는 코드로 반영됨. 다만 **문제는 이 분기가 정상 동작해도 결국 항상 이 빈 상태들만 보인다는 것**(D~E 상태, 즉 표본 100 이상의 "정상" 리포트에 도달할 데이터 자체가 파이프라인 부재로 생길 수 없음). 관리자 콘솔(`admin-frontend`)에는 이 성과 화면 자체가 없다(F-11 미구현).

## 8. 미검증으로 남긴 것

- `BizDashboard.tsx` 전체를 라인 단위로 다 읽지 못함 — F-6/F-7 은 추가 grep 으로 구현 확인했으나, F-8(퍼널 3단 바), F-12(면별 아코디언), 게시중지(F) 분기 구현 여부는 파일 일부(grep 매치 주변)만 확인. **추정 아님 — 파일 전체 미열람으로 인한 실제 미확인.**
- `ad_events.surface` 값 카탈로그는 CHECK 제약이 없어(자유 `VARCHAR`) 코드가 실제로 어떤 문자열을 쓸지는 **아직 아무 코드도 이 컬럼에 INSERT 하지 않으므로 확정값이 없음** — §5 표는 설계문서(`ad-performance-metrics.md` §1-C)의 지면 카탈로그를 코드상 노출 지면과 대조한 것이지, DB 에 실재하는 값이 아님.
- 웹 포털(business.saigon-rider.com)에 로그인/대시보드 기능이 앞으로도 없을 설계 의도인지, 아니면 doil-context 티켓(`2026-08-10-biz-web-contract-portal`)의 다음 범위인지는 **티켓 원문을 조회하지 못해 미확인**.
- 결제 계좌이체 안내 문구가 실제 운영에서 플레이스홀더 그대로 나가는지, 아니면 어드민이 카카오톡/이메일로 별도 안내하는 수작업 프로세스가 이미 있는지는 **코드 밖 운영 프로세스라 확인 불가**.
- 세금계산서/VAT 관련 베트남 법적 요건은 **법률 검토 사안**이라 코드 감사 범위 밖 — 요건 자체를 조사하지 않음(요구되는지 여부조차 미확인).
- `admin-frontend` 의 `BizAdListPage`/`BizAdDetailPage` 를 라인 단위로 다 읽지 않아, 성과 열(impressions 등)이 정말 없는지는 grep 기반 정황 판단(파일에 "impression"/"클릭" 관련 컬럼 렌더 코드가 안 잡힘)이며 100% 확정은 아님.
