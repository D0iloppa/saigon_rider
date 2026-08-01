# 다국어 검색 결함 진단 + 해결책 설계

- 작성 2026-08-01 · 브랜치 `feat/info-map-poi-l3` · 작성자 분석 에이전트(Opus) — **구현 미포함, 코드 무변경**
- 실측 환경: dev (`saigon_db` PostgreSQL 15.4 / postgis 15-3.3, `localhost:18090`)
- 대표 문제제기 요약: "영어로 `Bike selling` 올린 매물을 한국 유저가 `자전거`로 검색하면 나와야 한다. 모든 컨텐츠가 번역되길 원하는데 번역이 잘 안 된다. **궁극 목표는 검색 해결**."

---

## 0. 결론 요약 (읽는 순서: 0 → 3 → 5 → 7)

1. **운영 사고가 먼저 있다.** Google Translate API 키가 **403 `User Rate Limit Exceeded`** 로 죽어 있고, `translations` 테이블의 마지막 적재는 **2026-07-08**이다. 즉 **3주 넘게 신규 번역이 0건**이다. 이것이 대표가 체감한 "번역이 잘 안 된다"의 1차 원인이다. → §2.1
2. **키를 살려도 검색은 안 고쳐진다.** 현행 방식은 "검색어를 번역해 원문 title 에 ILIKE" 인데, 이건 **어휘가 정확히 일치할 때만 우연히 맞는다**. 실측: `helmet` → 2건(영어 제목만), `Mũ bảo hiểm` → 2건(베트남어 제목만) — **같은 개념인데 결과 집합이 완전히 분리**됐다. `bike`→1건 / `bicycle`→0건, `xe máy`→1건 / `xe may`→0건, `Bikes`(복수형)→0건. → §3
3. **검색 대상 자체가 거의 없다.** 피드·가게소식·가격표·리뷰·공지에는 **검색 엔드포인트가 존재하지 않는다**. 매물은 `title` 만 검색되고 `description` 은 제외다. 업체는 `name` 만이고 **번역 연계가 아예 없다**. 그리고 대표가 말한 "업체소개"는 **`business_profile` 에 해당 컬럼이 아예 없다**(제품 갭). → §1
4. **추천 해결책**: 엔티티마다 **3개 언어를 하나로 합친 정규화 검색 컬럼(`search_blob`)** 을 두고 `pg_trgm` GIN 인덱스를 걸어 **단일 ILIKE 로 검색**한다. 번역문은 등록/수정 시 **아웃박스 비동기**로 미리 적재한다. 검색 경로에서 외부 번역 API 의존을 **완전히 제거**한다. `translations` 테이블은 폐기하지 않고 **번역 SoT 로 유지**(표시 경로 무변경, blob 의 재료로 재사용). → §4 안 2, §5
5. 실측으로 확인된 기술 전제: `pg_trgm`·`unaccent` 는 이 이미지에서 **설치 가능**(미설치 상태), `t ILIKE '%자전거%'` 는 **GIN trgm 인덱스를 실제로 탄다**(한국어 포함). 단 `unaccent(t) ILIKE ...` 는 seq scan 이 된다 — **정규화는 앱단(Python)에서 미리 수행**해야 한다. → §4.2
6. **대표 결정 필요 4건**: Google 빌링/쿼터 복구, "업체소개" 필드 신설 여부, 통합검색 화면 신설 여부, 번역 대상 컨텐츠 범위. → §7

---

## 1. 검색 표면 전수 조사

### 1.1 전체 표

| # | 파일:라인 | 경로 | 파라미터 | 검색 컬럼(OR 전부) | 연산자 | 번역연계 | 인덱스 | 결함 |
|---|---|---|---|---|---|---|---|---|
| 1 | `backend/app/routers/market.py:270-282` | `GET /api/bff/market/listings` | `q` | `MarketplaceListing.title` **만** (원문 + 검색어의 ko/en/vi 3변형 각각) | `ilike '%v%'` | **있음** (`translate_all(kw)` — 검색어 번역) | **없음** (seq scan) | `description` 미검색 / 매 검색마다 외부 API / 번역 실패 시 조용히 원문만 |
| 2 | `backend/app/routers/biz.py:867-901` | `GET /api/bff/biz/public/map` | `q` | `BusinessProfile.name` | `ilike '%q%'` | **없음** | 없음 | 번역 연계 전무 — 한국어로 베트남 상호 검색 불가 |
| 3 | `backend/app/routers/map/poi.py:19-50` | `GET /api/bff/poi/public/map` | `q` | `Poi.name_ko`, `Poi.name_vi`, `Poi.name_en` | `ilike` ×3 OR | 불필요(사전 3언어 컬럼) | 없음 | **이 레포에서 유일하게 "옳은" 다국어 검색 패턴** — 안 2 의 선례 |
| 4 | `backend/app/routers/users.py:356-374` | `GET /api/bff/users/search` | `query` | `User.nickname`(ilike) OR `User.phone`(`==` 정확일치) | 혼합 | 없음 | `idx_users_nickname` (btree — `%x%` 엔 무용) | 번역 대상 아님(고유명사) — 설계 범위 밖 |
| 5 | `backend/app/routers/admin_legacy.py:464` | `GET /admin-legacy/quests` | `q` | `Quest.title_ko` | `ilike` | 없음 | 없음 | 운영자용 — 우선순위 낮음 |
| 6 | `backend/app/routers/admin_legacy.py:1072` | `GET /admin-legacy/users` | `q` | `User.nickname`, `User.phone` | `ilike` ×2 | 없음 | 없음 | 운영자용 |
| 7 | `backend/app/routers/admin_legacy.py:1893` | `GET /admin-legacy/sre/shop` | `q` | Engine 응답 dict 의 `item_code`,`display_name` (**Python 메모리 필터**) | `str.lower()` substring | 없음 | N/A | 운영자용 |
| 8 | `backend/app/routers/admin_legacy.py:2143` | `GET /admin-legacy/sre/items` | `q` | 동일 | 동일 | 없음 | N/A | 운영자용 |
| 9 | `backend/app/routers/admin_legacy.py:4354` | `GET /admin-legacy/push/search-users` | `q` | (Engine 프록시) `SreUser.external_user_uuid` | `ilike` | 없음 | 미확인 | UUID 검색 — 번역 무관 |
| 10 | `backend/app/routers/admin_api/push.py:25` | `GET /admin/api/push/users` | `q` | #9 과 동일 프록시 | `ilike` | 없음 | 미확인 | 동일 |
| 11 | `backend/app/routers/admin_api/listings.py:69` | `GET /admin/api/listings` | `q` | `MarketplaceListing.title` | `ilike` | 없음 | 없음 | 운영자용 |
| 12 | `backend/app/routers/admin_api/quests.py:148` | `GET /admin/api/quests` | `q` | `Quest.title_ko` | `ilike` | 없음 | 없음 | 운영자용 |
| 13 | `backend/app/routers/admin_api/users.py:143` | `GET /admin/api/users` | `q` | `User.nickname`, `User.phone` | `ilike` ×2 | 없음 | 없음 | 운영자용 |
| 14 | `backend/app/routers/admin_api/audit_logs.py:34` | `GET /admin/api/audit-logs` | `admin` | `AdminAuditLog.admin_username` | `ilike` | 없음 | 없음 | 운영자용 |
| 15 | `backend/app/routers/admin_api/map/poi.py:117` | `GET /admin/api/map/poi` | `q` | `Poi.name_ko/vi/en` | `ilike` ×3 | 불필요 | 없음 | 운영자용 |
| 16 | `engine/app/routers/admin.py:895` | `GET /v1/admin/push/users` | `q` | `SreUser.external_user_uuid` | `ilike` | 없음 | 미확인 | Engine, `verify_service_key` |

> 인덱스 실측(`pg_indexes`): 검색 대상 테이블에 **텍스트 검색용 인덱스는 하나도 없다**. `users` 의 `idx_users_nickname`/`users_nickname_key` 는 btree 라 `ILIKE '%x%'` 에 쓰이지 않는다. `pg_extension` 에 `pg_trgm` 미설치.

### 1.2 대표가 언급한 컨텐츠별 확정 답변

| 컨텐츠 | 검색 엔드포인트 | 번역 | 상태 |
|---|---|---|---|
| **매물 title** | 있음 (#1) | 있음(검색어 번역 방식) | 결함 있음 — §3 |
| **매물 description** | **없음** — `market.py:270-282` 은 `title` 만 조건에 넣는다 | 표시용 번역은 됨(`translate_to`, `market.py:482`) | **검색 누락**. 본문에 "자전거"가 있어도 안 잡힌다 |
| **피드(`feed_posts`)** | **없음** — `routers/feed.py`·`admin_api/feed.py` 전수 확인, `q`/`keyword`/`ilike` 로직 부재. 목록은 `page`/`size` 만 | 표시용 번역은 됨(`FeedPost.content`) | **검색 엔드포인트 자체가 없다** |
| **업체소개** | **없음** | — | **`business_profile` 테이블에 description/intro/about 컬럼이 존재하지 않는다**(스키마 실측: name·category·address·phone·rep_name·상태/검증 컬럼만). 즉 기능 자체가 없음 → **제품 결정 필요**(§7-②) |
| **가게소식(`business_news`)** | **없음** — `GET /biz/public/{profile_id}/news`(`biz.py:1050`) 목록조회만 | **없음** | 컬럼은 있다(`title varchar(120)`, `body text`) — 번역·검색 양쪽 미배선 |
| **가격표(`business_price`)** | **없음** — `GET /biz/public/{profile_id}/prices`(`biz.py:1139`) | **없음** | `name varchar(120)`, `price_vnd` |
| **리뷰(`business_review`, `marketplace_review`)** | 없음 | 없음 | — |
| **공지/FAQ(`Notice`,`Faq`)** | 없음 | 없음 | — |
| **통합검색(global search)** | **존재하지 않음** | — | 도메인별 개별 엔드포인트로만 분산 |

### 1.3 프론트 검색 UI

| 화면 | 파일 | 호출 API |
|---|---|---|
| 마켓 검색 | `frontend/src/pages/market/MarketSearch.tsx` | `fetchListings` (`api/market.ts:279`) → #1 |
| 동네지도 검색 | `frontend/src/pages/map/MapSearch.tsx` | `fetchBizMapItems` (`api/biz.ts:392`) → #2 |
| 친구 추가 | `frontend/src/pages/profile/FriendAdd.tsx` | `searchUsers` (`api/follows.ts:75`) → #4 |
| 어드민 푸시 | `admin-frontend/src/pages/sre/PushPage.tsx` | #10 |

> **커뮤니티(피드)·업체 상세(소식/가격표)에는 검색 입력 UI 가 없다** — 백엔드 부재와 정합.

---

## 2. 번역이 "잘 안 되는" 원인 규명

### 2.1 1차 원인 — provider 가 죽어 있다 (운영 사고)

`saigon_bff` 로그 실측:

```
search query translate failed: Client error '403 Forbidden' for url
  'https://translation.googleapis.com/language/translate/v2?key=...'
```

Google API 직접 호출로 사유 확인(3회 재시도 전부 403 — 일시적 스로틀 아님):

```
CODE: 403   MESSAGE: User Rate Limit Exceeded
```

DB 실측 정황이 이를 뒷받침한다:

```
translations 총 행수: 144
max(created_at) = 2026-07-08 02:11:30+00   ← 3주 넘게 신규 적재 0건
source_lang 분포: vi 88 / en 28 / ko 28
app_config(group_name='translate'): api_key [len=39], provider=google  ← 설정은 정상
```

`TRANSLATE_API_KEY` env 는 비어 있고 DB `app_config` 가 SoT 로 동작 중이므로 **설정 배선은 정상**이다. 문제는 **키/프로젝트의 쿼터·빌링**이다. `User Rate Limit Exceeded` 가 지속되는 전형적 원인은 (a) 빌링 계정 미연결/해지, (b) Cloud Translation API 쿼터가 0, (c) 무료 한도 소진, (d) 키 제한(API restriction) 설정. → **대표 확인 필요(§7-①)**

**중요**: `translate_all()` 은 provider 예외를 **삼키지 않고 전파**하고(`translate.py:156`), 실패 시 `translations`/Redis 에 **아무것도 남기지 않는다**(`translate.py:164` `if api_key:` 게이트는 stub 만 막고, 403 예외는 그 앞에서 터진다). 즉 **오염은 없지만 복구도 자동으로 안 된다** — 키가 살아나야 그때부터 다시 채워진다.

### 2.2 2차 원인 — 번역 트리거 지점이 듬성듬성하다

`translate.py` 함수를 호출하는 파일은 **단 3개**(`routers/translate.py`, `routers/feed.py`, `routers/market.py`).

| 호출부 | 시점 | 대상 필드 | 방식 |
|---|---|---|---|
| `feed.py:336` `background.add_task(warm_translations,[body.content])` | 피드 **작성 시** | `FeedPost.content` | BackgroundTasks (프로세스 내 fire-and-forget) |
| `feed.py:218` `lookup_lang_batch` | 피드 목록 **조회 시** | `FeedPost.content` | 캐시 전용(API 미호출) → 없으면 **조용히 원문** |
| `feed.py:269` `translate_to` | 피드 상세 조회 시 | `FeedPost.content` | 온디맨드 API, 실패 시 `translation_failed=True` |
| `market.py:569` `background.add_task(warm_translations,[title, description])` | 매물 **등록 시** | `MarketplaceListing.title`, `.description` | BackgroundTasks |
| `market.py:376` `lookup_lang_batch` | 매물 목록 조회 시 | `MarketplaceListing.title` | 캐시 전용 |
| `market.py:479,482` `translate_to` | 매물 상세 조회 시 | `title`, `description` | 온디맨드 API |
| `market.py:182,204,207` | 제휴광고 목록/상세 조회 시 | `MarketplaceAd.title`, `.body` | 목록=캐시전용 / 상세=온디맨드 |
| `market.py:276` `translate_all` | **검색 시** | 검색어(엔티티 아님) | 온디맨드 API — §3 의 원흉 |

**번역 파이프라인이 배선된 컬럼은 총 5개뿐**: `FeedPost.content`, `MarketplaceListing.title`, `MarketplaceListing.description`, `MarketplaceAd.title`, `MarketplaceAd.body`.

#### 번역되지 않는 필드 목록 (대표 요구 "모든 컨텐츠 번역" 대비 갭)

| 모델.컬럼 | 비고 |
|---|---|
| `BusinessProfile.name` | 업체명 — 검색 #2 의 유일 대상인데 번역 없음 |
| `BusinessProfile.address` | 주소 |
| `BusinessProfile.category` | 카테고리(코드값 → i18n 로 처리 가능) |
| **`BusinessProfile.(업체소개)`** | **컬럼 자체가 없음** — 신설 결정 필요 |
| `BusinessNews.title`, `BusinessNews.body` | 가게소식 — 번역·검색 둘 다 없음 |
| `BusinessPrice.name` | 가격표 항목명 |
| `BusinessReview.body`, `MarketplaceReview.comment` | 리뷰 본문 |
| `MarketplaceAd.partner_name`, `.address`, `.category`, `.business_hours` | 광고 부가 필드 |
| `PostComment.body` | 피드 댓글 |
| `Notice.*`, `Faq.*` | 공지/FAQ |
| `Quest.title_ko` 등 미션 설명 | `title_ko` 만 존재(다국어 컬럼 없음) |

### 2.3 3차 원인 — 워밍 커버리지 실측이 처참하다

`sha256(btrim(text))` 로 `translations` 와 조인해 실측:

```
매물 title:   총 203건 중 번역 있음 79건 / 없음 124건  (61% 미번역)
매물 desc:    description 있는 13건은 전부 번역 있음
피드 content: 8건 전부 번역 있음
```

미번역 124건의 정체 — 등록일 버킷:

```
2026-07-02:  185건 중 번역 있음 64건   ← seed/일괄 INSERT 로 들어와 API 경로를 안 탔다
2026-07-10:    3건 중 번역 있음  0건   ← 403 발생 이후 등록
2026-07-06/07: 5건 전부 번역 있음
```

즉 **두 개의 누수**가 겹쳤다: ① DB 직접 seed 로 들어온 데이터는 `warm_translations` 를 못 탐, ② 2026-07-08 이후 등록분은 403 으로 실패. 미번역 예시(실제 dev 데이터): `Xe đạp thể thao Giant`, `Mũ bảo hiểm 3/4 mới 95%`, `Tủ lạnh mini 90L`.

### 2.4 4차 원인 — 수정 경로에 워밍이 없다

`update_listing`(PATCH `/market/listings/{id}`, `market.py:574-607`)은 `title`/`description` 을 갱신하지만 `warm_translations` 를 **재호출하지 않는다**. 원문이 바뀌면 해시가 바뀌므로 이전 번역은 무효가 되고, 다음 상세 조회자가 온디맨드 지연을 그대로 받는다. **목록에서는 `lookup_lang_batch` 가 캐시 미스로 원문 폴백** → 수정된 매물은 번역이 사라진 것처럼 보인다.

### 2.5 5차 원인 — `detect_lang()` 휴리스틱 한계

```python
_RE_HANGUL = re.compile(r"[가-힣㄰-㆏]")
_RE_VIET   = re.compile(r"[Ạ-ỹĂăĐđƠơƯư]")
def detect_lang(text): 한글→ko / 베트남전용문자→vi / 그 외→en
```

- **성조 없는 ASCII 베트남어는 `en` 오판**(코드 주석에도 명시). `xe may`, `Binh Thanh` → `en` 으로 판정 → 영어→베트남어 번역을 시도하지 않고 `en` 슬롯에 원문을 그대로 넣는다.
- **숫자/이모지/모델명만 있는 텍스트도 `en`**. `"Galaxy A52"`, `"90L"` → en. 판별불가 상태가 없다.
- **혼합 언어는 한글 1자만 있어도 `ko`**. `"iPhone 13 팝니다"` → ko (맞음). 하지만 `"Xe đạp 자전거"` → ko 로 판정되어 vi 슬롯에 원문이 안 들어감.
- 파급: `lookup_lang_batch` 는 `lang == detect_lang(clean)` 이면 **번역을 건너뛴다**(`translate.py:191`). 오판 시 번역을 아예 조회하지 않는다.

### 2.6 캐시/영속 관계 — DB 를 건너뛰는 경로

| 경로 | DB write | Redis write |
|---|---|---|
| Redis hit (`saigon:tr:{hash}`, TTL 30일) | **없음** | 없음 |
| DB row 3언어 완전 | 없음(read only) | 워밍 |
| provider 성공 | upsert + commit | set |
| **api_key 미설정(stub)** | **없음** | **없음** (원문=번역 오염 방지 — 의도된 설계) |
| **provider 예외(현재의 403)** | **없음** | **없음** (예외 전파) |
| 원문 빈 문자열 | 없음 | 없음 |

→ **DB 에 남지 않는 경로가 명확히 존재한다**(위 3·5행). 다만 이는 오염 방지 목적의 의도된 설계이고, 진짜 문제는 "실패한 항목을 나중에 재시도할 큐가 없다"는 점이다. 현재 재시도는 "누군가 그 상세페이지를 다시 열어야" 일어난다.

### 2.7 사용자가 번역 실패를 아는가?

- **상세 화면: 안다.** `translation_failed` 플래그(`schemas.py:189,244,607`) → 프론트 `FeedDetail.tsx:154-156`, `MarketDetail.tsx:337-339` 에서 `<Globe/>` + `t('common.translationUnavailable')` 노출.
- **목록·검색 화면: 모른다.** `lookup_lang_batch` 는 실패 플래그가 없어 **원문 폴백이 조용히** 일어난다. 대표가 목록을 보며 "번역이 안 된다"고 느낀 게 정확히 이 경로다.

---

## 3. 현행 방식의 실패 모드 — 실측 재현

### 3.1 재현 방법

```bash
curl -s "http://localhost:18090/api/bff/market/listings?q=<urlencoded>&size=50"
```

dev DB 에는 관련 매물이 실제로 존재한다: `Xe đạp thể thao Giant`(자전거, vi), `gate-test bike`(en), `Phụ tùng xe máy chính hãng`(오토바이부품, vi), `Mũ bảo hiểm 3/4 mới 95%`·`Mũ bảo hiểm fullface XR`(헬멧, vi), `P2 QA Helmet for sale`·`P2 QA gate helmet second`(헬멧, en).

### 3.2 결과표 (실측)

| 검색어 | 결과 | 매칭된 제목 | 판정 |
|---|---|---|---|
| **`자전거`** | **0건** | — | **대표 시나리오 실패.** `Xe đạp thể thao Giant` 가 DB 에 있는데 안 나온다 |
| `xe đạp` | 1건 | Xe đạp thể thao Giant | 원문 직접 일치 시에만 성공 |
| `xe dap` (성조 없음) | **0건** | — | **발음구별기호 미정규화** |
| `bike` | 1건 | gate-test bike | |
| `bicycle` | **0건** | — | **어휘 갭** — `자전거`의 영어 번역은 보통 `bicycle` |
| `Bikes` (복수) | **0건** | — | **활용/굴절 미처리** |
| `motorbike` | 0건 | — | |
| `xe máy` | 1건 | Phụ tùng xe máy chính hãng | |
| `오토바이` | 1건 | Phụ tùng xe máy chính hãng | **캐시에 우연히 남아 있어서 성공** (§3.3) |
| **`헬멧`** | **0건** | — | 헬멧 매물 4건이 DB 에 있는데 0건 |
| `helmet` | **2건** | P2 QA gate helmet second, P2 QA Helmet for sale | **영어 제목만** |
| `Mũ bảo hiểm` | **2건** | Mũ bảo hiểm 3/4…, Mũ bảo hiểm fullface XR | **베트남어 제목만** |

### 3.3 `오토바이`만 성공한 이유 = 구조적 취약성의 증거

```sql
select source_text, source_lang, text_ko, text_en, text_vi, created_at::date
  from translations
 where source_text in ('자전거','오토바이','헬멧','Bike','Bike selling');
-- 오토바이 | ko | 오토바이 | motorcycle | xe máy | 2026-07-01
-- (그 외 전부 행 없음)
```

`오토바이` 는 **403 발생 전(2026-07-01)에 캐시된 행이 남아 있어서** `xe máy` 변형을 얻어 매칭됐다. `자전거`·`헬멧` 은 캐시가 없고 403 이라 **원본 키워드 하나로만 ILIKE** → 0건. 즉 현재 검색 품질은 **"과거에 누가 그 단어를 검색해 캐시에 남겼는지"에 의존**한다. 이건 검색 시스템이 아니다.

### 3.4 구조적 실패 모드 정리 (키를 복구해도 남는 것들)

| 실패 모드 | 근거/사례 | 왜 검색어 번역으로 못 고치나 |
|---|---|---|
| **어휘 갭(1:N 동의어)** | `bike`→1건 vs `bicycle`→0건. `helmet`/`Mũ bảo hiểm` 결과 집합 완전 분리 | 번역기는 **단어 하나**만 돌려준다. `자전거`→`bicycle` 을 받으면 `bike` 로 올린 매물은 영원히 안 잡힌다. 반대도 마찬가지 |
| **문맥 없는 짧은 키워드 오번역** | 베트남에서 `bike` 는 통상 **오토바이**(`xe máy`)를 뜻한다. 번역기가 `xe đạp`(자전거)로 내리면 오매칭·미매칭이 동시에 발생 | 검색어는 1~2단어라 문맥이 없다. 문맥이 있는 쪽은 **매물 제목**이므로 번역해야 할 대상은 검색어가 아니라 **컨텐츠**다 |
| **발음구별기호** | `xe may`→0건 / `xe máy`→1건. `Binh`/`Bình` | 번역기 출력에 성조가 붙어도, **유저 입력에 성조가 없으면** 원본 변형이 매칭에 실패. 정규화(unaccent) 문제이지 번역 문제가 아니다 |
| **활용·굴절·조사** | `Bikes`→0건. 한국어 `팝니다/판매/팔아요` | ILIKE `%자전거%` 는 저장된 `"자전거를 팝니다"` 를 잡지만(부분문자열), 유저가 `"자전거를"` 로 검색하면 `"자전거 팝니다"` 를 못 잡는다(역방향 실패, 실측 `자전거를`→0건) |
| **description 미검색** | `market.py:270-282` 은 `title` 만 | 번역 방식과 무관한 순수 누락 |
| **매 검색이 외부 API 의존** | 검색 1회 = 최대 2회 Google 호출(캐시 미스 시). 403/지연 시 `log.warning` 후 **원본 키워드만**으로 조용히 강행 | 검색 품질이 외부 서비스 가용성에 직결. 지금 3주간 그 상태였고 **아무 알림도 없었다** |
| **인덱스 없음** | `pg_indexes` 실측 — 텍스트 인덱스 0개. 게다가 변형 3개에 대한 `OR ILIKE` | 데이터 증가 시 전체 스캔 3~4회. 현재 203건이라 안 아프지만 스케일 시 터진다 |
| **번역 없는 행이 검색에서 사라지는 위험** | 현행은 원문 매칭이므로 이 문제는 **없다** | 새 설계에서 반드시 유지해야 할 성질 (§4 실패모드 항목) |

---

## 4. 해결책 설계 — 대안 비교

### 4.0 판단 기준

- 데이터 규모 실측: 매물 203, 제휴광고 32, 업체 7, 가게소식 4, 가격표 1, 피드 8, 리뷰 7. **총 텍스트 ~5KB**. 스케일 문제가 아니라 **정합성(recall) 문제**다.
- 언어 3종(ko/vi/en)이 **한 컬럼에 섞여** 저장된다.
- 검색 경로에서 외부 API 의존을 없애는 것이 최우선(§3.4).
- 번역이 없는 행이 검색 결과에서 **사라지면 안 된다**.

### 4.1 안 1 — 현행 유지 + 검색어 번역 강화 (기각)

동의어 사전을 붙이고, `description` 을 조건에 추가하고, unaccent 를 씌운다.

- 데이터 모델 변경: 없음 / 구현 규모: 소(1~2일)
- **기각 근거**: §3.4 의 "어휘 갭"·"문맥 없는 오번역"이 **원리적으로 안 닫힌다**. 동의어 사전은 3언어 × 카테고리 전체를 사람이 채워야 하고, `helmet`/`Mũ bảo hiểm` 이 분리되는 문제를 개별 단어마다 손으로 메꾸는 일이 된다. 매 검색의 외부 API 의존도 그대로. **대표 문제가 닫히지 않는 미봉책이다.**

### 4.2 안 2 — 엔티티별 정규화 검색 컬럼(`search_blob`) + pg_trgm GIN **[추천]**

각 검색 대상 엔티티에 **파생 컬럼 1개**를 추가한다. 이 컬럼은 그 엔티티의 검색 대상 텍스트를 **3개 언어 전부 이어붙이고 정규화**한 문자열이다.

```
marketplace_listings.search_blob text
  = norm(title_ko) ‖ ' ' ‖ norm(title_en) ‖ ' ' ‖ norm(title_vi)
  ‖ ' ' ‖ norm(desc_ko) ‖ ' ' ‖ norm(desc_en) ‖ ' ' ‖ norm(desc_vi)

norm(s) = lower(unaccent(s)) 를 Python 에서 계산  (§ 아래 "정규화" 참조)
```

검색 쿼리는 **조건 1개**로 붕괴한다:

```sql
WHERE search_blob LIKE '%' || :norm_q || '%'   -- norm_q = norm(사용자 입력)
```

- **언어 파라미터 불필요**. 유저가 `자전거`/`bicycle`/`bike`/`xe dap` 중 무엇을 치든, blob 안에 3언어가 다 있으므로 그 중 하나에 걸린다. `helmet` / `Mũ bảo hiểm` / `헬멧` 이 **같은 결과 집합**을 돌려준다.
- **검색 경로에 외부 API 호출이 0회**. 번역은 쓰기 시점에 이미 끝나 있다.
- **번역이 없어도 원문은 blob 에 항상 들어간다** → 행이 검색에서 사라지지 않는다(현행 성질 유지).

#### 인덱스 (실측 검증 완료)

`pg_available_extensions` 실측: `pg_trgm 1.6`, `unaccent 1.1`, `btree_gin 1.3` **설치 가능**(현재 `pg_extension` 에는 `plpgsql`, `postgis`, `uuid-ossp` 만).

폐기용 DB 에 4만 행을 넣고 실측한 실행계획:

```sql
CREATE INDEX probe_trgm ON probe USING gin (t gin_trgm_ops);

EXPLAIN (costs off) SELECT * FROM probe WHERE t ILIKE '%자전거%';
--  Bitmap Heap Scan on probe
--    Recheck Cond: (t ~~* '%자전거%')
--    ->  Bitmap Index Scan on probe_trgm        ← 한국어에서도 인덱스를 탄다

EXPLAIN (costs off) SELECT * FROM probe WHERE unaccent(t) ILIKE '%xe dap%';
--  Seq Scan on probe                            ← unaccent 를 쿼리에서 쓰면 인덱스 무용
```

→ **결론 2가지**: ① pg_trgm GIN 은 한국어 부분문자열 검색에 실제로 작동한다(멀티바이트 trigram 해시). ② `unaccent()` 는 STABLE 이라 쿼리에서 감싸면 seq scan 이 된다. **그래서 정규화는 앱단(Python)에서 미리 수행하고 컬럼엔 이미 정규화된 문자열만 저장한다** — IMMUTABLE 래퍼 함수나 표현식 인덱스가 필요 없어진다(설계가 단순해지는 지점).

또한 `similarity('xe dap','xe đạp') = 0.27` < 기본 임계 0.3 이므로 **trigram 유사도만으로는 성조 차이를 못 넘는다** → unaccent 정규화가 필수임이 실측으로 확인됨.

#### 정규화 규칙 (Python, 신규 헬퍼 1개)

```python
# backend/app/services/search_norm.py (신규, ~15줄)
import re, unicodedata
_WS = re.compile(r"\s+")
def norm(s: str) -> str:
    """검색 정규화: NFD 분해 → 결합기호 제거 → NFC → lower → 공백 압축.
    베트남어 성조 제거(unaccent 상당) + đ/Đ 는 d 로 별도 치환(NFD 로 안 분해됨)."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = unicodedata.normalize("NFC", s).replace("đ", "d").replace("Đ", "d")
    return _WS.sub(" ", s).strip().lower()
```

- 한글은 NFD 분해 후 결합기호가 없어 그대로 복원된다 → 무해.
- `Xe đạp` → `xe dap`, `Bình` → `binh`, `자전거` → `자전거`.
- 쓰기와 읽기 **양쪽에서 같은 함수**를 쓴다(대칭성이 핵심).
- 라이브러리 추가 불필요(표준 `unicodedata`). DB `unaccent` 확장도 **불필요**(설치 안 해도 됨).

#### 번역 적재 시점 — 아웃박스 비동기 (기존 패턴 재사용)

현재 `warm_translations` 는 FastAPI `BackgroundTasks` 라 **프로세스 재시작 시 유실**되고 재시도가 없다. 이 레포엔 이미 durable 한 패턴이 있다:

- `notification_outbox` (`models.py:998-1020`): `id BigInt PK`, `event_type varchar(64)`, `payload JSONB`, `created_at`, `published_at`(NULL=미발행), 부분 인덱스 `ix_notification_outbox_unpublished`
- `services/noti_events.py`: `enqueue(db, event_type, payload)` — **도메인 트랜잭션과 같은 커밋**에 적재
- `noti_worker/__main__.py`: `_drain_outbox_once`(`FOR UPDATE SKIP LOCKED LIMIT 100` → Redis Stream `noti:events` XADD → `published_at` 갱신) → `_consume_loop`(`xreadgroup`, 그룹 `noti-workers`, `HANDLERS` dict 분기, 즉시 `xack`) → `_claim_pending`(idle 60s 재할당, `MAX_DELIVERIES=5` 초과 시 `noti:events:dlq`)

**재사용 판정**: 아웃박스 테이블·relay 루프·컨슈머그룹·재시도·DLQ 인프라는 **그대로 재사용 가능**하다. 필요한 건 `HANDLERS` 에 `search.reindex` 항목 1개와 그 핸들러 함수 1개다. 핸들러 로직은 새로 쓴다(`_insert_notification` 의 `(source_event_id, user_id)` 멱등키는 번역엔 안 맞음 — 멱등키는 `(entity_type, entity_id)` upsert).

- 동기 방식은 기각: 등록 요청이 Google API 왕복(최대 10초 타임아웃 × 2)을 기다리게 되고, **403 이면 매물 등록 자체가 실패**한다. 등록은 번역보다 중요하다.
- blob 은 **2단계로 채운다**: 등록/수정 트랜잭션에서 **원문만으로 즉시** blob 을 세팅(검색 즉시 가능) → 아웃박스 이벤트 소비 후 번역을 얹어 blob 재계산. 번역이 영원히 안 와도 원문 검색은 항상 된다.

#### 데이터 모델 변경 (마이그레이션 1개)

```sql
-- database/init/164_search_blob.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS search_blob text;
ALTER TABLE business_profile     ADD COLUMN IF NOT EXISTS search_blob text;
ALTER TABLE business_news        ADD COLUMN IF NOT EXISTS search_blob text;
ALTER TABLE feed_posts           ADD COLUMN IF NOT EXISTS search_blob text;
ALTER TABLE marketplace_ads      ADD COLUMN IF NOT EXISTS search_blob text;

CREATE INDEX IF NOT EXISTS idx_listings_search_blob ON marketplace_listings USING gin (search_blob gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_biz_search_blob      ON business_profile     USING gin (search_blob gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_biz_news_search_blob ON business_news        USING gin (search_blob gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_feed_search_blob     ON feed_posts           USING gin (search_blob gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ads_search_blob      ON marketplace_ads      USING gin (search_blob gin_trgm_ops);
```

`160_schema_migrations.sql` 의 `bff_migrate` 원장에 등록(`162_*` 선례 따름).

#### `translations` 는 살린다

- **살리는 방향(채택)**: `translations`(hash 키)는 **번역 SoT 로 그대로 유지**한다. 표시 경로(`lookup_lang_batch`, `translate_to`)는 **무변경**. `search_blob` 은 `translations` 를 재료로 만드는 **파생 프로젝션**일 뿐이다. hash 키의 장점(동일 텍스트 전역 dedupe — 예: 같은 문구를 여러 업체가 쓰면 번역 1회)도 유지된다.
- **버리는 방향(기각)**: `translations` 를 없애고 엔티티마다 `title_ko/en/vi` 3컬럼씩 정규화하는 안. 표시 경로 전면 재작성 + 컬럼 폭발(엔티티 5종 × 필드 2~3 × 3언어 = 30+ 컬럼) + dedupe 상실. **표시 경로는 이미 잘 동작한다(망가지지 않은 것을 고치지 않는다).**

#### 실패 모드

| 상황 | 결과 |
|---|---|
| Google 403 지속 | blob 에 원문만 들어감 → **현행과 동일한 recall**(퇴행 없음). 아웃박스 이벤트는 DLQ 로 격리되어 **가시화된다**(현재는 조용히 실패) |
| 워커 다운 | 아웃박스 행이 `published_at IS NULL` 로 쌓여 있다가 재가동 시 처리(유실 없음) |
| 번역 후 원문 수정 | 수정 트랜잭션에서 blob 즉시 재계산(원문) + 새 이벤트 → 오래된 번역이 blob 에 남지 않음 |
| blob NULL(백필 누락) | `LIKE` 가 NULL 에 대해 NULL → 그 행이 검색에서 **사라진다**. → 백필 스크립트 + `COALESCE(search_blob, '')` 방어 둘 다 필요 (§5 검증 항목) |
| 오번역 유입 | blob 에 잡음이 섞여 false positive 발생 가능. 원문도 함께 있으므로 recall 손실은 없고 precision 만 약간 손해 — 3언어 OR 검색의 본질적 트레이드오프로 수용 |

#### 비용 (번역 API 호출량)

Google Cloud Translation v2: **$20 / 1M 문자**.

- 백필: 실측 `sum(length(title))=4,265`, `sum(length(description))=648`. 업체명·소식·광고 포함 대략 **~12K 문자** × 대상언어 2 = **24K 문자 ≈ $0.5**.
- 운영 시: 등록 1건당 (제목+본문 ~100자) × 2언어 = 200자 ≈ $0.004. **월 1만 건 등록 시 ~$40/월**.
- **현행 대비**: 지금은 **검색 1회마다** 최대 2회 호출한다. 검색은 등록보다 10~100배 잦다. 즉 **사전 적재가 오히려 훨씬 싸다** — 비용 논거가 추천안을 지지한다.
- 구현 규모: 중(3~5일). 마이그레이션 1 + 헬퍼 1 + 아웃박스 핸들러 1 + 라우터 수정 3~5곳 + 백필 스크립트 1.

### 4.3 안 3 — `translations` 를 엔티티와 FK 연결 (조인 검색)

`entity_translation(entity_type, entity_id, field, source_hash)` 링크 테이블을 만들고, 검색은 `translations` 를 조인해 `text_ko/en/vi` 3컬럼에 OR ILIKE.

- 장점: `translations` 를 진짜 SoT 로 승격. 새 필드 추가가 링크 행 추가로 끝남(스키마 변경 없음). dedupe 유지.
- 단점:
  - 검색 쿼리가 **`EXISTS` 서브쿼리 + 3컬럼 OR ILIKE**로 복잡해지고, 필드가 2개면 링크 행도 2개라 **중복 행 제거(DISTINCT)** 가 필요 → 페이지네이션·카운트 쿼리가 지저분해진다(`market.py` 는 `q`/`count_q` 두 쿼리를 병행 유지 중이라 양쪽 다 손봐야 함).
  - trgm 인덱스를 `translations.text_*` 3컬럼에 걸어야 하고, **엔티티별 필터(status, ward, category, 차단유저)와 결합할 때 플래너가 인덱스를 잘 못 쓴다**(검색 조건과 필터 조건이 다른 테이블에 있음).
  - 정규화(unaccent/lower)를 어디에 둘지 다시 문제 — `translations` 에 `norm_*` 3컬럼을 또 붙여야 한다.
  - **성조 없는 입력 매칭**을 위해 원문 컬럼(`source_text`)도 정규화 필요 → 결국 안 2 와 같은 정규화 컬럼을 `translations` 쪽에 만드는 셈.
- 판정: **기각**. 안 2 와 같은 일을 하면서 쿼리 복잡도만 올린다. 다만 "필드가 앞으로 20개로 늘어난다"면 재검토 가치가 있다 — 현재 검색 대상은 5~8개 필드다.

### 4.4 안 4 — Postgres `tsvector` FTS (기각)

- **한국어 형태소 분석기가 없다.** PG 기본 `simple`/`english` 설정은 한국어를 공백 단위로만 자른다 → `"자전거를"` 과 `"자전거"` 가 **다른 렉심**이 되어 매칭 실패. 실측 §3.2 의 `자전거를`→0건 문제가 그대로 남는다.
- 한국어 지원에는 `pgroonga`(mecab) 또는 `zhparser` 류가 필요한데, `pg_available_extensions` 실측 결과 **이 이미지(postgis/postgis:15-3.3)에 없다** → 커스텀 Docker 이미지 빌드 + PG 확장 컴파일이 필요. 지금 `postgis` 공식 이미지를 그대로 쓰는 운영 편의를 버리는 값이 너무 크다.
- 베트남어는 `unaccent` + `simple` 로 어느 정도 되지만, **3언어 혼합 컬럼에 단일 `regconfig` 를 고를 수 없다**는 근본 문제가 남는다(`to_tsvector('english', …)` 를 한국어에 적용하면 스테밍이 엉킨다).
- 판정: **기각**. FTS 의 장점(랭킹, 어간 처리)이 한국어에서 무력화되는데 비용은 크다. **trigram 이 이 3언어 조합에 현실적인 선택**이다 — 언어 중립적이고, 형태소 분석 없이 부분문자열을 인덱스로 처리하며, §4.2 에서 한국어 인덱스 스캔을 실측 확인했다.

### 4.5 안 5 — Elasticsearch / OpenSearch (기각)

- 현 데이터 규모는 **텍스트 총합 ~5KB / 행 수 수백**. 컨테이너 13개 단일 호스트 Docker Compose 에 JVM 기반 검색 클러스터를 추가하면 **메모리 1~2GB 상시 점유 + 인덱스 동기화 파이프라인 + 장애 지점 1개 추가**.
- ES 가 필요해지는 조건: (a) 한국어 형태소 랭킹이 제품 차별점일 때, (b) 수백만 문서 규모, (c) facet/aggregation 이 복잡할 때. **현재 어느 것도 해당 안 됨.**
- 판정: **기각**. 안 2 로 Postgres 안에서 닫힌다. 향후 (a)~(c) 중 하나가 성립하면 그때 안 2 의 `search_blob` 을 그대로 ES 문서 본문으로 밀어넣으면 되므로 **안 2 는 ES 로 가는 길을 막지 않는다**.

### 4.6 비교 요약

| | 안 1 미봉책 | **안 2 search_blob+trgm** | 안 3 FK 조인 | 안 4 tsvector | 안 5 ES |
|---|---|---|---|---|---|
| 대표 문제 해결 | ✗ | **✓** | ✓ | △(한국어 실패) | ✓ |
| 검색 경로 외부 API 의존 제거 | ✗ | **✓** | ✓ | ✓ | ✓ |
| 스키마 변경 | 없음 | 컬럼 5개 + 인덱스 5개 | 신규 테이블 1 | 컬럼+인덱스 | 외부 시스템 |
| 쿼리 복잡도 | 중(OR 다중) | **최소(조건 1개)** | 높음(EXISTS+DISTINCT) | 중 | 별도 DSL |
| 한국어 부분매칭 | △ | **✓(실측)** | ✓ | **✗** | ✓ |
| 성조 무시 매칭 | ✗ | **✓** | ✓(추가작업) | ✓ | ✓ |
| 인프라 추가 | 없음 | **없음** | 없음 | 커스텀 이미지 | 컨테이너+JVM |
| 번역 API 비용 | 검색당 과금 | **등록당 과금(↓)** | 등록당 | 등록당 | 등록당 |
| 구현 규모 | 소 | **중(3~5일)** | 중~대 | 대 | 대 |

### 4.7 추천: **안 2** — 근거

1. **대표가 든 시나리오가 실제로 닫힌다.** `Bike selling` 매물의 blob 에 `bike selling`(en) + `자전거 팝니다`(ko) + `xe dap ban`(vi) 이 모두 들어가므로, 한국 유저가 `자전거` 를 치면 잡힌다. `helmet`/`Mũ bảo hiểm`/`헬멧` 이 같은 결과 집합을 반환한다.
2. **§3.4 의 7개 실패 모드 중 6개가 한 번에 닫힌다** (어휘갭·문맥오번역·성조·description누락·API의존·인덱스없음). 남는 하나(굴절/조사 역방향)는 trigram 부분매칭이 상당 부분 완화한다.
3. **검색 경로에서 외부 API 를 뺀다** — 지금 3주간 아무도 모르게 검색이 망가져 있던 근본 취약성을 제거한다.
4. **기존 자산을 버리지 않는다** — `translations`(번역 SoT), `notification_outbox`+`noti_worker`(durable 큐), `Poi.name_ko/vi/en` 의 3언어 검색 선례를 모두 재사용한다. 새 인프라 0개.
5. **비용이 내려간다** (검색당 → 등록당 과금).
6. **과설계가 아니다** — 컬럼 1개 + 인덱스 1개 + 정규화 함수 15줄 + 아웃박스 핸들러 1개. ES/FTS 대비 압도적으로 작다.

---

## 5. 단계적 실행 계획 (Sonnet 워커용)

> 각 단계는 독립 커밋 가능. **P0 은 코드가 아니라 운영 조치**라 대표 확인이 선행된다.

### P0 — Google Translate 403 복구 (**대표 결정 필요, 코드 무관**)

- 확인 명령: `curl -s -X POST "https://translation.googleapis.com/language/translate/v2?key=$KEY" -H 'Content-Type: application/json' -d '{"q":"test","target":"vi","format":"text"}'`
- 점검 순서: GCP 프로젝트 빌링 활성 여부 → Cloud Translation API 사용 설정 → 쿼터(문자/일, 문자/100초) 값이 0 이 아닌지 → API 키 제한(API restrictions)에 Translation 포함 여부.
- 키 교체는 `app_config(group_name='translate', key='api_key')` 갱신(어드민 런타임 교체 경로, TTL 300초 후 자동 반영). **키를 커밋 파일에 넣지 말 것.**
- **검증**: `POST /api/bff/translate/all {"text":"자전거"}` 200 + `select * from translations where source_text='자전거'` 1행.

### P1 — 번역 실패 가시화 (P0 과 병행 가능, 소규모)

문제: 3주간 검색이 망가졌는데 아무 알림이 없었다.

1. `backend/app/routers/market.py:279` 의 `log.warning("search query translate failed: ...")` 를 **운영 알림 경로로 승격**. 이 브랜치에 이미 `engine/app/services/ops_alerts.py` 가 신규 추가돼 있으니(미커밋) 동일 취지의 BFF 측 알림 헬퍼를 확인 후 재사용 — 없으면 `services/noti_events.publish("ops.translate_failed", {...})` 로 발행하고 어드민에서 확인.
2. `backend/app/services/translate.py` 에 **연속 실패 카운터**(Redis `saigon:tr:fail`)를 두고 임계 초과 시 1회만 알림(로그 폭주 방지).
- **검증**: 키를 일부러 잘못된 값으로 바꾼 뒤 검색 1회 → 알림 1건 발생, 검색 응답은 200 유지(fail-open 성질 보존).

### P2 — 정규화 헬퍼 + 마이그레이션

1. `backend/app/services/search_norm.py` 신규 — `norm(s)` (§4.2 코드 그대로). 단위테스트: `norm('Xe đạp')=='xe dap'`, `norm('자전거')=='자전거'`, `norm('Bình  Thạnh')=='binh thanh'`, `norm(None)==''`.
2. `database/init/164_search_blob.sql` 신규 (§4.2 SQL 그대로). `160_schema_migrations.sql` 원장 등록 방식은 `162_marketplace_listing_withdrawn_status.sql` 선례 확인 후 동일하게.
- **검증**: `docker compose --env-file .env up --build -d bff` 후
  `select extname from pg_extension;` → `pg_trgm` 포함,
  `\d marketplace_listings` → `search_blob`,
  `select indexname from pg_indexes where indexname like '%search_blob%';` → 5행.

### P3 — blob 빌더 + 쓰기 경로 배선

1. `backend/app/services/search_index.py` 신규:
   ```python
   async def build_blob(db, texts: list[str]) -> str:
       """원문 리스트 → 3언어 정규화 blob. translations 캐시만 조회(API 미호출)."""
       parts = [norm(t) for t in texts if t and t.strip()]
       for lang in ("ko", "en", "vi"):
           parts += [norm(v) for v in await lookup_lang_batch(texts, lang, db)]
       return " ".join(dict.fromkeys(p for p in parts if p))  # 중복 제거, 순서 유지

   async def reindex_entity(db, entity_type: str, entity_id) -> None:
       """엔티티 1건의 search_blob 재계산 + UPDATE. 멱등."""
   ```
   `lookup_lang_batch`(`translate.py:177`)를 **그대로 재사용** — 캐시 전용이므로 API 호출 0.
2. 쓰기 경로에 배선 (도메인 커밋과 같은 트랜잭션에서 blob 즉시 세팅 + 아웃박스 enqueue):
   | 파일:함수 | 조치 |
   |---|---|
   | `market.py:~569` `create_listing` | 기존 `background.add_task(warm_translations,…)` 유지 + `search_blob` 즉시 세팅 + `noti_events.enqueue(db,"search.reindex",{"entity_type":"listing","entity_id":str(id),"texts":[title,description]})` |
   | `market.py:574-607` `update_listing` | **현재 워밍 누락(§2.4)** — 동일 조치 추가 |
   | `feed.py:~336` `create_feed_post` | 동일 (`FeedPost.content`) |
   | `biz.py` 업체 등록/수정 | 동일 (`BusinessProfile.name` + P5 의 소개 필드) |
   | `biz.py` 가게소식 등록/수정 | 동일 (`BusinessNews.title`, `.body`) |
   | 제휴광고 생성(어드민) | 동일 (`MarketplaceAd.title`, `.body`) |
3. `noti_worker/__main__.py` `HANDLERS`(`:349`) 에 `"search.reindex": _handle_search_reindex` 추가. 핸들러는 `warm_translations`(번역 확보) → `reindex_entity`(blob 재계산) 순. 멱등키는 `(entity_type, entity_id)` UPDATE 이므로 재전달 안전.
- **검증**: 매물 1건 등록 → `select search_blob from marketplace_listings where id=…` 이 원문 정규화값으로 즉시 채워짐 → 워커 로그 후 3언어가 붙어 있음. 같은 이벤트를 2회 소비시켜도 blob 동일(멱등).

### P4 — 검색 쿼리 전환

1. `market.py:270-282` 를 교체:
   ```python
   if keyword and keyword.strip():
       nq = norm(keyword)
       kw_cond = func.coalesce(MarketplaceListing.search_blob, "").like(f"%{nq}%")
       q = q.where(kw_cond); count_q = count_q.where(kw_cond)
   ```
   `translate_all` 호출·`variants` 루프·`httpx` except 블록을 **제거**한다(검색 경로 API 의존 제거). `import httpx` 가 이 파일에서 더 이상 안 쓰이면 그 고아 import 만 정리.
   - `LIKE` 사용(ILIKE 아님) — blob 이 이미 lower 이므로. `%` `_` 는 `nq` 에서 이스케이프.
   - **`COALESCE` 필수** — blob NULL 인 행이 사라지지 않도록(§4.2 실패모드).
2. `biz.py:867-901` 동일 전환 (`BusinessProfile.search_blob`).
3. `admin_api/listings.py:69` 는 운영자용 — 원문 title 검색 유지(운영자는 원문으로 찾는다). 변경하지 않는다.
- **검증(회귀 테스트로 고정)**: §3.2 표를 그대로 테스트 케이스로 쓴다.
  ```
  자전거 → ≥1건 (Xe đạp thể thao Giant 포함)
  bicycle / bike / Bikes → 모두 동일 자전거 매물 포함
  헬멧 / helmet / Mũ bảo hiểm / mu bao hiem → 모두 헬멧 매물 4건 전부
  xe may / xe máy → 동일 결과
  q 미지정 → 기존 전체 목록과 건수 동일 (회귀 없음)
  ```

### P5 — 기존 데이터 소급 백필

1. `backend/scripts/backfill_search_blob.py` 신규 (`backend/scripts/seed_dev_test_accounts.py` 스타일 따름):
   - 인자 `--entity {listing,biz,news,feed,ad,all}`, `--translate/--no-translate`(기본 no-translate = 캐시만), `--limit`, `--dry-run`.
   - 2패스: ① `--no-translate` 로 **전체 blob 을 원문만으로 즉시 채운다**(API 0회, 즉시 recall 확보). ② `--translate` 로 미번역분만 `warm_translations` 호출 후 blob 재계산.
   - 미번역 대상 집계 SQL(실측에 사용한 쿼리 그대로):
     ```sql
     select count(*) from marketplace_listings l
       left join translations t
         on t.source_hash = encode(sha256(convert_to(btrim(l.title),'utf8')),'hex')
      where t.source_hash is null;   -- 현재 124건
     ```
   - **레이트리밋 필수**: Google 쿼터를 다시 태우지 않도록 `--rps` 옵션(기본 5) + 실패 시 중단·재개 가능(진행 커서 로그).
2. 백필 비용 실측 기반 추정: 매물 title 4,265자 + desc 648자 + 업체·소식·광고 ≈ 12K 자 × 2언어 = **24K 자 ≈ $0.5**. 대표 승인 불필요 수준.
- **검증**: 패스① 후 `select count(*) from marketplace_listings where search_blob is null` = 0. 패스② 후 §P4 회귀 테스트 전건 통과.

### P6 — 검색 대상 확장 (**대표 결정 선행**)

- **업체소개 필드 신설**: `business_profile` 에 소개 컬럼이 없다(§1.2). 신설 시 `ALTER TABLE business_profile ADD COLUMN intro text` + 업체 등록/수정 폼(`frontend`) + 공개 상세 노출 + blob 편입. **제품 결정 사항.**
- **가게소식 검색**: 현재 업체별 목록만 있다. 전역 소식 검색을 만들려면 신규 엔드포인트가 필요하고, page-map 에 "여러 업체 소식을 모은 전용 화면이 없어 '더보기' 링크를 생략했다"는 기록이 있으므로 **화면 신설 여부가 선행 결정**이다(§8).
- **피드 검색**: 엔드포인트 자체가 없다. `GET /api/bff/feed?q=` 파라미터 추가 + `FeedList.tsx` 검색 UI. blob 은 P3 에서 이미 채워지므로 백엔드 작업은 조건 1줄.
- **가격표/리뷰/공지**: 번역·검색 둘 다 없음. 호출량이 늘어나므로 대표 판단.

### P7 — 통합검색 (선택, **대표 결정 선행**)

blob 이 엔티티별로 통일 형식이라 `UNION ALL` 로 통합검색을 만들 수 있다. 단 page-map 에 마켓 검색(`/market/search`)과 동네지도 검색(`/map/search`)을 **의도적으로 분리**한 결정이 기록돼 있어(§8), 통합검색은 그 결정을 덮는 UX 변경이다 → **대표 승인 없이 진행 금지.**

---

## 6. 검증 명령 모음 (워커용 복붙)

```bash
# 확장/인덱스 확인
docker exec saigon_db psql -U wellconn -d saigon_rider -c "select extname from pg_extension;"
docker exec saigon_db psql -U wellconn -d saigon_rider -c "select indexname,indexdef from pg_indexes where indexname like '%search_blob%';"

# blob 커버리지
docker exec saigon_db psql -U wellconn -d saigon_rider -c "select count(*) total, count(search_blob) filled from marketplace_listings;"

# 실행계획이 GIN 을 타는지
docker exec saigon_db psql -U wellconn -d saigon_rider -c "explain (costs off) select id from marketplace_listings where coalesce(search_blob,'') like '%자전거%';"

# 다국어 recall 회귀 테스트
for kw in 자전거 bicycle bike Bikes 헬멧 helmet "Mũ bảo hiểm" "mu bao hiem" "xe may" "xe máy"; do
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$kw")
  echo -n "q='$kw' -> "
  curl -s "http://localhost:18090/api/bff/market/listings?q=$enc&size=50" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);i=d.get('items',[]);print(len(i),[x['title'] for x in i[:4]])"
done

# 번역 provider 생존 확인
KEY=$(docker exec saigon_db psql -U wellconn -d saigon_rider -tA -c "select value from app_config where group_name='translate' and key='api_key';")
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://translation.googleapis.com/language/translate/v2?key=$KEY" \
  -H 'Content-Type: application/json' -d '{"q":"test","target":"vi","format":"text"}'
```

---

## 7. 대표 결정 필요 항목

| # | 항목 | 왜 결정이 필요한가 | 권고 |
|---|---|---|---|
| ① | **Google Cloud Translation 빌링/쿼터 복구** | 키가 403 `User Rate Limit Exceeded`. 빌링 미연결·쿼터 0·무료한도 소진 중 하나. **이게 안 풀리면 어떤 설계도 신규 번역을 못 만든다.** 월 비용 발생(추정 등록량 1만/월 → ~$40/월) | **즉시 처리**. 비용은 검색당 과금(현행)보다 오히려 낮아진다 |
| ② | **"업체소개" 필드 신설 여부** | 대표가 검색 대상으로 언급했지만 `business_profile` 에 소개/설명 컬럼이 **아예 없다**. 신설은 스키마+등록폼+공개상세+검색 4곳 변경 | 신설 권고(업체 검색 recall 이 상호명 하나에 묶여 있다) |
| ③ | **번역 대상 컨텐츠 범위** | 가격표·리뷰·공지·FAQ·댓글까지 번역하면 API 호출량이 수 배 늘어난다. 리뷰/댓글은 사용자 생성이라 양이 가장 많다 | 1차: 매물·업체명·업체소개·가게소식·피드. 2차 판단: 리뷰/댓글 |
| ④ | **통합검색 화면 신설 여부** | page-map 에 마켓 검색과 동네지도 검색을 **분리 유지**한 결정이 기록돼 있다. 통합검색은 그 UX 결정을 덮는 변경 | 이번 범위 제외 권고(검색 recall 이 먼저). blob 구조가 통합검색 길을 막지는 않는다 |
| ⑤ | (참고) 피드 검색 UI 신설 | 백엔드 조건 1줄이면 되지만 `FeedList.tsx` 에 검색 진입점을 새로 놓는 UX 변경 | 대표가 "피드도 검색 대상"이라 했으므로 P6 에서 함께 |

---

## 8. 기존 결정(ADR / page-map)과의 저촉 검토

**ADR**: `manage_adr(mode='get', project='mnt-c-DEV-saigon_rider')` 조회 결과 **`status: no_adr`** — 저장된 ADR 이 없다. 따라서 `대표 결정 — 건드리면 회귀` / `재작업 금지` 섹션과의 저촉은 **판정 불가(해당 없음)**. 기존 결정의 유일한 기록은 `ai-docs/context/frontend-page-map.md` 본문이다. → **후속 조치 권고**: 이 설계가 채택되면 ADR 을 생성해 검색 구조 결정을 기록해야 한다(CLAUDE.md 는 ADR 과 page-map 을 함께 갱신하도록 규정).

**page-map 에서 확인한 검색·번역 관련 기존 결정** (모두 존중, 저촉 없음):

| 기록(page-map 행) | 내용 | 이 설계와의 관계 |
|---|---|---|
| :111 (2026-07-25) | 동네지도 **인라인 검색폼 폐기** → 검색 아이콘 → 신규 라우트 `/map/search`(`MapSearch.tsx`). 조회는 **신규 API 없이** `fetchBizMapItems({...HCMC_BBOX, q, category})` 재사용 | **존중.** P4-2 는 `GET /biz/public/map` 의 `q` 조건만 blob 으로 바꾼다. 라우트·API 재사용 구조 무변경 |
| :111 | 검색 결과 카드에 **거리 표기 없음**(GPS 권한 프롬프트 회피 목적) | **존중.** 응답 필드 추가 없음 |
| :62, :70 | 마켓 검색은 `useInfiniteScroll` + `reset()`, 새로고침이 검색어를 유지 | **존중.** `q` 파라미터 시그니처 무변경 → 프론트 무변경으로 P4 적용 가능 |
| :88 (2026-07-31) | 목록·검색 실패를 "결과 없음"으로 위장하던 문제 해소 — `useInfiniteScroll` 의 `error` 로 오류/빈상태 분리 | **강화 방향으로 정합.** P4 는 검색 경로에서 외부 API 를 제거해 "조용한 품질 저하" 자체를 없앤다 |
| :109 | 탭 전환 시 검색어·카테고리 보존(`searchMemory`), 검색 무결과 전용 상태 | **존중.** 프론트 무변경 |
| :86 (2026-07-31) | `WITHDRAWN` 매물은 **피드·검색·상세에서 완전 비노출** | **주의사항.** P4 에서 `q` 조건만 교체하고 status 필터 `where` 절은 **손대지 않아야 한다**. 검증: 철회 매물 제목으로 검색 → 0건 |
| :77 | 홈 섹션 순서 확정(2026-07-25), 업체 소식 섹션 **"더보기" 링크 없음** — 여러 업체 소식을 모은 전용 화면이 없어 의도적 생략 | **P6 의 가게소식 전역 검색은 이 결정과 맞물린다** — 전역 소식 검색 화면 신설은 대표 결정 선행(§7-④와 같은 성질) |
| :95, :116 등 | 헤더/카드 시각 결정 다수 | 이 설계는 UI 무변경 |

**저촉 판정: 없음.** 이 설계는 라우트·API 시그니처·프론트 컴포넌트를 바꾸지 않고, 백엔드 `q` 조건의 매칭 방식과 쓰기 시점 번역 적재만 교체한다. 대표 결정이 필요한 항목(업체소개 필드, 통합검색, 전역 소식검색, 피드 검색 UI)은 모두 **P6/P7 로 분리**해 승인 전에는 손대지 않도록 격리했다.

---

## 부록 A — 실측 데이터 (재현용)

```
PostgreSQL 15.4 / 설치 확장: plpgsql, postgis, uuid-ossp
설치 가능 확장: pg_trgm 1.6, unaccent 1.1, btree_gin 1.3   (pgroonga/zhparser 없음)

translations: 144행, PK(source_hash) 인덱스 1개뿐
  source_lang: vi 88 / en 28 / ko 28
  NULL 언어 슬롯: ko 4 / en 2 / vi 3
  max(created_at) = 2026-07-08 02:11:30+00

행 수: marketplace_listings 203 / marketplace_ads 32 / feed_posts 8
       business_profile 7 / business_news 4 / business_price 1 / business_review 7
텍스트량: sum(length(title))=4265, sum(length(description))=648

매물 title 번역 커버리지: 79/203 (미번역 124)
  등록일 버킷: 07-02 → 64/185, 07-06 → 3/3, 07-07 → 2/2, 07-10 → 0/3

Google Translate v2: HTTP 403, error.code=403, message="User Rate Limit Exceeded" (3회 재시도 전부 동일)

pg_trgm 실측(4만행 폐기 DB):
  t ILIKE '%자전거%'            → Bitmap Index Scan on gin(t gin_trgm_ops)   ✓
  unaccent(t) ILIKE '%xe dap%'  → Seq Scan                                    ✗
  similarity('xe dap','xe đạp') = 0.27   ('xe dap' % 'xe đạp' = false, 기본임계 0.3)
  unaccent('Xe đạp thể thao Giant') = 'Xe dap the thao Giant'
  unaccent('Bình Thạnh') = 'Binh Thanh'
  unaccent('자전거') = '자전거'
```

## 부록 B — 검색 API 실측 응답 (2026-08-01, dev)

```
q='자전거'        -> 0건
q='xe đạp'       -> 1건  Xe đạp thể thao Giant
q='xe dap'       -> 0건
q='자전거를'      -> 0건
q='bike'         -> 1건  gate-test bike
q='bicycle'      -> 0건
q='Bikes'        -> 0건
q='motorbike'    -> 0건
q='오토바이'      -> 1건  Phụ tùng xe máy chính hãng   (캐시 잔존 덕분)
q='xe máy'       -> 1건  Phụ tùng xe máy chính hãng
q='xe may'       -> 0건
q='헬멧'          -> 0건
q='helmet'       -> 2건  P2 QA gate helmet second / P2 QA Helmet for sale
q='Mũ bảo hiểm'  -> 2건  Mũ bảo hiểm 3/4 mới 95% / Mũ bảo hiểm fullface XR
```

> `helmet` 과 `Mũ bảo hiểm` 이 **같은 개념인데 교집합이 0** — 대표가 지적한 문제의 가장 압축된 증거.
