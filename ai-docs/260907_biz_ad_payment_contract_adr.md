# ADR — 비즈니스 광고 전자계약 · 결제 레일 · 과금 모델 결정 (2026-09-07)

> ## ⚠️ 결제 레일 결정 변경 (2026-09-07, 대표 확정) — 아래 "PG 유보" 결론을 대체한다
>
> **토스페이먼츠(Toss Payments) 채택.** 이 문서는 "한국 법인만 있어 VN PG 직가맹 불가 → PG 유보, 계좌이체+수동승인 유지, Stage 2 에 2C2P 검토" 로 결론냈으나, 토스페이먼츠로 **베트남 소비자 → Visa/Master 해외카드 → 토스페이먼츠 → 한국 법인 정산** 경로가 성립함이 확인됐다. 한국 법인 제약을 우회하는 경로이므로 Stage 2 의 PG 후보(2C2P 등) 비교는 **무효**다.
>
> - **가입 상태(2026-09-07)**: 신청 주체 블루어반(사업자등록번호 1052933544), 상태 **"결제 대기"** — 가입비 결제 후 심사, **승인 시 API 키 제공**. 비용: 상점비 + 연 11만원 + 가맹비 22만원. 담당 이재훈 대표.
> - **가능/불가(사전 조사)**: 한국 사업자·법인의 베트남 대상 쇼핑몰 → 가능성 높음 · 베트남 고객 해외카드 → **가능** · USD 결제 → 별도 외화결제 계약 · PayPal → 추가 계약 · VN 현지법인 직접 PG → 어렵거나 별도 심사 · **VND 직접 결제·현지 은행 정산 → 토스 해외결제 구조와 안 맞음**.
> - **미해결 쟁점**: tier 가격이 VND 확정(일반 199,000/월 등)인데 VND 직접 결제가 불가하다. **표시 통화(VND)와 청구 통화(KRW/USD) 분리**, 환율 스냅샷을 계약건에 저장할지 결정 필요.
> - **IAP 판정은 변하지 않는다** — 카드 결제가 가능해질수록 앱 내 결제는 Apple 3.1.3(g) 에 정면으로 걸린다. 결제는 계속 **계약 웹페이지(외부 브라우저)** 에서만 일어난다.
> - 구현 방침: 파이프라인 설계(`260907_ad_payment_pipeline_design.md`)의 **seam-B 어댑터로 붙인다** — 코어·관리자 화면·노출 게이트 무변경. 단 토스는 "입금 관측"만이 아니라 **결제 개시(결제창·승인)** 도 필요하므로 seam 확장 여부를 별도 설계한다.
> - 개발자 문서: https://developers.tosspayments.com/


> **결정 문서.** 이번 세션 코드 변경: **없음** (문서만). 구현은 §9 티켓으로 다음 턴에.
> 선행 문서: [`260810_proximity_ad_contract_model.md`](260810_proximity_ad_contract_model.md)(tier 내장 옵션 A 확정), [`task/active/260810_proximity_ad_pricing_contract_report.md`](task/active/260810_proximity_ad_pricing_contract_report.md)(대표 결정 요청 3건 — 본 문서가 그 답), [`research/260810_proximity_ad_contract_research/`](research/260810_proximity_ad_contract_research/)(Apple 조항 원문 1차 조사).
> 표기 규약: **[확인]** = 코드·공식 문서로 확인한 사실 / **[추정]** = 근거는 있으나 확정 아님 / **[확인 필요]** = 법무·세무·실측이 필요한 항목. 정책·법령 인용에는 출처 링크를 붙였다.

---

## 0. 권고안 요약 (이것만 읽어도 됨)

1. **과금 모델 — (a) 월정액 tier 유지, 단 "선불 기간제"로 고정.** 광고주는 1·3·6개월분을 **선불**하고, 관리자가 입금확인 시 **`paid_until`(유료 만료일)** 을 찍는다. 자동갱신 없음, 만료 7일 전 알림 → 재입금 → 연장. Facebook식 선불 예산 지갑(b)은 **채택하지 않음** — 광고주 잔액 원장이 레포에 없고(§4-2), 노출 단가 차감은 셀프서브 결제 레일과 성과 분쟁 대응이 갖춰진 뒤에나 의미가 있다.
2. **결제 레일 — 지금은 계좌이체 + 관리자 수동 승인 유지**(변경 없음). PG 는 붙이지 않는다. 다음 단계는 "베트남 법인 없이 VND 를 받는 경로" 중 **국제 PG(2C2P 계열) 크로스보더 가맹 가능성**을 1차 후보로 검토하되, **월 유료 계약 30건 또는 수동 승인 처리시간이 주 4시간을 넘을 때**만 착수한다(§7). **직가맹(VNPay/MoMo/ZaloPay)은 VN 법인 설립 전까지 불가**(사용자 확정 제약).
3. **IAP — 쓸 수 있지만 쓰면 안 되고, 쓰지 않아도 된다.** 사용자의 "앱 내 결제는 말이 안 됨" 직관은 **정책적으로도 맞다**: Apple 3.1.3(g)는 *"같은 앱에 표시될 광고 구매는 IAP 필수"* 라 못 박지만, 이는 **구매가 앱 안에서 일어날 때**의 규정이다. 구매·계약을 **외부 브라우저 웹(business.saigon-rider.com)** 으로 빼면 IAP 의무 자체가 발생하지 않는다 — 이미 그렇게 구현돼 있다. 남은 리스크는 **앱 안의 "웹에서 계약하기" 버튼이 anti-steering(3.1.1) 위반으로 읽힐 가능성**이며, 그 완화 방법을 §2-3 에 정리했다.
4. **전자계약 — `checkbox_v1` 유지 + 증거력 보강 5건(§5-3).** 베트남 전자거래법(20/2023/QH15)상 클릭랩 동의도 전자계약으로 유효하나, **지금 구현은 "무슨 문안에 동의했는지"를 서버가 모른다**(계약 문안이 랜딩 프론트 `content.ts` 에만 있음 — §5-1). 문안을 서버로 올려 버전·스냅샷을 서명 기록에 박고, 계약 페이지에서 사본을 내려받게 한다. DocuSign·VNPT-CA 등 벤더는 **분쟁 1건 발생 또는 계약금액 상향 시**까지 보류.
5. **지금 할 일(다음 턴)** — §9 티켓 T-1~T-6: `paid_until` 도입 + 노출 게이트에 유료상태 반영(현재 **미입금 광고도 노출되는 결함** 포함 수정) / 계약 문안 서버 SoT 화 + 스냅샷 저장 / 관리자 활성화 시 입금 금액·기간·근거 기록 / 만료 알림 / 계약 사본 다운로드 / 앱 내 CTA 문구 조정.

**사용자 결정이 필요한 항목**은 §8 에 모았다(세무·법무 확인 4건, 제품 결정 3건).

---

## 1. 현재 구현 상태 [확인]

재설계 전에 "뭐가 이미 있나"를 코드로 확정한다.

| 영역 | 현재 상태 | 근거 |
|---|---|---|
| 과금 구조 | **월정액 tier 2단계**(프리미엄 weight 3 / 일반 weight 1). 광고 생성 시 tier 가격을 `monthly_price_snapshot_vnd` 로 스냅샷 | `backend/app/models.py:1045-1077`, `database/init/149_ads_tiers.sql`, `150_ad_tier_prices.sql`, `175_ad_tiers_proximity.sql` |
| 결제 상태 | `subscription_status ∈ {pending_payment, active, expired}` — **`expired` 로 전이하는 코드가 없다.** 활성화는 영구 | `models.py:1045`, `grep "expired" backend/app` → 0건 |
| 결제 수단 | **계좌이체 + 관리자 수동 승인만.** PG·IAP 코드 0줄. 계좌 안내는 플레이스홀더 문구("담당자가 카카오톡/이메일로 계좌번호를 안내") | `routers/ad_contract.py:43-46 _BANK_TRANSFER_INFO_PLACEHOLDER`, `routers/admin_api/biz.py:823 activate-subscription`, `modules/ads/application.py:426-435` |
| 관리자 활성화 | `activate_subscription()` 은 상태를 `active` 로 바꾸기만 한다. **입금 금액·입금일·입금 근거·유료 기간을 어디에도 기록하지 않는다.** 감사로그에는 행위만 남음(`BIZ_AD_ACTIVATE_SUBSCRIPTION`) | `admin_api/biz.py:823-843`, `_audit.py:17` |
| 노출 게이트 | `launching_ad_conditions()` 은 `APPROVED · is_active · 게시기간 · 파트너 verified` 4조건만 본다. **`subscription_status` 를 보지 않는다 → 미입금(pending_payment) 광고도 노출된다.** 260810 문서 §0-4 에서 근접 경로만 지적됐고 피드·마켓 경로는 그대로다 | `services/ad_gating.py:32-50` |
| 광고비 지표 | `ad_spend_vnd = monthly_price_snapshot × (게시∩조회 일수)/30`, `pending_payment` 는 비용 0 취급. 월정액 안분 방식이라 **선불 기간제와 그대로 정합** | `routers/biz.py:585-610`, `frontend/src/api/biz.ts:1026-1075` |
| 계약 웹 게이트 | 앱 `POST /api/bff/biz/ads/{id}/contract-link` → 토큰 URL → 외부 브라우저(`native.openExternalUrl`)로 `business.saigon-rider.com/apply?token=` → 무인증 조회/동의. 기록: `contract_accepted_at · contract_method='checkbox_v1' · contract_signer_name · contract_signer_ip(X-Real-IP)`. **별건 결함(본 문서 범위 밖, 같은 날 `context/architecture.md` §5 에 기록됨)**: 라우터가 `/bff/biz/...` 로 등록돼 nginx 의 `bff/` 제거 rewrite 와 겹쳐 이중 프리픽스 404 — T-4 착수 전 선행 수정 필요 | `routers/ad_contract.py`, `database/init/176_ad_contract_web_gate.sql`, `frontend/src/pages/biz/BizManage.tsx:214-225`, `landing/apps/client/src/pages/apply/Index.tsx`, `lib/adContractApi.ts` |
| 계약 문안 | **랜딩 프론트 `content.ts` 에 3개 로케일 한 문장씩만 존재**. 서버 응답의 `contract_text_version` 은 상수 `"v1"` 이고 서버는 문안 본문을 갖고 있지 않다. 동의 시 로케일·UA 미기록 | `landing/apps/client/src/pages/apply/content.ts:50-51,82-83,114-115`, `ad_contract.py:52` |
| 신원 연결 | 토큰은 **앱 세션 인증 + 광고 소유자 검증**을 거쳐 발급(`_own_pending_ad`). 광고주 프로필은 별도 사업자 검증(BizVerification, `151_biz_verification.sql`)을 거친다 → 서명자 신원의 1차 근거는 이미 있다 | `ad_contract.py:65-79` |
| 오리진 | 계약 페이지(정적 SPA, `/var/www/saigon-rider`) 와 BFF(`app.saigon-rider.com`) 가 **다른 오리진**. 랜딩은 `VITE_BFF_PUBLIC_BASE_URL` 로 BFF 를 직접 호출 | `adContractApi.ts:6-8` |
| 지갑 | `routers/wallet.py` 는 **라이더용 GOLD/XP 잔액 조회 프록시**(Engine `get_wallet`)일 뿐. VND·광고주·원장 개념 없음 → **광고주 예산 지갑에 재사용 불가** | `routers/wallet.py:14-31`, 260810 문서 §0-3 "잔액 원장 전무" |
| 이메일 발송 | 백엔드에 SMTP/메일 발송 코드 **없음** → "계약 사본 이메일 발송"은 신규 인프라 필요 | `grep smtp/sendgrid/send_email backend/app` → 0건 |
| 연장(makegood) | 관리자 `ends_at` 연장 엔드포인트 존재(보상 연장 용도) | `admin_api/biz.py:~800-820`, `tests/test_ad_makegood.py` |
| 테스트 | `tests/test_ad_contract.py`(mock db, 라우터 직접 호출 스타일), `test_biz_ad_stats_summary.py`, `test_ad_exposure.py` | — |

**요약**: "웹으로 뺀 계약 게이트"라는 뼈대는 있다. 없는 것은 ① 유료 **기간**(만료) ② 입금 **기록** ③ 노출 게이트의 유료 조건 ④ 계약 **문안의 서버 SoT**. 네 가지 모두 결제 레일·과금 모델과 무관하게 필요한 기초다 — §9 티켓은 여기에 국한한다.

---

## 2. IAP 판정 — 쓸 수 있는가 / 써야 하는가

### 2-1. 결론

| 질문 | 판정 |
|---|---|
| 앱 안에서 광고 tier 결제를 완결하면 IAP 가 강제되는가 | **예 (Apple).** 3.1.3(g) 원문이 "같은 앱에 표시될 광고 구매(예: 소셜미디어 부스트)는 IAP 필수"라고 명시한다. Google 은 명시 조항이 없어 회색지대 [확인 필요]. |
| 그러면 IAP 를 써야 하는가 | **아니오.** 구매 행위를 앱 밖(외부 브라우저 웹)으로 빼면 IAP 의무의 전제("구매가 앱 안에서 일어남")가 사라진다. Facebook·Google 광고 앱, Grab/배민/Gojek 이 전부 이 구조다. |
| 써도 되는가 | **써서는 안 된다.** ① 30%(소규모 사업자 프로그램 15%) 수수료 ② VND 로컬 결제수단 미지원(스토어 결제수단만) ③ B2B 세금계산서·법인 명의 결제 불가 ④ 구독 자동갱신 통제권을 Apple 이 가짐 ⑤ 광고주가 iOS/Android 를 각각 사면 정산이 갈린다. 사용자 직관 "말이 안 됨"은 **정확**하다. |

### 2-2. 근거 (원문)

- **Apple 3.1.3(g) Advertising Management Apps** [확인 — 260810 조사 원문 재인용, 현행 문안은 §2-4 리서치 결과로 재확인]:
  > "Apps for the sole purpose of allowing advertisers … to purchase and manage advertising campaigns across media types … do not need to use in-app purchase. These apps are intended for campaign management purposes and **do not display the advertisements themselves**. Digital purchases for content that is experienced or consumed in an app, **including buying advertisements to display in the same app** (such as sales of 'boosts' for posts in a social media app) **must use in-app purchase**."
- **Apple 3.1.3(e) Goods and Services Outside of the App**: 실물 재화·앱 밖 소비 서비스는 IAP **금지**. 우리 상품은 "앱 내 노출 슬롯"이라 (e) 로 방어하기 어렵다 [추정]. 근접 알림→실제 방문이라는 앱 밖 가치가 있어도, 광고주가 사는 것은 노출이다.
- 사이공라이더는 라이더용 화면과 광고주용 화면(BizManage)이 **한 바이너리** 안에 있고 광고가 **같은 앱에 표시**되므로, 문자 그대로 (g) 후단에 해당한다. 즉 **"앱 안에서 결제 완결"은 선택지가 아니다.**

### 2-3. 앱 안에서 결제 유도를 어디까지 노출할 수 있나 (steering)

여기가 실무 리스크다. 지금 `BizManage` 에는 **"웹에서 계약하기" 버튼이 외부 브라우저를 연다**(`native.openExternalUrl`). 웹뷰가 아니라 외부 브라우저인 점은 옳다(260810 조사 권고와 일치). 문제는 Apple 3.1.1 의 anti-steering 조항 — *IAP 대상 콘텐츠에 대해 앱 안에 외부 구매 링크·버튼·CTA 를 두는 것* 자체를 금지한다(미국 스토어프론트는 2025 Epic 판결 이후 예외, 베트남 스토어프론트는 해당 없음). **"결제를 앱 밖에서 한다"는 사실과 "앱 안에 그 링크를 둘 수 있다"는 별개 문제**다.

노출 수위별 리스크 (Apple 기준; Google 은 §2-4 참고):

| 수위 | 앱 내 노출 | 리스크 | 판정 |
|---|---|---|---|
| L0 | 가격·tier 정보만 표시, 결제 언급 없음. 계약 링크는 앱 밖 채널(Zalo OA·이메일·SMS)로 전달 | 최저 — Grab/배민 패턴 | 가장 안전. 단 지금은 메일 인프라가 없어 **운영자가 수동 전달**해야 한다(초기 수십 건이면 가능) |
| L1 | "계약 절차는 비즈니스 포털(business.saigon-rider.com)에서 진행됩니다" **문구만**(탭 가능한 버튼 없음) | 낮음 — 3.1.1 은 "buttons, external links, or other calls to action" 을 금지. 도메인 언급 자체는 Reader 앱 판례상 회색 [추정] | 허용 가능 범위로 판단 |
| L2 | **"웹에서 계약하기" 버튼 → 외부 브라우저** (현재 구현) | 중간 — 심사관이 (g) 대상 콘텐츠의 외부 구매 링크로 볼 수 있음 | **iOS 심사 시 리젝 가능성 있음 [확인 필요]** |
| L3 | 앱 내 웹뷰로 계약·결제 페이지 열기 | 높음 — "앱 안"으로 간주될 위험 | 금지 |
| L4 | 앱 내 결제 완결(PG/카드 입력) | (g) 위반 확정 | 금지 |

**권고**: 웹앱(브라우저 서비스) 단계에서는 L2 를 그대로 둔다 — 브라우저에서 열리는 웹앱은 스토어 심사 대상이 아니다. **iOS 네이티브 제출 빌드**에서는 `BizManage` 의 버튼을 **L1 문구**로 내리고(플랫폼 분기 `data-platform="ios"` 또는 Capacitor 네이티브 판별로 버튼 숨김), 계약 링크는 **푸시 알림 대신 Zalo/이메일로 운영자가 전달**한다. Android 는 §2-4 Google 정책 확인 결과에 따라 L1/L2 결정. 이 분기는 §9 T-6 에서 **문구·조건 1곳만** 바꾸는 작업이다 — 새 플로우를 만들지 않는다.

> ⚠️ 이 판정은 정책 문안 해석이다. **네이티브 제출 전 Apple 심사 사례 또는 법무 재확인 [확인 필요]** — 260810 조사도 같은 유보를 남겼다. 사용자 메모리의 "웹앱 우선 로드맵"(웹에서 완성 후 네이티브 포팅) 덕에 이 리스크는 **네이티브 포팅 시점까지 유예**된다.

### 2-4. 최신 정책 원문 재확인 (2026-09 리서치)

2026-09-07 에 원문을 다시 가져와 대조했다(Sonnet 서브에이전트 WebFetch — [developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en)).

- **Apple 3.1.3(g)·(e) 현행 문안은 §2-2 인용과 동일** [확인]. 변경 없음.
- **Apple 3.1.1(a) Link to Other Purchase Methods** [확인]: 외부 구매 링크 entitlement 는 **미국 스토어프론트에서만 불필요**하다("These entitlements are not required for developers to include buttons, external links, or other calls to action in their United States storefront apps"). **그 외 스토어프론트**에서는 entitlement 없이 "apps and their metadata may not include buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase". 베트남 스토어프론트가 어떤 지역 entitlement 에 포함됐는지는 **[확인 필요]**(빌드 시점 entitlement 지역 목록 재확인). → §2-3 의 L2 리스크가 문안으로 확정된다.
- **Epic v. Apple (미국)**: 2025-12-11 제9순회 판결로 Apple 은 외부 링크 결제에 "합리적으로 필요한" 수수료를 부과할 수 있으나 링크 금지는 불가 — 미국 한정 ([MacRumors](https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/), [Justia](https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html)). 우리와 무관.
- **Meta 의 실제 구조** [확인]: 독립 앱 *Meta Ads Manager* 는 IAP 없이 캠페인을 구매·관리한다(광고가 그 앱에 표시되지 않으므로 (g) 전단 예외). 반면 Facebook/Instagram 앱 **안**의 "게시물 부스트"는 2022-10 이후 IAP 대상이 되어 Apple 수수료가 붙는다 ([MacRumors 2022](https://www.macrumors.com/2022/10/25/facebook-apple-app-store-guidelines-ads/), [CNBC](https://www.cnbc.com/2022/10/26/apples-new-app-store-rules-over-boosted-ads-provoke-facebook-again-.html)). Meta 가 이를 피하는 방법은 **웹(ads.facebook.com)에서 결제**하게 하는 것 — 우리 권고와 같은 구조다.
- **Google Play** [확인]: "Play-distributed apps requiring or accepting payment for access to in-app features or services, including any app functionality, digital content or goods must use Google Play's billing system." 면제는 **실물 재화·실물 서비스(교통·청소·항공권·헬스장·음식배달·공연 티켓)**, P2P 송금, 온라인 경매, 면세 기부, 도박 등 **재화 유형 기준**이며 **B2B·광고 관련 면제 조항은 없다.** 즉 Android 에서 앱 내 광고 구매는 Apple 보다 **더** 회색이고 방어 근거가 적다 [추정 — 판례·서포트 사례 미확보]. 결론은 동일: **앱 안에서 구매를 완결하지 않는다.** Google 도 Play 결제 외 수단으로 유도하는 CTA 를 제한하므로 §2-3 의 L1 문구 권고는 Android 에도 같이 적용하는 것이 안전하다.

---

## 3. 한국 법인만으로 VND 를 받는 경로

### 3-1. 전제

- 한국 법인 단독. VN 법인·대표사무소 없음 → **VNPay/MoMo/ZaloPay/OnePay/Payoo 직가맹 불가**(현지 사업자등록 필수 — 사용자 확정, §3-3 리서치로 재확인).
- 광고주는 호치민 소상공인. 건당 25만~100만 VND(≈ 10~40 USD) 소액 [추정 — 260810 권장가].
- **지금 계좌이체를 "어느 계좌"로 받고 있는지가 문서·코드에 없다** (`_BANK_TRANSFER_INFO_PLACEHOLDER`). 한국 법인은 베트남 은행 계좌를 직접 열 수 없으므로, 현재 실제 수취 경로가 ①한국 계좌 국제송금(USD, 수수료가 건당 금액을 상회) ②현지 개인 계좌 대리수취(회계·세무 리스크) 중 무엇인지 **[확인 필요 — §8 Q-1]**. 이 답에 따라 §3-2 의 1순위가 바뀐다.

### 3-2. 경로 비교

| 경로 | VN 로컬 결제수단(ATM 카드·MoMo·VNPay QR) | 한국 법인 가맹 가능 | 정산·환율 | 수수료 | 판정 |
|---|---|---|---|---|---|
| **A. 계좌이체 + 수동 승인 (현행)** | 광고주가 이미 쓰는 VietQR/NAPAS 247 계좌이체 — 소상공인에게 **가장 익숙한 수단**(VietQR 가맹점 도달 85%, NAPAS 247 연 89억 건 [확인 — [kaadxpay](https://www.kaadxpay.com/en/countries/vietnam)]) | 수취 계좌가 어디냐에 달림(§3-1 Q-1) | 수취 경로별 상이 | 0 (은행 수수료만) | **Stage 1 유지** |
| **B. Wise Business (VND 수취)** | Wise 는 VN 에서 **수취 전용** — VND 계좌로 입금 받을 수 있으나 VND 잔액 보유·송출·운영계좌 불가, SBV 중개 라이선스 없음 [확인 — [Wise help](https://wise.com/help/articles/2932336/guide-to-vnd-transfers)]. 건당 상한 ≈ 4.99억 VND | 한국 법인 Wise Business 계정으로 가능 여부 **[확인 필요]** | 입금 즉시 USD/KRW 전환, Wise 환율 | 전환 수수료 ~0.5~1% [추정] | A 의 "수취 계좌" 문제를 푸는 **후보**. 게이트웨이가 아니라 수취 레일이므로 승인은 여전히 수동 |
| **C. 크로스보더 국제 PG — 2C2P** | VN 운영·로컬 수단 250+ 지원 표방 [확인 — [2c2p.com/vietnam](https://go.2c2p.com/vietnam/)] | **외국 법인(비VN) 가맹 수용 여부·요건 미확인 [확인 필요 — 영업 문의 필요]** | 크로스보더 정산 통화·주기 미확인 | 미확인 (통상 3~4%+ [추정]) | **Stage 2 1차 검토 대상.** 가맹 가능하면 유일하게 "법인 없이 로컬 수단"을 여는 경로 |
| **D. Stripe** | **VN 은 Stripe 가맹 미지원 국가, VND 정산 불가** [확인 — [stripe.com](https://stripe.com/resources/more/payments-in-vietnam)] | 한국 계정이어도 VND·VN 로컬 수단 불가 | — | — | **배제** |
| **E. Paddle / Lemon Squeezy / FastSpring (MoR)** | VND·VN 로컬 수단 지원 근거 없음(카드 네트워크 중심) [확인 필요] | MoR 이라 세금 대행은 매력 | USD 정산 | 5%+ | 카드 보유율이 낮은 소상공인 대상엔 부적합 → **배제(현 단계)** |
| **F. PayPal** | VND 미지원, 광고주가 USD 연동 계좌·PayPal 계정 필요 | 가능 | USD | 4%+ | 소상공인 마찰 과대 → **배제** |
| **G. 국내 PG 해외카드 (KG이니시스·토스·엑심베이)** | 해외 카드(Visa/MC/JCB…) + 3DS. VN 로컬 지갑(MoMo/VNPay/ZaloPay) 직접 연동 근거 **미확인 [확인 필요]** | 가능(한국 법인이 본래 대상) | KRW 정산 | 3~4% [추정] | VN 신용카드 보유율이 낮아(직불/ATM 카드 위주, 신용은 대출 규제로 제한 [확인 — kaadxpay]) 전환율 낮음. Stage 2 에서 C 가 막힐 때 **차선** |
| **H. VNPay/MoMo/ZaloPay/OnePay/Payoo 직가맹** | 전부 | **불가** — 외국 법인은 VN 등록 자회사·JV 또는 SBV 라이선스 보유 현지 파트너 경유 필수 [확인 — [kaadxpay](https://www.kaadxpay.com/en/countries/vietnam)] | — | — | **Stage 3 (VN 법인 후)** |

**지불 관성 데이터** [확인 — kaadxpay, [Ken Research](https://www.kenresearch.com/industry-reports/vietnam-mobile-wallets-digital-payments-market)]: 성인 은행계좌 보유 ~87%(2024) / 카드는 직불·ATM 중심, 신용카드는 제한적 / 전자지갑 결제 점유 36%(2025), MoMo 침투 69%·ZaloPay 44% / QR 거래 +81.6%(2025 Q1). → **소상공인의 "돈 내는 방법"은 이미 계좌이체(QR)** 이고, 자동갱신 카드 결제는 공급도 수요도 약하다. §4 의 (a) 선불 기간제 선택을 뒷받침한다.

### 3-3. 세금·외환 리스크

전부 **[확인 필요 — 세무]** 로 분류한다. 아래는 리서치로 확보한 1차 근거이며, 계약 문안(E-5)의 세금 조항과 가격 표시(세전/세후)를 정하려면 세무 회신이 선행돼야 한다.

| 항목 | 1차 근거 | 우리에게 미치는 영향 |
|---|---|---|
| **베트남 외국인계약자세(FCT)** — 외국 법인이 VN 상대방에 서비스 공급 시 VAT+CIT 를 **VN 상대방이 원천징수** | Circular 103/2014/TT-BTC; 간주법 CIT 0.1~10%·VAT 2~5% 구간, 광고·마케팅 서비스의 정확한 구간은 미확정 [추정 5%/5%] ([Vietnam Briefing](https://www.vietnam-briefing.com/news/foreign-contractor-tax-in-vietnam-guide.html/), [LexConsult](https://lexconsult.com.vn/en/foreign-contractor-tax-ftc-2025/)). "VN 밖에서 수행·소비되는 광고" 면제는 **비온라인 광고 한정** — 우리 앱 내 노출은 해당 안 됨 | 광고주(VN 사업자)가 우리에게 낼 때 세금을 떼고 보낼 수 있다 → **표시 가격이 "세후 수취액"인지 계약에 명시** 필요. 소상공인이 원천징수 신고를 실제로 하는지는 별문제(안 하면 리스크는 광고주 측) |
| **2025 VAT 법 개정** (Law 48/2024/QH15, 2025-07-01 시행) | PE 없는 외국 공급자의 전자상거래·디지털 공급 VAT **5% → 10%**; 외국 공급자도 VN VAT 인보이스 등록·발행 가능 ([EY](https://www.ey.com/en_gl/technical/tax-alerts/vietnam-introduces-new-and-amended-tax-laws-on-foreign-suppliers-conducting-business-through-e-commerce-and-digital-platforms)) | 세율 가정이 바뀌었을 수 있음. 광고주가 VAT 인보이스를 요구할 때 우리가 발행 가능한 경로가 생겼는지 확인 |
| **외국 공급자 GDT 포털(NCCNN) 등록** (Circular 80/2021) | 본래 VN 중개 원천징수자가 없는 **B2C 디지털 공급** 자진신고 장치([Orbitax](https://orbitax.com/news/country/article/Vietnam-Launches-Electronic-Po-49377)). 우리 구매자는 사업자(B2B) → 원칙은 상대방 원천징수. **단 B2B 포함 전 외국 디지털 공급자 등록 의무 여부 미확정** | 등록 의무가 있으면 분기 신고 운영 부담 발생. 개인사업자(household business) 광고주가 많으면 B2C 로 분류될 여지 |
| **Decree 117/2025/ND-CP** | 국내 플랫폼이 **개인 판매자** 대신 원천징수하는 규정 — 우리 광고 매출과는 다른 사실관계([EY VN](https://www.ey.com/en_vn/technical/tax/tax-and-law-updates/people-advisory-service-tax-alert-june-2025-decree-117-on-tax-management-for-business-activities-on-e-commerce-platforms-and-digital-platforms)) | 광고 결제에는 무관. 다만 마켓 개인 판매자 관련 별건 확인 대상 |
| **한국 외국환거래법 신고** | 건당 USD 5,000 초과 시 지급·수령 사유 입증서류, 연간 무증빙 한도 USD 10만(2023 확대) [추정 — [CNC News](https://www.cncnews.co.kr/mobile/article.html?no=8338)]. 소액 다건 수령의 합산 취급, PSP/Wise 경유 시 취급은 **미확정** | 건당 25만~100만 VND 는 임계 아래이나 연 합산·경유 방식 확인 필요 |
| **환율** | VND 는 관리변동, 대VND 원화 직거래 없음 → USD 경유 이중 환전 | Stage 1 은 수취 시점 환율로 회계 인식. 가격은 VND 고정(광고주 관점 단순)으로 유지 |

### 3-4. 결제 레일 결정

- **지금(Stage 1)**: 계좌이체 + 수동 승인 **유지**. 코드 변경은 "입금 기록을 남기는 것"뿐(§9 T-3). 이유: 월 계약 수가 수십 건 이하인 동안 PG 수수료·연동·정산 운영이 수동 승인 비용을 넘지 않는다. 자동갱신 레일이 없다는 부담은 **선불 기간제 + 만료 알림**으로 흡수한다(§4).
- **Stage 2 진입 조건**(하나라도): 월 유료 계약 30건 초과 / 수동 승인·입금 대조 처리시간 주 4시간 초과 / 입금 불일치 분쟁 월 3건 이상. 진입 시 1차 검토 대상은 **크로스보더 국제 PG(2C2P 계열)** — VN 로컬 결제수단(ATM 카드·QR)을 한국 법인 가맹으로 붙일 수 있는지가 관건이며 §3-2 표의 [확인 필요] 항목을 그때 실측한다.
- **Stage 3**: VN 법인 설립 시 VNPay/MoMo 직가맹 + VAT 인보이스 정상화. 이때만 자동갱신(카드 저장)·예산 지갑 검토가 열린다.

---

## 4. 과금 모델 선택

### 4-1. 세 모델 비교

| 기준 | (a) 월정액 tier 구독 (현행) | (b) 선불 예산 지갑 (Facebook 식) | (c) 하이브리드 (tier 기본 + 부스트 예산) |
|---|---|---|---|
| 코드 정합성 | **높음** — tier·`monthly_price_snapshot`·`ad_spend_vnd`(월정액 안분)·플랜 피커 UI 전부 존재. 빠진 건 `paid_until` 하나 | **낮음** — 광고주 잔액 원장·충전·차감·노출 단가·잔액 소진 시 게시 중단 로직 전부 신규. `wallet.py` 는 라이더 GOLD/XP 프록시라 재사용 불가 | (a) 전부 + (b) 대부분 |
| 자동결제 레일 부재 시 운영 | 선불·수동 승인과 **자연 결합**. 만료 알림 1종이면 됨 | 충전마다 수동 승인 → 잔액 소진 → 게시 중단 → 재충전… **수동 승인 횟수가 늘어남**. 잔액 부족 시점에 노출이 끊기는 UX 도 소상공인에게 낯설다 | (b) 의 부담이 그대로 |
| 베트남 소상공인 지불 관성 | 월정액은 Zalo OA·Chợ Tốt 유료 패키지 등 **현지에 익숙한 형태** [추정]. 소액·선불·기간제 선호와 맞음 | 예산 지갑은 Facebook Ads 경험자에겐 익숙하나, 소상공인은 "얼마 쓰면 뭐가 되는지"를 노출수로 이해하기 어려움. 카드 자동충전 없이는 잔액 관리 자체가 마찰 | 두 개념을 동시에 설명해야 함 |
| 성과 분쟁 대응 | 기간 기준이라 노출수 시비가 정산에 영향 없음. 성과는 대시보드 **참고 지표** | **노출/클릭 수가 곧 돈** → viewability·봇·중복 필터(`spec/ad-performance-metrics.md`)의 정확도가 정산 정확도가 됨. 초기 볼륨에서 분쟁 대응 불가 | 부스트 부분에 (b) 리스크 |
| 초기 전환율 | 가격이 단순("월 25만동") → 영업 현장(필드 에이전트) 설명 쉬움 | "예산 얼마부터?" 진입 마찰. 최소 충전액 설정 필요 | 중간 |
| 매출 상한 | tier 가격 × 계약 수. 단순하나 대형 광고주 업셀 여지 작음 | 예산 크기에 비례 — 상방 열림 | 상방 열림 |

### 4-2. 결정: (a) 월정액 tier 유지 + 선불 기간제

**채택: (a).** 근거는 넷이다.

1. **있는 것을 쓴다.** 260810 에서 "정산 근거를 정액 월구독 하나로 유지"하는 결정을 이미 했고 코드가 그렇게 짜여 있다. (b) 는 광고주 원장이라는 **새 머니 경로**를 만드는 일이며, Karpathy 원칙상 지금 수요(월 수십 건, 수동 승인)가 요구하지 않는다.
2. **결제 레일이 수동인 동안 (b) 는 운영을 늘린다.** 자동충전이 없는 예산 지갑은 "잔액 떨어질 때마다 입금·승인"이다. 월정액 선불은 승인 횟수가 계약 기간당 1회다.
3. **성과 지표는 아직 정산 등급이 아니다.** `ad_events`/`ad_daily_stats` 는 대시보드용으로 설계됐고(`spec/ad-performance-metrics.md`), 노출 단가 차감의 근거로 쓰려면 검증·분쟁 절차가 필요하다. 그 전에 돈을 노출수에 묶으면 첫 분쟁에서 환불로 끝난다.
4. **베트남 소상공인의 지불 관성**은 소액·선불·기간제다 [추정 — §3-2 카드 보유율 데이터 참조]. 신용카드 자동결제 보유율이 낮아 "자동갱신 구독"도 어차피 못 만든다. 선불 기간제가 유일하게 지금 레일로 동작하는 형태다.

**(b) 를 배제하는 것이 아니라 시기를 뒤로 미룬다.** 진입 조건: Stage 3(VN 법인 + 자동 결제 레일) **그리고** 광고주가 성과 대시보드를 근거로 예산 증액을 요청하는 사례가 나올 때. 그 전엔 설계하지 않는다.

### 4-3. 선불 기간제의 최소 정의

- 상품: tier(프리미엄/일반) × 기간(1·3·6개월). 장기 할인 여부는 대표 결정 [§8 D-2]. 코드상은 `months` 정수 하나.
- 상태: `pending_payment`(계약 동의 전/입금 전) → `active`(입금확인, `paid_until = 승인일 + months개월`) → 만료(`paid_until < now`). **`expired` 상태값을 별도 전이시키는 크론은 만들지 않는다** — 노출 게이트가 `paid_until >= now` 를 직접 본다(상태 파생). 프론트 배지용 `subscription_status` 는 조회 시 계산해 내려준다.
- 연장: 재입금 → 관리자 활성화 재호출 → `paid_until += months`. 기존 makegood(`ends_at` 연장)과 분리한다 — `ends_at` 은 "게시 종료 희망일", `paid_until` 은 "돈 낸 기간".
- 알림: `paid_until - 7일` 에 광고주 알림 1종(`noti_events` 기존 채널 `biz.*` 재사용). 자동갱신 없음.
- 광고비 지표: `_ad_spend_for_period` 의 월정액/30 안분을 그대로 쓴다. 게시 구간 상한만 `min(ends_at, paid_until)` 로 바뀐다.

---

## 5. 전자계약 (e-signature)

### 5-1. 현재 `checkbox_v1` 의 증거력 진단 [확인]

기록되는 것: 동의 시각(UTC aware) · 서명자명(자유 입력) · IP(X-Real-IP) · 토큰(앱 세션·소유자 검증을 거쳐 발급). 기록되지 **않는** 것:

1. **계약 문안 본문** — 문안은 랜딩 `content.ts` 에만 있고 서버는 `"v1"` 상수만 안다. 문안이 바뀌면 과거 동의가 무엇에 대한 것이었는지 복원 불가. **가장 큰 결함.**
2. 서명 시 로케일(vi/ko/en 중 어떤 문안을 봤는지), User-Agent.
3. 계약 조건 스냅샷(가격은 `monthly_price_snapshot_vnd` 로 있음 ✓, 기간·tier 명칭은 tier 테이블 참조 — tier 명 변경 시 유실).
4. 광고주에게 남는 **사본**(웹 성공 화면 1회 표시 후 사라짐, 메일 없음).
5. 동의 기록의 변경 불가성 — 컬럼이 `marketplace_ads` 에 nullable 로 있어 UPDATE 로 덮어쓸 수 있음(감사로그 없음).

### 5-2. 법적 유효성 — 베트남 전자거래법 기준

- **전자거래법 20/2023/QH15**(2023-06-22 통과, **2024-07-01 시행**, 2005년 법 대체) [확인 — [thuvienphapluat EN](https://thuvienphapluat.vn/van-ban/EN/Thuong-mai/Law-20-2023-QH15-Electronic-Transactions/577937/tieng-anh.aspx), [Lexology](https://www.lexology.com/library/detail.aspx?g=25fd390f-b9da-431b-b9fb-1d98c5e75b5f)]:
  - 전자계약(제3조 16항) = "데이터 메시지 형태로 성립한 계약", 별도 약정 없으면 체결 시 효력.
  - 데이터 메시지·전자서명은 **"전자 형식이라는 이유만으로 법적 효력이 부인되지 않는다."**
  - 서명 등급은 실무상 3층 — 일반 전자서명(chữ ký điện tử) / 전용 전자서명(chữ ký điện tử chuyên dùng) / 디지털 서명(chữ ký số, 인가 CA PKI). **정확한 정의·요건 매핑은 원문 재확인 [확인 필요]**(리서치는 2차 요약 기반). 시행령 **Decree 23/2025/ND-CP** 는 이번 조사에서 원문 미확보 [확인 필요].
- **클릭랩(체크박스) 유효성**: 개인정보보호 Decree 13/2023 은 "체크박스 체크"를 유효한 동의 방식으로 명시 [확인 — [Apolat Legal](https://apolatlegal.com/click-wrap-and-browse-wrap-consent-under-personal-data-protection-laws-of-vietnam/)]. 계약 성립 측면에서도 전자거래법의 일반 원칙 + "명확한 승낙 표시와 승낙자 식별"(서명자명·시각·IP·세션)로 **일반 전자서명 수준의 증거로 방어 가능** [추정 — [FPT.eSign 해설](https://kyta.fpt.com/en/blogs/e-contracts-in-vietnam-2025-latest-regulations-and-business-impact)]. 다만 **인가 CA 디지털 서명과 같은 증거력은 아니며**, VN 상사분쟁에서 체크박스 단독 승낙이 어떻게 판단됐는지 **판례 미확보 [확인 필요]**.
- **외국 당사자의 CA**: Decree 130/2018 제51조상 외국 인증서도 VN 상대방에 보내는 데이터 메시지에 유효 [추정 — 2023 법·Decree 23/2025 이후 승계 여부 확인 필요]. 즉 우리(한국 법인)가 VN CA 를 반드시 쓸 필요는 없을 수 있다.
- **현지 벤더**: VNPT SmartCA · Viettel-CA · FPT-CA(FPT.eSign) · Intrust CA 가 시장 지배 [확인 — [VietnamNet](https://vietnamnet.vn/en/vnpt-viettel-and-intrust-ca-dominate-vietnam-s-digital-signature-market-2359522.html)]. 광고주(VN 사업자) 쪽 서명에 이들을 붙이면 광고주가 자체 디지털 인증서를 보유해야 해 소상공인에겐 진입 마찰이다.

**판정**: 월 25만~100만 VND 규모의 광고 서비스 계약에서 `checkbox_v1` 은 **형식상 유효**하다. 문제는 유효성이 아니라 **증거의 완결성**(§5-1 — "무엇에 동의했는지"가 서버에 없음)이다. 따라서 벤더보다 §5-3 보강이 먼저다.

### 5-3. 벤더 없이 증거력을 최대화하는 최소 보강 (권고)

`contract_method` 값을 바꾸지 않고(여전히 클릭랩) **기록의 완결성**만 올린다. 벤더(DocuSign/Adobe Sign/VNPT SmartCA/Viettel-CA)는 **분쟁 1건 발생, 또는 단건 계약금액이 월 최저임금(≈531만 VND) 을 넘는 상품이 생길 때** 재검토한다.

| # | 보강 | 왜 | 최소 구현 |
|---|---|---|---|
| E-1 | **계약 문안을 서버 SoT 로** — BFF 가 로케일별 문안·버전을 내려주고 랜딩은 표시만 | 서버가 "무엇에 동의했는지" 알아야 함 | `ad_contract.py` 에 문안 상수(dict[locale] → text, version `"v2"`), `GET /public/ad-contract/{token}` 응답에 `contract_text`, `contract_text_version` 포함. 랜딩 `content.ts` 의 문안 3벌 삭제(표시 라벨만 남김) |
| E-2 | **동의 시 스냅샷 저장** — 문안 본문·버전·로케일·UA·tier명·가격·기간을 서명 레코드에 고정 | 문안·tier 변경 후에도 원계약 복원 | `marketplace_ads` 에 `contract_snapshot JSONB`(문안 전문 포함 — 해시보다 **전문 저장이 단순**하고 해시 검증 절차가 없는 상황에선 전문이 곧 증거). `sha256` 은 스냅샷 안에 필드로 함께 기록(무결성 대조용, 별도 체인 없음) |
| E-3 | **광고주 사본** — 계약 페이지에 "계약서 보기/저장" — `already_accepted` 상태에서 스냅샷을 그대로 렌더, 브라우저 인쇄→PDF | 메일 인프라 없이도 사본 제공 | 랜딩 `apply/Index.tsx` `already` 상태 화면에 스냅샷 표시 + `window.print()` 버튼. 서버 PDF 생성은 하지 않음 |
| E-4 | **동의 기록 불변** — accept 후 `contract_*` 컬럼 UPDATE 를 코드에서 막고(이미 멱등 분기 있음 ✓), 관리자 API 에 해당 컬럼 수정 경로가 없음을 테스트로 고정 | 사후 조작 의혹 차단 | 테스트 1건: accept 2회 호출 시 첫 기록 유지(현행 동작 확인) |
| E-5 | **문안에 필수 조항** — 당사자(한국 법인명·사업자번호 / 광고주 프로필명·사업자검증 ID), 상품(tier·기간·가격·VND), 게재 정책 참조, 환불·중단 조건, 준거법·분쟁해결, 세금 부담 주체(§3-3) | 지금 문안은 한 문장이라 계약이라 부르기 어렵다 | 문안 작성은 **법무 [확인 필요 — §8 Q-4]**. 코드는 E-1 의 상수 교체만 |

이메일 사본 발송·OTP 서명은 **넣지 않는다** — 메일 인프라가 없고, OTP 는 이미 앱 세션(소셜 로그인)+사업자 검증으로 신원이 묶여 있어 한계효용이 낮다. 대신 스냅샷에 `issued_to_user_id`(토큰 발급 세션의 user_id) 를 넣어 "누가 링크를 받았는지"를 계약 기록 안에 고정한다.

---

## 6. 오리진·웹훅 설계 메모 (Stage 2 대비, 지금 구현 안 함)

- 계약 페이지는 정적 SPA(`/var/www/saigon-rider`), API 는 `app.saigon-rider.com`. PG 를 붙일 때 **리다이렉트 복귀 URL 은 정적 SPA(business.)**, **웹훅(IPN) 은 BFF(app.)** 로 갈라진다. 웹훅은 PG 서명 검증 후 `paid_until` 을 갱신하는 **관리자 활성화와 동일한 서비스 함수**를 호출해야 한다 — 그래서 T-3 에서 활성화 로직을 "금액·기간·근거를 받는 함수" 형태로 만들어 두면 Stage 2 에 그대로 재사용된다(이건 미래용 추상화가 아니라 T-3 의 본래 요구다).
- BFF 는 Engine DB 직접 접근 금지 — 결제·계약은 전부 BFF 소유 테이블(`marketplace_ads`)이라 Engine 무관. timezone-aware 규약은 `paid_until` 계산에 그대로 적용.

---

## 7. 단계적 로드맵

| 단계 | 진입 조건 | 결제 | 계약 | 과금 | 코드 범위 |
|---|---|---|---|---|---|
| **Stage 1 (지금)** | — | 계좌이체 + 수동 승인 (수취 계좌 경로는 §8 Q-1 확인 후 문구 확정) | `checkbox_v1` + E-1~E-5 보강 | tier × 선불 1·3·6개월, `paid_until` | §9 T-1~T-6 |
| **Stage 2** | 월 유료 계약 30건 초과 **또는** 수동 승인 주 4h 초과 **또는** 입금 분쟁 월 3건 | 크로스보더 국제 PG 1종(§3-2 결과에 따라 2C2P 계열 우선) — VN 로컬 카드/QR | 동일 (PG 결제 완료를 계약 기록에 연결) | 동일 | PG 웹훅 수신 + `paid_until` 자동 갱신, 랜딩 결제 리다이렉트, 정산 대조 어드민 뷰 |
| **Stage 3** | VN 법인 설립 | VNPay/MoMo 직가맹, VAT 인보이스 발행 | 필요 시 현지 CA 전자서명 벤더 | 자동갱신 옵션, (b) 예산 지갑 검토 개시 | 결제수단 추가, 인보이스 발행 연동, 원장 설계(그때 별도 ADR) |

"웹앱 우선 로드맵"과의 정합: Stage 1~2 는 전부 웹(랜딩 + 브라우저 웹앱)에서 완결된다. 네이티브 포팅 시점에 필요한 것은 §2-3 의 iOS CTA 수위 조정(T-6) 하나다.

---

## 8. 사용자 결정 / 외부 확인 필요 항목

| # | 항목 | 왜 필요 | 누가 |
|---|---|---|---|
| Q-1 | **현재 계좌이체 수취 경로** — 한국 계좌 국제송금인가, 현지 개인/제3자 계좌인가 | §3-1. 후자면 세무·자금세탁 규정 리스크, 전자면 건당 수수료가 광고비를 넘음. Stage 2 착수 시점 판단의 입력 | 대표 → 세무 |
| Q-2 | **베트남 외국인계약자세(FCT)·전자상거래 외국공급자 등록 의무** — 우리 매출에 해당하는지, 광고주(VN 사업자)가 원천징수해야 하는지, 개인사업자 광고주일 때 우리가 GDT 포털 등록 대상인지 | §3-3. 계약 문안의 "세금 부담 주체" 조항과 가격표시(세전/세후)가 여기 달림 | 세무 [확인 필요] |
| Q-3 | **한국 외국환거래 신고 임계** — 소액 해외 서비스 수입의 신고 요건 | §3-3 | 세무 [확인 필요] |
| Q-4 | **계약 문안(E-5)** — 당사자·상품·환불·준거법·세금 조항 | §5-3. 코드는 상수 교체만 | 법무 |
| D-1 | **iOS 네이티브 빌드에서 "웹에서 계약하기" 버튼을 L1 문구로 내릴지**(권고: 예) | §2-3 | 대표 |
| D-2 | **기간 옵션·할인** — 1/3/6개월 제공 여부, 장기 할인율 | §4-3 | 대표 |
| D-3 | **미입금 광고 노출 차단 즉시 적용 여부** — 현재 pending_payment 광고가 노출 중이라면 T-1 배포 시 사라진다. 기존 무료 노출 중인 파트너 처리(유예 기간?) | §1 결함 | 대표 |

---

## 9. 다음 턴 구현 티켓 (Stage 1 만)

각 티켓은 독립 커밋 가능. 미래 단계용 추상화 없음.

| # | 제목 | 변경 파일 후보 | 검증 (테스트로 확인) |
|---|---|---|---|
| **T-1** | `paid_until` 도입 + 노출 게이트에 유료 조건 반영 | `database/init/2xx_ad_paid_until.sql`(`marketplace_ads.paid_until TIMESTAMPTZ NULL`, 멱등) · `models.py` MarketplaceAd · `services/ad_gating.py launching_ad_conditions` 에 `subscription_status=='active' AND paid_until >= now` 추가 · `bff_migrate` 등록 | `tests/test_ad_exposure.py` 확장: pending_payment 광고 / `paid_until` 과거 광고는 `public_ads()` 결과에서 제외, active+미래는 포함. `list_admin_ads(launching=…)` 도 동일 조건 |
| **T-2** | 조회 시 만료 상태 파생 | `modules/ads/application.py _ad_read` — `paid_until < now` 면 `subscription_status="expired"` 로 내려줌(DB 갱신 없음) · `routers/biz.py _ad_spend_for_period` 상한 `min(ends_at, paid_until)` · 프론트 `BizManage` 배지는 기존 `expired` 분기 재사용 | `test_biz_ad_stats_summary.py`: paid_until 이후 일수는 광고비 0. `_ad_read` 단위 테스트: 경계값(=now) |
| **T-3** | 관리자 활성화에 입금 기록·기간 | `admin_api/biz.py activate-subscription` 요청 바디 `{months:int(1|3|6), amount_vnd:int, paid_at:datetime, bank_ref:str}` · `application.activate_subscription(ad_id, months, …)` — `paid_until = max(now, paid_until) + months` · `audit(detail={...})` 에 전부 기록 · 기존 409(already active) 는 "연장" 의미로 허용 전환 · admin-frontend 활성화 모달 입력 4개 | 신규 `tests/test_ad_activate_subscription.py`: 최초 활성화 `paid_until=now+months` / 만료 전 재활성화는 누적 / 감사로그 detail 에 amount·bank_ref 존재 / months∉{1,3,6} 422 |
| **T-4** | 계약 문안 서버 SoT + 동의 스냅샷 | `ad_contract.py`: 문안 dict(vi/ko/en, version `"v2"`), `GET` 응답에 `contract_text·contract_text_version` 추가, `accept` 바디에 `locale` 추가, `marketplace_ads.contract_snapshot JSONB`(문안·버전·로케일·UA·tier명·가격·months·sha256·issued_to_user_id) 저장 · `database/init/2xx_ad_contract_snapshot.sql` · 랜딩 `content.ts` 문안 3벌 제거, `apply/Index.tsx` 는 서버 문안 렌더 · `adContractApi.ts` 타입 | `tests/test_ad_contract.py` 확장: accept 후 스냅샷 필드 전부 존재, sha256 = 문안 해시 일치, 2차 accept 는 스냅샷 불변(E-4), 미지원 locale → vi 폴백 |
| **T-5** | 만료 7일 전 광고주 알림 | 기존 스케줄러/워커에 일 1회 조회 추가(`paid_until BETWEEN now+6d AND now+7d`, active) → `noti_events.publish("biz.ad_expiring", …)` · 알림 타입 등록(`115_notifications_biz_type.sql` 패턴) | 단위 테스트: 경계 날짜 광고만 선택, 중복 발송 방지(발송 여부는 알림 테이블 존재로 판정 — 새 컬럼 없음) |
| **T-6** | 앱 내 CTA 수위 + 계약 사본 | `BizManage.tsx:466-477` — Capacitor 네이티브 iOS 에서는 버튼 대신 L1 문구(`biz.contractPortalNotice`, 3로케일) · 랜딩 `apply/Index.tsx` `already` 상태에 스냅샷 렌더 + 인쇄 버튼(E-3) · `_BANK_TRANSFER_INFO_PLACEHOLDER` 를 Q-1 확정 문구로 교체(env 또는 상수) | 프론트 계약 테스트(`bizIntro.contract.test.mjs` 스타일): iOS 네이티브 플래그일 때 버튼 미렌더·문구 렌더 / 웹·Android 는 버튼 유지. 로케일 키 패리티 3벌 |

**티켓에서 의도적으로 뺀 것**: PG 연동·웹훅·예산 지갑·서버 PDF·이메일 발송·OTP·`expired` 전이 크론·전자서명 벤더 — 전부 Stage 2 이후 또는 불필요(§4-3, §5-3).

---

## 부록 A. 리서치 출처 목록

리서치 수행: 2026-09-07, Sonnet 서브에이전트(WebSearch/WebFetch). 본문 각 절에 인라인 링크로 인용했다. 주요 출처만 재열거:

- Apple App Store Review Guidelines (3.1.1(a), 3.1.3(e), 3.1.3(g)) — https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments policy — https://support.google.com/googleplay/android-developer/answer/9858738 · https://support.google.com/googleplay/android-developer/answer/10281818
- Epic v. Apple 제9순회 2025-12-11 — https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html
- Meta 부스트 IAP 전환(2022) — https://www.macrumors.com/2022/10/25/facebook-apple-app-store-guidelines-ads/
- 2C2P Vietnam — https://go.2c2p.com/vietnam/ · Stripe Vietnam — https://stripe.com/resources/more/payments-in-vietnam · Wise VND — https://wise.com/help/articles/2932336/guide-to-vnd-transfers
- VN 결제 시장 데이터 — https://www.kaadxpay.com/en/countries/vietnam · https://www.kenresearch.com/industry-reports/vietnam-mobile-wallets-digital-payments-market
- FCT: Circular 103/2014 — https://www.vietnam-briefing.com/news/foreign-contractor-tax-in-vietnam-guide.html/ · https://lexconsult.com.vn/en/foreign-contractor-tax-ftc-2025/
- VAT Law 48/2024 — https://www.ey.com/en_gl/technical/tax-alerts/vietnam-introduces-new-and-amended-tax-laws-on-foreign-suppliers-conducting-business-through-e-commerce-and-digital-platforms
- GDT 외국공급자 포털 — https://orbitax.com/news/country/article/Vietnam-Launches-Electronic-Po-49377
- Decree 117/2025 — https://www.ey.com/en_vn/technical/tax/tax-and-law-updates/people-advisory-service-tax-alert-june-2025-decree-117-on-tax-management-for-business-activities-on-e-commerce-platforms-and-digital-platforms
- 전자거래법 20/2023/QH15 — https://thuvienphapluat.vn/van-ban/EN/Thuong-mai/Law-20-2023-QH15-Electronic-Transactions/577937/tieng-anh.aspx
- 클릭랩 동의(Decree 13) — https://apolatlegal.com/click-wrap-and-browse-wrap-consent-under-personal-data-protection-laws-of-vietnam/
- VN CA 시장 — https://vietnamnet.vn/en/vnpt-viettel-and-intrust-ca-dominate-vietnam-s-digital-signature-market-2359522.html
- 한국 외국환 한도(2023) — https://www.cncnews.co.kr/mobile/article.html?no=8338
