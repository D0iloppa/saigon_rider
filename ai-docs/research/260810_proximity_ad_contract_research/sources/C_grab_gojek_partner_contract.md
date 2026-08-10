# C. Grab/Gojek/배민 — 파트너 업체 대상 광고 계약·결제 프로세스 (raw 수집)

조사일: 2026-08-10. 방법: WebSearch + WebFetch (공식 페이지 우선, 실패 시 뉴스/블로그 대체). **판단·해석 없이 원문 발췌 + 출처만 기록.**

---

## 1. GrabAds / GrabMerchant (동남아)

### 1-1. 공식 T&C 원문 — Marketing Manager Service Terms (Grab PH)
출처: https://www.grab.com/ph/terms-policies/marketing-manager-service-terms/ (확인일 2026-08-10, WebFetch 성공)

> **Section 7.2(a) — Grab Merchants (Grab 입점 가맹점)**
> Store Earnings Deduction: "authorize Grab to deduct Advertiser's merchant wallet...for Charges Advertiser makes through the Marketing Manager Service platform on a daily basis"
> Credit/Debit Cards: "Charges will be charged via credit/debit cards as the primary payment method. When submitting its credit/debit card information for payment, Advertiser authorizes Grab to obtain pre-authorisation and charge Advertiser's card"
>
> **Section 7.2(b) — Non-Grab Merchants (Grab 비입점 광고주)**
> Credit/Debit Cards: 위와 동일
> Invoice Billing: "Advertiser will be invoiced by Grab to settle the Charges...on a monthly basis. Advertiser shall make payment within credit terms agreed with Grab"
>
> **Section 7.3 — Agency Liability (대행사 책임)**
> "Advertiser has to make direct payments on behalf of the Client to Grab for all Charges incurred"

- 최소 계약기간·최소 광고비 조항은 이 문서에 **명시 없음** (WebFetch로 재확인, 부재 확인됨).
- 즉 결제방식은 **(1) 입점 가맹점 = 정산 지갑(store earnings wallet)에서 매일 차감 → 부족 시 카드 차감/인보이스, (2) 비입점 광고주 = 카드결제 또는 월 단위 인보이스(신용 조건은 개별 협의)** 이원 구조.

### 1-2. Grab SG 가맹점 T&C
출처: https://www.grab.com/sg/terms-policies/grab-merchant-terms-and-conditions/ (확인일 2026-08-10, WebFetch)
- GrabAds 관련 실질 조항 없음. 하단 네비게이션에 "[GrabAds](/sg/business/ads/) - Take advantage of our exposure, online-to-offline" 링크만 존재. → GrabAds 전용 별도 약관 문서가 따로 있는 구조로 추정(본 조사에서 직접 URL 미확인).

### 1-3. Self-serve 대시보드 (SMB向)
출처: https://www.grab.com/sg/inside-grab/stories/self-serve-marketing-manager-merchants-msmes/, https://www.grab.com/inside-grab/stories/cost-per-order-pricing-ad-campaign-merchants-msmes/ (검색 스니펫 확인, 2026-08-10)

- "GrabMerchant is an all-in-one, self-serve merchant platform for business owners"
- CPO(Cost-Per-Order) 모델: "merchants only pay when they receive actual orders through their ads" — 2023년 도입, 업계 최초 표방.
- "With Ad Manager, any merchant can launch an ad in just 3 minutes." (https://www.grab.com/my/business/ads/, WebFetch 확인)
- 2024년 3월 모바일(앱) 셀프서브 확대 발표: "GrabAds Expands Self-Serve Offerings on Mobile" (https://www.brandinginasia.com/grabads-expands-self-serve-offerings-on-mobile/, https://technode.global/2024/03/19/grabads-expands-self-serve-offerings-on-mobile-to-help-sea-small-and-medium-businesses-boost-sales/) — GrabMerchant **앱 안에서** 캠페인 생성·집행이 가능하다는 의미로 읽힘 (본문 원문 직접 인용은 확보 못함, 제목·요약 수준).

### 1-4. 엔터프라이즈/대형 광고주 — 세일즈팀 경로
출처: https://www.grab.com/my/business/ads/ (WebFetch), https://www.grab.careers/en/teams/advertising/, 채용 공고 다수 (WebSearch, 2026-08-10)

- 셀프서브 버튼과 별도로 "Request for demo" / "Speak to Us" 버튼 존재 → 대형 광고주는 세일즈팀 컨택 경로.
- GrabAds 세일즈 조직에 "Regional Head, Agency Partnerships", "Client Partner"(미디어 에이전시 대상 buying relationship 관리, "Joint-Business Plans" 수립) 등 직무 존재 — **에이전시/대형 브랜드는 오프라인 협의 기반 계약(Joint Business Plan)** 구조로 추정됨. 계약서 원문이나 최소 스펜드 수치는 공개 문서에서 확인 못함(비공개/협상 대상으로 보임).
- Grab Ads 매출의 상당 부분이 self-serve 성장분이라는 산업지 언급: "Self-serve boosts Grab's ad revenue" (WARC, https://www.warc.com/content/feed/self-serve-boosts-grabs-ad-revenue/10082 — 유료 콘텐츠, 본문 미확인, 제목만).

### 1-5. GrabMerchant 앱 성격 (네이티브 vs 웹뷰)
- Google Play / App Store에 별도 네이티브 앱으로 등록: `com.grab.merchant` (https://play.google.com/store/apps/details?id=com.grab.merchant, https://apps.apple.com/sg/app/grabmerchant/id1282271764). 앱스토어 상장 형태로 보아 **별도 B2B 전용 앱**이며, 웹뷰인지 순수 네이티브인지 기술 스펙은 **미확인** (공개 자료에 기재 없음).
- 기능: 주문 관리, VoIP 콜, 메뉴/카탈로그 관리, 직원 권한 관리, 매출 분석, **Marketing Manager(광고 생성/집행)** 포함.

### 1-6. GrabPay 지갑 결제 메커니즘 (참고)
출처: 다수 WebSearch 스니펫 (Stripe, Grab 공식 top-up 가이드, 2026-08-10)
- 지갑 충전 수단: 신용/체크카드, 온라인 계좌이체, DuitNow 등. 2024.09.11부터 신용카드 충전에 1% 수수료 부과(말레이시아 기준).
- "Wallet balances are safeguarded in regulated trust accounts and monitored under strict compliance standards."

---

## 2. Gojek GoBiz / GoAds (인도네시아)

### 2-1. GoAds 개요
출처: 다수 프레스릴리즈 WebSearch 스니펫 — CNN Indonesia(https://www.cnnindonesia.com/teknologi/20210202132749-206-601289/cara-pakai-fitur-myads-gobiz-bisa-atur-iklan), Kontan(https://pressrelease.kontan.co.id/release/gojek-sukses-bantu-puluhan-ribu-mitra-usaha-gofood-perluas-akses-pasar-melalui-goads), Gojek Newsroom(https://newsroom.gojek.com/gojek-indonesia/k6burmkbjc8zz0jbg3og5u1aaqucch) (확인일 2026-08-10, 스니펫 수준)

- GoAds는 2020년 7월 출시, GoBiz 앱 내 "Ads Manager" 기능으로 파트너가 직접 광고 기간·예산·매장 운영시간에 맞춰 설정.
- "Partners can access cost and advertising performance reports through the GoBiz application" — 리포트/결제 상태 확인도 **앱 내**에서.
- MyAds(Telkomsel) 연계 언급: "Through this integration, Gojek business partners can access Telkomsel MyAds service from the GoBiz app to create, send, and monitor their business advertising campaigns." — 통신사 제휴 광고 상품을 GoBiz 앱에서 중개하는 사례로, **외부 광고 플랫폼을 파트너앱에 임베드**하는 접근이 확인됨.

### 2-2. 결제 방식
- GoAds 자체의 결제 방식(자동차감/카드/인보이스) **공식 원문 미확인**. 검색된 자료는 GoBiz 일반 결제(GoPay, GoBiz PLUS 카드결제 MDR)에 관한 것으로 GoAds 전용 조항은 확보 못함.
- 참고: GoBiz PLUS 카드결제 수수료(MDR) — "BCA 신용카드 1.5%, Non-BCA(Visa/Mastercard) 2%" (https://gobiz.co.id/pusat-pengetahuan/aktifkan-pembayaran-kartu-kredit-di-gobiz-plus/, WebSearch 스니펫). 이건 GoBiz의 **매장 결제 수수료**이며 GoAds 광고비 결제와는 별개 항목일 가능성이 큼 — 혼동 주의, 미확정.
- GoBiz 개발자 포털(https://developer.gobiz.com/)에 공개 API 문서 존재하나 GoAds 전용 엔드포인트는 확인 못함.

### 2-3. GoBiz 앱 성격
- Google Play: "GoBiz - GoFood Merchant App" (`com.gojek.resto`) — 별도 네이티브 앱으로 상장. 인도네시아 전용, Android/iOS 지원.
- 기능: 주문 관리, GoPay 결제 수신, 매출 리포트, 메뉴 커스터마이징, 프로모션/광고 생성.
- 네이티브/웹뷰 여부 기술 스펙 **미확인**.

### 2-4. 엔터프라이즈/대형 브랜드 경로
- 본 조사에서 Gojek 측 "GoAds 세일즈팀 오프라인 계약" 관련 원문·기사 **미발견**. Grab처럼 에이전시 파트너십 전담 조직이 명시적으로 검색되지 않음 — 존재 여부 자체가 미확인 상태로 남김.

---

## 3. 배달의민족 (배민) — 국내 비교 사례

### 3-1. 배민셀프서비스 (self.baemin.com / ceo.baemin.com)
출처: WebSearch 스니펫 다수 (2026-08-10)

> "배민셀프서비스는 B2B 고객들이 본인과 관련된 정보를 확인 및 수정하는 서비스"
> "파트너셀프서비스 팀은 배달의민족의 또 다른 고객인 수십만의 사장님들이 더 쉽게, 더 빠르게, 더 효과적으로 장사하실 수 있도록 '셀프서비스'라는 서비스를 만드는 팀"
> "약 일 10만 명, 월 35만의 사장님이 가게, 메뉴, 리뷰 등의 정보를 관리하기 위해 셀프서비스를 이용"

- 광고 상품(울트라콜/오픈리스트) 신청·설정도 **사장님 사이트(ceo.baemin.com)/배민셀프서비스에서 사장님이 직접** 처리 — 별도 오프라인 계약서 서명 절차 없이 **웹(사장님 사이트) self-serve**로 신청되는 구조로 보임. (신청 화면 자체의 원문 캡처는 로그인 필요 영역이라 미확인.)
- URL 참고: https://self.baemin.com/, https://ceo.baemin.com/baemin-ad ("배민 광고 가입" 페이지 — 접근/원문 미확인, 링크만 검색됨)

### 3-2. 울트라콜 — 정액제
출처: 검색 스니펫 종합 (스마트월드 https://smartworld.co.kr/baemin-ad3 — WebFetch 403 실패, 검색 스니펫만 확보 / 비즈한국 https://www.bizhankook.com/bk/article/23702 등, 2026-08-10)

> "매월 정기 결제일에 광고 이용료 '80,000원(30일/부가세별도)'을 지불하면 배달의민족 앱에 가게(광고)가 노출"
> "광고비는 비즈머니 충전 계좌로 등록된 사장님의 계좌에서 광고 이용료가 출금되어 비즈머니를 충전하고 충전된 비즈머니를 차감되는 방식으로 납부"
> "울트라콜 광고의 가장 큰 특징은 '선결제'"
> (2026-08 시점 최신 요금, 비즈한국 인용): "부가세 포함 월 8만8000원"

- 즉 결제 메커니즘: **사장님 계좌 → 비즈머니(선불 포인트/지갑) 충전 → 비즈머니에서 정기 차감**. 신용카드 직접결제가 아니라 계좌 자동출금 기반 선불 지갑 충전 구조.
- 계약기간: 30일 단위 정기결제(월납), 별도 장기 락인 계약서 존재 여부는 확인 못함.

### 3-3. 오픈리스트 — 정률제(CPA성) + 클릭당 과금(우리가게클릭, CPC) 추가
출처: 서울경제/inews24/비즈한국 (2026-08-10 검색 스니펫)

> "오픈리스트'(정률제, 매출의 6.8% 부과)나 '울트라콜'(정액제, 부가세 포함 월 8만8000원) 둘 중 하나를 반드시 이용해야 합니다."
> "'우리가게클릭'은 클릭당 광고(CPC) 상품으로, 앱 이용자가 광고를 클릭하기만 하면 건당 200~600원의 광고비가 차감"
> "이 광고 상품은 '오픈리스트' 광고 상품을 이용하는 입점 업체만 추가로 이용 가능"
> "동일한 가게에 대해서는 회원, 비회원 무관하게 이용자당 1회의 클릭만 과금"

- 오픈리스트는 주문 발생 시에만 매출의 6.8%를 광고비로 차감하는 방식 → 정산(매출)과 연동된 자동 차감으로 추정(비즈머니/정산 계좌 흐름은 울트라콜과 유사할 것으로 보이나 이 항목의 정산 메커니즘 원문은 별도로 확보 못함).

### 3-4. 세금계산서 처리
출처: WebSearch 종합 (2026-08-10)

> "신용카드 결제 시... 신용카드 매출전표가 세금계산서와 동일하게 부가세 신고 시 매입세액 공제를 받을 수 있어 별도의 세금계산서를 발행하지 않는다" (요약, casenote/incruit 등 일반 세무 상식 출처 — 배민 전용 공식문서 아님)
> "부가세 신고 자주묻는질문" — ceo.baemin.com/guide/6249 (배민 공식 가이드, 원문 접근은 로그인 필요라 미확인)
> baeminceo.com: "배민 셀프서비스 부가세자료 확인하는법" — 사장님이 셀프서비스에서 광고비(울트라콜/오픈리스트 등) 부가세 신고자료를 **직접 다운로드**하는 구조 (원문 캡처 미확인, 제목/스니펫 수준)

- 즉 배민 광고비는 **카드결제 매출전표/비즈머니 충전내역이 세금계산서에 준하는 부가세 증빙으로 갈음**되는 구조로 보이며, Grab의 "invoice billing"(비입점 광고주 대상 월 단위 인보이스)처럼 별도 세금계산서를 정식 발행하는 절차와는 결이 다름. 다만 배민이 사업자 대 사업자 정식 세금계산서를 발행하는 경우(예: 대형 프랜차이즈 본사 계약, 배민1 수수료 등)가 따로 있는지는 **본 조사에서 확인 못함** — 추가 검증 필요 항목으로 남김.

---

## 4. 미확인/추가 조사 필요 항목 (명시)

- GrabAds 전용 별도 약관 문서(위 3-2에서 링크만 발견, 본문 미확인).
- GrabMerchant/GoBiz 앱이 순수 네이티브인지 웹뷰 하이브리드인지 기술적 확인 불가(공개 자료 없음).
- Gojek 측 엔터프라이즈/에이전시 세일즈 조직·오프라인 계약 프로세스 원문 — 검색에서 발견 못함(Grab 대비 공개 정보 부족).
- GoAds 자체 결제 메커니즘(카드/자동차감/인보이스) 원문 — 확보 못함(GoBiz 일반 결제 정보만 확보).
- Grab 엔터프라이즈 계약의 최소 스펜드·최소 계약기간 수치 — 공개 문서에 없음(비공개 협상 사항으로 추정).
- 배민 "배민광고 가입"(ceo.baemin.com/baemin-ad) 페이지 원문, 오픈리스트 결제/정산 메커니즘 원문 — 로그인 벽 또는 크롤링 실패로 미확인.
- 배민이 대형 프랜차이즈/체인 대상으로 세일즈팀 오프라인 계약을 별도로 운영하는지 여부 — 미확인.
