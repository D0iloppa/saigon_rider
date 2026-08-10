# B. IAP 강제 정책이 B2B 광고 판매에도 적용되는가 — raw 수집

조사일: 2026-08-10 (WebFetch/WebSearch 직접 확인). 판단·비교 없이 원문 인용 + URL만 남긴다.

---

## 1. Apple App Store Review Guideline — 원문

출처: https://developer.apple.com/app-store/review/guidelines/ (WebFetch 확인일 2026-08-10)

### 3.1.1 In-App Purchase (일반 원칙)

> "If you want to unlock features or functionality within your app, (by way of example: subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full version), you must use in-app purchase. Apps may not use their own mechanisms to unlock content or functionality, such as license keys, augmented reality markers, QR codes, cryptocurrencies and cryptocurrency wallets, etc."

> "Digital gift cards, certificates, vouchers, and coupons which can be redeemed for digital goods or services can only be sold in your app using in-app purchase. Physical gift cards that are sold within an app and then mailed to customers may use payment methods other than in-app purchase."

(그 외 loot box 확률공개, NFT, 무료체험 등 조항 — 본 조사와 직접 관련 없어 생략)

### 3.1.3 Other Purchase Methods (IAP 외 결제수단 허용 예외 — 도입부)

> "The following apps may use purchase methods other than in-app purchase. Apps in this section cannot, within the app, encourage users to use a purchasing method other than in-app purchase, except for apps on the United States storefront and as set forth in 3.1.1(a) and 3.1.3(a). Developers can send communications outside of the app to their user base about purchasing methods other than in-app purchase."

**3.1.3(a) "Reader" Apps:**
> "Apps may allow a user to access previously purchased content or content subscriptions (specifically: magazines, newspapers, books, audio, music, and video). Reader apps may offer account creation for free tiers, and account management functionality for existing customers. Reader app developers may apply for the External Link Account Entitlement..."

**3.1.3(b) Multiplatform Services:**
> "Apps that operate across multiple platforms may allow users to access content, subscriptions, or features they have acquired in your app on other platforms or your web site, including consumable items in multi-platform games, provided those items are also available as in-app purchases within the app."

→ (b)는 "이미 다른 플랫폼/웹에서 구매한 것에 대한 접근 허용"이 핵심 조건이며, **동일 항목이 앱 내에서도 IAP로 구매 가능해야 한다**는 전제가 붙는다. 즉 결제 자체를 앱 밖으로 완전히 빼는 예외가 아니라, "이미 산 것 접근"용 조항으로 읽힌다 (원문 그대로 인용, 해석 판단은 보류).

**3.1.3(c) Enterprise Services:**
> "If your app is only sold directly by you to organizations or groups for their employees or students (for example professional databases and classroom management tools), you may allow enterprise users to access previously-purchased content or subscriptions. Consumer, single user, or family sales must use in-app purchase."

**3.1.3(d) Person-to-Person Services:**
> "If your app enables the purchase of real-time person-to-person services between two individuals (for example tutoring students, medical consultations, real estate tours, or fitness training), you may use purchase methods other than in-app purchase to collect those payments. One-to-few and one-to-many real-time services must use in-app purchase."

**3.1.3(e) Goods and Services Outside of the App:**
> "If your app enables people to purchase physical goods or services that will be consumed outside of the app, you must use purchase methods other than in-app purchase to collect those payments, such as Apple Pay or traditional credit card entry."

→ 이 조항은 "may" 가 아니라 **"must use purchase methods other than in-app purchase"** — 즉 앱 밖에서 소비되는 실물 재화/서비스는 IAP 사용이 오히려 금지(강제 아웃)된다는 원문.

**3.1.3(f) Free Stand-alone Apps:**
> "Free apps acting as a stand-alone companion to a paid web based tool (i.e. VoIP, Cloud Storage, Email Services, Web Hosting) do not need to use in-app purchase, provided there is no purchasing inside the app, or calls to action for purchase outside of the app."

**3.1.3(g) Advertising Management Apps:** ← 본 조사 핵심 조항
> "Apps for the sole purpose of allowing advertisers (persons or companies that advertise a product, service, or event) to purchase and manage advertising campaigns across media types (television, outdoor, websites, apps, etc.) do not need to use in-app purchase. These apps are intended for campaign management purposes and do not display the advertisements themselves. Digital purchases for content that is experienced or consumed in an app, including buying advertisements to display in the same app (such as sales of "boosts" for posts in a social media app) must use in-app purchase."

→ 이 조항 안에 **두 문장이 대립적으로 존재**한다:
  1문장: 광고주가 광고 캠페인을 구매/관리하는 것만을 목적으로 하는 앱은 IAP 불필요.
  3문장(같은 조항 마지막): "**동일 앱 안에 표시될 광고를 구매하는 경우**(소셜미디어 앱의 게시물 '부스트' 판매 등 예시)는 IAP 사용 의무."

  → 즉 원문 기준으로 "캠페인 관리 전용 별도 앱"이면 예외, "동일 앱 내 광고 노출을 파는 경우"는 예외 대상이 아니고 IAP 의무 대상으로 명시되어 있음. (이 구분 자체가 원문 문장이며, 사이공라이더 사례 적용 여부는 판단하지 않음.)

### 3.1.5 (참고 — 광고 아님, 암호화폐 조항)
검색 중 "3.1.5 = Advertising Apps and Business Services"라는 가설을 세웠으나 WebFetch 확인 결과 **3.1.5는 Cryptocurrencies 조항**이었다. 광고/비즈니스 서비스 전용 별도 번호 조항은 가이드라인 목차상 확인되지 않음 (3.1.3(g)에 통합되어 있음). "Advertising Apps and Business Services"라는 명칭의 독립 조항은 **미확인** — 존재하지 않거나 명칭이 다를 수 있음.

---

## 2. Google Play Billing 정책 — 원문/요약

출처: https://support.google.com/googleplay/android-developer/answer/9858738 (WebFetch 확인일 2026-08-10, 페이지가 요약 형태로 반환되어 일부는 paraphrase임을 명시)

### 핵심 요구사항
> "Developers must use Google Play's billing system for 'in-app purchases' including virtual items, subscriptions, and app functionality, with specific exceptions." (WebFetch 도구의 요약 표현 — 원문 그대로인지 미확인, 재확인 필요)

### 실물 재화/서비스 예외 (Section 3, 인용부호 있는 부분은 원문으로 보임)
> "payment is primarily for the purchase or rental of physical goods (such as groceries, clothing, housewares, electronics)"
> "physical services (such as transportation services, cleaning services, airfare, gym memberships, food delivery, tickets for live events)"

### 기타 제외
> "peer-to-peer payments, online auctions, and tax exempt donations"
> 온라인 도박 관련 콘텐츠 촉진 금지 별도.

### B2B/광고/비즈니스 도구 관련 명시적 예외
**미확인.** WebFetch 결과 요약에 "The document does not explicitly address B2B services, advertising, or business tools as standalone exceptions. Physical goods/services represent the primary carve-out." 라고 명시됨 — 즉 Google Play 정책 원문에서 Apple의 3.1.3(g)에 대응하는 "광고 캠페인 관리 앱" 전용 명시 예외 문구는 이번 조사에서 **발견하지 못함**. 재확인이 필요하다면 play.google.com/console 정책 페이지(Payments policy)를 별도 원문 대조 요망.

### Alternative Billing (참고)
> Sections 8-9 (WebFetch 요약): 특정 리전에서 프로그램 등록 시 대체 결제수단 허용 또는 앱 밖 유도 허용. — 원문 조항 번호·문장은 이번 조사에서 그대로 인용하지 못했음 (요약만 확보). **재확인 필요.**

---

## 3. 실제 선례

### (a) Uber / Uber Eats 드라이버 앱
- 서치 결과(WebFetch/WebSearch 요약, 1차 출처 기사 원문 인용은 아님): "App Store fees only apply to digital goods and services, excluding physical goods and tangible services like Uber rides. Apple takes 30% of all transactions for In-App Purchases... but takes no fees for physical items or services." / "Uber doesn't pay Apple a cut when people use the app to book rides. An Uber ride is not a digital item—it is a real world service used/consumed outside the app."
- 출처: AppleInsider "Every Apple App Store fee, explained" (https://appleinsider.com/articles/23/01/08/the-cost-of-doing-business-apples-app-store-fees-explained), Quora 답변 스레드 (https://www.quora.com/For-every-Uber-request-made-through-the-iOS-app-is-Uber-paying-a-30-revenue-share-to-Apples-App-Store)
- **드라이버 앱의 구독료·수수료 자체가 IAP를 쓰는지/안 쓰는지에 대한 직접 확인은 못했음 — 미확인.** (라이더 요금 결제 자체가 실물서비스 예외로 IAP 미적용이라는 것만 확인됨. 드라이버 구독형 "Uber Pro"류 요금이 앱 내 IAP인지 외부결제인지는 이번 조사에서 원문 확인 안 됨.)

### (b) 당근마켓 비즈프로필 광고비
- 확인된 사실: 당근 비즈프로필 광고는 "당근비즈니스"라는 **별도 웹/PC 대시보드**(business.daangn.com)에서 운영되며, "본인 당근 계정에 직접 당근 캐시를 충전한 뒤, 소비자들이 클릭을 할 때마다 충전한 광고예산에서 차감되는 방식"이라는 서술을 확인 (출처: 아이보스 블로그 등 2차 자료, https://www.i-boss.co.kr/ab-2987-345900 , https://business.daangn.com/ , tossplace.com/story/carrot_biz_1).
- PC 웹으로 접속 시 "기존 계정 로그인 상태의 스마트폰으로 QR코드를 촬영하여 연동" 방식이 언급됨 — 즉 광고주 결제 흐름이 **PC 웹 대시보드 중심**으로 보이나, 모바일 "당근비즈니스" 전용 앱이 앱스토어에 별도 등록되어 있는지, 있다면 그 앱 내 캐시 충전이 Apple IAP를 쓰는지는 **미확인** (검색으로 특정 앱 존재/캐시충전 결제수단을 확정하지 못함).
- "당근 인앱결제 논란", "당근 애플 심사" 키워드로 심사 통과 관련 직접 보도/공식 자료는 이번 조사에서 **찾지 못함 (미확인)**.

### (c) 배달의민족 / 배민사장님 앱 광고비·입점료
- 확인된 사실: 배민 광고 상품은 CPT(기간제) → CPC(클릭당) → 오픈리스트(주문 성사 시 수수료율 차감, 2025년 4월부터 주요 상품) 순으로 변화. "입점업체가 수수료율을 직접 선택하고, 광고를 통해 음식 주문까지 실제로 이어진 경우 설정된 수수료율만큼 음식 값에서 빠져나간다"는 서술 확인 (출처: 소비자가만드는신문 https://www.consumernews.co.kr/news/articleView.html?idxno=645641 , wonjuni.com 블로그).
- 결제수단 관련: "배민사장님" 앱에 법인카드/사업자카드 등록, 세금계산서 처리 관련 자료는 확인되나(고위드 블로그 https://www.gowid.com/blog/corporate-card-delivery-ecommerce-payment , easybaemin.com), 이 결제가 **Apple/Google IAP API를 통과하는지, 아니면 PG(카드사) 직결/자동이체인지는 이번 조사에서 명확히 확인하지 못함 (미확인)**. 다만 광고비가 "주문 발생 시 음식값에서 차감"되는 성과형 구조라는 점, 그리고 이는 실물 서비스(음식배달) 매출에 연동된 수수료라는 점만 원문 확인됨.

---

## 4. 판별기준 원문 근거 — "앱 안에서 소비 vs 앱 밖 실물/서비스"

Apple 가이드라인 원문에서 이 이분법이 명시적으로 드러나는 두 지점:

1. **3.1.3(e)**: "physical goods or services that will be consumed outside of the app" → IAP 사용 금지(다른 결제수단 강제).
2. **3.1.3(g) 마지막 문장**: "Digital purchases for content that is **experienced or consumed in an app**... must use in-app purchase." (예시: 같은 앱 안에 표시되는 광고 구매)

→ 원문상 "앱 안에서 경험/소비되는 콘텐츠"와 "앱 밖에서 소비되는 실물/서비스"를 구분하는 문구가 반복적으로 나타나는 것은 사실로 확인됨. 다만 이 구분이 "판별기준의 핵심"이라는 요약 명제 자체는 원문에 그런 표제어로 명시된 것이 아니라, 3.1.3의 여러 하위 조항(a~g)에 흩어진 개별 조건들을 종합해 도출한 것 — 즉 원문은 단일 "테스트 문구"를 제공하지 않고 **케이스별 조항 나열** 방식이다.

B2B 사업자 대상 서비스(예: Shopify 입점 수수료, 배민 광고비)가 통상 어느 쪽으로 분류되는지에 대한 Apple 공식 성명/가이드라인 원문의 **직접적 카테고리 규정은 확인되지 않음**. 관련해서 확인한 것:
- Apple Developer Forum 스레드(https://developer.apple.com/forums/thread/674671, 커뮤니티 답변, 공식 문서 아님)에서 한 커뮤니티 유저(Juliejohn2022, 2022-12)가 "It's important to note that all in app purchases, including subscriptions, must be handled and processed by the App Store... you cannot offer subscriptions or other paid features outside of the app, or ask users to pay for subscriptions on your website or other external platforms such as Chargebee, Recurly, SubscriptionFlow, Chargify." 라고 답변 — 이는 **"앱 안에서 기능을 unlock하는" 일반 B2B SaaS**에 대한 답변이며, "광고 캠페인 구매/관리 전용 앱"(3.1.3(g))과는 다른 케이스로 보임 (원문에 두 케이스를 구분하는 명시적 언급은 없음 — 조사자 주석, 판단 아님).
- 별도 서치 결과(2차 요약, 원문 미확인): "Apple expanded the exemption category significantly in 2022 to include cloud apps, file storage, and most B2B SaaS" — 이 문장의 1차 출처(Apple 공식 발표문 등)는 이번 조사에서 특정하지 못함. **미확인 — 원문 대조 필요.**

---

## 5. 미확인 항목 목록 (재조사 필요)

- Google Play 정책 원문 그대로의 전문(현재는 WebFetch 도구의 요약본만 확보, 특히 Section 8-9 대체결제 조항의 정확한 문장).
- Google Play에 Apple 3.1.3(g)에 대응하는 "광고 캠페인 관리 앱" 명시 예외 존재 여부.
- Uber/Uber Eats **드라이버용 구독 요금**(예: Uber Pro류)이 IAP를 쓰는지 외부결제를 쓰는지.
- 당근비즈니스가 별도 모바일 앱으로 앱스토어/플레이스토어에 등록되어 있는지, 등록되어 있다면 그 앱 내 캐시 충전 결제수단.
- 당근/배민이 Apple 심사를 어떤 근거 조항(3.1.3의 어느 항)으로 통과했는지의 1차 출처(Apple 공식 승인 근거, 개발사 인터뷰 등).
- "Apple이 2022년 B2B SaaS를 예외 카테고리로 확대했다"는 서술의 1차 출처(Apple 공식 발표문 원문).
