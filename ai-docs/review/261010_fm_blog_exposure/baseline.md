# FM 블로그 노출 실험 — 기준선(baseline)

- task id: `2026-10-10-fm-google-blog-exposure`
- SoT: [`ai-docs/task/active/261010_fm_google_blog_exposure_task.md`](../../task/active/261010_fm_google_blog_exposure_task.md) (§2.3, §2.5, §2.6, §3 P0)
- 트랙: **경량**(§6 D12, 2026-10-10 확정) — 정적 `/blog/<slug>/`, 지표는 Search Console UI 수기 판독
- 업스트림 확인: `fm_upstream.py` 전 항목 `unchanged` @ `da4644f` (2026-10-10)
- 이 문서는 **첫 발행 전에 ①~⑤를 채워 완성**한다. 완성 후 ⑤ 동결 줄에 서명.

---

## 운영자 체크리스트 (순서대로)

- [x] **(a) 랜딩 sitemap 변경 배포** (중복 7 라우트 제외 — SoT §6 D3) — 2026-10-13 완료: 로컬 빌드(527c2c39) rsync, 운영 sitemap-site loc=3, 백업 `/var/www/saigon-rider.bak-20261013T042949Z.tgz`
  1. `cd landing && nvm use 22 && pnpm run build`
  2. `grep -c "<loc>" apps/client/dist/sitemap-site.xml` → **3** (`/`, `/ko`, `/en`)
  3. dist 복사: `sudo cp -r apps/client/dist/* /var/www/saigon-rider/` (CLAUDE.md `랜딩배포`)
  4. `curl -s https://saigon-rider.com/sitemap-site.xml | grep -c "<loc>"` → **3**
- [x] **(b) Search Console 도메인 속성 추가** (미등록 → 신규, SoT §6 D4) — 2026-10-13 등록(사용자)
  1. Search Console → 속성 추가 → **도메인** → `saigon-rider.com` → 안내된 TXT 값 복사
  2. 도메인 등록업체의 DNS 관리에서 TXT 레코드 추가 (호스트 `@`, 값 = 복사한 TXT). 등록업체: ____
  3. 전파 후 확인: `dig TXT saigon-rider.com +short` 에 값 표시 → Search Console에서 '확인'
- [ ] **(c) 사이트맵 제출** `https://saigon-rider.com/sitemap.xml` — **'색인 생성 요청' 버튼은 누르지 않는다**(§2.3-3, 자연 발견 측정. 8주차 판정 후에는 자유)
- [x] **(d) fm 플랫폼(허브 `/l/`) 발행** — `/admin/fm`에서 플랫폼 발행 → 발행일 기록, `curl -I https://saigon-rider.com/l/` → 200
  - `/l/` 발행일: **2026-10-13 02:52:39 UTC (11:52 ICT)**, verify ok 02:53:33 UTC (`/ko/l/`, `/en/l/` 발행 여부: **발행 — 셋 다 200**). IndexNow(Bing) 202 — urls `/b/saigon-rider-official-…/`, `/l/`, `/ko/l/`, `/en/l/` (`fm_event` index_notified 2026-10-13 02:53:33 UTC). 허브 항목 1곳(Saigon Rider Official, intro 표시)
- [ ] **(e) ①~④ 기록** (아래 섹션)
- [ ] **(f) ⑤ 동결 확인 후 서명줄 기입**

---

## ① C arm URL 검사 (Search Console URL 검사, 수동)

속성은 Domain이므로 조회는 `https://saigon-rider.com/` 접두 URL만 대상으로 한다(app.·business. 섞임 방지, §6 D4).

| URL | 검사일 | URL이 Google에 있음 | 적용 범위(coverage) | 마지막 크롤링 | Google 선택 canonical | 메모 |
|---|---|---|---|---|---|---|
| `https://saigon-rider.com/` | | | | | | |
| `https://saigon-rider.com/ko` | | | | | | |
| `https://saigon-rider.com/en` | | | | | | |
| `https://saigon-rider.com/l/` | | | | | | |
| `https://saigon-rider.com/ko/l/` (발행 시) | | | | | | |
| `https://saigon-rider.com/en/l/` (발행 시) | | | | | | |

## ② 실적(과거)

신규 속성은 과거 데이터가 거의/전혀 없을 수 있다 — 비어 있으면 "데이터 없음 (속성 등록일 ____)"으로 기록한다. 보이는 기간: ____ ~ ____.

브랜드 질의 판정(정규식, 대소문자 무시): `saigon rider|saigonrider|사이공라이더|sài gòn rider` — 일치하면 브랜드, 아니면 **비브랜드**.

| 페이지 | 노출 | 클릭 | 비고 |
|---|---|---|---|
| `/` | | | |
| `/ko` | | | |
| `/en` | | | |
| `/l/` | | | |

상위 질의 20 (Search Console 성과 → 질의):

| # | 질의 | 노출 | 클릭 | 비브랜드 |
|---|---|---|---|---|
| 1 | | | | |
| … | | | | |
| 20 | | | | |

## ③ 색인 총수

- Search Console **페이지 색인** 보고서의 총수(색인됨 / 색인 안 됨): ____ / ____ (조회일 ____)
- 기록: 기존 어드민 수기 폼 `POST /admin/api/fm/console-coverage` (`source: google`, `observed_on`, `indexed`, `discovered`, `note`) 1건
- 기록된 `fm_event` id: ____

## ④ AI 프로브 1회차

질문 10개는 **고정**이다 — 이후 2·3회차(4주·8주)에 **문자열 그대로 재사용**한다. 변경 금지.

| # | 언어 | 질문 |
|---|---|---|
| Q1 | vi | mua xe máy cũ ở TP.HCM cần kiểm tra gì |
| Q2 | vi | sang tên xe máy TPHCM thủ tục |
| Q3 | vi | đi xe máy mùa mưa Sài Gòn cần chuẩn bị gì |
| Q4 | vi | gửi xe máy ở sân bay Tân Sơn Nhất giá bao nhiêu |
| Q5 | vi | mua bán đồ cũ với hàng xóm có an toàn không |
| Q6 | ko | 호치민 중고 오토바이 구매 체크리스트 |
| Q7 | ko | 호치민 오토바이 명의 이전 절차 |
| Q8 | ko | 호치민에서 중고 물건 안전하게 거래하는 법 |
| Q9 | en | best app to buy used motorbike in Saigon |
| Q10 | en | how much does it cost to run a motorbike in Ho Chi Minh City per month |

채널: Google AI Overviews/AI Mode(VN 로케일), Gemini, ChatGPT, Perplexity, Cốc Cốc AI. 각 셀은 `언급` / `인용` / `없음` 중 하나(인용 = 사이공라이더 도메인 URL이 출처로 표시).

| 질문 | Google AI | Gemini | ChatGPT | Perplexity | Cốc Cốc AI | admin ai-probe 폼 기록 event id |
|---|---|---|---|---|---|---|
| Q1 | | | | | | |
| Q2 | | | | | | |
| Q3 | | | | | | |
| Q4 | | | | | | |
| Q5 | | | | | | |
| Q6 | | | | | | |
| Q7 | | | | | | |
| Q8 | | | | | | |
| Q9 | | | | | | |
| Q10 | | | | | | |

- 프로브 수행일: ____ / 수행자: ____

## ⑤ 판정 기준 동결 (SoT §2.6)

| 기준 | 성공 | 효과 없음 | 그 사이 |
|---|---|---|---|
| K1 크롤 | vi 글 ≥ 80%가 발행 후 14일 안에 VERIFIED Googlebot 방문 ≥ 1 | ≤ 40% | 결론 보류 |
| K2 색인 | vi 글 ≥ 4/6(4편이면 3/4)이 발행 후 28일 안에 "URL is on Google"(verdict PASS) | ≤ 1편 | 4주 연장 후 재판정 |
| K3 노출 | 첫 발행 후 5~8주 합계: 아티클 URL 비브랜드 impressions ≥ 100 **그리고** 고유 질의 ≥ 10 | impressions < 20 **또는** 질의 < 3 | 4주 연장 |
| K4 대조 | 같은 기간 C arm(랜딩 3 + 허브) 비브랜드 impressions 대비 T arm이 ≥ 2배 | T ≤ C | 기록 |
| K5 AI | 8주차 프로브에서 아티클 URL 인용 ≥ 1 | 0 | **0이어도 실패로 보지 않는다**(기대값 0, 증거로만 기록) |

- "효과 있음" 판정 = K1·K2·K3 모두 성공. "효과 없음" = K2 또는 K3가 "효과 없음". 나머지는 "불충분 → 4주 연장 1회"까지만. 연장 후에도 불충분이면 **불충분으로 종결**(무한 연장 금지).
- 통계 한계를 숨기지 않는다: n=6~13 URL, 트래픽 극소. 이 실험은 **유의성 검정이 아니라 선행 지표의 사전 등록 관찰**이다. 결론 문장은 "사이공라이더 도메인에서 n편 기준 ~했다"로만 쓴다.

**경량 트랙 정의 변경(유일)**: 경량 트랙의 정적 `/blog/` 경로는 `fm_bot_visit`에 기록되지 않으므로 K1의 "VERIFIED Googlebot 방문"은 Search Console URL 검사의 **`마지막 크롤링`(lastCrawlTime)이 발행 후 14일 이내**인 것으로 측정한다. 임계값(80%/40%, 14일)은 변경 없음. 측정 시점은 2·4·8주차 UI 판독.

동결: 2026-10-10 (사용자 확정) — 첫 발행 후 변경 금지

서명/확인: ________ (확인일 ____)

---

## 발행 대장

| # | topic | lang | slug | URL | 발행일 | 검수자/검수일 | 첫 크롤(URL 검사) | 첫 색인일 | 메모 |
|---|---|---|---|---|---|---|---|---|---|

## 예외 사건

실험 기간 중 결과를 흔들 수 있는 사건(앱 스토어 출시, 장애, 랜딩·conf 변경 등)을 기록한다. 브랜드 질의 급증은 비브랜드 분리로 흡수.

| 날짜 | 사건 | 영향 |
|---|---|---|
