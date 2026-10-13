# 블로그형 콘텐츠의 구글 노출 효과 실험 — 사이공라이더 선행 시험 (fm 레이어)

- 시작일: 2026-10-10 (계획 수립)
- 상태: **IN_PROGRESS — P0 착수(2026-10-10). 경량 트랙(§6 D12).**
- 질문: **"블로그형 사이트/콘텐츠가 구글 노출에 도움이 되는가?"** — 사이공라이더로 먼저 시험한다.
- 배경(레포 밖 출처, 신뢰): 2026-10-09 대표 FactMind 네이버 블로그 글 "AI 검색 노출 가이드" — AI 답변은 검색엔진이 색인한 것에서 나온다 / 이름 질의는 공식 정보, "추천" 질의는 블로그·플레이스 리뷰에서 답한다 / 네이버 AI 브리핑 인용의 ~82%가 네이버 내부 콘텐츠(2026-06~07 PC) / 네이버 인용 기준 = 직접 경험·일관된 주제·정직·읽기 쉬운 구조·신선도 / 양산·복제·과홍보 글 제외 / FactMind 자체 실험: 이름만 있는 목록 페이지는 구글이 "콘텐츠 없음"으로 거부 → 설명 추가 후 당일 수락 / 구글은 새 페이지를 ~2주 안에 색인, 네이버·Bing은 더 느림 / 키워드 채우기는 AI 인용에 무효(Chen et al., arXiv 2509.08919). 사용자 회신: "구글 쪽도 블로그 사이트가 노출에 더 도움 되는지 사이공으로 먼저 시험해보면 좋을 것 같습니다."
- 표기: **[확인]** = 레포에서 확인(경로·커밋) / **[추정]** = 근거 있으나 확정 아님 / **[확인 필요(운영자)]** = 운영 상태·외부 계정은 레포에서 알 수 없음.
- 절대 제약: `/DEVELOP/Blueurban/factmind`(업스트림 엔진)는 **건드리지 않는다**(대표: "엔진 작업중이다. 만지지마"). 사이공 문서는 이 레포에만 둔다(대표: "사이공을 FactMind md에 섞지 마라"). `factmind-saigon/factmind_saigon/core/`는 이 태스크에서 **무수정**(§6 D9).

- **확정 결정 (2026-10-10, 사용자)**:
  1. D12 = 경량 트랙 채택 — 정적 `/blog/<slug>/index.html`(랜딩 빌드 생성, canonical·Article JSON-LD·`<html lang>`·`sitemap-site.xml` 포함), 마이그레이션·nginx 변경 없음, 지표는 Search Console UI를 2/4/8주차에 수기 판독. P1-fm·P3·P4는 K1/K2 신호 후 확장(→ P0 서브태스크 3 서비스 계정은 지금 불필요).
  2. §2.4 주제 6개 전부 승인.
  3. vi 네이티브 검수자 미정 — 코드 작업 먼저, T0(첫 발행)은 필요 시 뒤로.
  4. §2.6 K1~K5 값 확정·동결(2026-10-10). 경량 트랙에서 K1 "VERIFIED Googlebot 방문"은 `fm_bot_visit`로 못 재므로(정적 경로 미기록) URL 검사 `마지막 크롤링(lastCrawlTime)` ≤ 발행 후 14일로 측정 — 이것이 유일한 정의 변경(임계값 불변).
  5. Search Console 미등록 → P0에서 Domain 속성 `saigon-rider.com` 신규 등록(DNS TXT, DNS는 도메인 등록업체 관리, 업체명 미정).
  6. fm 허브 `/l/`는 기준선 전에 발행하여 C arm에 포함, 발행일은 `baseline.md`에 기록.
  7. 업스트림 확인 완료: `fm_upstream.py` 전 항목 `unchanged` @ `da4644f`(2026-10-10).

---

## 0. 한 장 요약

- **무엇을**: 사이공라이더 브랜드 도메인(`saigon-rider.com`)에 **자체 도메인 아티클 섹션 `/blog/`** 를 fm 어댑터(BFF 서빙)로 만들고, 네이티브 검수를 거친 **베트남어 글 6편(+한국어 6편)** 을 4주에 걸쳐 평일에 발행한다. 외부 플랫폼(Blogger) arm은 이번 실험에서 **제외**하고 후속 실험 E2로 미룬다(§6 D2).
- **어떻게 재나**: FactMind 증거 위생 규칙(수집 → 색인 → 노출 → 클릭 → AI 언급/인용을 **따로** 기록, `ai-docs/spec/261008_fm_engine_port_plan.md` §3.5)대로 URL 단위로 잰다. 수집 = `fm_bot_visit`(이미 있음), 색인 = Search Console **URL Inspection API**, 노출·클릭 = **Search Analytics API** 일간 잡 → 새 테이블 → `/admin/fm` "검색 성과" 카드 한 곳. AI 언급/인용 = 고정 질문 10개 수동 프로브(기존 `ai-probe` 폼) 3회.
- **언제 판정하나**: 성공/실패 기준(§2.6)은 **첫 발행 전에 동결**한다. 첫 발행 후 4주차·8주차에 `ai-docs/review/261010_fm_blog_exposure/` 보고서, 배운 점은 증거 id와 함께 `factmind-saigon/BACKPORT.md` `Kind: learning`.
- **정직한 한계**: 출시 전 사이트(등록 업체 0, 앱 심사 중)라 트래픽은 극소. 클릭은 판정 기준이 아니고 **선행 지표(크롤 → 색인 → 노출 → 질의 수)** 로 판정한다. FactMind 자신도 "등록이 색인·인용·유입을 늘린다"는 걸 입증하지 못했다(계획서 §1) — 이 실험이 첫 증거가 된다.

---

## 1. FactMind 이식(fm 레이어) 현황 요약 [확인]

| 항목 | 상태 | 근거 |
|---|---|---|
| 이식 단계 | 계획서 P0~P5 완료(2026-10-08), **운영 반영 `8569bb6d`**. P6(확장)은 "4주 VERIFIED 봇 방문 > 0 + 대표 결정" 전제라 미착수 | `ai-docs/spec/261008_fm_engine_port_plan.md` §4, `ai-docs/context/current.md` l.10~14 |
| 코어 | `factmind-saigon/factmind_saigon/core/` — fetch·site_report·access·bundle·verify·indexnow·bots + `locale/{ko,vi,en}`; stdlib 전용, pre-commit `fm-core-guard` | `factmind-saigon/BACKPORT.md` BP-0001 |
| 어댑터 | `factmind_saigon/saigon/` — storage·subjects·publishing·lists·routes_public·routes_admin·indexnow·middleware·jobs | `current.md` l.10~12 |
| 역이식 원장 | `UPSTREAM.json` 전부 `unchanged` @ `da4644f`; `BACKPORT.md` `Forwarded: pending` **0건**(BP-0002 applied `bd13494`, BP-0001 not-needed) | `factmind-saigon/BACKPORT.md`, 커밋 `56de04a6` |
| 서빙면 | 엣지 `deploy/saigon-rider.conf:47` 정규식 1개로 `/b/ /l/ /ko/l/ /en/l/ /sitemap.xml /sitemap-fm.xml /rss.xml /<IndexNow키>.txt` → BFF. 그 외는 `/var/www/saigon-rider` 정적(랜딩 SPA). `app.` 호스트는 의도적 noindex | `deploy/saigon-rider.conf:38~66` |
| 공개 페이지 | `/b/<slug>/`(LocalBusiness), `/l/`·`/ko/l/`·`/en/l/` 허브(Organization+CollectionPage/ItemList), ward·category 목록. **운영은 플랫폼 미발행이라 `/l/` 404·`/sitemap-fm.xml` 빈 urlset** — "운영자 액션 대기"(2026-10-08 기준). 현재 상태 [확인 필요(운영자)] | `current.md` l.11~12 |
| 측정 | `fm_event`(kind: publish/verify/withdraw/index_notified/site_report/diagnosis/console_coverage/ai_probe), `fm_bot_visit`(30일 보존, VERIFIED/UNVERIFIED/UNKNOWN, `path_kind` profile/facts/list/sitemap/rss/key), `fm_bot_feed`. `FmBotVisitMiddleware`는 **fm 접두 경로만** 기록 — 랜딩 정적 페이지·robots·sitemap-site는 미기록 | `database/init/253_fm_tables.sql`, `254_fm_measurement.sql`, `saigon/middleware.py:27,64` |
| 어드민 | `/admin/fm`(`admin-frontend/src/pages/fm/FactMindPage.tsx` 605줄): 봇 방문 7/14/30일, 콘솔 색인 수기(`source google|bing, observed_on, indexed, discovered, note` — **URL별 노출·클릭·질의·순위 없음**), AI 프로브 수기(채널 6+기타), 진단, 잡 실행 | `saigon/routes_admin.py:356~440` |
| 검색엔진 등록 | 레포에 `google-site-verification`·`msvalidate`·`naver-site-verification` 흔적 **0**. "Search Console sitemap 제출"은 `current.md` l.11 TODO. DNS TXT 검증은 레포 밖에서 가능 → **등록 여부 [확인 필요(운영자)]**. IndexNow는 Bing만(`FM_INDEXNOW_ENGINES=bing`); 구글은 IndexNow 불참. Search Console API 자격증명·env 키 없음. `core/bot_policy.json:40~44` providers = google_search_console·bing_webmaster `not_connected` | `.env.example:215~225`, `docker-compose.yml:800~804` |
| 랜딩 | React CSR SPA(`landing/apps/client/src/App.tsx`). 라우트 `/`(vi) `/ko` `/en` + `/product /security /solutions /how-it-works /pricing /resources /contact` **7개가 같은 컴포넌트**(`pages/home/Index.tsx:288~294`)이고 전부 `dist/sitemap-site.xml`에 실림 → 중복 콘텐츠. prerender는 홈만(`scripts/prerender.mjs`, 실패해도 exit 0). canonical은 JS 전용(`App.tsx:59 HeadSync`), `dist/index.html` 정적 canonical 0. 정적 hreflang 4줄(`index.html:21~24`, 비상호적). 엣지 `try_files … /index.html` → 미지 경로 soft-404(fm 자체진단이 지적, `current.md` l.13). 블로그/아티클 표면 **없음**(`/resources`는 홈 별칭) | `landing/apps/client/scripts/{postbuild,prerender,generate-sitemap-*}.mjs` |
| JSON-LD | 랜딩 정적 `WebSite` 1개. `Article`/`BlogPosting`/`FAQPage` 없음 | `landing/apps/client/index.html:25~33` |
| 배포 | 랜딩: 로컬 `cd landing && pnpm run build`(Node 22) → dist rsync `/var/www/saigon-rider/`(운영에 pnpm 없음). BFF: `git pull` → `docker compose --env-file .env up --build -d bff bff_migrate noti_worker admin_frontend` | `CLAUDE.md` 랜딩배포, `current.md` l.14 |
| 알려진 리스크 | `CLAUDE.md`가 `ai-docs/INDEX.md`를 가리키나 실제 파일은 `ai-docs/index.md`; codebase-memory 그래프 stale; Cốc Cốc·Zalo 크롤러 UA 미등록; `TRANSLATE_API_KEY` 403 상태 미상; 워킹트리에 타 태스크 변경(스토어 자산·ai-docs·native/ios) — **건드리지 않는다**; main이 origin보다 6커밋 앞 | W1 조사 |

---

## 2. 실험 설계

### 2.1 가설

- **H0(귀무)**: 자체 도메인에 블로그형 아티클을 추가해도, 8주 안에 그 URL들이 구글에 색인되거나 검색 노출(impressions)을 만들지 못한다 — 즉 랜딩 홈·fm 허브와 다를 바 없다.
- **H1(대립)**: 블로그형 아티클 URL은 ① 2주 안에 Googlebot(VERIFIED) 크롤을 받고 ② 4주 안에 과반이 색인되며 ③ 5~8주차에 비브랜드 질의에서 노출을 만든다.
- 보조 질문(이번엔 판정 안 함, 기록만): 베트남어 vs 한국어 중 어느 쪽이 먼저 색인·노출되는가 / AI 채널(Google AI Overviews·Gemini·ChatGPT·Perplexity·Cốc Cốc)에서 언급·인용이 나오는가.

### 2.2 Arm 정의

| Arm | 내용 | 측정 단위 |
|---|---|---|
| **C (대조)** | 콘텐츠 변경 없는 기존 URL: 랜딩 `/`, `/ko`, `/en`; fm 허브 `/l/`(발행돼 있을 때). 실험 기간 동안 **변경 금지**(P0 위생 조치 제외) | URL별 색인 상태·노출 |
| **T (처치)** | 자체 도메인 아티클 섹션 `/blog/`(vi) · `/ko/blog/`(ko): 허브 1 + 글 6편×(vi, ko) = **최대 13 URL** | URL별 크롤·색인·노출·질의 수 |
| ~~E (외부 플랫폼)~~ | Blogger 등 외부 블로그 — **이번 실험 제외**(§6 D2). 후속 E2 | — |

"블로그 사이트"의 두 뜻을 명시한다: (A) 자체 도메인 안의 아티클 섹션 / (B) 외부 블로그 플랫폼. 네이버는 자사 블로그 플랫폼을 우대한다는 근거(82%)가 있지만, **구글은 자사 플랫폼(Blogger) 우대를 문서화한 적이 없다**. 그래서 이번 실험의 1차 질문은 (A)이고, (B)는 "플랫폼 우대"가 아니라 "blogspot.com 도메인 권위" 를 재게 되므로 분리한다.

### 2.3 고정 변수(교란 통제) — 첫 발행 전에 확정, 8주 동안 유지

1. 랜딩 콘텐츠·구조 변경 금지(P0 위생 조치 1건만 허용: sitemap 중복 7 URL 제외 — §6 D3). 홈 푸터에 **"Blog" 링크 1개** 추가는 처치의 일부로 P1에서 함께 배포한다(아티클 섹션이 사이트에서 연결되지 않으면 현실적인 "블로그 섹션"이 아니다).
2. **외부 홍보 금지**: 8주 동안 아티클 URL을 소셜·Zalo·네이버·커뮤니티·앱 내 어디에도 올리지 않는다. 외부 링크(백링크)는 발견 속도를 바꿔 "구글이 스스로 찾아 색인했는가"를 오염시킨다.
3. 발견 경로는 **sitemap-fm 자동 포함 + Search Console 사이트맵 1회 제출 + IndexNow(Bing)** 만. Search Console의 "색인 요청(Request indexing)" 버튼은 **쓰지 않는다**(자연 발견 측정). 단 8주차 판정 후에는 자유.
4. 글 품질 규칙: 직접 경험·사실 기반, 양산 금지, 과홍보 금지(Google 스팸 정책의 scaled content abuse, 네이버 정직 기준). **AI로 본문을 생성하지 않는다** — AI는 번역 초안·교정에만. 베트남어는 **네이티브 검수 필수**(W1: vi/en 문구는 아직 네이티브 미검수).
   - **조정(2026-10-13, 사용자 결정)**: 사용자가 직접 초안을 쓰기 어려워 **AI가 공개 자료 조사 기반 정보형 초안을 작성**하는 것을 허용한다. 조건: 모든 사실에 출처(`sources`), **경험을 지어내지 않는다**("작성 근거" 블록에 '공개 자료 정리, 직접 경험담 아님'을 명시, 실제 경험이 있으면 사람이 추가), 확인 못한 사항은 본문에 '확인 필요'로 표시, 양산 금지(6주제 그대로), 발행 전 사람 검토(vi는 네이티브 검수 필수 유지).
5. 발행 요일: 평일만. 주말·"월요일까지" 류 마감 없음.
6. 앱 스토어 출시가 실험 중 일어날 수 있다 → 브랜드 질의(`saigon rider`, `saigonrider`, `사이공라이더`) 노출이 튄다. 분석은 **비브랜드 질의**로 분리한다(§4 잡이 query 차원을 저장).

### 2.4 콘텐츠 계획(후보 — **사용자 승인 필요**)

| # | 주제(vi 1차 / ko) | 검색 의도 | 비고 |
|---|---|---|---|
| 1 | Mua xe máy cũ ở TP.HCM: checklist kiểm tra trước khi xuống tiền / 호치민에서 중고 오토바이 살 때 체크리스트 | 거래 전 정보 | 직접 경험 필요(사용자/지인) |
| 2 | Thủ tục sang tên xe máy tại TP.HCM (giấy tờ, chi phí, thời gian) / 호치민 오토바이 명의 이전 절차 | 절차 | 법·수수료 정확성 주의, 출처 명기 |
| 3 | Đi xe máy mùa mưa Sài Gòn: đồ cần mang, đường hay ngập / 사이공 우기 라이딩 준비물·침수 상습 구간 | 생활 정보 | 지역성 강함 |
| 4 | Gửi xe máy ở sân bay Tân Sơn Nhất: bãi nào, giá bao nhiêu / 떤선녓 공항 오토바이 주차 안내 | 지역 정보 | 가격은 날짜 명기 |
| 5 | Mua bán đồ cũ với hàng xóm: cách gặp an toàn, tránh lừa đảo / 이웃과 중고거래 안전하게 하는 법 | 서비스 인접 | 앱 홍보 최소화(링크 1개 이하) |
| 6 | Giá xăng hôm nay và cách tính chi phí chạy xe mỗi tháng / 오늘 휘발유 가격과 월 유류비 계산 | 반복 검색 | 레포에 연료가 파이프라인 존재(`ai-docs/task/active/260527_fuel_price_pipeline_task.md`) — 정적 글로 시작, 동적화는 범위 밖 |

- 편수: **6주제 × vi(필수) + ko(권장)**, en 없음(네이티브 검수자 없음·1차 시장 아님). 네이티브 검수 역량이 부족하면 **vi 최소 4편**까지 줄이고 ko 6편 유지. 각 글 600~1,200단어, 소제목·목록·"작성 근거/경험" 블록·갱신일.
- 발행 주기: 첫 발행 후 4주에 걸쳐 2·2·1·1편(평일, 예: 화·목). 글마다 발행일이 다르므로 **URL별 "발행 → 첫 크롤 → 색인" 소요일**을 각자 잴 수 있다.
- 작성 흐름: ko 초안(사용자) → vi 번역 초안(AI) → **네이티브 검수(사람, 필수)** → front matter `reviewed_on` 기입 → 동기화 → 발행. 검수자 확보 [확인 필요(운영자)].

### 2.5 측정 창과 지표(증거 위생: 단계별 분리)

| 단계 | 지표 | 출처 | 창 |
|---|---|---|---|
| 수집(크롤) | URL별 Googlebot **VERIFIED** 방문 첫 시각·횟수 | `fm_bot_visit`(아티클이 BFF 서빙이므로 자동 기록, `path_kind=article`) | 발행 후 14일 |
| 색인 | URL별 URL Inspection `verdict`/`coverageState`/`lastCrawlTime`/`googleCanonical` 일간 스냅샷 → 첫 "색인됨" 날짜 | `fm_url_inspection`(§4) | 발행 후 28일 |
| 노출 | URL별 일간 impressions, 질의 수, 평균 position, 비브랜드 분리 | `fm_search_daily`(§4) | 첫 발행 후 5~8주 |
| 클릭 | 기록만. 판정 기준 아님 | 동일 | 동일 |
| AI 언급/인용 | 고정 질문 10개 × 채널 5개, 언급/인용 여부 | `fm_event(ai_probe)` 수동 | 기준선·4주·8주 (3회) |

기준선(발행 전): C arm URL들의 Inspection 상태, 속성 추가 후 보이는 과거 Search Analytics(가능하면 90일), 사이트 전체 "색인된 페이지" 수(Search Console 페이지 색인 보고서 — API 없음 → 기존 수기 폼 `console-coverage` 1회), AI 프로브 1회차.

### 2.6 사전 등록 판정 기준(첫 발행 전 동결 — 값은 사용자가 P2 시작 전에 조정 가능, 이후 고정)

| 기준 | 성공 | 효과 없음 | 그 사이 |
|---|---|---|---|
| K1 크롤 | vi 글 ≥ 80%가 발행 후 14일 안에 VERIFIED Googlebot 방문 ≥ 1 | ≤ 40% | 결론 보류 |
| K2 색인 | vi 글 ≥ 4/6(4편이면 3/4)이 발행 후 28일 안에 "URL is on Google"(verdict PASS) | ≤ 1편 | 4주 연장 후 재판정 |
| K3 노출 | 첫 발행 후 5~8주 합계: 아티클 URL 비브랜드 impressions ≥ 100 **그리고** 고유 질의 ≥ 10 | impressions < 20 **또는** 질의 < 3 | 4주 연장 |
| K4 대조 | 같은 기간 C arm(랜딩 3 + 허브) 비브랜드 impressions 대비 T arm이 ≥ 2배 | T ≤ C | 기록 |
| K5 AI | 8주차 프로브에서 아티클 URL 인용 ≥ 1 | 0 | **0이어도 실패로 보지 않는다**(기대값 0, 증거로만 기록) |

- "효과 있음" 판정 = K1·K2·K3 모두 성공. "효과 없음" = K2 또는 K3가 "효과 없음". 나머지는 "불충분 → 4주 연장 1회"까지만. 연장 후에도 불충분이면 **불충분으로 종결**(무한 연장 금지).
- 통계 한계를 숨기지 않는다: n=6~13 URL, 트래픽 극소. 이 실험은 **유의성 검정이 아니라 선행 지표의 사전 등록 관찰**이다. 결론 문장은 "사이공라이더 도메인에서 n편 기준 ~했다"로만 쓴다.

---

## 3. 구현 Phase

### 3.0 아티클 표면 대안 비교 → **(b) 채택**(§6 D1)

| 대안 | 장점 | 단점(명명된 문제) |
|---|---|---|
| (a) 랜딩 SPA에 `/blog/:slug` 라우트 + prerender 다중 경로 + sitemap + Article JSON-LD + 정적 canonical | 랜딩과 같은 룩, 배포는 rsync | `prerender.mjs`는 홈 1장만 SSR하고 **실패해도 exit 0**(`run().catch(()=>process.exit(0))`) → 글이 빈 SPA 셸로 배포돼도 모름; `generate-sitemap-routes.mjs`는 `:` 포함 동적 라우트 제외; canonical·hreflang이 JS 전용; **정적 서빙이라 봇 방문이 기록되지 않아 "크롤" 칸을 못 채움**; Lovable 템플릿 빌드 파이프라인(Babel 변환·happy-dom)에 손대는 위험 |
| **(b) fm 어댑터에 `kind='article'` 추가, BFF가 `/blog/…` 서빙** | 서버 HTML·canonical·hreflang·Article JSON-LD, publish → verify(해시 대조) → sitemap-fm 자동 → IndexNow(Bing) → `fm_bot_visit` 크롤 기록 → withdraw 410까지 **기존 파이프라인 재사용**; core 무수정 | 마이그레이션 255(CHECK 2개 확장), 엣지·컨테이너 nginx 정규식 1곳씩, 글 1편 추가마다 bff 재빌드(§6 D6); 페이지 스타일은 허브처럼 단순 |
| (c) 별도 정적 사이트/서브패스(SSG 산출물을 `/var/www/saigon-rider/blog/`) | 간단 | 새 툴체인, 봇 방문 미기록, 사이트맵 인덱스에 세 번째 사이트맵 추가(결국 BFF 수정), verify 없음 |

### P0 — 전제 조건·기준선 (대부분 운영자 액션) · `p0-baseline`

**목표**: 측정 수단이 갖춰지고, 콘텐츠 변경 전 기준선이 기록된다.

서브태스크
1. **[운영자] Search Console Domain 속성** `saigon-rider.com` — DNS TXT 검증(§6 D4). DNS 호스팅 위치 [확인 필요(운영자)]. 이미 등록돼 있으면 건너뛴다(레포엔 흔적이 없을 뿐). Bing Webmaster는 선택(Search Console 가져오기 기능 사용 시 수 분).
2. **[운영자] 사이트맵 제출** `https://saigon-rider.com/sitemap.xml`(sitemapindex → `sitemap-fm.xml`·`sitemap-site.xml`). 제출 후 **"색인 요청" 버튼은 누르지 않는다**(§2.3-3).
3. **[풀 트랙 전용 — 경량 트랙에서는 보류] [운영자] 서비스 계정**: GCP 프로젝트(기존 `GOOGLE_MAPS_API_KEY`·`GOOGLE_API_KEY` 프로젝트 재사용 가능 [추정]) → Search Console API 활성화 → 서비스 계정 생성·JSON 키 1개 → Search Console 속성 사용자로 서비스 계정 이메일 추가(권한 **Full** — URL Inspection은 Restricted 불가 [추정, 공식 문서 재확인]). 키 파일은 `.gitignore` 대상 경로에만(§4).
4. **[Sonnet] 랜딩 sitemap 중복 제외**: `landing/apps/client/scripts/generate-sitemap-site.mjs:11` `isExcluded`에 `/product /security /solutions /how-it-works /pricing /resources /contact` 추가(라우트·UI는 그대로). 로컬 빌드 → **[운영자] dist rsync**(Node 22, `CLAUDE.md` 랜딩배포).
5. **[운영자] fm 플랫폼 발행 여부 결정**: `/l/` 허브가 아직 404면 기준선 전에 발행할지(C arm에 포함) 그대로 둘지 결정. 권장: **발행 후 기준선**(허브는 이미 만들어진 대조 URL이고, 실험 중엔 안 바꾼다). 발행하면 그 날짜를 기준선 문서에 적는다.
6. **[운영자+Sonnet] 기준선 기록** `ai-docs/review/261010_fm_blog_exposure/baseline.md`: ① C arm URL별 URL Inspection 결과(UI 수동 또는 P3 잡 첫 실행) ② Search Analytics 과거 90일(있으면) 페이지별 impressions/clicks/질의 상위 20 ③ 페이지 색인 보고서 총수 → 기존 수기 폼 `POST /admin/api/fm/console-coverage` 1건 ④ **AI 프로브 1회차**: 고정 질문 10개(vi 5·ko 3·en 2, 예: "mua xe máy cũ ở TP.HCM cần kiểm tra gì", "sang tên xe máy TPHCM thủ tục", "호치민 중고 오토바이 구매 체크리스트", "best app to buy used motorbike in Saigon" …) × 채널(Google AI Overviews/AI Mode VN 로케일·Gemini·ChatGPT·Perplexity·Cốc Cốc AI) → 각 결과를 `ai-probe` 폼에 기록(질문 문자열은 이후 2회차·3회차에 **동일하게** 사용). ⑤ §2.6 임계값 동결 선언 줄.

검증(1회): 로컬 빌드 후 `grep -c "<loc>" landing/apps/client/dist/sitemap-site.xml` = **3**; 배포 후 `curl -s https://saigon-rider.com/sitemap-site.xml | grep -c "<loc>"` = 3(운영자). `baseline.md`에 ①~⑤ 섹션 존재.
모델: **Sonnet**(1줄 제외 수정 + 체크리스트 문서화 — 기계적). 운영자 액션이 대부분.
depends_on: 없음. caution: 랜딩 다른 파일 수정 금지, 워킹트리의 타 태스크 변경분 커밋 금지.

### P1 — 아티클 표면(fm 어댑터, `/blog/`) · `p1-article-surface`

**경량 트랙 구현(D12, 2026-10-10)**: 아래 풀 트랙 대신 랜딩 빌드가 정적 HTML을 생성한다(BFF·마이그레이션·nginx 무변경).
- 소스 `landing/apps/client/content/blog/<vi|ko>/<slug>.md`(front matter 스키마는 아래 P1-2와 동일 → 풀 트랙 전환 시 `git mv`). 생성기 `landing/apps/client/scripts/generate-blog.mjs`(postbuild의 `prerender` 다음, `sitemap-site` 앞; 의존성 추가 없음).
- 산출: `dist/blog/<slug>/index.html`, `dist/ko/blog/<slug>/index.html`, 허브 `dist/blog/index.html`·`dist/ko/blog/index.html`(해당 언어 글이 1편 이상일 때만), `dist/blog-routes.json` → `generate-sitemap-site.mjs`가 lastmod와 함께 `sitemap-site.xml`에 추가. self canonical·`<html lang>`·Article/CollectionPage JSON-LD, hreflang은 같은 `topic_id`의 vi·ko가 모두 발행될 때만.
- 정직성 게이트: `status: ready` + `reviewed_on` 있는 파일만 출력. ready 글이 규칙 위반(필수 필드·slug/lang 불일치·날짜·중복)이면 빌드 실패(postbuild exit 1). 발행 가능 글 0편이면 아무것도 쓰지 않고 sitemap-site는 3 loc 유지.
- 푸터 "Blog" 링크는 이 변경에 없음(P2 첫 발행 커밋에서 추가 — T0 전 404 링크 방지). nginx 무변경(`/blog/`는 fm 정규식에 안 걸려 정적 서빙).
- 알려진 한계: `fm_bot_visit` 크롤 로그 없음; 철회(파일 삭제/draft) 시 SPA fallback으로 soft-404; `/blog/<slug>`(슬래시 없음)도 서빙됨(canonical로 정리).

**목표**: repo의 markdown 글이 어드민 동기화 → draft → 발행 → `/blog/<slug>/` 서버 HTML(Article JSON-LD·canonical·hreflang) → verify → sitemap-fm 포함 → 봇 방문 기록까지 기존 fm 흐름을 탄다. **core 무수정.**

서브태스크
1. **마이그레이션 `database/init/255_fm_articles.sql`**(멱등, §10 관례): `ALTER TABLE fm_subject DROP CONSTRAINT IF EXISTS fm_subject_kind_check; ADD CONSTRAINT fm_subject_kind_check CHECK (kind IN ('platform','business','article'))`; `fm_bot_visit_path_kind_check`에 `'article'` 추가(같은 패턴). 두 제약 모두 253/254의 `CREATE TABLE … IF NOT EXISTS` 인라인 정의라 재실행 체인(NOT VALID) 대상이 아님 — 255가 최종 소유자. `fm_subject`에 `locale_source` 재사용, 아티클 메타는 `fm_snapshot.facts`(jsonb)에: `{topic_id, slug, lang, title, description, body_html, date_published, date_modified, tags[], reviewed_on, reviewed_by, sources[]}`. 부분 unique 추가: `uq_fm_subject_article ON fm_subject (slug, locale_source) WHERE kind='article'`(기존 `slug UNIQUE`가 전역이면 ko/vi slug를 다르게 두거나 `slug`를 `<lang>-<slug>`로 — 구현자가 253 제약 확인 후 결정, 공개 URL은 어디까지나 `/blog/<slug>/`·`/ko/blog/<slug>/`). compose `bff_migrate` command에 `-f` 쌍 추가.
2. **콘텐츠 소스** `factmind-saigon/content/articles/<lang>/<slug>.md` — front matter(`---` 블록, `key: value`, stdlib 파싱; PyYAML 미도입): `topic_id, slug, lang(vi|ko), title, description, date_published, date_modified, tags, status(draft|ready), reviewed_on, reviewed_by, sources`. **`status: ready` 이고 `reviewed_on`이 있는 파일만 동기화 대상**(정직성 게이트를 코드로). 샘플 글 1편(`example` topic, 공개 금지 표시)로 dev 검증. 운영 이미지는 `factmind-saigon/`를 `/opt/factmind_saigon`으로 COPY(`backend/Dockerfile`, `current.md` l.13) — 패키지 위치에서 `../content/articles` 를 찾는지 구현자 확인; 안 되면 env `FM_ARTICLES_DIR`(.env/.env.example/compose 셋 다).
3. **렌더러 `saigon/articles.py`**(신규, `lists.py`의 문자열 조립 스타일 그대로): markdown → HTML은 `markdown>=3.6` 의존성 추가(`backend/requirements.txt`; §6 D6). 페이지: `<html lang>`, `<title>`, meta description, **self canonical**, hreflang(같은 `topic_id`에 vi·ko 둘 다 발행돼 있을 때만 vi/ko/x-default→vi; 아니면 생략), `<article>` h1·발행/갱신일·본문·"작성 근거/경험" 블록·`sources` 목록, 허브(`/blog/`)·홈 링크, 최소 인라인 CSS(허브와 동일 수준). JSON-LD `@graph`: `Article`(headline, description, inLanguage, datePublished, dateModified, author=Organization 'Saigon Rider', publisher(+logo), mainEntityOfPage) + `BreadcrumbList`. 허브 `/blog/`·`/ko/blog/`: `CollectionPage`+`ItemList`(발행 글, 최신순), hreflang, 제목·설명 3언어 `ARTICLE_TEXTS`(vi/ko/en 패리티).
4. **`subjects.py`/`publishing.py` 확장**: `sync_articles()`(파일 → subject upsert, snapshot version 증가는 본문 digest 변경 시만), `publish`가 kind=article이면 `articles.render_article()` 산출 `{"index.html": …}`만 저장(facts.json 없음), verify·withdraw·reverify·IndexNow는 기존 경로 그대로(아티클 발행/철회 변경 시 블로그 허브 재발행 — 업체 발행 시 `/l/` 허브 재발행과 동일 패턴).
5. **`routes_public.py`**: `GET /blog/` `/blog/{slug}/` `/ko/blog/` `/ko/blog/{slug}/`(+`/en/blog/…`는 404 catch-all만), `/blog/{slug}` → 301, withdrawn 410, 비정규 Host noindex 기존 규칙 적용. `sitemap-fm`에 아티클 URL(lastmod=date_modified)·블로그 허브 추가. `/rss.xml`에 아티클 item 포함(선택 — 포함 시 제목·링크·pubDate만).
6. **`middleware.py`**: `_FM_PREFIXES`에 `/blog/`·`/ko/blog/`·`/en/blog/`, `path_kind`: `/blog/<slug>/` → `article`, `/blog/` → `list`.
7. **nginx 정규식 2곳**: `deploy/saigon-rider.conf:47` 와 `nginx/conf.d/default.conf`(컨테이너) 의 fm location에 `blog/|ko/blog/|en/blog/` 추가(큰따옴표 유지 — `{8,128}` 파싱 함정, `current.md` l.11). 엣지 conf는 운영자가 drift 가드·백업·`nginx -t`·reload로 반영(P4 선례).
8. **어드민**: `routes_admin.py` `POST /articles/sync`, `GET /subjects?kind=article`(기존 목록이 kind 필터를 받는지 확인 후 최소 변경), 기존 publish/verify/withdraw 재사용. `FactMindPage.tsx`에 "아티클" 탭/필터 + '아티클 동기화' 버튼(기존 '업체 동기화' 패턴 복제). (UI 품질 요구 낮음 — 표 1개)
9. **랜딩 푸터 "Blog" 링크 1개**: `pages/home/content.ts` vi/ko/en + `Index.tsx` 푸터 nav에 `/blog/`(ko는 `/ko/blog/`). P2 첫 발행 **직전** 배포(처치의 일부, §2.3-1).

검증(1회, 감독이 재빌드된 dev `:18090`에서 실제 HTTP 시나리오): `POST /admin/api/fm/articles/sync`(샘플 1편 ready) → subject draft 1 → `publish` → `GET /blog/<slug>/` 200 HTML에 `<link rel="canonical" href="…/blog/<slug>/">`·`"@type": "Article"`·`<html lang="vi">` 존재 → `verify` ok(`verified_at`) → `/sitemap-fm.xml`에 해당 loc → `/blog/<slug>` 301 → Googlebot UA로 `/blog/<slug>/` 요청 → `fm_bot_visit` 1행 `path_kind='article'` → `withdraw` → 410 → 허브에서 제외. 컨테이너 nginx가 `/blog/` 를 bff로 보내는지 같은 시나리오 안에서 확인.
모델: **Fable** — 어댑터 여러 모듈(스토리지·발행·라우트·미들웨어·nginx)을 가로지르는 통합 설계이고, canonical·hreflang·JSON-LD 오류는 실험 자체를 무효로 만든다(품질 판단 필요).
depends_on: 없음(P0와 병행 가능). caution: `core/` 수정 금지(pre-commit `fm-core-guard`), `.env`/`.env.example` 키셋 동일, 253 제약 재선언 금지(255가 소유), `markdown` 의존성은 bff·noti_worker 이미지 둘 다 재빌드.

### P2 — 콘텐츠 작성·검수·발행 (사람 주도) · `p2-content`

서브태스크
1. §2.4 주제 6개 **사용자 승인**(교체·삭제 가능). §2.6 임계값 **동결**(이 시점 이후 변경 금지).
2. ko 초안 6편(사용자 직접 — 경험·사실 기반). AI는 구조 제안·교정만.
3. vi 번역 초안(AI) → **네이티브 검수**(사람) → front matter `reviewed_on`/`reviewed_by` → `status: ready`. 검수 불가 편은 발행하지 않는다.
4. 발행 일정(평일): 1주차 2편, 2주차 2편, 3주차 1편, 4주차 1편. 각 발행 = `git commit`(content) → 운영 `git pull` + bff 재빌드 → 어드민 '아티클 동기화' → publish → verify → (IndexNow Bing 자동) → 발행일·URL을 `baseline.md` 하단 "발행 대장"에 1줄.
5. 발행 직전 P1-9 푸터 링크 배포(1회). (경량 트랙: 푸터 링크 변경은 랜딩 `src/`의 `pages/home/content.ts` + `Index.tsx`.)

검증(1회): 운영 `GET https://saigon-rider.com/blog/<첫 slug>/` 200 + canonical 자기 URL + `fm_publication.verified_at` not null + `/sitemap-fm.xml`에 포함(운영자 curl). 모델: **사람**(작성·검수). 번역 초안만 **Fable**(vi 품질 판단 — 검수 전 단계). depends_on: p1-article-surface, p0-baseline. caution: AI 본문 생성 금지, 외부 홍보 금지, "색인 요청" 버튼 금지.

### P3 — Search Console 지표 수집 잡 · `p3-gsc-job`

**목표**: 하루 1회 자동으로 URL별 성과·색인 상태를 DB에 쌓는다(수기 복붙 제거).

서브태스크
1. **마이그레이션 `256_fm_search.sql`**(멱등): `fm_search_daily(day DATE, page TEXT, query TEXT NOT NULL DEFAULT '', clicks INT, impressions INT, position NUMERIC(6,2), fetched_at TIMESTAMPTZ, PRIMARY KEY(day,page,query))` — `query=''` 행이 페이지 합계; `fm_url_inspection(id BIGSERIAL, url TEXT, inspected_at TIMESTAMPTZ, verdict TEXT, coverage_state TEXT, indexing_state TEXT, last_crawl_time TIMESTAMPTZ, google_canonical TEXT, raw JSONB)` + 인덱스 `(url, inspected_at DESC)`. `fm_event` kind 변경 없음(254 체인 안 건드림).
2. **env**(`.env`·`.env.example`·compose bff 셋 다): `FM_GSC_SITE_URL`(예 `sc-domain:saigon-rider.com`), `FM_GSC_SA_KEY_PATH`(컨테이너 경로; 비면 잡은 "미연결" 로그 후 즉시 종료). 키 파일은 `firebase-credentials.json` 선례처럼 레포 경로 + `.gitignore` 1줄(`gsc-service-account.json`) + 마운트(구현자가 compose `FIREBASE_CREDENTIALS_JSON` 마운트 방식 확인 후 동일하게).
3. **`saigon/gsc.py`**(신규): `google-auth>=2.30`(이미 `backend/requirements.txt:17`)로 서비스 계정 토큰(scope `https://www.googleapis.com/auth/webmasters.readonly` — URL Inspection에도 충분한지 구현자 확인; 부족하면 `webmasters`) → httpx(이미 있음)로 REST 2개: `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`(dimensions `['date','page']`와 `['date','page','query']`, 최근 **10일** 창(구글 데이터 2~3일 지연·사후 확정 → 매일 재조회 upsert), rowLimit 25000) · `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`(추적 URL 집합 = 발행된 `/b/`·`/blog/`(로캘 포함)·허브 `/l/`·`/blog/` 로캘별·랜딩 `/`,`/ko`,`/en`; ward×category 목록은 제외 — 일 ≤ 30건 ≪ 할당 2,000/일). `google.auth.transport.requests`가 `requests` 패키지를 요구하면 컨테이너에 있는지 확인, 없으면 `google.auth.transport.urllib3` 또는 JWT 직접 서명 후 토큰 교환(httpx).
4. **`jobs.py`**: `fm_gsc_fetch` CronTrigger 06:30(ICT, 기존 잡들 뒤) `_single_flight`, `register_fm_jobs`에 1줄, `routes_admin._JOBS`에 `gsc_fetch` 추가(수동 실행 202 패턴 재사용).
5. **읽기 API** `routes_admin.py`: `GET /search/urls?days=28` → URL별 `{url, group(article|hub|business|landing), first_indexed_on, latest{verdict,coverage_state,last_crawl_time,google_canonical,inspected_at}, impressions_7d, impressions_28d, clicks_28d, nonbrand_impressions_28d, queries_28d, position_28d}`; `GET /search/weekly?weeks=12` → 주(ICT 월~일)×group 합계. 브랜드 판정 = query에 `saigon rider|saigonrider|사이공라이더|sài gòn rider` 포함(대소문자 무시, 상수 1곳). 날짜는 Search Console 기준(PT)이라 **변환하지 않고 "GSC 날짜"로 표기**.
6. `core/bot_policy.json` providers `state`는 **수정하지 않는다**(core 파일 → BACKPORT 대상). 연결 상태는 어드민 카드가 env 유무로 표시.

검증(1회, 감독이 dev에서 실제 API 1회): dev `.env`에 운영자가 키 파일·`FM_GSC_SITE_URL` 세팅(읽기 전용 API라 안전) → `POST /admin/api/fm/jobs/gsc_fetch/run` 202 → 수십 초 후 `fm_search_daily` ≥ 1행(또는 사이트 데이터가 0이면 잡 로그에 `rows=0` 명시) **그리고** `fm_url_inspection`에 추적 URL 수만큼 행 → `GET /search/urls` 가 같은 URL 집합 반환 → 같은 잡 재실행 시 행 수 불변(upsert). 키 미설정 시 잡이 `skipped no_key` 로그로 종료.
모델: **Fable** — 외부 API 인증·멱등 upsert·날짜 경계(PT vs ICT)·할당량은 틀리면 조용히 잘못된 숫자를 쌓는다(품질 판단). depends_on: p0-baseline(서비스 계정). caution: 키 파일 커밋 금지, `.env`/`.env.example` 패리티, `fm_event` kind 체인 손대지 않기.

### P4 — 어드민 "검색 성과" 한 곳 보기 · `p4-admin-search-view`

서브태스크
1. `admin-frontend/src/api/fm.ts`에 `getSearchUrls(days)`, `getSearchWeekly(weeks)`, 잡 `gsc_fetch` 추가.
2. `FactMindPage.tsx` 측정 섹션에 `SearchConsoleCard`: 상단 StatCard 3(추적 URL 수 / 색인됨 수 / 28일 비브랜드 impressions), **URL 표**(group 필터, 열: URL·첫 색인일·최근 verdict·최근 크롤·7d/28d impressions·비브랜드 28d·질의 수·position·마지막 inspection) + **주간 표**(주 × article/hub/business/landing impressions·clicks) — 차트 없음(antd 표로 충분, 1인 운영). 잡 실행 버튼('GSC 수집') + 미연결 안내(Alert).
3. 기존 "검색 콘솔 색인 수(수기)" 카드는 유지(사이트 총수는 API에 없음).

검증(1회): Playwright(`/admin/fm`, 쿠키 주입 — P3 선례) 카드 제목 "검색 성과" 렌더, URL 표 행 ≥ 1(dev 잡 데이터), 콘솔 오류 0. 모델: **Sonnet** — 기존 카드(`BotVisitsCard`·`ConsoleCoverageCard`) 패턴 미러링, 표 2개. depends_on: p3-gsc-job. caution: 기존 카드 수정 금지(추가만).

### P5 — 4주차 중간 보고 · `p5-report-4w`

(첫 발행 후 4주) `ai-docs/review/261010_fm_blog_exposure/report_4w.md`: §2.6 표의 K1·K2 채우기(URL별 발행일·첫 VERIFIED 크롤일·첫 색인일·소요일), K3 중간값, AI 프로브 **2회차**(기준선과 같은 질문 10개), 예외 사건(출시·장애·conf 변경) 기록. 데이터는 `GET /search/urls`·`/visits`·DB 조회를 CSV로 같은 폴더에 첨부. `INDEX`(`ai-docs/index.md`)에 폴더 1줄 등록. 판정하지 않는다(기록만).
검증: 보고서에 K1·K2 표와 증거 id(`fm_url_inspection.id`, `fm_bot_visit.id`, `fm_event.id`) 존재. 모델: **Sonnet**(추출·표 작성 기계적; 해석은 감독·사용자). depends_on: p2-content, p4-admin-search-view.

### P6 — 8주차 최종 보고·학습 기록 · `p6-report-8w`

(첫 발행 후 8주) `report_8w.md`: K1~K5 최종 판정(동결된 임계값 그대로), 대조(K4), 언어별(vi vs ko) 기록, AI 프로브 **3회차**, "효과 있음/없음/불충분" 결론 1문장, 후속 제안(E2 Blogger 실험 여부, fm P6 확장 여부, 내부 링크·홍보 해제). 대표 전달용 1페이지 요약(한국어) 포함. **`factmind-saigon/BACKPORT.md`에 `Kind: learning` 항목**(예: "구글 신규 URL 색인 소요일 중앙값 N일(n=6)", "Cốc Cốc 크롤러 UA 관측 여부", "IndexNow(Bing) 후 Bing 색인 여부") — 각 항목 `Why`에 `report_8w.md §x` + `fm_event`/`fm_url_inspection` id. `Forwarded: pending`으로 두고 **업스트림 적용은 대표 판단**(업스트림 레포 무접촉). 보고 마지막 줄에 `Forwarded: pending` 건수.
검증: 보고서 K1~K5 전부 값 있음, BACKPORT 항목 ≥ 1 with 증거 경로. 모델: **Sonnet** + 감독 종합. depends_on: p5-report-4w.

---

## 4. 지표를 한 곳에서 보는 방법(§6 D5)

- **자동**: P3 잡이 매일 06:30(ICT) Search Analytics(10일 창 upsert) + URL Inspection(추적 URL ≤ 30건)을 `fm_search_daily`·`fm_url_inspection`에 쌓는다. 봇 방문은 기존 미들웨어가 `/blog/`도 기록한다(BFF 서빙이므로 — 정적이었다면 불가능). IndexNow 송신은 기존 `fm_event(index_notified)`.
- **화면**: `/admin/fm` 측정 섹션 한 페이지 — 봇 방문(기존) · **검색 성과(신규: URL 표 + 주간 표)** · 콘솔 총수 수기(기존, 주 1회 숫자 1개) · AI 프로브 수기(기존, 3회만).
- **수기로 남는 것**(정직하게): ① 사이트 총 색인 수(API 없음, 주 1회 1분) ② AI 프로브 3회(회당 10질문×5채널 ≈ 1시간) ③ 발행 대장 1줄/편. 그 외 복붙 없음.
- **자격증명·키 보관**: 서비스 계정 JSON은 레포 밖 또는 `.gitignore` 경로 파일, 컨테이너엔 경로만(`FM_GSC_SA_KEY_PATH`). `.env`와 `.env.example` 키셋 동일(`FM_GSC_SITE_URL`, `FM_GSC_SA_KEY_PATH`; 필요 시 `FM_ARTICLES_DIR`). 값은 이 문서에 쓰지 않는다.
- **폴백**: 서비스 계정 설정이 막히면(DNS·권한) P5/P6 보고는 Search Console UI를 사람이 읽어 표를 채운다 — 수기 폼을 URL별로 확장하는 기능은 **만들지 않는다**(§6 D5 second look).

---

## 5. 보고·학습 흐름

| 시점 | 산출물 | 위치 | 독자 |
|---|---|---|---|
| 첫 발행 전 | `baseline.md`(기준선·임계값 동결·발행 대장) | `ai-docs/review/261010_fm_blog_exposure/` | 사용자·AI 세션 |
| 첫 발행 +4주 | `report_4w.md` + CSV | 동일 | 사용자(대표 공유 선택) |
| 첫 발행 +8주 | `report_8w.md`(판정 + 1페이지 요약) + CSV | 동일 | **대표** |
| 8주 후 | `BACKPORT.md` `Kind: learning` N건(증거 id 필수) | `factmind-saigon/BACKPORT.md` | 대표(업스트림 적용 판단) |

- 업스트림(`/DEVELOP/Blueurban/factmind`)에는 아무것도 쓰지 않는다. 학습은 원장에만 쌓고 적용은 대표가 고른다.
- 완료 처리 시 이 md → `ai-docs/task/261010/` 이관 + `task/archive.md`(agent-guidelines §1-C).

---

## 6. 리스크·미결 결정 (권장안 + Second Look)

**D1. 아티클 표면 — (a) 랜딩 SPA / (b) fm 어댑터 BFF / (c) 별도 정적**
> **Recommendation:** (b) fm 어댑터에 `kind='article'` 추가, BFF가 `/blog/`·`/ko/blog/` 서빙
> **Why (brief):** publish→verify→sitemap→IndexNow→봇 방문 기록이 이미 돌아가는 파이프라인에 글을 얹는 것이고, 정적 서빙이면 "크롤" 칸을 채울 수 없다. prerender는 홈 1장뿐이고 실패해도 exit 0이라 빈 셸 배포를 못 잡는다.
> **Second look:** 참조(구글 문서: 서버 HTML·HTML 안 canonical·Article 구조화 데이터 권장) / Gamma(경계 = subject→snapshot→publication 계약, 아티클은 어댑터 끝단의 변주, core 불변) + 프리모템("8주 뒤 BFF 장애로 글이 5xx" — fm 경로 전부 같은 성질, 허용) / Karpathy(새 툴체인 0, 렌더러 1파일) → **kept**

**D2. 외부 플랫폼(Blogger) arm 포함 여부**
> **Recommendation:** 이번 실험에서 제외, 후속 실험 E2로 분리(질문: "blogspot 도메인의 vi 질의 노출")
> **Why (brief):** 구글은 자사 블로그 우대를 문서화한 적이 없어 비교하면 플랫폼 우대가 아니라 도메인 권위를 재게 되고, Blogger 글이 우리 글로 링크하면 주 arm의 발견 경로를 오염시킨다. 1인 운영에 arm 3개는 무리.
> **Second look:** 초안은 "2편 소규모 병행" — Gamma 프리모템에서 **링크 오염·주제 불일치**라는 구체 문제가 나와 변경 / Karpathy(변수 1개) → **changed**(병행 → 제외·후속)

**D3. 랜딩 교란 요인(중복 라우트 7·soft-404·JS canonical) — 기준선 전 수정 vs 고정·문서화**
> **Recommendation:** sitemap 중복 7 URL 제외(1줄)만 P0에서 수정하고 soft-404·JS canonical·비상호 hreflang은 **고정·문서화**
> **Why (brief):** 판정 지표가 URL 단위라 랜딩 결함은 T arm 수치에 직접 영향이 없고, 엣지 nginx·prerender 수정은 별개 위험이며 실험 중 랜딩을 바꾸면 "무엇이 효과였나"가 흐려진다. 사이트맵 제외는 공짜고 기준선 전이다.
> **Second look:** 초안은 "전부 기준선 전에 수정" — 프리모템("랜딩 수정과 블로그를 동시에 했더니 원인 분리 불가")과 Karpathy(1줄 vs 빌드 파이프라인·nginx 변경)로 축소 → **changed**(전부 수정 → 1건만)

**D4. Search Console 속성 유형**
> **Recommendation:** Domain 속성(DNS TXT) `saigon-rider.com` 1개
> **Why (brief):** root/www/business/app를 한 번에 덮고 프로토콜·호스트 변화에 안정적이다. 분석은 API에서 page 접두로 자른다.
> **Second look:** Gamma(호스트가 늘어도 경계 불변) / 프리모템("app.·business. 데이터가 섞여 기준선이 흐림" → 모든 조회를 `https://saigon-rider.com/` 접두로 필터, 호스트별 기준선 별도 기록) / DNS 호스팅 위치는 [확인 필요(운영자)] → **kept**

**D5. 지표 수집 — 수기 폼 확장 vs Search Console API 잡**
> **Recommendation:** API 일간 잡(Search Analytics + URL Inspection) → 테이블 2개 → 어드민 표. 수기 폼은 사이트 총수용으로만 유지, URL별 수기 확장은 안 함
> **Why (brief):** URL×일 단위 데이터는 사람이 복붙할 수 없고, 1인 운영자의 주간 복붙은 8주 동안 가장 먼저 빠지는 일이다. `google-auth`·httpx·APScheduler가 이미 있어 추가 의존성 0.
> **Second look:** 참조(Search Analytics API 2~3일 지연·사후 확정 → 10일 창 재조회; URL Inspection 2,000/일 → 추적 ≤ 30) / Gamma(구글 API 계약 안정) / 프리모템("권한·DNS가 막혀 잡이 못 돎" → 폴백 = 보고 시점에 UI를 사람이 읽기, 기능 추가 없음) / Karpathy(~150줄) → **kept**

**D6. 글 작성·저장 방식 — 어드민 폼 vs repo markdown**
> **Recommendation:** repo `factmind-saigon/content/articles/<lang>/<slug>.md` + 어드민 '아티클 동기화'(`status: ready`+`reviewed_on` 있는 파일만) → draft → publish. markdown→HTML은 `markdown` 패키지 추가
> **Why (brief):** 운영자가 개발자이고 글은 6~12편뿐이라 git이 곧 리뷰·버전 경계다. 검수 완료 표시를 front matter에 두면 정직성 게이트가 코드로 강제된다. 어드민 CMS는 UI 작업이 크고 검수자는 어드민이 아니다.
> **Second look:** 초안은 어드민 markdown 폼 — Karpathy(폼·미리보기·권한 vs 파일 1개)로 변경 / 프리모템("편당 bff 재빌드가 귀찮아 발행이 밀림" → 발행 6회뿐, 이미 하는 배포 절차; 치명 아님) / Gamma(콘텐츠는 데이터, 렌더는 어댑터 — 경계 유지) → **changed**(폼 → 파일)

**D7. 편수·언어**
> **Recommendation:** 6주제 × vi(필수, 네이티브 검수) + ko(권장); en 없음; 검수 역량 부족 시 vi 최소 4편
> **Why (brief):** 구글의 scaled content 스팸 정책과 네이버 정직 기준 모두 "적지만 진짜"를 요구하고, 1차 시장은 vi, 운영자 모국어는 ko다. en은 검수자도 시장도 없다.
> **Second look:** 실험 타당성 렌즈(글마다 발행일을 달리해 URL별 소요일 측정 가능) / 프리모템("vi 검수자를 못 구해 발행이 0" → vi 4편 하한 + ko는 독립 발행 가능) → **kept**

**D8. 판정 기준 수치(§2.6)**
> **Recommendation:** K1 80%/14일, K2 4/6 28일, K3 비브랜드 100 impressions·10질의(5~8주), K4 T≥2C, K5 기록만 — P2 시작 전 사용자 조정 후 동결
> **Why (brief):** 극소 트래픽 사이트라 클릭은 노이즈고, 크롤·색인·노출·질의 수는 n이 작아도 "있다/없다"가 갈린다. 미리 적어두지 않으면 결과를 본 뒤 기준이 움직인다.
> **Second look:** 측정 타당성 렌즈(연장은 1회만 — 무한 연장 방지) / 프리모템("출시로 브랜드 질의가 튀어 K3 자동 통과" → 비브랜드로 한정) → **kept**

**D9. core 변경 여부**
> **Recommendation:** core 무수정. 아티클 렌더·GSC 수집·미들웨어 접두는 전부 `saigon/` 어댑터. `core/bot_policy.json` providers `state`도 손대지 않음
> **Why (brief):** 대표가 업스트림 엔진 작업 중이라 core 다이제스트를 흔들면 역이식 패리티가 깨지고, 필요한 기능(해시 검증·봇 판정)은 core가 이미 제공한다.
> **Second look:** Gamma(small core + variation at the edges 그대로) / 프리모템("나중에 Article 번들을 core로 올리고 싶음" → 그때 BACKPORT `Kind: code`로 제안하면 됨) → **kept**

**D10. 서비스 계정 키 보관**
> **Recommendation:** `.gitignore` 경로 파일 + 컨테이너 경로 env(`FM_GSC_SA_KEY_PATH`), `firebase-credentials.json` 선례 방식
> **Why (brief):** base64 인라인은 `.env`를 읽기 어렵게 하고 유출 시 범위가 같다. 레포에 이미 같은 패턴이 있다.
> **Second look:** 보안 렌즈(읽기 전용 scope, Search Console 사용자 권한은 필요 최소 — Full이 요구되면 그 이유를 기록) → **kept**

**D11. 내부 링크·홍보 통제**
> **Recommendation:** 홈 푸터 "Blog" 링크 1개 + sitemap-fm만. 8주간 외부 홍보·백링크·"색인 요청" 금지
> **Why (brief):** 묻는 것이 "구글이 블로그형 페이지를 스스로 찾아 색인·노출하는가"이지 "홍보하면 트래픽이 오는가"가 아니다.
> **Second look:** 프리모템("8주 뒤 '아무도 홍보 안 했으니 당연히 0'이라는 반론") — 그 반론이 맞다면 그것 자체가 답(블로그만으로는 부족)이고, 홍보 효과는 E2 이후 별도 질문 → **kept**

**기타 리스크**
- `TRANSLATE_API_KEY` 403은 이 실험과 무관(기계번역을 공개하지 않음).
- 앱 심사 통과·출시 시점이 창 안에 들어올 수 있음 → 보고서 "예외 사건" 칸에 날짜 기록, 비브랜드 분리로 흡수.
- `fm_bot_visit` 보존 30일 → K1(14일 창)은 충분하나 8주 보고 시 초기 행은 purge됨 → P5에서 CSV 추출로 보존.
- 네이티브 검수자 미확보 시 일정은 콘텐츠에서 밀린다(코드는 안 밀림). 일정 §8은 "검수 완료 전제".
- Cốc Cốc·Zalo 크롤러 UA 미등록 → `UNKNOWN`으로 잡힘. 관측되면 P6 learning 후보(core 정책 수정은 BACKPORT 경유, 이 태스크 범위 밖).

---

### D12 — 착수 범위: 풀 트랙 vs 경량 트랙 (사용자 결정 필요)

- **풀 트랙(W2 권장, D1·D5)**: P0 → P1 fm `kind='article'`(마이그레이션 255·nginx 2곳·어드민 동기화) + P3 Search Console API 일간 잡(마이그레이션 256) → P4 어드민 "검색 성과" 카드 → P5·P6 보고.
- **경량 트랙(감독 의견)**: P0(Search Console·기준선) + 정적 아티클(랜딩 빌드에서 `/blog/<slug>/index.html`을 서버 HTML로 생성 — canonical·Article JSON-LD·`<html lang>` 포함, `sitemap-site.xml`에 추가, 마이그레이션·nginx 변경 없음) + 2/4/8주차에 Search Console 화면(성과·URL 검사의 마지막 크롤 시각)을 읽어 P5·P6 보고. P1(fm 아티클)·P3·P4는 K1/K2에서 신호가 보이면 확장 단계로 진행.

> **Recommendation:** 경량 트랙으로 먼저 착수하고, K1/K2 신호가 보이면 풀 트랙으로 확장
> **Why (brief):** 운영자 1명·업체 0곳·글 6편 규모에서 "블로그형 글이 구글 노출에 도움 되는가"에 답하는 데는 서버 HTML 몇 장과 Search Console 화면이면 충분하다. 마이그레이션 2개·nginx·API 잡·어드민 카드는 효과가 확인된 뒤에 들여도 늦지 않다.
> **결정(2026-10-10): 경량 트랙 채택.**
> **Second look:** 레퍼런스(Search Central: 정적 HTML + canonical + Article 구조화 데이터로 충분, URL 검사가 마지막 크롤 시각 제공) + Gamma 사전부검("8주 뒤 fm 파이프라인으로 다시 옮겨야 해 이중 작업") → Karpathy 재적합(옮길 대상이 md 6편이라 재작업이 작음) → 경량 유지. 단 W2는 풀 트랙 권장(크롤 로그·검증 해시·FactMind 학습 연결) — 두 의견이 갈리는 이 지점이 실제 결정 포인트다. 경량 트랙의 알려진 한계: 정적 경로는 `fm_bot_visit`에 기록되지 않음(크롤 지표는 URL 검사로 대체), 글 철회 시 엣지 `try_files` 때문에 soft-404.

## 7. 티켓용 Phase 표 (`doil-context` 서브 티켓; `task_id` 발행됨 `2026-10-10-fm-google-blog-exposure`, workspace 규약은 agent-guidelines §1-D)

| sub_id | title | model + rationale | subtasks(요지) | verify | depends_on | caution |
|---|---|---|---|---|---|---|
| `p0-baseline` | 전제·기준선 | Sonnet — 1줄 제외 수정·체크리스트 문서(기계적); 나머지 운영자 | Search Console Domain 속성·사이트맵 제출·서비스 계정·sitemap 중복 7 제외·플랫폼 발행 결정·baseline.md(Inspection·과거 성과·총수 수기·AI 프로브 1회·임계값 동결) | 로컬 `dist/sitemap-site.xml` loc=3, 배포 후 curl loc=3, baseline.md ①~⑤ | — | 랜딩 타 파일·워킹트리 타 변경 금지 |
| `p1-article-surface` | 아티클 표면 `/blog/` | Fable — 어댑터 횡단 설계, SEO 정확성이 실험 유효성 좌우 | 255 마이그레이션·content md 소스·`articles.py` 렌더(Article JSON-LD·canonical·hreflang)·subjects/publishing 확장·routes_public·middleware·nginx 2곳·어드민 동기화·푸터 링크 | dev :18090 HTTP 시나리오 1회(sync→publish→200 Article/canonical→verify→sitemap-fm→301→봇 방문 article→withdraw 410) | — | core 무수정, env 패리티, 253 제약 재선언 금지, `markdown` 의존성 양쪽 이미지 |
| `p2-content` | 글 6편 작성·검수·발행 | 사람(작성·검수); 번역 초안만 Fable | 주제 승인·임계값 동결·ko 초안·vi 번역·네이티브 검수·`reviewed_on`·주 2/2/1/1 평일 발행·발행 대장 | 운영 `/blog/<slug>/` 200+canonical, `verified_at`, sitemap-fm 포함 | p1, p0 | AI 본문 생성·외부 홍보·색인 요청 금지 |
| `p3-gsc-job` | Search Console 수집 잡 | Fable — 외부 API 인증·멱등 upsert·날짜 경계(PT/ICT) 오류는 조용히 틀린 숫자를 쌓음 | 256 마이그레이션(`fm_search_daily`·`fm_url_inspection`)·env 2키·`gsc.py`(google-auth+httpx, 10일 창, 추적 URL ≤30)·`jobs.py` 06:30·`_JOBS`·읽기 API 2개·브랜드 분리 | dev 실제 API 1회: 잡 202 → 행 생성 → `/search/urls` 집합 일치 → 재실행 행 수 불변; 키 없으면 skipped | p0(서비스 계정) | 키 커밋 금지, `fm_event` 체인 불변, core `bot_policy.json` 불변 |
| `p4-admin-search-view` | 어드민 "검색 성과" 카드 | Sonnet — 기존 카드 패턴 미러링, 표 2개 | `api/fm.ts` 3함수·`SearchConsoleCard`(StatCard 3·URL 표·주간 표·잡 버튼·미연결 Alert) | Playwright `/admin/fm` 카드 렌더·행 ≥1·콘솔 오류 0 | p3 | 기존 카드 수정 금지 |
| `p5-report-4w` | 4주차 중간 보고 | Sonnet — 추출·표 작성 기계적, 해석은 감독 | K1·K2 표·K3 중간·AI 프로브 2회·예외 사건·CSV·index.md 등록 | 보고서에 K1·K2 표 + 증거 id | p2, p4 | 판정하지 않음 |
| `p6-report-8w` | 8주차 최종 보고·학습 | Sonnet + 감독 종합 | K1~K5 판정·언어별·AI 프로브 3회·대표 1페이지·BACKPORT learning(증거 id)·후속 제안(E2) | K1~K5 값 전부, BACKPORT ≥1, `Forwarded: pending` 건수 | p5 | 업스트림 무접촉, 동결 임계값 변경 금지 |

---

## 8. 일정(평일 기준, 착수일 상대 — 고정 요일 마감 없음)

| 시기 | 할 일 |
|---|---|
| 착수 후 1주차 평일 | Plane·티켓 등록(§10) → P0 운영자 액션(속성·사이트맵·서비스 계정) + P0 sitemap 1줄 배포 + **P1·P3 구현 착수(병행)** + 주제 승인·ko 초안 시작 |
| 2주차 평일 | P1·P3 dev 통합 1회 → 운영 반영(255·256, nginx 정규식, env) → P4 → 기준선 `baseline.md` 완성(잡 첫 실행 데이터 포함)·AI 프로브 1회·**임계값 동결** · vi 번역·검수 진행 |
| 3주차 평일 | 검수 완료분 **첫 발행 2편**(화·목 등 평일 2일) + 푸터 링크 배포. 이 날이 "첫 발행일(T0)" |
| 4주차 평일 | 발행 2편 |
| 5주차 평일 | 발행 1편 |
| 6주차 평일 | 발행 1편(마지막). 이후 콘텐츠·랜딩 변경 없음 |
| 7주차 평일(T0+4주) | `report_4w.md`, AI 프로브 2회 |
| 11주차 평일(T0+8주) | `report_8w.md`, AI 프로브 3회, BACKPORT learning, 대표 보고. 불충분이면 15주차에 1회 연장 판정 |

검수가 늦어지면 T0만 뒤로 밀고 창 길이는 유지한다.

---

## 9. 제약사항(요약)

- 완료 정의: 각 Phase **통합테스트 1회**(dev `:18090` 재빌드 후 실제 HTTP/API 시나리오 또는 Playwright 1회). 단위테스트·재검증 루프 금지. 구현자는 구현+커밋까지, 통합테스트는 감독.
- `factmind-saigon/factmind_saigon/core/` 무수정. fm 작업 시작 시 `python factmind-saigon/tools/fm_upstream.py --upstream /DEVELOP/Blueurban/factmind` 상태를 보고에 적는다(실행 불가 환경이면 `unknown-upstream`). 보고 마지막 줄에 `Forwarded: pending` 건수.
- `.env`·`.env.example` 키셋 동일(신규: `FM_GSC_SITE_URL`, `FM_GSC_SA_KEY_PATH`, 필요 시 `FM_ARTICLES_DIR`). 값·키 파일 커밋 금지.
- `database/init/255_*.sql`·`256_*.sql`은 매 배포 재실행 → 멱등(agent-guidelines §10). 254의 `fm_event_kind_check` 체인은 건드리지 않는다.
- 평일만. 외부 홍보·백링크·"색인 요청" 8주 금지. AI 본문 생성 금지, vi 네이티브 검수 필수.
- 업스트림 FactMind 레포·문서 무접촉. 사이공 문서는 이 레포(`ai-docs/`)에만.
- 워킹트리의 타 태스크 변경분(스토어 자산·ai-docs·native/ios)은 커밋에 섞지 않는다.

---

## 10. 착수 핸드오프

1. **Plane**: Feature "FM 블로그 노출 실험" 등록(+label `fm`), description에 `SoT: ai-docs/task/active/261010_fm_google_blog_exposure_task.md`; 서브 Todo는 §7 행대로(`[P0-1]`…).
2. **`doil-context`**: 메인 티켓 `2026-10-10-fm-google-blog-exposure` + 서브 티켓 7개(§7)는 2026-10-10 계획 세션에서 **발행 완료**. 착수 세션은 `/doil-supervise follow`로 이어받는다(새로 발행하지 않는다).
3. 사용자 확정 질문 4개를 먼저 받는다: ① 주제 6개 승인/교체 ② vi 검수자 확보 여부 ③ §2.6 임계값 수치 ④ Search Console이 이미 등록돼 있는지·DNS 호스팅 위치. → 2026-10-10 확정(상단 확정 결정 블록).
4. `/doil-supervise`로 P0(운영자 체크리스트 전달)와 P1·P3(병행) 라우팅.
