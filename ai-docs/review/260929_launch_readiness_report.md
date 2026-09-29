# Saigon Rider 출시 준비도 보고서

기준일: 2026-09-29 · 범위: 현재 개발 트리, 실행 중인 개발 BFF, 읽기 전용 외부 점검. 운영 공개본은 의도적으로 최신 개발본이 아니며, Android/iOS 비공개 테스트는 완료된 상태로 취급했다. 코드·설정·운영 인프라·외부 콘솔은 변경하지 않았다.

## Summary

**오늘의 판정은 HOLD다.** 개발 BFF에서 Zalo OAuth가 의존하는 베트남 VPS 프록시로 연결할 수 없어 token 교환과 프로필 조회를 수행할 수 없다. 직접 Zalo 원본은 HTTP 200이지만 프록시 경로는 timeout이며, VPS 원인은 아직 확인되지 않았다. 구 공개 운영의 health/ready 200은 이 문제나 최신 출시 후보의 증거가 아니다.

핵심 소비자 기능은 대부분 코드에 존재한다. 그러나 출시 수락에는 Zalo 복구·실제 OAuth smoke, 최신 후보 배포/복구 증적, 법무·스토어 선언, 선택적으로 위치 채널 네이티브 수명주기 검증이 남는다. 유료 광고 구매는 Core 범위에서 제외하는 것을 **권고안**으로 제시한다. 앱 안에서 같은 앱의 광고를 구매하는 CTA는 Apple 3.1.3(g)에 따라 IAP가 필요한 경로이므로, 외부 브라우저를 연다는 사실만으로 예외가 되지 않는다.

| 독립 축 | 결과 | 읽는 법 |
|---|---:|---|
| 활성 Core 여정 구현 존재 | **9 / 9 (100%)** | UI→API/상태전이가 소스에 존재한다는 수. 기능 완성도·출시율은 아니다. 퇴역 게임/RP·유료 광고는 분모에서 제외했다. |
| 이번 감사의 표적 자동 점검 | **PASS 4 / 9 (44%)** | 여정 단위의 source-contract 점검이다. E2E pass rate가 아니다. 1개는 구 모델 assertion stale fail, 4개는 이번 환경 미실행이다. |
| 광고 결제 준비 마일스톤 | **8 / 12 (67%)** | 코드 기반 준비 8개, 외부 계약·E2E·운영 증거 4개가 남았다. 출시 승인률이 아니다. |
| 운영 게이트 | **확인 2 / 부분 2 / 미검증 4 / 실패 1** | 서로 다른 증거 종류이므로 위 수치를 합쳐 단일 전체 진척률을 만들지 않는다. 실패 1은 Zalo 프록시다. |

**권고 일정(1 개발자 + 오너 QA 협업):** 유료 광고 구매 CTA를 보류/숨김하는 빠른 소비자 출시 후보는 범위 동결 뒤 **내부 5–8 인일, 약 1–2주**다. 이 추정은 새 계정 확인/등록·허가 요구가 생기지 않고 VPS·법무·스토어 접근이 즉시 가능하다는 조건이며, 주말만 제외하고 공휴일·외부 대기는 제외한다. 스토어 심사는 외부 변수라 제출/승인일을 보장하지 않는다. 기존 Toss 경로를 유료 광고에 포함하려면 Core에 **추가 4–7 인일**, 보수적으로 **합계 9–15 인일·약 2–3주**와 정책/계약 게이트가 필요하다. IAP 또는 새 현지 PG로 재설계해야 하면 이 추정과 출시일 약속은 적용되지 않는다.

| Core 5–8 인일 구성 | 기간 | 전제/완료 기준 |
|---|---:|---|
| Zalo proxy 복구와 test OAuth smoke | 0.5–1.5일 | VPS 접근 가능, proxy 수용과 token→`/me` 성공 |
| 거래세트 stale 계약 교체·2계정 E2E | 0.5–1일 | 구 assertion 제거, 현 모델 전이 PASS |
| 위치/음성 후보 실기기 수락 | 0.5–1일 | 위치 노출 시에만; 결함 수정은 QA 여유에서 처리, 숨기면 이 작업 제외 |
| 릴리스·restore·선언 증적 | 1–2일 | 격리 restore, migration/rollback, 스토어 제출 자료 |
| 범위 동결·실제 업체/UGC 수락·QA 여유 | 2.5일 | 커뮤니티/CS·오너 협업, 발견 결함은 범위 안에서만 수정 |

## 출시 결정표

| 우선 | 유형 | 오너·의존성 | 완료 기준 |
|---|---|---|---|
| **P0** | 확인된 실패 | VPS/네트워크 담당자, Zalo 프록시 | 프록시가 BFF에서 permission URL 응답을 받고, 테스트 계정 OAuth token→`/me` smoke가 성공한다. |
| **P0** | 외부 확인 | 릴리스 오너, VPS·법무·스토어 계정 | 최신 후보 배포 전 migration/rollback 지점, restore drill, 법무 문안·Play/Apple 선언을 증적으로 확인한다. |
| **P0 조건부** | 정책 | 제품·스토어 정책 오너 | 앱 안 유료 광고 구매 CTA를 포함하려면 Apple IAP 경로 또는 정책상 허용되는 별도 모델을 확정한다. 외부 브라우저만으로는 면제라고 가정하지 않는다. |
| **P0 조건부** | 네이티브 수락 | iOS/Android QA 기기 | 위치 채널 노출 시 동의→백그라운드→복귀/종료→나가기에서 좌표·Live Activity가 남지 않음을 두 플랫폼에서 확인한다. 숨기면 Core 후보에서 제외 가능하다. |
| **P1** | 코드/테스트 부채 | 프론트·백엔드 | 거래세트 계약을 현 모델로 갱신하고 판매자/구매자 2계정 E2E를 통과시킨다(0.5–1 인일). |
| **P1** | 운영 수락 | 커뮤니티·CS 오너 | 그룹 가입/탈퇴·공식방 동기화, 신고→관리자 처리, 실제 업체·쿠폰 흐름을 각 1회 수락한다. |

## 소비자 Core 플로우

| 여정 | 구현 근거 | 이번 검증·제한 |
|---|---|---|
| 가입/OAuth/동의/탈퇴·복구 | [ProfileSetup](../../frontend/src/pages/auth/ProfileSetup.tsx#L42), [동의 API](../../backend/app/routers/profile.py#L167), [탈퇴](../../backend/app/routers/users.py#L274) | `privateRouteConsentGate` 6/6 PASS. Zalo 실제 OAuth는 P0 프록시 복구 뒤 smoke가 필요하다. |
| 홈/동네지도/업체 탐색 | [라우트](../../frontend/src/App.tsx#L648), [NeighborhoodMap](../../frontend/src/pages/map/NeighborhoodMap.tsx) | `neighborhoodMapBizCap` 1/1 PASS. 실제 업체 데이터는 운영 수락 항목이다. |
| 매물 등록·검색·상세·신고/차단 | [시장 라우트](../../frontend/src/App.tsx#L666), [상세 예약 진입](../../frontend/src/pages/market/MarketDetail.tsx#L796) | `storyboardMarket` 3/3, `dmBlockSafety` 3/3 PASS. |
| DM/가격제안/약속/거래세트 | [세트 항목](../../backend/app/routers/dm.py#L2436), [판매자 상태전이](../../backend/app/routers/dm.py#L2581), [예약자 선택](../../backend/app/routers/market.py#L2021) | `tradeTransaction` 2/4, `completionRequest` 3/6 FAIL은 구 약속 종속·단일매물 source assertion이 세트 모델과 충돌한 stale 테스트다. 실제 플로우 실패로 판정하지 않고 P1로 갱신한다. |
| 물품확인/QR/신고/완료/후기 | [세트 완료](../../backend/app/services/trade_sets.py#L489), [완료 확인 UI](../../frontend/src/components/dm/TradeSetStatusSheet.tsx#L43) | Toss 심층 결제는 별도 범위. 수동 QR·신고 1쌍 E2E가 필요하다. |
| 피드/그룹/UGC 신고 | [신고 API](../../backend/app/routers/feed.py#L731), [공식방 퇴장 차단](../../backend/app/routers/dm.py#L2024) | 이번 환경 미실행. 가입·강퇴 동기화와 신고 처리 수락을 수행한다. |
| 음성/워키토키 | [세션 바](../../frontend/src/components/shell/ActiveSessionBar.tsx), [DM](../../frontend/src/pages/dm/DmDetail.tsx) | 코드 존재. 녹음 권한·백그라운드 종료/복귀 실기기 확인이 남는다. |
| 실시간 위치/목적지/나가기 | [채널 API](../../backend/app/routers/location_channels.py#L345), [런타임](../../frontend/src/components/location/useLiveLocationChannelRuntime.ts#L39) | pytest 미설치로 `test_location_channels` 미실행. 공개 노출 시 P0 네이티브 수락이다. |
| 파트너/쿠폰/후기 | [쿠폰 발행·수령·사용](../../backend/app/routers/biz.py#L1523), [수령 UI](../../frontend/src/pages/biz/BizPublic.tsx#L245) | `bizLoungeInformationArchitecture` 5/5, `couponLaunchGate` 2/2 PASS. 유료 광고 구매는 별도 선택 범위다. |

퇴역 게임/RP·가챠/상점/인벤토리는 [주석 처리된 라우트](../../frontend/src/App.tsx#L732)이며 비노출 테스트 2/2 PASS다. 이들은 출시 결손이나 Core 분모에 넣지 않았다.

## 광고 결제: 조건부 별도 범위

기존 Toss 광고 결제는 계약 스냅샷, 서버 confirm 검증, lock/멱등성, webhook remote lookup, 관리자 재동기화와 부분/전액 환불 경로를 갖는다. 실행 가능한 순수 경계 테스트는 **47 PASS**이나 DB 통합·실결제는 실행하지 않았다. DEV에서 Toss 키는 empty이고 카드 CTA는 fail-closed로 노출되지 않는다. migration 231에는 KRW 가격 6개가 있으나 운영 DB 적용 여부는 확인해야 하며, DB 값을 추정하지 않았다.

| 결제 마일스톤 12개 | 상태·근거 |
|---|---|
| 계약 link/draft 단일화 | 구현 — [`ad_contract.py:262`](../../backend/app/routers/ad_contract.py#L262) |
| VND·KRW 스냅샷 | 구현 — [`ad_contract.py:370`](../../backend/app/routers/ad_contract.py#L370), [`231 migration`](../../database/init/231_ad_tier_krw_prices.sql#L15) |
| 결제창 success/fail 복귀 | 구현 — [`Index.tsx:68`](../../landing/apps/client/src/pages/apply/Index.tsx#L68) |
| confirm/PSP 재검증/광고 활성 | 구현 — [`toss_card.py:337`](../../backend/app/services/ad_payments/rails/toss_card.py#L337), [`checkout.py:55`](../../backend/app/services/ad_payments/checkout.py#L55) |
| amount/currency/order/paymentKey 대조 | 구현 — [`toss_card.py:248`](../../backend/app/services/ad_payments/rails/toss_card.py#L248) |
| 재시도·중복·동시성 | 구현 — [`toss_card.py:360`](../../backend/app/services/ad_payments/rails/toss_card.py#L360) |
| webhook·관리자 재동기화 | 구현 — [`rails/__init__.py:32`](../../backend/app/services/ad_payments/rails/__init__.py#L32) |
| 부분/전액 환불·감사 | 구현 — [`toss_card.py:403`](../../backend/app/services/ad_payments/rails/toss_card.py#L403) |
| test/live 키·해외카드 MID | 미완료 — 외부 계약 |
| 베트남 광고주 결제 접근성 | 미완료 — 제품/외부 확인 |
| sandbox·실결제 E2E | 미완료 — DB/PSP 증적 |
| 법무·세무·환불·대사 운영 | 미완료 — 외부 문안/SOP |

**답: Toss 결제 프로세스는 이미 구현되어 있지만, API 키만으로 출시할 수는 없다.** PSP 계약·MID·실결제 증적과 스토어 정책을 먼저 통과해야 하며, IAP 또는 새 PG가 필요하다고 판정되면 추가 코드와 별도 일정이 필요하다. 현재 [`useInternationalCardOnly: true`](../../landing/apps/client/src/pages/apply/Index.tsx#L91)는 한국 발급 카드를 제외한다. 광고주의 국적과 카드 발급국은 같지 않다. 상품 가격은 VND로 보이지만 청구는 고정 KRW이며, 베트남 내수전용 카드/현지지갑의 직접 연동은 없다. 베트남 발급 국제브랜드 카드는 Toss 해외카드 계약에서 검증할 대상이다. [Toss 해외결제 안내](https://docs.tosspayments.com/guides/v2/learn/foreign-payment).

광고주는 베트남 사업자뿐 아니라 한국 사업자도 대상이다. **국적은 카드 발급국이 아니다.** Toss 해외카드 경로의 실제 가능 여부는 상점 계약, MID, 카드 발급 BIN과 카드사 심사로 정해진다. Toss 공식 안내상 해외카드 계약 등록은 통상 2영업일 이내, 이후 카드사 심사는 10–14영업일이 걸릴 수 있다. Vietnam-issued 카드/한국 발급 카드 범위, KRW MID, test/live 키는 Toss의 서면 확인이 필요하다.

Apple 정책은 같은 앱 안에서 표시되는 광고 구매를 디지털 서비스로 보고 [3.1.3(g)](https://developer.apple.com/app-store/review/guidelines/)에서 IAP를 요구한다. 따라서 외부 계약 페이지·외부 브라우저만으로 광고 구매 CTA의 정책 문제가 해소된다고 쓰지 않는다. Google Play의 결제 정책, Toss 계약 조건, 환불/세무/대사 SOP도 실제 출시 모델과 함께 확인한다.

| 광고 출시 경로 | 추가 내부 작업 | 외부 의존·수락 기준 |
|---|---:|---|
| **권고: 소비자 Core, 광고 구매 CTA 보류** | Core 5–8 인일 | 광고 계약/구매/유료 노출 CTA가 사용자에게 오인되지 않게 비노출. |
| 기존 Toss 경로를 정책상 허용되는 외부 B2B 계약으로 사용 | +4–7 인일, 합계 9–15 인일 | Toss 계약/MID·카드범위·sandbox/live E2E·환불/대사 SOP와 스토어 정책 승인. |
| IAP 또는 새 PG 재설계 | 미산정 | 제품·정책·재무 결정 뒤 별도 설계/일정. 이 보고서는 날짜를 약속하지 않는다. |

## 운영·법무·릴리스 게이트

### Zalo 장애 사실과 복구 런북

| 시각·관측 위치 | 요청 | 결과 |
|---|---|---|
| 06:59:58 UTC / 외부 | 구 공개 운영 `/api/bff/health` | 200, 79.9ms |
| 06:59:58 UTC / 외부 | 구 공개 운영 `/api/bff/ready` | 200, 80.8ms |
| 약 07:00 UTC / 외부 | proxy→Zalo permission URL (5초) | HTTP 000, connect timeout |
| 약 07:01 UTC / 외부 | 문서화된 VPS SSH TCP/22 (7초) | `No route to host` |
| 약 07:02 UTC / 개발 BFF | proxy→Zalo permission URL (12초) | `ConnectTimeout` |
| 동시 / 개발 BFF | 직접 Zalo permission URL | HTTP 200 |

따라서 구 공개 운영 liveness는 최신 후보 또는 OAuth proxy 정상 증거가 아니다. VPS 원인은 확인되지 않았고 이번 감사는 SSH/컨테이너/VPS를 수리·재시작하지 않았다.

복구는 VPS 콘솔 권한자가 (1) `systemctl status tinyproxy`, `ss -lntp`, `ufw status`로 프로세스·포트·방화벽을 확인하고, 라우팅·자격증명 설정을 확인하며, (2) BFF에서 proxy 경유 URL 응답을 재확인하고, (3) 테스트 Zalo 계정 OAuth token→`/me`를 1회 smoke하는 순서로 진행한다. 성공 증적은 비밀값 없이 시간·관측 위치·HTTP 결과만 남긴다.

| 게이트 | 상태 | 오너/의존성 | 수락 기준 |
|---|---|---|---|
| 보안 기본값, T&S/CS 코드 | 확인 | 개발·CS | 코드 경로와 신고/제재/지원 큐 존재 확인. |
| 백업, 관측/온콜 | 부분 | 운영 | 격리 restore, 실제 alert 수신·담당자/에스컬레이션 확인. |
| 최신본 배포, migration/rollback, 법무/store, native 후보 smoke | 미검증 | 릴리스·법무·스토어 | 배포 manifest/restore point, 실제 선언·서명 후보 smoke 증적. |
| Zalo proxy/OAuth | **실패** | VPS·Zalo 오너 | 위 복구 런북 3단계 통과. |

베트남 개인정보·전자상거래 분류와 스토어 선언은 법률 결론으로 단정하지 않는다. 현재 처리하는 위치/OAuth 식별자/이미지/해외 수탁 흐름을 기준으로 현지 자격 법무가 실제 문안·보존/삭제·국외 이전과 서비스 분류를 확인해야 한다.

Google Play의 앱 내·웹 계정 삭제 경로 및 Data safety 제출, Apple의 앱 내 삭제·개인정보처리방침/수집·제공·보유·삭제 설명은 외부 Console/공개 웹에서 아직 확인되지 않았다. 앱 삭제 UI가 있다고 해서 해당 선언이 충족됐다고 가정하지 않는다. [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app).

**조건부 법무 게이트 — UGC/소셜 계정 확인:** 피드·댓글·DM·그룹은 “mạng xã hội”(소셜 네트워크)로 분류될 가능성이 있다. 정보통신부는 Decree 147/2024 안내에서 게시·댓글·공유에는 전화번호 또는 개인식별 정보로 확인된 계정을 요구하고, 베트남 휴대전화가 없는 외국인에게는 대체 식별수단을 언급한다. OAuth 성공이나 연령 동의만으로 이 계정 확인 요건을 충족한다고 가정하지 않는다. 다만 2026년 일부 조항의 만료/현행 적용 범위와 이 서비스의 분류는 현지 자격 법무가 확인해야 하며, 여기서 자동 신원확인 구현이나 등록·허가 의무를 단정하지 않는다. 적용된다면 identity workflow의 추가 노력은 미산정이며, 전자상거래 등록 검토와 함께 빠른 출시 일정의 전제에 영향을 준다. [MIC 안내](https://mic.gov.vn/tu-25-12-2024-tai-khoan-mang-xa-hoi-phai-xac-thuc-so-dien-thoai-thi-moi-duoc-dang-bai-197250106101155862.htm), [Decree 147/2024 관련 법령 정보](https://vbpl.moj.gov.vn/thanhphohochiminh/Pages/vbpq-vanbanlienquan.aspx?ItemID=171689&Keyword=).

## Second-look 권고

| 권고 | 이유 | 재검토 |
|---|---|---|
| Core 출시에서는 광고 구매 CTA 보류 | **Gamma→유지:** 소비자 거래·안전과 수익결제의 외부 정책/계약을 분리한다. **Karpathy→수정:** 광고 레일을 새로 만들지 않고 CTA만 범위에서 보류한다. | Apple 정책과 B2B 결제 모델, Toss 카드 범위가 서면으로 닫히면 기존 경로를 재평가한다. |
| Zalo는 proxy health + 테스트 OAuth를 함께 수락 | **Vogels→수정:** 단일 외부 의존 timeout은 app health만으로 감지되지 않아 proxy monitor와 OAuth smoke를 추가한다. 직접 200은 proxy·자격증명을 증명하지 않는다. | proxy 수용과 OAuth smoke가 연속 통과하면 P0를 닫는다. |
| 거래세트는 재설계 대신 stale 테스트 교체 | **Gamma→유지:** 현 서버 lock·경쟁 409·예약자 선택 경계를 유지한다. **Karpathy→수정:** 구 assertion만 새 모델의 API/UI E2E로 바꾼다. | 2계정 전이 E2E가 실패하면 그 실패 경로만 수정 범위로 연다. |

## 방법·출처·한계

- 검토 시작 기준 HEAD는 `e417e743`이다. 검토 중 다른 세션의 커뮤니티 후속 변경이 유입되어 해당 변경의 회귀 검증은 본 보고서 범위 밖이며, 최종 릴리스 후보에서 재검증해야 한다.
- 입력: `/tmp/saigon-launch-flow.md`, `/tmp/saigon-launch-payment.md`, `/tmp/saigon-launch-ops.md`, 현재 소스 및 기존 출시 증적 문서.
- 실제 PASS: `storyboardMarket` 3/3, `dmBlockSafety` 3/3, `couponLaunchGate` 2/2, `privateRouteConsentGate` 6/6, `bizLoungeInformationArchitecture` 5/5, `neighborhoodMapBizCap` 1/1, Toss 순수 경계 47. 실패: `tradeTransaction` 2/4, `completionRequest` 3/6(stale assertion). 미실행: pytest 의존성 부재 및 DB/실기기/외부 콘솔 필요 범위.
- 공식 참고: [Apple App Review Guidelines 3.1.3(g)](https://developer.apple.com/app-store/review/guidelines/), [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738), [Toss 해외결제](https://docs.tosspayments.com/guides/v2/learn/foreign-payment), [Toss 다국어 결제창](https://docs.tosspayments.com/guides/v2/payment-window/integration-international), [베트남 개인정보법 91/2025/QH15](https://vanban.chinhphu.vn/?docid=214590&pageid=27160), [시행령 356/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=216387&pageid=27160).
- 한계: 이 보고서는 DB/운영 서버/VPS/결제/외부 콘솔을 변경하거나 실제 사용자 결제를 수행하지 않았다. 단일 종합 퍼센트나 스토어 승인일은 증거가 없어 제시하지 않는다.
