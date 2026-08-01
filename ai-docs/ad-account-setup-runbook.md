# 광고계정 선행 셋업 런북 — Meta Business + TikTok Ads

> 작성 2026-07-21. 사이공 라이더 정식오픈(2026-08-14) 대비 **광고계정 선행 생성**용.
> 채널: Meta Business(Facebook/Instagram) + TikTok Ads (대표님 최종 채널 확정 전 선행).
> 실제 로그인·서류 업로드는 본인인증이 필요하므로 **권도일이 직접 수행**. 코드로 대신 가능한 항목은 [코드로 처리 가능] 표기.

---

## 0. 왜 지금(선행) 하는가
비즈니스 인증(Business Verification)이 **최대 14영업일**까지 걸릴 수 있다. 8/14 오픈을 역산하면 계정·인증·도메인·결제 기반은 **7/21 지금 시작**해야 안전하다. 반대로 앱 등록·픽셀·MMP SDK는 각각 스토어 라이브(8/14)·픽셀 셋업(7/30) 시점에 해야 하므로 지금은 하지 않는다.

---

## 1. Meta Business — 생성 체크리스트

| # | 단계 | 무엇을 / 어디서 | 필요물 |
|---|---|---|---|
| 1 | Business Portfolio 생성 | business.facebook.com → "Create a Business Portfolio". 개인 FB 계정 로그인(개인/비즈니스 프로필 분리 유지) → 비즈니스명·담당자명·업무용 이메일 입력 → 이메일 인증 → 주소/전화 입력 | 개인 FB 계정, 업무용 이메일 |
| 2 | 광고계정(Ad Account) 생성 | Business Settings → Accounts → Ad accounts → Add → Create → 계정명 + **시간대 Asia/Ho_Chi_Minh(GMT+7)** + 통화. 신규 포트폴리오는 처음 1개만, 결제 1건 후 3개로 확장 | — |
| 3 | 결제수단 등록 | Ads Manager → Billing → Payment methods. **통화 매칭 주의**(§4-1) | 국내 발행 신용/체크카드 |
| 4 | 도메인 인증 `business.saigon-rider.com` | Business Settings → Brand Safety → Domains → Add. **본 런북 §5 방식(메타태그)으로 코드팀 준비 완료** | Meta 발급 토큰 |
| 5 | 비즈니스 인증 | Security Center → Start Verification → 서류 업로드. 서류상 회사명·주소·전화가 Business 설정과 **정확히 일치**해야 반려 안 됨 | 한국 사업자등록증(1년 이내) |
| 6 | 앱 등록 (App Install) | developers.facebook.com → Create App. **앱이 스토어 "Live" 상태여야 함** → 8/14 이후 | 스토어 라이브 |

## 2. TikTok Ads — 생성 체크리스트

| # | 단계 | 무엇을 / 어디서 | 필요물 |
|---|---|---|---|
| 1 | Business Center 생성 | business.tiktok.com → Sign up → 비즈니스 유형 선택 → 국가/지역·회사 법인명(BC명=회사명 일치) → **시간대·통화 정확히**(§4-1) | 이메일, 회사 법인명 |
| 2 | 광고계정(Advertiser) 생성 | Business Center → Accounts → Advertiser accounts → Add → Create New. **BC Admin 권한 필요** | Admin 권한 |
| 3 | 결제수단 등록 | Ads Manager → Billing. APAC은 은행송금·카드·PayPal 지원, 지역/통화에 따라 선불/후불 상이 | 국내 발행 카드 |
| 4 | 비즈니스 인증 | Business Center → Business info → verification. JPEG/PNG/PDF·10MB↓·워터마크/사본의사본 불가. 검토 2~7영업일 | 한국 사업자등록증 |
| 5 | 앱 등록 (App Promotion) | Ads Manager → Assets → App. **스토어 URL 필요** → 8/14 이후 | 스토어 라이브 |

---

## 3. 타임라인 배치

- **지금(7/21)**: Meta 1~5 / TikTok 1~4 (계정·인증·도메인·결제). 인증 승인 대기가 길므로 서류 제출을 먼저.
- **7/30 (픽셀/타겟 셋업)**: Meta Pixel/Conversions API, TikTok Pixel/Events API 웹 이벤트 셋업, 오디언스·타겟 설정.
- **8/14 (앱 라이브·집행)**: 양 플랫폼 앱 등록(스토어 URL), MMP(AppsFlyer/Adjust) SDK 앱 빌드 통합, iOS ATT·SKAdNetwork 매핑, 캠페인·소재 업로드.

---

## 4. 베트남 특이사항·리스크

1. **통화/결제 매칭** — Meta는 광고계정 통화 ↔ 카드 발행 통화가 어긋나면 결제 마찰. 한국 카드(KRW)면 계정 통화를 VND로 잡지 말고 **KRW 또는 USD** 검토. 단 국가 설정에 따라 이용 가능 결제수단 목록이 달라지므로 **계정 생성 시 통화를 신중히**(사후 변경 어려움).
2. **베트남 규제(Decree 70/2021)** — 국경간 광고 사전신고 의무는 **플랫폼(Meta/TikTok) 몫**이지 광고주(권도일) 몫이 아님. 별도 신고 불필요로 판단.
3. **부가세(VAT)** — 한국 카드 결제 시 VAT/원천징수 처리는 공식근거 미확인. **세무사 상담 권장.**

## 5. 앱 측정(전환 추적) — MMP 권장

**직접 SDK보다 MMP(AppsFlyer 또는 Adjust) 경유 권장:**
- Capacitor 공식 플러그인 존재(`appsflyer-capacitor-plugin`) — 순정 Meta/TikTok SDK는 네이티브 전제라 래핑이 번거로움.
- Meta+TikTok 동시 운영 시 순정 SDK 각각 삽입은 이벤트 중복 계상 위험 → MMP 하나로 양쪽 전송이 안전.
- iOS는 MMP + 플랫폼 SDK 하이브리드로 SKAdNetwork 포스트백 중계가 표준, Android는 MMP 단독으로 충분.
- 실행: 8/14 빌드 전 AppsFlyer(또는 Adjust) Capacitor 플러그인 통합 → dev key → Ads Manager에서 MMP 파트너 연결 → 이벤트 매핑(설치·회원가입·결제).

---

## 6. [코드로 처리 가능] Meta 도메인 인증 — 메타태그 방식

**방식 선정 근거**: 랜딩은 정적 SPA(`landing/apps/client`)로 `dist` 하나를 root/www/business 3개 도메인이 공유 서빙(App.tsx가 hostname으로 client-side 분기). `index.html`의 `<head>`에 메타태그를 넣으면 ① 재빌드에도 유지(소스에 있음) ② `business.saigon-rider.com`에도 자동 적용 ③ DNS 등록기관 접근 불필요.

### 절차
1. 권도일: Meta Business Settings → Brand Safety → **Domains** → Add `business.saigon-rider.com` → **Meta-tag** 방식 선택 → 발급된 토큰 복사. 형식:
   ```html
   <meta name="facebook-domain-verification" content="여기에_발급된_토큰" />
   ```
2. `landing/apps/client/index.html` 의 `<head>` 안(예: `<meta name="author" ...>` 줄 아래)에 위 태그 삽입.
3. **랜딩배포** (CLAUDE.md 절차):
   ```bash
   cd landing
   pnpm run build
   sudo cp -r apps/client/dist/* /var/www/saigon-rider/
   ```
4. Meta 콘솔의 Domains 화면에서 **Verify** 클릭 → 초록색 인증 완료 확인.

> **현재 상태(2026-07-21)**: 토큰 미발급(Portfolio 생성 전)이라 삽입 대기. 토큰 확보 즉시 위 2~4단계는 1줄 수정 + 재배포로 완료됨.

---

## 7. 불확실/확인 필요 (공식근거 미확정 — 추측 금지)

- 한국 사업자등록만으로 베트남 타겟 계정이 100% 승인되는지 → 명문 금지규정 없음, **인증 제출 결과로 확인**.
- 한국 카드 + VND 표시 계정 결제 실제 성공 여부.
- 카드 결제 VAT 처리 → 세무사.
- Meta AEM 8개 이벤트 제한 폐지(2025-06)·iOS 19/SKAdNetwork v5 → 7/30·8/14 시점 **공식 문서 재확인**.
