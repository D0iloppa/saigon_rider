# SYNTHESIS — 거래 DM 내 위치공유(unicast) + 음성메시지(워키토키) 결합 제공의 법적 리스크 (베트남)

조사일: 2026-08-27. **본 문서는 법률 판단이 아니라 리서치 결과 정리이며, 실제 기능 출시 전 베트남 현지 변호사 자문으로 재확인이 필요하다.**

원문 상세는 `sources/A_decree13_sensitive_data.md`, `sources/B_recording_correspondence_secrecy.md`, `sources/C_pdpl2025_transition.md` 참조.

---

## 핵심 포인트

**1. 조사 시점 기준(2026-08-27) 적용 법령은 Decree 13/2023이 아니라 PDPL 2025(Law No. 91/2025/QH15) + Decree 356/2025/ND-CP다.** 2026-01-01부로 완전 대체되었다. 구법(Decree 13) 프레임을 신법이 계승하되 위치정보에 대해 "수집고지 + 옵트아웃 제공" 요건이 더 명시화되고, 유출 시 통지기한이 유형별로 세분화됐다. (`C` 참조: [EY Vietnam](https://www.ey.com/en_vn/technical/tax/tax-and-law-updates/legal-alert-july-2025-personal-data-protection-law), [Tilleke & Gibbins](https://www.tilleke.com/insights/vietnams-new-personal-data-protection-law-a-closer-look/), [Rajah & Tann](https://www.rajahtannasia.com/viewpoints/new-decree-implementing-the-law-on-personal-data-protection-passed/))

**2. 위치정보(location data)는 신·구법 모두에서 "민감정보"로 명시적으로 열거된다.** Decree 13 Article 2.4의 "위치서비스로 식별된 개인 위치정보"가 그대로, PDPL 2025에서는 "정밀 위치정보(precise location data)"로 더 구체화되어 이어진다. GPS 좌표 unicast 공유 기능은 민감정보 처리로 볼 근거가 뚜렷하다 — 목적 고지, 목적별 동의, (신법 기준) 옵트아웃 옵션 제공이 요구된다. (`A` §2, `C` §1~2, [Viet An Law](https://vietanlaw.com/decree-13-2023-nd-cp-on-protection-of-personal-data/), [Tilleke & Gibbins](https://www.tilleke.com/insights/a-closer-look-at-vietnams-first-ever-personal-data-protection-decree/))

**3. 음성(voice)은 "민감정보"로 자동 분류된다는 명확한 근거를 찾지 못했다 — 다만 상충하는 2차 소스가 존재해 재검증이 필요하다.** 조문 열거 목록(Decree 13 및 PDPL 2025 모두)에 "voice"라는 독립 항목은 없다. 대신 "생체적/신체적 특성(biometric or biological characteristics)"이라는 포괄 범주가 있어, **화자식별용 음성지문(voiceprint)이라면 생체정보로 포섭될 가능성**이 있지만, 거래 DM에서 주고받는 **콘텐츠성 음성메시지(대화 내용을 녹음해 전송하는 워키토키형 파일)** 자체가 이 범주에 자동 포함된다는 명시적 규정·해설은 확인하지 못했다. 반면 일부 2차 검색결과(원문 미대조, 출처 특정 실패)는 "voice는 Decree 13 Art.2.4(d)의 민감정보"라고 단정적으로 서술해 — 이 두 결과가 상충한다. **실무적으로는 보수적으로 접근해 음성메시지도 민감정보에 준해 취급(목적 고지+동의)하는 것이 안전.** (`A` §3)

**4. 통신비밀 침해(도청)형 규제는 "제3자의 무단 침입·탈취"를 규율하는 것으로 보이며, 앱이 정상 기능으로 이용자 간 메시지를 전달·저장하는 행위 자체를 별도로 금지하는 조항이라는 근거는 찾지 못했다.** 헌법 21조·형법 159조는 사적통신의 "불법 침입·통제·압수"를 금지하는 구조이며, 서비스제공자가 발신자 요청에 따라 메시지를 전달하는 정상 서비스 흐름과는 결이 다르다(리서치 차원의 해석, 확정적 결론 아님). "Law on Cyberinformation Security"라는 명칭의 법에서 도청동의 특칙을 별도로 찾지 못했고, 실시간 통화녹음(콜센터형)에 대한 3차 해설은 있으나 워키토키형 비실시간 음성메시지 전송에 그대로 적용되는지를 명시적으로 다루는 소스는 발견하지 못했다 — **이 항목은 조사 신뢰도가 가장 낮으니 특히 재검증 필요.** (`B` §1~4)

**5. "위치+음성을 하나의 기능 세트로 묶는 것" 자체에 대한 별도·가중 규제는 조사한 모든 소스(Decree 13, PDPL 2025, Decree 356 관련 2차 해설 전체)에서 발견되지 않았다.** 법령 구조 자체가 데이터 유형별로 개별 요건(목적고지·동의·유출통지기한 등)을 규정하는 방식이고, "N개 민감정보를 동시 처리하면 임계값을 넘어 추가 의무가 생긴다"는 콤비네이션 조항은 없는 것으로 보인다. 즉 **"각 데이터 종류별로 동의·목적명시·보관기간·삭제권을 개별적으로 지키면, 두 기능을 같은 화면/제품 세트로 묶어 제공하는 것 자체는 이번 조사 소스 기준 추가 법적 의무를 만들지 않는다"**는 쪽에 조사 결과가 기운다. 다만 PDPIA(영향평가) 작성 시 "여러 민감정보 유형 동시 처리"가 고위험 처리 트리거로 취급되는지는 Decree 356 세부 시행지침 원문을 대조하지 못해 미확인으로 남겨둔다. (`A` §5, `C` §4)

---

## 결론 요약 (재차 강조: 리서치 결과이지 법적 판단이 아님)

- 위치공유 기능: 민감정보 처리로 취급하고 목적고지 + 명시적 동의 + 옵트아웃 옵션을 갖출 것을 권장하는 방향으로 소스가 수렴.
- 음성메시지 기능: 민감정보 해당 여부가 소스 간 불일치 — 보수적으로 동일하게 목적고지+동의 절차를 갖추는 편이 안전. 실시간 통화 감청과는 성격이 다르다(비실시간 파일 전송)는 구분점은 있으나 이를 뒷받침하는 명시적 법률자문 아티클은 못 찾음.
- 두 기능을 하나의 UX/기능 세트로 묶는 것 자체에 특별히 추가되는 법적 의무는 조사 범위 내에서 발견되지 않음 — 결합이 아니라 "각 데이터 유형별 요건 충족 여부"가 관건이라는 쪽으로 소스가 수렴.
- 가장 신뢰도가 낮은 대목은 (a) 음성의 민감정보 해당 여부(상충 소스), (b) 도청/감청법이 비실시간 음성메시지 전송에 적용되는지 여부(원문 미확인) — 이 두 가지는 출시 전 반드시 베트남 현지 변호사 확인 필요.

**미확인/추가 확인 필요 전체 목록**은 `sources/A_decree13_sensitive_data.md` §3, `sources/B_recording_correspondence_secrecy.md` §3~4, `sources/C_pdpl2025_transition.md` §5 참조.
