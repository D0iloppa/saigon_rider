# A. Decree 13/2023/ND-CP(PDPD) — 민감정보 분류: 위치정보·음성데이터 — 원문 수집 (raw)

조사일: 2026-08-27. 판단·추천 없음. 원문/사실만 기록, 미확인 항목은 명시.

**중요 — 시점 주의**: Decree 13/2023/ND-CP는 2026-01-01부로 **Law on Personal Data Protection(PDPL) No. 91/2025/QH15 + 시행령 Decree 356/2025/ND-CP 로 대체됨**(현재 유효 법령 아님). 조사 시점(2026-08-27) 기준 **현행법은 PDPL 2025 + Decree 356/2025**. Decree 13 조사는 구법이지만 신법이 그 프레임을 계승했으므로 비교 근거로 유지. 상세는 `C_pdpl2025_transition.md` 참조.

---

## 1. Decree 13/2023/ND-CP 민감정보(sensitive personal data) 정의 — Article 2, Clause 4

WebSearch 결과 종합(LuatVietnam, Lexology, Watson Farley & Williams 등 검색 스니펫 기반, 조문 원문 직접 대조 못함):

> "Sensitive personal data" = 개인의 프라이버시와 결부된 정보로서, 침해 시 개인의 적법한 권리·이익에 직접 영향을 미치는 정보.

열거된 카테고리 (WebFetch 처리: Viet An Law + Tilleke & Gibbins + FPF 3개 소스 교차확인, 확인일 2026-08-27):

- 정치적 견해·종교적 신념
- 건강상태 및 의료기록상 사생활 정보 (**혈액형 제외**)
- 인종·민족 출신 정보
- 유전정보(선천/후천 유전적 특성)
- **신체적 특성 및 생체적 특성(physical attributes and biological characteristics / biometric or biological characteristics)**
- 성생활·성적지향 정보
- 범죄·위법행위 기록(법집행기관 보유분)
- 신용기관/외국은행지점/결제중개서비스제공자의 고객정보(신원·계좌·예금·거래·보증인 정보)
- **위치서비스로 식별된 개인 위치정보(personal location data identified through location services)**
- 기타 법령상 별도 보안조치가 요구되는 정보

출처: [Viet An Law — Decree 13/2023/ND-CP on protection of personal data](https://vietanlaw.com/decree-13-2023-nd-cp-on-protection-of-personal-data/) (WebFetch, 확인일 2026-08-27), [Tilleke & Gibbins — A Closer Look at Vietnam's First-Ever Personal Data Protection Decree](https://www.tilleke.com/insights/a-closer-look-at-vietnams-first-ever-personal-data-protection-decree/) (WebFetch, 확인일 2026-08-27), [Future of Privacy Forum — Vietnam's Personal Data Protection Decree: Overview, Key Takeaways, and Context](https://fpf.org/blog/vietnams-personal-data-protection-decree-overview-key-takeaways-and-context/) (WebFetch, 확인일 2026-08-27).

FPF 소스 원문 특기사항: "list is more extensive than the GDPR's definition" — GDPR 대비 민감정보 범위가 넓어 중소업체도 규제 대상이 되기 쉽다는 논평.

## 2. 위치정보(location data) — 명시적 민감정보 여부

**명시적으로 포함됨.** 3개 소스(Viet An Law, Tilleke, FPF) 모두 "location data identified through location services" / "location data obtained through location services"를 민감정보 리스트에 직접 열거. 애매함 없음 — GPS 좌표 기반 위치공유는 Decree 13 하에서 민감정보 처리로 분류될 가능성이 높음(추가 법률자문 필요하나 리서치 소스 상 이견 없음).

## 3. 음성(voice)데이터 — 명시적 민감정보 여부: 두 갈래 결과 (교차검증 필요)

두 갈래의 상충하는 검색결과가 나와 **명확히 구분해 기록**:

### 3-1. "voice가 명시적 sensitive data" 라는 검색결과
WebSearch 요약(출처 특정 안 된 2차 종합, [Didomi — Vietnam data privacy law (PDPD): everything you need to know](https://www.didomi.io/blog/vietnam-data-privacy-law-pdpd-everything-you-need-to-know) 등이 후보 출처로 제시됨, 확인일 2026-08-27):
> "In Vietnam, an individual's voice is categorized as 'sensitive personal data' according to Article 2.4(d) of Decree No. 13/2023/NĐ-CP."

이 문구는 **WebSearch 자체 생성 요약**이며 정확히 어느 원문 페이지의 어느 문장인지 특정하지 못함(Didomi 블로그 자체를 WebFetch 로 직접 대조하지 않음) — **미확인, 재검증 필요**.

### 3-2. 조문 열거 목록에는 "voice" 별도 항목 없음 — "생체적 특성" 범주에 포함 여부만 해석 문제
Viet An Law·Tilleke·FPF·LuatVietnam 4개 소스 전부 Article 2.4 열거 목록에 "voice"를 **별도 항목으로 명시하지 않음**. 대신 "physical attributes and biological characteristics"(신체·생체적 특성) 이라는 포괄 범주가 있고, 이 범주가 **음성을 생체인식(voiceprint, 화자 식별용 음성 지문)으로 사용할 경우에는 생체정보로 포섭될 가능성**이 있으나, **단순히 "녹음된 음성 메시지 파일"(대화 내용 전송용, 화자 식별 목적 아님)이 이 범주에 자동으로 해당되는지는 조사 소스에서 명시적으로 답을 주지 않음.**

출처: [LuatVietnam EN — Decree No. 13/2023/ND-CP](https://english.luatvietnam.vn/decree-no-13-2023-nd-cp-dated-april-17-2023-of-the-government-on-personal-data-protection-249791-doc1.html) (WebSearch 스니펫, 원문 미대조), 위 2-1 인용 3개 소스 동일.

**결론(리서치 수준, 판단 아님)**: "위치정보"는 법령상 민감정보로 명확히 열거되어 이견이 없다. "음성"은 (a) 화자식별용 생체음성지문(voiceprint)이라면 "생체적 특성" 범주로 민감정보 해당 가능성이 있으나, (b) 거래 DM에서 주고받는 **일반 음성메시지(대화 콘텐츠, 워키토키형 파일 전송)** 자체가 민감정보로 자동 분류된다는 명시적 근거는 이번 조사에서 확인되지 않았다. 이 구분(식별목적 음성 vs 콘텐츠 음성)은 리서치에서 도출한 해석이며 **법률 자문으로 최종 확인 필요**.

## 4. 민감정보 동의(consent) 절차 — 일반정보 대비 강화 여부

- 동의는 명확(clear)·구체적(specific)·검증가능(verifiable, 시점·범위 포함)해야 하며, 목적별로 개별 동의를 받아야 함(하나의 포괄동의 대신 처리목적이 여럿이면 각각 동의 선택 가능하게 구성).
- 민감정보 처리 시 추가 절차: 해당 정보가 "민감정보"에 해당한다는 사실을 정보주체에게 **고지**해야 함(단, 법령상 예외 사유 있는 경우 제외).
- 조사 소스들(Viet An Law, Tilleke)은 민감정보에 대해 "일반정보보다 더 엄격한 별도의 명시적(explicit) 동의 서식"을 규정한다고 단정하지 않음 — 대신 "민감정보임을 고지 + 목적별 동의"가 핵심 요건으로 반복 확인됨. **"explicit consent"라는 GDPR식 별도 법적 트리거 문구가 Decree 13 조문에 명시돼 있는지는 원문 직접 대조 못해 미확인.**

출처: 상동 (Viet An Law, Tilleke, WebSearch 종합 — [Lexology, Legal update on Personal Data Protection](https://www.lexology.com/library/detail.aspx?g=8a617748-e0b8-4b71-9ee0-12e8a1c885ca) 포함), 확인일 2026-08-27.

## 5. 결합수집(위치+음성 동시)에 대한 별도 규제 여부

**조사한 모든 소스(Viet An Law, Tilleke, FPF)에서 "복수의 민감정보 카테고리를 하나의 기능/제품으로 결합 수집하는 것" 자체에 대한 별도·가중 규제 조항은 발견되지 않음.** FPF 아티클은 리스트 자체가 GDPR보다 넓다는 점만 언급했을 뿐, 결합수집 시 추가 의무가 발생한다는 서술은 없음. Decree 13(및 후속 PDPL 2025 — `C_pdpl2025_transition.md` 참조)의 구조는 **데이터 유형(카테고리)별 요건을 규정**하는 방식이며, "N개 민감정보 카테고리를 동시 처리하면 임계값을 넘어 추가 의무가 발생한다"는 식의 조합적(combinatorial) 규정은 이번 조사에서 확인되지 않았다.

**미확인 사항**: PDPIA(개인정보영향평가) 작성 시 "여러 민감정보 유형을 동시 처리"하는 사업이 고위험(high-risk) 처리로 분류되어 더 엄격한 PDPIA 심사를 받는지 여부 — Decree 356/2025 세부 시행지침 원문까지는 확인하지 못함(추가 확인 필요).

## 6. PDPIA(영향평가) 의무

Decree 13 하에서는 모든 Controller/Processor가 데이터 유형과 무관하게 "Impact Assessment Report(IAR)"를 처리 개시 시점부터 작성·보관하고, 공안부(A05) 요청 시 60일 내 제출 가능해야 함(WebFetch, FPF/Viet An Law 종합). 민감정보라고 해서 별도의 상위 등급 평가서를 요구하는 명시 조항은 확인되지 않음(단, 후속 PDPL 2025/Decree 356 은 PDPIA 서식·절차를 새로 규정 — C 문서 참조).
