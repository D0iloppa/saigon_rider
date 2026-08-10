# H. 베트남 B2B 계약용 전자서명(e-signature) 서비스 — 원문 수집 (raw)

조사일: 2026-08-10. 판단·추천 없음. 원문/사실만 기록, 미확인 항목은 명시.

---

## 1. 베트남 전자거래법(Luật Giao dịch điện tử) 2023 — 전자서명 법적 효력

### 1-1. 법령 기본 정보
- 정식 명칭: Luật Giao dịch điện tử 2023, 번호 20/2023/QH15
- 시행일: 2024년 7월 1일 (2005년 구법 대체)
- 원문/해설: [thuvienphapluat.vn](https://thuvienphapluat.vn/van-ban/Cong-nghe-thong-tin/Luat-Giao-dich-dien-tu-2023-20-2023-QH15-513347.aspx)

### 1-2. 전자서명 3분류 (WebSearch 요약, Lexology/Tilleke 인용)
- Type 1: "Specialized e-signatures for organizations" (기관·조직 자체 전용 전자서명)
- Type 2: "Public digital signatures for individuals and organizations" (공공 전자서명, 공인인증서 기반)
- Type 3: "Specialized digital signatures for government agencies" (정부기관 전용)

출처: [Tilleke & Gibbins — Regulations on E-signatures and Trust Services in Vietnam](https://www.tilleke.com/insights/regulations-on-e-signatures-and-trust-services-in-vietnam/), 확인일 2026-08-10 (WebFetch 처리 결과 인용, 원문 페이지 직접 대조는 못함).

WebFetch로 추출된 핵심 인용문:
> "only secure specialized e-signatures (a secure e-signature of type 1) and digital signatures (type 2) are explicitly granted the same legal validity as handwritten (wet) signatures."

- Type 1 요건: 조직이 자체 생성 + "secure"(과학기술부 인증 획득)
- Type 2 요건: "licensed public digital signature certification service providers"가 발급
- 그 외(단순 전자서명, simple e-signature)는 "may gain recognition but lack explicit equivalence to handwritten signatures" — 즉 법적 효력을 원천 부인당하진 않으나, 손글씨 서명과 동등하다는 명시적 규정은 없음.

### 1-3. Article 23.1 — 전자서명 형식만으로 효력 부인 금지
> "The LOET 2023 explicitly recognizes the legal validity of e-signatures by stipulating that their legal validity is not denied merely because they are in electronic form (Article 23.1)."

- "secure" specialized e-signature 또는 digital signature = 개인의 종이문서 서명과 동일한 법적 효력.
- "secure" 판정 기준: 과학기술부(MST, 옛 정보통신부 MIC 기능 이관분 포함)로부터 safety certificate 발급.
- 외국 전자서명/인증서: 요건 충족 시(외국 전자서명인증 서비스제공자가 베트남 내 대표사무소 보유 등) 법적 효력 인정.

출처: WebSearch 결과 종합(Lexology "New Regulations on E-Signatures (Vietnam)", 확인일 2026-08-10). 정확한 조문 원문(베트남어 법령 전문) 미대조 — Article 23.1 표기는 2차 해설 기사(Lexology) 인용이며 법령 원문 조번호 직접 확인은 못함.

### 1-4. Decree 23/2025/ND-CP — 하위 시행령 (전자서명·신뢰서비스)
- 발효: 2025년 2월 21일 공표, 2025년 4월 10일 시행.
- 구 Decree 130/2018/ND-CP, Decree 48/2024/ND-CP를 대체.
- 인증서 4종 분류: root certificates, trust service provider certificates, public digital signature certificates, specialized certificates.
- 적용범위: 개인·조직·기관 (정부 전용 서명 제외).

출처: [RÖDL — New Regulations on Electronic Signatures and Trust Services in Vietnam](https://www.roedl.com/en/insights/vietnam-new-regulations-electronic-signatures-trust-services/), [LuatVietnam EN — Decree 23/2025/ND-CP](https://english.luatvietnam.vn/thue/decree-23-2025-nd-cp-defining-e-signatures-and-trust-services-390758-d1.html), 확인일 2026-08-10 (WebSearch 요약, 원문 페이지 직접 열람 못함 — 검색결과 스니펫 기반).

- 추가 참고: "3 National Technical Regulations on Trust Services" — 2026년 7월 1일부터 시행 예정이라는 언급 있음 (출처: [phucgia.com.vn](https://phucgia.com.vn/en/technical-regulations-on-trust-services), 확인일 2026-08-10, 원문 미대조).

### 1-5. B2B 상업계약(광고계약 포함)에서 단순 전자서명으로 충분한지
esign.ai 블로그(WebFetch 처리) 인용:
> "For standard commercial contracts, including advertising service agreements, token-based signatures are not mandatory... basic electronic signatures suffice under the Law on Electronic Transactions, allowing tools like email-based approvals or software-generated signatures as long as they demonstrate signer intent and document immutability."

- 인증서 기반(token/QES) 서명이 **강제되는** 영역(위 기사 기준): 은행/금융(대출·지급승인·AML, Circular 17/2020/TT-NHNN), 세무신고(전자세금계산서, Decree 123/2020/ND-CP), 부동산 소유권 이전(공증 요건, Land Law 2013/2024개정), 의료(Decree 13/2023/ND-CP), 정부조달(Law on Bidding 2023).
- **결론성 인용**(esign.ai 원문, 판단 아닌 원문 그대로): "For routine B2B advertising contracts without regulatory overlap, basic e-signatures suffice."

출처: [esign.ai — Is a token-based digital signature mandatory for companies in Vietnam?](https://www.esign.ai/blog/is-token-based-digital-signature-mandatory-companies-vietnam), 확인일 2026-08-10 (WebFetch로 콘텐츠 요약, 원문 전문 직접 대조는 못함).

### 1-6. 실무 관행 — Vietnam Law Magazine 해설
[Vietnam Law Magazine — Signing contracts by electronic means](https://vietnamlawmagazine.vn/signing-contracts-by-electronic-means-27312.html) (WebFetch 요약, 확인일 2026-08-10):

- 법상 전자서명 3유형 언급(2015 민법, 2005 LET 기준 해설 — **2023년 신법 반영 여부 불명**, 기사 작성 시점 확인 필요, 본 조사에서 발행일 미확인).
- "Digital Signature" — 공인 CSP(당시 15개 베트남 라이선스 사업자 언급) 인증, 법적 지위 가장 강함이나 "rarely used for major commercial contracts despite strongest legal standing"라고 원문 서술.
- "Scanned Signature"(출력 후 수기서명 → 스캔) — "widely used in multi-party and cross-border B2B agreements", 법령에 명시적 규정은 없으나 실무상 수용 확대.
- "Image Signature"(서명 이미지 삽입) — 저가치·일상 계약에 적합, 격식 가장 낮음.
- 법원 판단 기준: "substance over form" — 서명자 식별 가능성 + 내용 승인 의사 증명이 핵심, 형식적 방식보다 실질 동의 여부를 우선.
- 원문 결론(광고계약류 언급): "For advertising service agreements and similar B2B contracts, scanned signatures currently represent the practical legal standard in Vietnamese business practice." — **이는 3차 해설 기사의 주장이며, 법령 원문에 명시된 문구가 아님. 발행 시점(2005년법 기준인지 2023년법 기준인지) 미확인이라 현재도 유효한지 별도 검증 필요.**

---

## 2. 전자서명 서비스별 원문 수집

### 2-1. DocuSign
출처: [DocuSign — eSignature Legality in Vietnam](https://www.docusign.com/products/electronic-signature/legality/vietnam), 확인일 2026-08-10 (WebFetch).

- 원문 인용: "Electronic signatures are legally recognized in Vietnam" — Civil Code + Law on Electronic Transactions(LET) 근거.
- 참조 법령: Decree 23/2025, Circular No. 06/2024 (전자서명 인증서비스 제공자 규율).
- 주의 대상 문서유형(DocuSign 자체 명시): 부동산·건설계약, 대출·담보계약, 정부제출·공증 필요 문서, 위임장·부동산매매계약.
- 면책조항: "The information on this site is for general information purposes only and is not intended to serve as legal advice."
- **베트남 현지 파트너십**: CMC Technology and Solutions(CMC TS)가 베트남 최초 DocuSign Trusted Service Provider. CMC CA(베트남 국가전자인증센터 NEAC 라이선스 CA)와 연동해 베트남 전자서명법 완전 준수 워크플로우 제공.
  - 출처: [CMC — CMC TS is the first partner of Docusign to provide Docusign-integrated digital signature solution in Vietnam](https://www.cmc.com.vn/insight-detail/cmc-ts-is-the-first-partner-of-docusign-to-provide-docusign-integrated-digital-signature-solution-in-vietnam-202010075657.html), 확인일 2026-08-10 (WebSearch 스니펫, 원문 페이지 직접 열람은 못함).
- API/다국어: WebSearch 요약 인용 — "DocuSign's eSignature platform supports Vietnam's legal requirements through API integrations and customizable templates... multi-language support (including Vietnamese)". **원문 페이지 직접 대조 못함, 2차 검색결과 스니펫 기반.**
- 가격: 이번 조사에서 **미확인**(DocuSign 표준 글로벌 요금제 페이지 별도 확인 필요, 베트남向 특가는 검색 안됨).

### 2-2. Adobe (Acrobat Sign / Adobe Sign)
출처: [Adobe — Electronic Signature Laws & Regulations - Vietnam](https://helpx.adobe.com/legal/esignatures/regulations/vietnam.html), [Adobe Acrobat Sign compliance page](https://www.adobe.com/vn_en/sign/compliance/electronic-signature-legality.html) — WebSearch 스니펫만 확인, WebFetch 미실시.

- 검색결과 인용: "Electronic signatures are legally recognized in Vietnam and are regulated by the Civil Code, the Law on Electronic Transactions dated June 22, 2023, and Decree No. 23/2025 guiding on electronic signatures and trust services."
- "Simple electronic signatures, such as typed names or clicked checkboxes, are valid for low-risk transactions, but qualified electronic signatures—those using digital certificates from licensed certification service providers—carry the highest legal weight, equivalent to wet-ink signatures."
- "Adobe Sign is a compliant platform that can be used for electronic signatures in Vietnam, though the specific legal validity will depend on the type of signature method used within the platform and whether it meets Vietnam's requirements for your particular use case." — **이 문장이 WebSearch 자체 생성 요약인지 원문 인용인지 불명확, 원문 페이지 직접 대조 필요.**
- 가격/베트남 로컬 CA 연동 여부: **미확인.**

### 2-3. 모두싸인 (Modusign, 한국 업체)
출처: [modusign.co.kr/legality](https://modusign.co.kr/legality) (WebFetch), 확인일 2026-08-10.

- 법적 근거는 **한국 법**만 명시: 민법(낙성불요식 계약원칙), 전자서명법, 전자문서 및 전자거래 기본법. 베트남 법령 언급 없음.
- 다국어 지원: WebSearch 요약 — "한국어와 영어, 중국어, 일본어, 베트남어, 프랑스어 등 총 6개 국어 전자서명 서비스를 제공... 계약 상대방이 영어, 중국어, 일본어, 베트남어로 모든 절차를 진행할 수 있습니다." (출처: [modusign.co.kr](https://modusign.co.kr/), 확인일 2026-08-10, WebSearch 스니펫 — 정확한 문구 위치는 특정 못함, 별도 페이지 확인 필요)
- **WebFetch로 확인한 legality 페이지 자체는 "베트남 특화 지원·베트남어 계약 관련 언급 없음"** — 즉, 서비스 자체는 UI 다국어를 제공하나 베트남 현지 법(전자거래법 2023) 준거성에 대한 공식 명시는 legality 페이지에서 확인되지 않음.
- 대상 시장: 한국 기업·공공기관 중심(공공기관 표기 다수).
- API 연동 가능 여부·가격: **이번 조사에서 미확인**(별도 요금제/API 문서 페이지 필요).

### 2-4. 글로싸인 (Glosign, 한국 전자계약 스타트업 — 해외진출 언급)
- 검색 스니펫에서 "정보보호 스타트업, 해외로 가다 — 전자계약 서비스 '글로싸인'" 기사 발견: [boannews.com](https://m.boannews.com/html/detail.html?idx=109408). **본문 내용(베트남 진출 구체 여부) 미확인 — WebFetch 미실시.**

### 2-5. VNPT-CA / VNPT SmartCA (베트남 로컬)
출처: [VNPT-CA](https://www.vnpt-ca.vn/), [VNPT SmartCA](https://smartca.vnpt.vn/), [oneSME — VNPT-CA 서비스](https://onesme.vn/enterprise/service/2/chu-ky-so-vnpt-ca) — WebSearch 스니펫 기반.

- VNPT-CA: 공공 디지털서명 인증서비스, 법적 효력 보유(공인 CA).
- VNPT SmartCA: 원격(클라우드) 디지털서명, eIDAS(유럽) + 베트남 정보통신부(MIC) 표준 충족 주장. HSM EAL4+ 인증.
- 배치서명·자동서명 지원, 웹/모바일/데스크톱 다중 플랫폼 통합 언급(구체 API 스펙 미확인).

**가격표** (출처: [onesme.vn — 챗ky so bao nhieu tien](https://onesme.vn/blog/tin-tuc-su-kien/chu-ky-so-bao-nhieu-tien.html), WebFetch, 확인일 2026-08-10 — VAT 10% 포함가):

VNPT-CA (하드웨어 USB 토큰, 조직 신규등록):
| 패키지 | 기간 | 서비스료 | USB토큰 | 합계 |
|---|---|---|---|---|
| OID Standard | 12개월 | 1,273,000đ | 550,000đ | 1,823,000đ |
| OID Standard | 24개월 | 2,190,000đ | 550,000đ | 2,740,000đ |
| OID Standard | 36개월 | 3,112,000đ | 포함 | 3,112,000đ |
| OID Pro | 12개월 | 5,500,000đ | 550,000đ | 6,050,000đ |
| OID Pro | 24개월 | 9,900,000đ | 550,000đ | 10,450,000đ |
| OID Pro | 36개월 | 13,200,000đ | 550,000đ | 13,750,000đ |

갱신(조직): OID Standard 1,273,000đ/12개월, OID Pro 5,500,000đ/12개월.

콤보 패키지(CA + 사회보험 소프트웨어 BHXH, 18개월):
| 패키지 | 대상 | 합계 |
|---|---|---|
| CA-VAN10 | 1~10인 | 1,870,000đ |
| CA-VAN100 | 11~100인 | 2,134,000đ |
| CA-VAN1000 | 101~10,000인 | 2,447,500đ |
| CA-MAX | 무제한 | 2,750,000đ |

SmartCA(클라우드, 무하드웨어):
- 조직: 1,273,000đ~2,912,000đ / 12~36개월
- 개인: 월 35,000đ부터, 연 220,000đ~550,000đ

별도 WebSearch 요약(원문 페이지 미대조 보조 인용): "고급(advanced) SmartCA 패키지 가격은 basic 패키지의 150%", "고급 패키지는 24시간당 최대 10,000건 서명 vs 기본 500건" — [onesme.vn/blog/san-pham/vnpt-smartca-la-gi.html](https://onesme.vn/blog/san-pham/vnpt-smartca-la-gi.html), 확인일 2026-08-10, WebSearch 스니펫.

- API 연동 가능 여부: 페이지 상 "integration on multiple platforms" 언급만 있고 **공개 API 문서·개발자 포털 유무는 미확인**.
- 영어 지원 여부: **미확인**(사이트 자체가 베트남어 위주로 보임, 직접 열람 안 함).

### 2-6. FPT.eSign (베트남 로컬, FPT IS)
출처: [FPT IS — FPT.eSign](https://fpt-is.com/fpt-esign/), [esign.fpt.com](https://esign.fpt.com/), [esign.fpt.com.vn](https://esign.fpt.com.vn/) — WebSearch 스니펫, WebFetch 미실시(가격 페이지 직접 열람 실패).

- 원격 디지털서명, 모바일에서 USB토큰/SIM 없이 서명 가능(클라우드 기반).
- 인증 방식: OTP SMS + MPKI. HSM은 FPT.CA 표준 시스템에 저장.
- 표준 준거: 정보통신부(MIC) 보안정책 + ISO + eIDAS(유럽) 언급.
- 응용분야: 전자세금계산서, 사회보험, 세무신고, 회계, HR, 영업, 은행/증권거래 등.
- API: "FPT.eSign API는 인증서 발급을 위한 고객정보 전송에 사용된다"는 언급 확인 — **구체 스펙(REST/SOAP, 엔드포인트, 인증방식) 미확인**. 통합 소요기간 "as little as one week"라는 마케팅 문구 있음(출처 미특정, 검증 안 됨).
- 가격: **정확한 금액 미확인**. WebSearch 결과는 "1년당 100만동대 초반(just over 1 million VND per year)"이라는 3차 요약뿐이며, 원문 가격표(esign.fpt.com 자체 페이지)는 이번 조사에서 직접 열람하지 못함. USB 토큰(FPT-CA 구형 라인, 다른 도메인)에 대해선 평생보증 언급.
- 영어 지원: **미확인.**

**참고 — Kyta (FPT의 별도 전자계약 SaaS)**: [kyta.fpt.com](https://kyta.fpt.com/en/blogs/e-contracts-in-vietnam-2025-latest-regulations-and-business-impact) (WebFetch, 확인일 2026-08-10).
- FPT 계열의 계약수명주기관리(CLM) 플랫폼. 서브 제품: Kyta ALM(계약생애관리), Kyta Signature(전자서명), Kyta Gate(신뢰서비스 관련 추가기능).
- "Saves up to 90% of processing time" 마케팅 문구, AI 통합 언급.
- **2025년 초 출시, 금융·보험·물류·부동산 분야 국내외 기업 약 4,500곳 사용 중**이라는 언급(별도 WebSearch 결과, [goodmorningvietnam.co.kr](https://www.goodmorningvietnam.co.kr/news/article.html?no=80172) 스니펫, 확인일 2026-08-10, 원문 직접 대조 못함).
- 영어 페이지 존재(`kyta.fpt.com/en/...`) — 즉 **영어 지원 확인됨**.
- 정부 목표 인용: "Vietnam targets over 80% of Vietnamese businesses adopting e-contracts by 2025, advancing toward 100% by 2030."
- 가격: **미확인.**

### 2-7. Viettel-CA (베트남 로컬)
출처: [viettel-ca.vn](https://viettel-ca.vn/), [tokenviettel.com](https://tokenviettel.com/) — WebSearch 스니펫만.

- 정보통신부(BTTTT) 라이선스 공인 CA, 법인 인감 대체 역할 명시.
- API 엔드포인트 확인: `https://api.viettelca.vn/vtss/service/ras/v1`, `setCredentials()` / `sign()` 함수 언급 — **출처가 2차 통합가이드(viettelsolution.com.vn)이며 공식 API 레퍼런스 원문은 직접 열람하지 못함.**
- 가격: **미확인**(별도 사이트 chukysoviettel-ca.com에 "Bảng giá chữ ký số 2026" 언급 있으나 이번 조사에서 열람 안 함).
- 영어 지원: **미확인.**

### 2-8. MISA eSign (베트남 로컬)
출처: [esign.misa.vn](https://esign.misa.vn/), [meinvoice.vn](https://www.meinvoice.vn/tin-tuc/14784/chu-ky-so-misa-esign/) — WebSearch 스니펫만.

- 원격 디지털서명, 모바일 직접 서명 지원. 전자세금계산서·세무신고·사회보험·관세·전자계약 서명 등에 사용.
- MISA는 베트남 국가전자인증센터(NEAC)로부터 원격서명(USB토큰 불필요) 서비스 라이선스 취득 — 출처: [neac.gov.vn 공지](https://neac.gov.vn/vi/tin-tuc-su-kien/detail/misa-duoc-cap-phep-cung-cap-dich-vu-chu-ky-so-tu-xa,-khong-can-usb-token-195.htm), 확인일 2026-08-10 (제목만 확인, 본문 미열람).
- 가격: USB 토큰 장치가 550,000동(조직/개인 대상)이라는 언급만 확인, 서명 서비스 자체의 연간 요금은 **미확인**. 프로모션 문구("3년 구매 시 3.5년 추가 제공") 있으나 구체 정가 미확인.
- API/영어 지원: **미확인.**

---

## 3. 국제(글로벌) 서비스의 베트남 CA 연동 요약

- DocuSign: CMC TS(현지 파트너, NEAC 라이선스 CA)와 연동해 베트남 법 완전 준수 워크플로우 제공한다고 주장 (2-1 참조).
- Adobe Sign: 베트남 법 준거 플랫폼이라는 자체 설명은 있으나, 현지 CA와의 구체적 파트너십 명시는 이번 조사에서 확인 못함.
- 모두싸인: 베트남 법령 언급 자체가 legality 페이지에 없음 — 베트남 현지 CA 연동 여부도 확인 안 됨. 다국어(베트남어 포함) UI는 확인되나, 이는 "베트남 거래상대방이 베트남어로 서명 절차를 볼 수 있다"는 뜻일 뿐 베트남 전자거래법상 공인 디지털서명(Type 2) 발급 주체인지와는 별개 — **이 구분은 원문에 명시되지 않아 추가 확인 필요.**

## 4. 한국 스타트업의 베트남 B2B 전자계약 도입 사례/후기

- 직접적인 "한국 스타트업이 베트남 B2B 계약에 전자서명 도입" 사례/후기 기사는 **이번 검색에서 발견되지 않음.**
- 관련은 있으나 사례 자체는 아닌 자료:
  - [모두싸인 공식 블로그 — 전국 영업 전자계약 도입 성공 사례집](https://blog.modusign.co.kr/insight/customer-stories/sales_casebook_ver2) — 한국 국내 세일즈 부서 사례집으로 보이며, **베트남 관련 여부 미확인**(제목만 확인, 본문 미열람).
  - [프라이드CEO 뉴스레터 — 베트남에서 전자 계약과 서명은 법적 효력이 있을까?](http://newsletter.prideceo.or.kr/board/news/323?webzine=Vol.10) — 한국 중소기업 대상 베트남 진출 뉴스레터로 보이나, **본문 미열람, 실제 도입 후기 포함 여부 불명.**
  - 글로싸인의 "해외로 가다" 기사(2-4 참조) — 해외진출 관련 기사이나 베트남 특정 여부 미확인.
- 결론: **한국 스타트업의 베트남向 전자서명 실사용 후기는 이번 조사에서 확인되지 않음(추가 심층 검색 필요, 예: 베트남 진출 한국 스타트업 커뮤니티/카페, KOTRA 보고서 등 별도 소스 탐색 권장).**

---

## 5. 미확인/추가 확인 필요 항목 목록 (재확인 필요)

1. 베트남전자거래법 2023 제23조 원문(베트남어 조문) 직접 대조 — 이번 조사는 전부 영어 2차 해설(Lexology/Tilleke) 기반.
2. DocuSign/Adobe Sign 각각의 실제 베트남向 가격(플랜별 USD)과 API 문서.
3. VNPT SmartCA / FPT.eSign / Viettel-CA / MISA eSign의 **공식 API 개발자 문서**(엔드포인트, 인증방식, rate limit, 영어 지원 여부) — 전부 검색 스니펫 수준에서 멈춤, 공식 문서 페이지 직접 열람 필요.
4. FPT.eSign 정확한 연 요금제 표 (VNPT처럼 표 형태로 확보 못함).
5. Kyta(kyta.fpt.com) 가격.
6. 모두싸인의 베트남 파트너/현지 CA 연동 여부 — 별도 페이지(가격/기능 페이지) 확인 필요.
7. 한국 스타트업의 베트남 B2B 전자서명 실사용 후기 — 별도 소스(카페, KOTRA, 베트남 진출 지원기관) 탐색 필요.
8. Vietnam Law Magazine 기사의 발행 시점(2005년법 기준 서술인지, 2023년 신법 반영본인지) — 미확인이라 "scanned signature가 실무 표준"이라는 결론의 현재 유효성 재검증 필요.
