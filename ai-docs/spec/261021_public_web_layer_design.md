# 공개 웹 레이어 설계 — fm 레이어 P6 확장: 침수·매물·업체 밀도 (2026-10-21)

> **성격**: 설계서(코드 변경 없음). 대표 결정 2026-10-21(Q3: 권도일 2~3주 우선 배정) 에 따라 Stage 0 에서 티켓화한다.
> **전제 문서**: [`261008_fm_engine_port_plan.md`](261008_fm_engine_port_plan.md)(P0~P5 완료 `8569bb6d`, P6 = 확장) · [`../task/active/261010_fm_google_blog_exposure_task.md`](../task/active/261010_fm_google_blog_exposure_task.md)(8주 교란 통제) · [`../task/active/261021_stage0_promotion_kickoff.md`](../task/active/261021_stage0_promotion_kickoff.md)(결정·역할).
> **원칙**: 새 생성기를 만들지 않는다. 이미 운영 중인 `factmind-saigon/`(core + saigon 어댑터)의 **주어(subject) 종류를 늘리고**, 밀도 게이트를 붙이고, 업체 발행을 자동화한다. 코어(`factmind_saigon/core/`)는 건드리지 않는다(역이식 가드레일).

---

## 0. 한 장 요약

| 페이지 유형 | URL | 주어·데이터(있음) | 1차(Stage 1) | 2차(Stage 2) |
|---|---|---|---|---|
| 침수 도로 현황 | `/ngap/<road-slug>/` (+`/ko/ngap/`, `/en/ngap/`) | `flood_report`(status·depth_level·reported_at·street_name) · `flood_hotspot_stats` · 공식 경보 연동(출처 표기) | ★ 상습 구간 20곳부터 | 전 도로 |
| 업체 페이지 | `/b/<slug>/` (있음) | `BusinessProfile`(APPROVED+verified) → `FmSubject` | ★ 발행 자동화 잡 | — |
| 동 허브·동×업종 목록 | `/l/<ward>/`, `/l/<ward>/<cat>/` (있음) | fm lists(요청 시 생성) | ★ 밀도 게이트(업체 ≥ 10) | — |
| 매물 허브·매물 | `/cho/<ward>/<cat>/`, `/cho/<ward>/<cat>/<id>/` | `MarketplaceListing`(ACTIVE) · 이미지 · `ward_id` | — | ★ |
| 주유소 | `/tram-xang/<ward>/` | `GasStation`(status active) | — | ★ |
| 블로그 | `/blog/<slug>/` (있음, 랜딩 빌드) | `landing/apps/client/content/blog/<lang>/*.md` | 실험 통제 중 | TextMind 주 2편(§7) |

- **왜 fm 어댑터 위에 얹나**: 저장 공개본·검증(`verify_publication` = 200 ∧ canonical ∧ sha256) · 사이트맵·RSS·IndexNow · 봇 방문 집계(`fm_bot_visit`) · 어드민(`/admin/fm`) 이 이미 있다. 침수·매물은 "주어가 하나 더 늘어난 것"이다.
- **밀도 게이트**: FactMind 10-09 실측(1건 목록 = Soft 404) 과 업스트림 10-13 동기화(목록에 facts 표시) 교훈. 목록 페이지는 항목 ≥ 10 일 때만 사이트맵에 넣고, 미만이면 `noindex` + 상위 허브로 canonical.
- **D2 법적 범위**: 침수 페이지에는 사용자 제보(사실·시각·건수·깊이 단계) + 공식 경보(출처·시각 표기) + 과거 통계(상습 구간, 제보 누적)만. `flood_risk_daily`(자체 예측)는 **공개 페이지·위젯·RSS 에 싣지 않는다**(앱 내부 전용, "tham khảo" 표기 — 법무 확인 §7 질문 3).

---

## 1. 침수 도로 페이지 `/ngap/<road-slug>/`

### 1-1. 주어와 슬러그
- 주어 = **도로 구간**(`street_name` 정규화 + 존 안 상습 구간 목록). 1차 20곳은 히엔 선생님이 만드는 표(도로명 vi · 구간 설명 · 평소 깊이)로 시딩한다. `flood_hotspot_stats` 의 hotspot 과 1:1 로 맞추고, 없는 도로는 hotspot 을 새로 만든다.
- slug = 베트남어 도로명의 무성조 ASCII(`nguyen-huu-canh`) + 구간 구분이 필요하면 `-q-binh-thanh`. 한 도로 한 페이지가 원칙(구간 분할은 2차).

### 1-2. 페이지 내용(위에서 아래로)
1. 제목 `Đường <도로> hôm nay có ngập không?` + 상태 배지(최근 3시간 제보 건수·최고 깊이 단계 / "Không có báo ngập trong 3 giờ qua").
2. **오늘 제보** 목록: 시각 · 깊이 단계(`depth_level` 라벨) · 확인 수(`flood_confirmation`) · 사진 썸네일(있으면, imgproxy). 사용자 식별 정보 없음.
3. **공식 경보**(있을 때): 출처 기관명 · 발표 시각 · 원문 링크. 없으면 섹션 생략. — 기상수문법 출처 표기 의무.
4. **이 길의 기록**: 최근 90일 제보 일수 · 월별 건수 막대(텍스트 표도 함께) · "thường ngập khi mưa lớn / triều cường" 분류(제보 시각과 조위 캘린더 대조는 2차).
5. **우회로**: 자체 길안내(Valhalla)로 존 안 주요 목적지 2~3개까지의 대체 경로 텍스트("qua Phan Đăng Lưu → …"). 지도 이미지는 정적 PNG(서버 렌더) 1장.
6. **근처**: 주유소 3곳 · 정비소 3곳(`/b/` 링크 있으면 그쪽으로) · 같은 동 다른 침수 도로 링크(내부 링크 밀도).
7. 앱 다리: "Nhận cảnh báo khi đường này ngập" → `app_down.html?src=ngap-<slug>` + Zalo OA 링크. 제보하기 → 앱 딥링크.
8. JSON-LD: `WebPage` + `Dataset`(제보 집계) + `BreadcrumbList`. `Event` 는 쓰지 않는다(경보로 오해될 소지).

### 1-3. 생성·갱신
- fm 어댑터에 `kind="road"` 주어 추가(`FmSubject.kind`). 스냅샷 = 위 2~6 의 데이터 JSON. **갱신 주기**: 제보가 들어오면 10분 디바운스로 재발행(저장 공개본 교체 + IndexNow), 제보 없으면 하루 1회(기록·우회로 갱신).
- 제보 0건 상태의 페이지도 유지한다(기록 섹션이 본문을 채운다). 단 **기록 제보 < 3건 && 상습 목록에 없음** 이면 noindex(밀도 게이트).
- 허브 `/ngap/`: 오늘 제보 있는 도로 → 상습 도로 → 나머지 순. 사이트맵 `sitemap-ngap.xml` 를 `sitemap.xml` 인덱스에 추가.

### 1-4. 임베드 위젯(공공재)
- `/ngap/widget/` : 존 전체 "지금 잠긴 도로" 목록 + 미니맵 PNG, iframe 허용(`X-Frame-Options` 제거는 이 경로만), 하단 "Nguồn: Saigon Rider" 고정 링크. 캐시 60초.
- 이미지 URL `/ngap/map.png`(언론·그룹 게시용, 시각 워터마크). 둘 다 자체 예측 없음.

---

## 2. 업체 페이지 발행 자동화 + 목록 밀도 게이트

- 현재: 업체 발행은 `/admin/fm` 수동(FmSubject publish). 시딩 500곳이 들어오면 손으로 못 한다.
- **잡**: `BusinessProfile.status='APPROVED' AND verification_status='verified'` 이고 `FmSubject` 미발행이면 자동 publish(스냅샷 = `business_snapshot(db, profile, locale)` 3개 언어) → verify → IndexNow. 승인 철회·정지 시 withdraw. 30분 주기(`jobs/`). 사장이 소식·가격표를 바꾸면 해당 업체만 재발행(기존 `publishing.py` 트랜잭션 재사용).
- **업체 페이지 본문 하한**: 소개(`intro`) 200자 미만이면 운영진 보강 전까지 발행 보류 큐에 둔다(얇은 페이지 금지). 시딩 안내지에 "소개 3문장" 을 필수 항목으로.
- **목록 밀도 게이트**(`lists.py`): `/l/<ward>/` 는 업체 ≥ 10, `/l/<ward>/<cat>/` 는 ≥ 5 일 때 index + 사이트맵 포함. 미만이면 페이지는 열되 `<meta name="robots" content="noindex,follow">` + canonical 을 `/l/<ward>/`(또는 `/l/`) 로. 사이트맵 생성도 같은 기준.
- 목록 항목에 facts(소개 첫 문장·주소·영업시간) 표시는 업스트림 10-13 동기화로 이미 반영됨 — 유지.

---

## 3. 매물(2차, Stage 2)

- 주어 = 매물(`MarketplaceListing`, status ACTIVE, 이미지 ≥ 1). 페이지 = 제목·가격·카테고리·동(ward 이름만)·등록일·사진·판매자 닉네임·신뢰 지표(거래 수·별점). **전화·정밀 좌표·실명 없음**. 판매 완료/삭제 시 즉시 withdraw(410).
- 허브 `/cho/<ward>/<cat>/`: 활성 매물 ≥ 10 일 때만 index. 매물 페이지는 항상 index(본문 = 설명 + 사진 alt + 같은 동 유사 매물 6개).
- 공유 카드: OG 이미지 = 첫 사진 + 가격 라벨(서버 합성). 앱 내 "공유" 가 이 URL(`?ref=u:<user_id>`)을 만든다 — 귀속은 기존 `acquisition.ts` 그대로.
- JSON-LD `Product` + `Offer`(priceCurrency VND, availability).

---

## 4. 주유소·정비소(2차)
- `/tram-xang/<ward>/`: `GasStation`(status active) 목록 + 24h 여부 + 대기 제보(`GasStationWaitReport` 최근 24h). 정비소는 fm 업체 페이지로 흡수(미등록 `RepairShop` 은 목록 페이지에 이름·주소만, 사장 등록 유도 링크).

---

## 5. 공통 — 서빙·사이트맵·링크·측정

- **서빙**: 엣지 `deploy/saigon-rider.conf` 정규식에 `ngap/`, `cho/`, `tram-xang/`, `sitemap-ngap.xml`, `sitemap-cho.xml` 추가(§3.3 방식 그대로, BFF 저장 공개본). nginx 변경은 운영 반영 절차(권도일).
- **사이트맵 인덱스** `sitemap.xml`: `sitemap-site.xml`(랜딩) · `sitemap-fm.xml`(업체·허브) · `sitemap-ngap.xml` · `sitemap-cho.xml`. 각 ≤ 5만 URL, `lastmod` 는 실제 발행 시각.
- **내부 링크**: 홈 → 허브 링크는 블로그 실험 종료 후(C arm). 그 전엔 신규 페이지끼리와 `/l/` 허브에서만 연결한다(허브는 실험 C arm 이므로 **12/08 까지 `/l/` 도 변경 금지** — 1차는 `/ngap/` 내부 링크만).
- **hreflang** vi/ko/en + x-default(vi). `<html lang>` 로캘 고정(`lists.py` 방식).
- **robots**: AI 봇 허용 목록(10/21 배포) 유지. Cốc Cốc(`coccocbot-web`) 추가됨.
- **측정**: `fm_bot_visit.path_kind` 에 `road`·`listing` 추가. 서치콘솔 URL 검사 lastCrawlTime 수기(블로그 실험 방식). AI 인용 관측은 v1 미구현(계획서 §3.5) — Stage 2 에 "주 1회 수동 프로브 5문항(Google AI Overviews·Gemini·ChatGPT)" 을 어드민 `ai_probe` 이벤트로 기록.

---

## 6. 개인정보·안전 규칙(전 페이지 공통)
- 공개 페이지 생성 입력에서 `phone`·정밀 좌표(소수 3자리 초과)·`reporter_user_id`·`seller_id` 를 제거한다(스냅샷 함수에서 화이트리스트 방식).
- 사용자 사진은 제보자가 "공개" 를 선택한 것만(제보 폼에 토글 추가, 기본 끔). 얼굴·번호판은 1차에선 사진 자체를 안 싣는 선택도 가능 — 법무 §7-4 결과로 결정.
- 업체는 사장이 `/biz/apply` 에서 "Google 공개 동의" 체크(기존 동의 버전에 항목 추가).
- 공개본에는 생성 시각·데이터 기준 시각을 항상 표기한다(낡은 정보 오해 방지, FactMind ⑤ 설명 관문).

---

## 7. TextMind 사이공 잡 — 콘텐츠 파이프라인(블로그 2차)

- **정체**: 서버 `/opt/textmind-serial/`(계정 `textmind`) 은 대표의 무인 연재 에이전트(엔진 + Claude 무인 세션 '정독'·'마무리', systemd timer, 검수 통과분 자동 게시). 정본 `C:\text_mind`. 사이공 잡은 아직 없다.
- **왜 그대로 안 쓰나**: 일 1편 무인 게시는 (a) 블로그 실험 §2.3-4(AI 양산 금지·출처 필수) 위반 (b) Google scaled-content 정책 위험 (c) 베트남어 사실 오류를 거를 검수자가 1명(히엔)뿐.
- **설계**: `textmind-saigon.timer`(주 2회, 화·금 09:00 KST)
  1. 주제 큐 `landing/apps/client/content/blog/_queue.md`(히엔·대표가 채움: 질문형 주제 + 출처 2개 이상). 큐가 비면 아무것도 안 한다.
  2. 엔진이 vi 초안(1,500~2,500자) + ko 번역 + `sources:` 프런트매터 작성 → `content/blog/_review/<slug>.md`.
  3. Claude 무인 세션 '정독': 출처 대조·경험 서술 금지·숫자 날짜 표기·링크 생존 검사 → 통과 시 `_review/` 에서 `vi/`·`ko/` 로 이동(미통과는 FEEDBACK 에 사유).
  4. **게시는 히엔 검수 승인 후**(Zalo 로 요약+링크 발송, "OK" 회신 시) — 자동 게시는 실험 종료·대표 결정 후에만 켠다.
  5. 게시 = 랜딩 빌드(`pnpm run build` → generate-blog → sitemap-site) → `/var/www/saigon-rider/` 반영(서버 빌드 또는 로컬 빌드 + rsync, 기존 `랜딩배포` 절차) → IndexNow.
- **주제 축(1차 12개)**: 침수 도로별 가이드(§1 페이지와 상호 링크) · 우기 장비 · 배출가스 검사(2026) · 전기 오토바이 전환 지원(기사용) · 정비소 고르는 법 · 중고 헬멧 고르기 · 설 전 대청소 판매 가이드 · 떤선녓 주차 · 주유 가격 · 명의 이전 · 동네별 "라이더 지도"(푸년·빈탄) · 사기 거래 피하기.
- **게시 시작 시점**: 블로그 실험 4주차 판독(11/10) 또는 종료(12/08) 후 대표 결정. 그 전엔 `_review/` 큐만 쌓는다.

---

## 8. 단계·티켓(권도일 등록)

| 티켓 | 범위 | 완료 조건(통합 시나리오 1회) |
|---|---|---|
| P6-1 업체 자동 발행 + 밀도 게이트 | §2 | dev 에서 업체 12곳 승인 → 30분 내 `/b/` 12개 + `/l/<ward>/` index, 4곳만 있는 동은 noindex·사이트맵 제외 |
| P6-2 침수 도로 페이지 + 허브 + 사이트맵 | §1-1~1-3 | 상습 20곳 시딩 → `/ngap/<slug>/` 20개 200·canonical·JSON-LD, 제보 1건 입력 후 10분 내 페이지 갱신 + IndexNow 이벤트 |
| P6-3 위젯·이미지 + 엣지 라우팅 | §1-4, §5 | iframe 삽입 테스트 페이지에서 60초 캐시 확인, 운영 nginx 반영 |
| P6-4 귀속·측정 | §5 측정 + Stage 0-3 | `app_down.html?src=ngap-x` → 설치 → 가입 소스 집계, `fm_bot_visit` road 집계가 `/admin/fm` 에 표시 |
| P6-5 매물·주유소(2차) | §3, §4 | Stage 2 착수 시 |
| TM-1 TextMind 사이공 잡 | §7 | `_queue.md` 1건 → `_review/` 초안 1건 + 정독 보고 1건(게시 없이) |

**순서**: P6-1 → P6-2 → P6-4 → P6-3 → TM-1 → (11/10 판독) → P6-5. P6-1·P6-2 가 Stage 1 시작(11/04) 전 dev 통과가 목표, 운영 반영은 Stage 1 첫 주.

---

## 9. 하지 않는 것
- 코어(`factmind_saigon/core/`) 수정 · 업스트림 FactMind 레포 수정(대표: "만지지 마").
- 자체 침수 예측 공개 · 사용자 식별 정보 공개 · 가짜 제보·가짜 업체 시딩.
- 블로그 실험 기간 중 홈·`/l/`·블로그 URL 변경 및 외부 홍보.
- 일 1편 무인 자동 게시(검수 없는 양산).
