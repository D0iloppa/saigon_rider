# 베트남 리포트 2종 — URL 전수 검증 & 개선사항 보고서

> 작성일: 2026-06-22
> 검증 대상:
> ① `vietnam-secondhand-daangn-report.md` (시장·당근 적합성 종합 보고서)
> ② `_tmp/saigon-rider-vn-ux-flow-diagnosis.md` (HCMC 사용자 관점 거래 플로우 UX 진단)
> 방법: 외부 정량 주장 → 1차 출처 URL 추적 + 3표 적대적 검증 / UX 진단의 코드 주장 → 실제 코드베이스 대조(41개 세부 주장)
> 판정 기준: **확인** = 1차 출처 일치 · **수정필요** = 수치는 근사하나 출처/시점/라벨/해석 오류 · **미확인** = 1차 출처 미확보

---

## 0. 한 줄 결론

두 보고서의 **정량 주장은 대부분 사실**이고(외부 25+ 항목 검증, 코드 41개 중 40개 일치), 전략적 논지는 견고하다. 그러나 **출처 1건 오인용(치명)**, **출처/시점 표기 오류 다수**, **규제 항목 1건 누락(중요)**이 있어 그대로 외부에 내보내면 신뢰도가 깎인다. 아래 §2의 정정과 §5의 제품 개선을 반영할 것.

---

## 1. 검증 총괄표 (출처 URL + 판정)

### 1-A. 시장 규모

| # | 보고서 주장 | 판정 | 1차 출처 URL | 핵심 메모 |
|---|---|---|---|---|
| 1 | 협의 리커머스 2024 $1.13B→2025 $1.28B(+13.7%)→2029 $1.97B, CAGR 11.3% | ✅ **확인** | businesswire.com/news/home/20250701589204 · globenewswire.com/news-release/2025/06/25/3104863 · researchandmarkets.com/reports/6099548 | **단일 유료벤더(ResearchAndMarkets) 예측치.** 모든 "교차확인" 매체는 동일 보도자료 신디케이션 → 독립 검증 아님. "벤더 추정"으로 표기 |
| 2 | 중고차 2025 $11.6B→2026 $13.2B→2031 $25.1B, CAGR 13.76%, 온라인 58.6%, 비공식 68.4% | 🟠 **수정필요(라벨)** | mordorintelligence.com/industry-reports/vietnam-used-car-market | 수치 전부 확인(58.55%/68.35% 반올림). 단 **CAGR 구간은 2026–2031**(2025→ 아님). "비공식 68.4%"는 원문 **"unorganized vendors"**(비조직 딜러 포함)이지 순수 개인간(P2P) 아님 — 오역 주의. 단일벤더 |
| 3 | 중고의류/thrift 2025 $5.2B→2031 $17.9B, CAGR 22.8% | ✅ **확인** | mobilityforesights.com/product/vietnam-second-hand-apparel-thrift-market | **광의 정의**(오프라인 thrift + 온라인 + P2P 전체). 협의 리커머스 $1.28B와 4배 차이는 정의 차이지 모순 아님. 단일벤더 |

### 1-B. Chợ Tốt / Carousell

| # | 보고서 주장 | 판정 | 1차 출처 URL | 핵심 메모 |
|---|---|---|---|---|
| 4 | Chợ Tốt 월 1,000만 MAU·5,500만 방문·60+ 카테고리·월 100만+(실제 ~200만) 신규매물·2013 출시 | ✅ **확인(빈티지 주의)** | careers.chotot.com/about-us · press.carousell.com/carousell-group · press.carousell.com/fact-sheet | 전부 **자사 미감사 PR 수치, 빈티지 2022~2023** → "2023년 기준 자사 발표치"로 명시. 실시간 수치로 제시 금지. (보고서 "월 100만+ 매물"은 보수 표기, 자사 발표는 ~200만) |
| 5 | Carousell 소유 / "Nearby Items" 근거리 기능 | ✅ **확인** | press.carousell.com/carousell-group · chotot.com | 베트남어 정식명은 **"gần bạn"(near you / Mua bán gần bạn)**. 영문 "Nearby Items"는 통용 번역 → "근거리 매물(gần bạn)"로 표기 권장 |
| 6 | Carousell 투자자 Naver·Telenor·Rakuten·Sequoia | 🟠 **수정필요** | press.carousell.com/fact-sheet | Naver·Telenor·Rakuten 확인. **"Sequoia Capital India"는 2023.6 "Peak XV Partners"로 사명변경** → 현 명칭으로 갱신. 전체: Telenor·Rakuten·Naver·STIC·500 Global·Peak XV |

### 1-C. 당근마켓

| # | 보고서 주장 | 판정 | 1차 출처 URL | 핵심 메모 |
|---|---|---|---|---|
| 7 | 2023 첫 흑자, 영업익 173억·매출 1,276억·+156%·창사 8년 | ✅ **확인(중요 단서)** | about.daangn.com/company/pr/archive/… · wowtale.net/2024/03/29/74379 · platum.kr/archives/225284 | **별도(개별) 기준** 수치. **연결 기준은 영업손실 11억(순익 +24억)** → "별도 기준 첫 흑자"임을 명시 안 하면 오해 |
| 8 | 매너온도 36.5도(→최대 99도) | ✅ **확인(국내 한정)** | medium.com/daangn/… · about.daangn.com/blog | **36.5도는 국내 한정.** 해외판은 명칭 "Karrot Score", 기본점수 36.5 아님(이후 0점+레벨제로로 재변경) → "36.5도는 한국 전용 설계"로 서술 |
| 9 | 해외진출 UK2019/CA2020/US2020/JP2021, 동남아 미진출 | ✅ **확인** | about.daangn.com/blog · koreaherald.com/article/10421761 · hankyung.com/article/202206243410i | 순서·연도 일치, 동남아/베트남 미진출 확인. 단 **영국은 2026년경 철수 보도** → "영국에서 서비스 중" 현재시제는 stale |
| 10 | 한국 반경 약 6km | ✅ **확인(메커니즘)** | techcrunch.com/2021/08/17/…2-7b-valuation | 2021 출처. 근거리 한정 메커니즘은 현재도 유효하나 정확한 km는 5년 전 값 |
| 11 | 반경 KR·JP 10km / US·CA 50km | 🟠 **수정필요** | bloter.net/news/articleView.html?idxno=614639 | 이건 **상한값/범위**(서울·도쿄 1~10km, 미·캐 2~50km). "한국 10km"는 #10의 6km와 충돌 → "한국 대표 6km, 상한 10km / 북미 상한 50km"로 정밀화 |
| 12 | 광고주 80만+ | ✅ **확인(2023 한정)** | blog.mstacc.com/columns/business-analysis/8271 | 정확히 **85만(2023.12)**. 현재(2026)는 수백만 단위 → "2023 기준"으로만 사용, 현재값 전용 금지 |
| 13 | 기업가치 ~$2.6–2.7B | 🟠 **수정필요** | techcrunch.com/2021/08/17/… | 1차 출처는 **$2.7B 단일값**(2021.8 Series D). "$2.6B" 하단은 근거 없음. **2021 라운드 밸류 ≠ 2026 현재**(비상장, 최신 밸류 미확인) |
| 14 | 캐나다 2025.2 누적 200만(9개월 2배) + 앱스토어 FB/X 추월 | 🟠 **수정필요(결합 오류)** | koreaherald.com/article/10421761 · kedglobal.com/…/ked202407040005 | 200만(2025.2) 확인. 단 **FB/X 추월은 2024.7 별개 사건** → 한 문장에 묶으면 시점 오인. 분리 서술 |

### 1-D. 인식·사기 통계 ★치명적 오류★

| # | 보고서 주장 | 판정 | 1차 출처 URL | 핵심 메모 |
|---|---|---|---|---|
| 15 | "Carousell 사용자 40%+ 사기 우려"(Recommerce Index 인용) | 🔴 **오류(출처 오인용)** | press.carousell.com/wp-content/uploads/2021/11/thecarousellrecommerceindex_en.pdf | **2021 Index 전문(47p)에 scam/fraud 0건.** 미구매 사유 1위는 "품질 우려"(미구매자 68%). "40%+ 사기"의 실제 출처는 **2026.1 Carousell 홍콩 PR**(44% 사기·홍콩 한정·베트남 아님) → **출처 교체 또는 주장 삭제 필수** |
| 16 | Recommerce Index 2021 전자 구매자 65%/판매자 69% | 🟠 **수정필요(해석)** | (동 PDF, p.10 Fig 2.1.2) | 이는 **베트남 응답자의 카테고리별 "편의도"**(전자제품을 가장 편하게 사고팖)이지, "구매자의 65%가 전자제품 거래"라는 점유율 통계가 아님 → 해석 정정 |

### 1-E. 디지털 인프라 / 결제

| # | 보고서 주장 | 판정 | 1차 출처 URL | 핵심 메모 |
|---|---|---|---|---|
| 17 | 인터넷 84.2% | ✅ **확인(출처 정정)** | datareportal.com/reports/digital-2026-vietnam | 84.2%(8,560만, 2025년 말)는 **DataReportal Digital 2026** 수치. Digital **2025**는 78.8% → 둘은 모순 아니라 6개월 시차. 출처를 **Digital 2026**으로 표기 |
| 18 | 스마트폰 84% | 🟠 **수정필요(정의·출처약)** | en.vietnamplus.vn/…post300610.vnp | "인구 보유율"이 아니라 **"휴대폰 가입자 중 스마트폰 비율"**. 1차 기관 출처 불명확 → 한계 명시 |
| 19 | 청년 앱사용 7.3시간/일 | 🟠 **수정필요(대상)** | qandme.net/en/report/viet-nam-mobile-app-popularity-2025.html | 7.3h는 **전체 평균**(Q&Me 2025)이지 청년/Gen Z 한정 아님 → 대상 정정 |
| 20 | QR 거래 54.7%(2025) | ✅ **확인(정밀화)** | mordorintelligence.com/industry-reports/vietnam-mobile-payments-market | 정밀값 **54.67%**, **거래 "건수" 기준**(금액 아님), Mordor |
| 21 | Zalo 침투율 98% | ✅ **확인** | qandme.net/en/report/viet-nam-mobile-app-popularity-2025.html | 1차 = Q&Me 2025.03(Facebook 95%·Messenger 82%·TikTok 79%). baonghean.vn은 2차 재인용 |

### 1-F. 규제·행정 (KYC/위치 설계 직결)

| # | 보고서 주장 | 판정 | 1차 출처 URL | 핵심 메모 |
|---|---|---|---|---|
| 22 | Decree 147 전화/국가ID 본인인증 | 🟠 **수정필요(위계)** | tilleke.com/insights/a-closer-look-at-vietnams-decree-147 · vietnam-briefing.com/news/vietnams-new-internet-regulation-decree-147-2024.html | 시행 2024-12-25·외국플랫폼 적용·90일 인증 확인. 단 **"베트남 전화번호 1차 필수, 국가ID는 전화번호 없을 때 폴백"** → "전화 또는 ID" 동등표기는 부정확. KYC는 "전화 우선" 위계로 |
| 23 | 사이버보안법 2026.7 시행 | ✅ **확인 + 누락 보완** | biometricupdate.com/202512/… · blogs.duanemorris.com/vietnam/2026/01/08/… | 신 사이버보안법(116/2025/QH15) 통과 2025-12-10·시행 2026-07-01 확인. 데이터 현지화는 시행령 미공개로 미확정. **★보고서 누락: 개인정보보호법(PDPL 91/2025)이 2026-01-01부터 이미 효력** — KYC/데이터 설계에 더 직접적 |
| 24 | 2025 HCMC 행정구역 통폐합 | ✅ **확인(강화)** | vietnam-briefing.com/news/…provincial-mergers · en.sggp.org.vn/…post118580 | **2025-07-01 시행.** 63→34 성·시, **군(district) 계층 완전 폐지**(3계층→2계층: 성/시→방/사). HCMC+Binh Duong+Ba Ria-Vung Tau 단일 통합(168 코뮌급). → "District 1" 등 구 주소는 더 이상 행정단위 아님. **데이터 컷오버 2025-07-01** |

> **인용 URL 버그:** 보고서/검증 과정에서 당근 블로그 인용 URL 2건이 잘못된 퍼센트 인코딩(`%ECB6%9C`)으로 404. 올바른 `about.daangn.com` / `careers.daangn.com` 경로로 교체 필요.

### 1-G. UX 진단서 코드 주장 (41개 세부 → 40 확인 / 1 부분일치 / 0 오류)

| 영역 | 판정 | 근거(파일:라인) |
|---|---|---|
| 매너온도 사용(`formatMannerTemp`/`mannerEmoji`) | ✅ | `marketFormat.ts:26-37` 정의, `MarketDetail.tsx:212` 사용. (DmDetail·ReviewSheet는 매너온도 직접표시 X — 후기는 만족도/태그 기반) |
| C2C 결제/에스크로 0건, IAP.ts는 게임재화 전용 | ✅ | `lib/plugins/IAP.ts`(buyItem…), MoMo/ZaloPay/escrow grep 0건 |
| MarketDetail 유일 CTA "채팅하기", 전화/Zalo 0건 | ✅ | `MarketDetail.tsx:321-331` |
| 등록폼: 영상 불가·상태등급 없음·negotiable 기본 OFF·"나눔" 카피·거래방식 필드 없음 | ✅ | `MarketCreate.tsx:162`(`image/jpeg,png,webp`)·`:38`(false)·`:219`(freeHint)·`market.ts:154-165` |
| 검색: 가격대/상태/거리 필터 없음·추천어 없음·SGR-299 카테고리 숨김 | ✅ | `MarketSearch.tsx:20-23,94-98` |
| 검색 정렬 필터 | 🟠 **부분일치** | MarketSearch UI엔 없으나 `fetchListings` sort 지원 + **MarketMain엔 정렬 드롭다운 존재**(`MarketMain.tsx:165-168`) → 개선은 "신규 구현"이 아니라 "기존 sort를 검색 UI에 노출" |
| FeedCreate: 영상 없음·포스트 유형 분류 없음·위치 자동첨부 기본 ON | ✅ | `FeedCreate.tsx:191,36`·`feed.ts:84-93` |
| Info 모듈(침수/주유/정비) 존재하나 피드 미연결 | ✅ | `pages/info/InfoHub.tsx` 등 존재, FeedCreate에 import 0건 |
| 약속: 구조화(whenAt+장소+상태)·매물상태 연동·후기·RideNav 연결·핀찍기(POI/안전장소 없음)·택배COD 없음 | ✅ | `DmDetail.tsx:118-181,243-327`·`AppointmentLocationPicker.tsx:16-20` |
| 유지강점: ₫ vi-VN·3언어·신고/차단·끌어올리기·위치피드 | ✅ | `marketFormat.ts:5-7`·`MarketDetail.tsx:114-164` |

---

## 2. 보고서 정정 액션 (문서 개선)

### 🔴 P0 — 반드시 고쳐야 (사실 오류)
1. **사기 통계 출처 교체**: "Carousell 사용자 40%+ 사기 우려 — Carousell Recommerce Index 2021" → 2021 Index엔 없음. **2026.1 Carousell 홍콩 PR(44%, 홍콩 한정)**로 교체하되 "베트남 아님" 단서 명기, 또는 베트남 직접근거(Q&Me 등)로 대체. (보고서 §2.3·부록A 2곳)
2. **사이버보안법 옆에 PDPL(91/2025, 2026-01-01 시행) 추가** — KYC/데이터 현지화에 더 직접적인데 누락됨. (§5.1·5.3)

### 🟠 P1 — 신뢰도 위해 정정
3. **당근 흑자 "별도 기준" 명기**(연결은 영업손실 11억). (§4.1·부록A)
4. **기업가치 "$2.7B(2021 라운드 시점)"**로 — $2.6B 삭제, 현재값 아님 명기. (§4.1·부록A)
5. **캐나다 200만(2025.2)과 FB/X 추월(2024.7) 분리** 서술. (§4.2)
6. **반경 정밀화**: 한국 대표 6km(상한 10km), 북미 상한 50km — "한국 10km/6km" 충돌 해소. (§4.1·4.2·부록A)
7. **인터넷 84.2% 출처를 Digital 2026**(2025년 말)로, 78.8%(Digital 2025)와 시차 명기. (§5.1·부록A)
8. **7.3시간 = 전체 평균**(청년 한정 아님)으로 대상 정정. (§5.1·부록A)
9. **Carousell 투자자 "Sequoia → Peak XV(2023 개명)"** 갱신. (§1.3 함의)
10. **Decree 147 "전화번호 우선, ID는 폴백"** 위계로 표현 수정. (§5.1·5.4)
11. **매너온도 "36.5도는 국내 한정"**(해외=Karrot Score) 단서. (§4.1·부록A)
12. **당근 블로그 인용 URL 404 2건** 교체.

### 🟡 P2 — 표현/라벨
13. 중고차 **CAGR 13.76% 구간 = 2026–2031**, **"비공식 68.4% = unorganized vendors"**(P2P 아님) 라벨. (§1.1)
14. 시장규모 3종 모두 **"단일 유료벤더 예측치"** 단서. (§1.1)
15. Chợ Tốt 지표 **"2023 기준 자사 발표치"**(실시간 아님). (§1.3·부록A)
16. "Nearby Items" → **"근거리 매물(gần bạn)"** 표기. (§1.3)
17. Recommerce Index 65%/69% = **"베트남 카테고리 편의도"**(점유율 아님) 해석 정정. (§1.2)
18. 당근 영국 **2026 철수 보도** 반영(현재시제 stale). (§4.2)

> **종합**: 두 보고서의 **핵심 논지(신뢰가 진짜 빈칸·Zalo/Chợ Tốt 인컴번시·에스크로 쐐기·신뢰엔진 교체)는 검증 결과 모두 유지**된다. 위 정정은 사실관계 정밀화일 뿐 결론을 바꾸지 않는다.

---

## 3. 검증으로 더 강해진 핵심 논지

검증 과정에서 **보고서 결론을 오히려 강화**하는 1차 근거가 확보됐다:

- **"신뢰 = 진짜 빈칸" 재확인**: Carousell 자체 데이터에서 베트남 미구매 사유 1위가 "품질 우려"(미구매자 68%). 사기·품질 불안이 시장의 실제 병목임을 1차로 뒷받침.
- **결제 공백의 규모 확인**: QR이 거래 **건수의 54.67%**(Mordor)인 시장인데 C2C 안전결제(에스크로)는 공백 → 에스크로 쐐기의 타당성↑.
- **Zalo 지배력 1차 확인**: Q&Me 2025.03 기준 Zalo 98% > Facebook 95% — "독립 앱이 동네 광장을 빼앗기 어렵다"는 논지 강화.
- **인컴번트 자본 연결**: Carousell 투자자에 Naver 포함 → "한국 자본이 이미 베트남 1위에 진입" 논지 유효(투자자명만 Peak XV로 갱신).

---

## 4. 규제발 신규 리스크 (검증 중 발견 — 보고서엔 약하게만 언급)

거래앱 설계에 **즉시 영향**을 주는데 두 보고서가 충분히 다루지 않은 항목:

1. **행정구역 데이터 컷오버 2025-07-01 (이미 지남).** 군(district) 계층이 **법적으로 폐지**되어 "District 1/4" 같은 구 주소는 더 이상 행정단위가 아니다. HCMC는 Binh Duong·Ba Ria-Vung Tau와 통합돼 168 코뮌급(방/사)으로 재편. → 앱의 위치/주소 데이터 모델을 **성/시 → 방(phường)/사(xã) 2계층**으로 재설계해야 함(UX 진단 2-1 ⑥·2-4 ①과 직결).
2. **PDPL(91/2025) 2026-01-01부터 효력.** 개인정보 동의·처리 요건이 이미 시행 중 → 전화번호 공개/Zalo 딥링크/위치 자동첨부 기능은 PDPL 동의 흐름과 함께 설계해야 함.
3. **Decree 147 = KYC를 "전화번호 우선"으로.** 본인인증 UX는 베트남 전화번호 인증을 1차로, 국가ID는 예외 경로로.

---

## 5. 제품·코드 개선사항 (UX 진단 + 검증 통합, 우선순위순)

UX 진단서 우선순위에 검증 결과(규제·결제·출처)를 반영해 재정렬했다. **코드 검증으로 "현 상태"는 전부 확정**됐으므로 아래는 실행 가능한 변경이다.

| 우선 | 변경 | 근거(검증 확인) | 코드 착점 |
|---|---|---|---|
| **1** | **신뢰 지표 교체/병기**: 매너온도 → 별점·거래완료수·응답률·전화인증 배지 | 매너온도 36.5는 **한국 전용 설계**(검증 8). 베트남 신뢰 시그널은 별점/인증 | `marketFormat.ts`, `MarketDetail.tsx:212` |
| **2** | **거래방식 명시 필드**(현장현금/계좌이체/MoMo·ZaloPay/택배+COD) | QR 거래 **54.67%** 시장(검증 20)인데 결제 연동 **0건**(코드 확인). 결제 모호성=불신 | `market.ts:154-165`(CreateListingParams), `MarketCreate.tsx` |
| **3** | **상품 상태 등급 필수 + 짧은 영상 업로드** | 사기·품질 우려 1위(미구매자 68%, 검증 15) | `MarketCreate.tsx:162`(accept 확장), `market.ts` 스키마 |
| **4** | **가격대 필터**(검색) + 기존 sort를 검색 UI에 노출 | 가격이 1순위 동기. sort는 **이미 구현**돼 노출만 하면 됨(코드 부분일치) | `MarketSearch.tsx`(MarketMain sort 재사용) |
| **5** | **선택적 안전결제(에스크로-lite)**: MoMo/ZaloPay 예치→검수 확인 시 릴리스 | 선입금 공포 구조적 해결. Chợ Tốt·FB 미해결 쐐기. **단 PDPL 결제정보 동의 준수**(검증 23) | 신규 — 약속(`DmDetail`) 완료 플로우에 연결 |
| **6** | **안전 만남장소 추천 + POI/랜드마크 선택**(약속) | 현재 "핀 찍기"만(코드 확인). 베트남은 명명장소(Circle K 등)로 약속 | `AppointmentLocationPicker.tsx:16-20` |
| **7** | **Zalo 연락 병행**(`zalo.me/<phone>` 딥링크 + 동의기반 번호공개) | Zalo 98%(검증 21). 현재 CTA는 인앱 DM 단일(코드 확인). **PDPL 동의 흐름 포함** | `MarketDetail.tsx:321-331` |
| **8** | **위치 데이터 모델 재설계**: district 폐지 반영, 방(phường)/사(xã) 2계층 | 행정 통폐합 **2025-07-01 시행 완료**(검증 24) — 이미 지난 리스크 | `LocationPickerSheet`, 위치 관련 전반 |
| **9** | **흥정 기본 ON / "나눔" 프레이밍 약화** | negotiable 기본 OFF·"비워두면 나눔" 카피 확인(코드). 흥정은 베트남 디폴트 | `MarketCreate.tsx:38,219` |
| **10** | **피드 = 라이더/동네 정보 허브로 재포지셔닝**(Info 연결) | Info 모듈 존재하나 피드 미연결(코드 확인). Zalo/FB와 안 겹치는 유일 자리 | `FeedCreate.tsx` ↔ `pages/info/` |

---

## 부록. 검증 통계

- 외부 정량 주장: 6개 각도 · 28개 소스 fetch · 106개 클레임 추출 · 25개 적대검증(24 확인/1 기각) + 후속 4클러스터 전수 보강
- 코드 주장: 41개 세부 → 40 확인 / 1 부분일치 / 0 오류 (read-only)
- 판정 분포(주요 24항): ✅ 확인 14 · 🟠 수정필요 9 · 🔴 오류 1
- 1차 출처(primary) 비중 높음: ResearchAndMarkets 보도자료·Carousell/Chợ Tốt 공식·당근 PR/기술블로그·Recommerce Index PDF 원문·DataReportal·Q&Me·Mordor·Tilleke/Duane Morris 법령분석

---

(끝)
