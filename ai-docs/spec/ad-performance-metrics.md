# 광고 성과 지표 (Ad Performance Metrics) — 설계 / 구현 발주서

> 작성일: 2026-07-26 · 상태: **설계 확정 전 초안 (구현 착수 전 필독)** · 코드 변경 없음
>
> **왜 이 문서가 있나** — 대표 지적(2026-07-25): *"광고 매출 효과가 잘 나타나야 하는데, 몇 건 노출되었고 CTA가 얼마나 되는지 보여줄 수 있어야 광고비를 지불한 게 아깝지 않다고 느낄 것인데 그런 요소가 전혀 없다."*
>
> 이 문서의 목적은 두 가지다. ① **무엇을 계측해야 광고주가 돈 낸 가치를 느끼는가**를 애매함 없이 정의한다. ② 그것을 실현하려면 **무엇이 미구현인지** 레이어·우선순위와 함께 목록화해 발주 가능한 형태로 만든다.
>
> 관련 문서: [`context/architecture.md`](../context/architecture.md)(BFF/Engine 경계) · [`engine/sre-design-spec.md`](../engine/sre-design-spec.md)(엔진 in/out-of-scope) · [`context/design-system.md`](../context/design-system.md)(빈 상태·숫자 표기) · [`spec/sink-economy-design.md`](sink-economy-design.md)(BM 설계 선례)

---

## 0. 한 줄 결론

**광고 성과 계측은 현재 0% 구현이다.** 노출·클릭·CTA 를 세는 컬럼도, 테이블도, 이벤트 경로도 없다. 그리고 이 도메인은 **엔진(SRE) 일이 아니라 BFF+DB+프론트 일**이다(§6). 최소 1단계(노출·클릭·전화 CTA 3종 + 일별 롤업)만 넣어도 광고주 대시보드에 "노출 N · 클릭 N · CTR x% · 전화문의 N" 을 정직하게 띄울 수 있다.

---

## 1. 현황 (코드 확인 결과)

### 1-A. 광고 도메인 데이터 모델

**`marketplace_ads`** — `backend/app/models.py:754-799`. 광고 1건 = 이 테이블 1행. 성과 관련 컬럼은 **하나도 없다**(view/impression/click 전무).

| 컬럼 | 근거 | 성과 지표와의 관계 |
|---|---|---|
| `id` UUID PK | `models.py:757` | 모든 성과 이벤트의 집계 키 |
| `owner_business_profile_id` FK → `business_profile` | `models.py:774-776` | **자기 노출(광고주 본인) 필터의 기준**. NULL 이면 하우스/레거시 광고(`ad_gating.py:8-9`) |
| `owner_id` FK → `users` | `models.py:771-773` | 레거시 소유자 축 (자기 노출 필터 보조) |
| `tier_id` FK → `ad_tiers` (NOT NULL, RESTRICT) | `models.py:794-796` | 노출 가중치 원천 |
| `monthly_price_snapshot_vnd` | `models.py:798` | **광고비 대비 효과 계산의 분자** (신청 시점 가격 고정 스냅샷) |
| `ad_fee` (기본 1) | `models.py:793` | 가중치 승수. 현재 전 행 1 로 정규화됨(`149_ads_tiers.sql` 말미 `UPDATE ... SET ad_fee = 1`) |
| `is_active` / `review_status` / `is_ongoing` | `models.py:785-788` | 노출 게이트 |
| `subscription_status` (기본 `pending_payment`) | `models.py:789` | 입금 확인 시 admin 이 `active` 로 전환(`modules/ads/application.py:428-432`) |
| `starts_at` / `ends_at` | `models.py:790-791` | **게시기간 = 성과 리포트의 기간 분모**. `starts_at` 은 광고주 미입력, 승인 시각에 서버가 세팅(`application.py:404-405`) |
| `district_id` | `models.py:777-779` | 지역 타게팅. 세그먼트 리포트 후보 축 |
| `link_url` | `models.py:768` | ⚠ **프론트에서 렌더되지 않는 죽은 데이터 경로** — 타입에만 존재(`api/market.ts:198,219`), 어떤 화면도 사용 안 함. 외부 링크 CTA 는 **존재하지 않는다**. (지적만 함 — 이 문서 범위에서 제거하지 않음) |
| `created_at` | `models.py:799` | `updated_at` 없음 |

**`ad_tiers`** — `models.py:802-813`, DDL `database/init/149_ads_tiers.sql`, 가격 확정 `database/init/150_ad_tier_prices.sql`.

| 티어 | 고정 UUID | `monthly_price_vnd` | `exposure_weight` |
|---|---|---|---|
| 프리미엄 | `…0001` | 499,000 | 3 |
| 일반 | `…0002` | 199,000 | 1 |

> `features_json` 은 `151_biz_verification.sql:55` 에서 추가된 플랜 피처 목록(프론트 플랜피커용). **성과 지표를 플랜 피처로 판매할 수 있는 슬롯이 이미 있다**는 뜻 — §7 참조.

**`business_profile`** — `models.py:560-604`. 승인축 `status`(`PENDING`/`APPROVED`/…)와 검증축 `verification_status`(`pending`/`verified`)가 **별개**다(`models.py:582-600`). 광고 노출은 검증축을 본다(아래).

> **`BusinessAd` 라는 모델/테이블은 존재하지 않는다.** `BusinessAdCreateRequest`/`BusinessAdOut`(`schemas.py:1116-1140`)은 `marketplace_ads` 를 광고주 시점으로 투영한 **스키마 이름**일 뿐이다. 프론트 타입 `BusinessAd`(`api/biz.ts:162`)도 동일. 즉 광고 실체 테이블은 `marketplace_ads` 하나다.

### 1-B. 노출 결정 로직

| 요소 | 위치 | 내용 |
|---|---|---|
| 노출 게이트 | `services/ad_gating.py:26-50` | `review_status='APPROVED'` **AND** `is_active` **AND** 게시기간(`starts_at<=now`, `ends_at>=now`, NULL 허용) **AND** (소유 프로필 없음 **OR** 소유 프로필 `verification_status='verified'`) |
| 가중치 | `services/ad_exposure.py:16-18` | `weight = max(1, tier.exposure_weight) * max(1, ad.ad_fee)` |
| 순서 | `services/ad_exposure.py:21-46` | 결정적 smooth weighted round-robin, 시퀀스 상한 `MAX_SEQUENCE_LENGTH=120`(`ad_exposure.py:8`) |
| 조립 | `routers/market.py:175` | `build_exposure_sequence(await AdsApplication(db).public_ads(district_id))` |
| 후보 질의 | `modules/ads/application.py:218-231` | 게이트 + `district_id == 요청구 OR NULL`, `ORDER BY sort_order, id` |

**중요 — 서버는 "노출 후보 시퀀스"를 주지만 "실제 노출"을 모른다.** `/market/ads` 는 최대 120개의 반복 시퀀스를 통째로 반환하고, 프론트가 위치 기반으로 잘라 쓴다(`lib/adPlacement.ts:26-32`). 즉 **응답 = 노출이 아니다.** 서버 단독 계측은 원리적으로 불가능하다(§3 의 근거).

### 1-C. 노출 소비처 전수 조사

| # | 소비처 | 근거 | 광고 표현 | 현재 활성? |
|---|---|---|---|---|
| S1 | 동네 피드(마켓 메인) 리스트 중간 삽입 광고카드 | `pages/market/MarketMain.tsx:353-357` → `adAtIndex` → `<AdCard>` | 히어로/인라인 카드(`pages/market/AdCard.tsx`) | ❌ `ADS_ENABLED=false` |
| S2 | 마켓 메인 상단 고정 1건 | `MarketMain.tsx:339-341` (`ads.slice(0,1)`) | 동일 `<AdCard>` | ❌ 동일 플래그 |
| S3 | 홈(WorldMapV2) 상품 카드 슬롯 | `pages/home/WorldMapV2.tsx:433-445` (`i % AD_EVERY === AD_EVERY-1`) | 상품카드 형태(`styles.productCard`) | ❌ 동일 플래그 |
| S4 | 홈 근처상품 빈 상태 대체 노출 | `WorldMapV2.tsx:350,358` (`nearbyProducts` 없으면 광고 4건) | 상품카드 | ❌ 동일 플래그 |
| S5 | **광고 상세** `/market/ad/:id` | 라우트 `App.tsx:384`, 화면 `pages/market/AdDetail.tsx` | 전체 화면 랜딩 | ✅ (진입 경로가 S1~S4·S6 에 의존) |
| S6 | **공개 비즈프로필의 게시중 광고 목록** `/biz/:id` | `pages/biz/BizPublic.tsx:359` (`bizAdCard`), 데이터 `BusinessPublicProfileOut.ads`(`schemas.py:1168`) ← `application.py:380-390` | 카드 목록 | ✅ |
| S7 | 동네지도 업체 핀 레이어 | `routers/biz.py:484-542` `/biz/public/map` | ⚠ **광고 무관** — `status='APPROVED'` + 좌표만 필터. 티어/광고비가 핀 노출에 영향 없음 | ✅ (단, 광고 성과 아님) |
| S8 | 홈 '업체 소식' 피드 | `routers/biz.py:549-560` `/biz/public/news/recent` | ⚠ **광고 무관** — 동일하게 APPROVED 프로필 전체 | ✅ (단, 광고 성과 아님) |

> **⚠ 최대 리스크: 유료 광고의 주 노출면(S1~S4)이 지금 전부 꺼져 있다.** `frontend/src/lib/adPlacement.ts:16-18` — *"광고 노출 시기상조 — 대표 지시(2026-07-25)로 피드 광고카드 노출만 숨긴다."* 계측을 붙이더라도 이 플래그가 `false` 인 동안 impression 은 S5/S6 경유분만 쌓인다. **계측 구현과 노출 재개는 같은 결정 라인에 있다** — §9 에서 이를 전제로 순서를 잡는다.
>
> **부수 결론:** S7/S8 은 광고비와 무관한 무료 노출면이다. 광고주에게 "노출"로 합산해 보여주면 **광고비 효과 오표기**가 된다. 리포트에서 반드시 분리한다(§2 "유료 노출" 정의).

### 1-D. 현재 계측 자산 — 있는 것과 없는 것

| 자산 | 근거 | 실제 성질 |
|---|---|---|
| `view-ping` | 엔드포인트 `routers/biz.py:851-861`, 구현 `routers/biz.py:57-70`, 훅 `frontend/src/hooks/useBizViewerCount.ts` | Redis ZSET `saigon:bizview:{profile_id}`, `_VIEW_TTL_SEC=30`(`biz.py:57`) **슬라이딩 윈도우 → 순간 동시 열람자 수**. `zadd` 로 user_id 를 덮어쓰므로 **누적 카운트가 아니다**. 프론트는 15초 폴링(`useBizViewerCount.ts:7`), 백그라운드 탭은 스킵. Redis 순단 시 조용히 0 반환(`biz.py:69`) — **영속 저장이 전혀 없다** |
| `marketplace_listings.view_count` | 컬럼 `models.py:448`, 증가 `routers/market.py:410` | **매물 전용**. 상세 진입마다 무조건 +1, 중복 제거·자기 조회 제외 **없음** |
| 광고 impression/click/view_count | — | **존재하지 않음.** `marketplace_ads` 에 해당 컬럼 없음(`models.py:754-799`), `database/init/` 전체에 관련 테이블 없음, 엔진에도 없음 |
| 업체소식(`business_news`) 열람 카운트 | `models.py:713-732` | **존재하지 않음** (`id/profile_id/title/body/created_at` 뿐) |
| 프론트 애널리틱스 SDK | — | **없음** (`analytics`/`trackEvent`/`gtag`/`amplitude`/`mixpanel` 전무) |
| 광고 관련 관리자 지표 | `modules/ads/application.py:270-291` | PENDING 건수, 오늘/주간 신규, **게시중 광고의 `monthly_price_snapshot_vnd` 합계(=MRR)**, 티어별 건수. 성과(노출/클릭)는 없음 |
| 일별 신규 광고 추이 | `application.py:293-296`, 소비 `routers/admin_api/dashboard.py:244` | VN 로컬 일자 경계 `cast(func.timezone('Asia/Ho_Chi_Minh', created_at), Date)` — **일별 롤업의 일자 규약 선례** |

### 1-E. 엔진 경계

| 사실 | 근거 |
|---|---|
| BFF↔Engine 은 HTTP + `X-Service-Key` 헤더만 | `backend/app/engine_client.py:13-19`, `context/architecture.md` §통신 규칙 |
| **BFF 는 Engine DB 테이블 직접 접근 금지** | `/CLAUDE.md` 핵심 제약 |
| Engine 은 `datetime.now()` naive 금지 (timezone-aware 강제) | `/CLAUDE.md` |
| **SRE(엔진) out-of-scope 에 피드/마켓/결제가 명시** | `engine/sre-design-spec.md:70-78` — "피드 게시물/댓글(Feed 서비스)", "결제(v2 마켓플레이스가 별도)" |
| SRE in-scope 는 RP·미션·보상·어뷰징·감사로그 | `engine/sre-design-spec.md:61-68` |

→ **광고 성과는 엔진 도메인이 아니다.** 상세 판단은 §6.

### 1-F. 광고주 대시보드 현황

`frontend/src/pages/biz/BizDashboard.tsx` (호스트: `pages/biz/BizManage.tsx:306-307` '대시보드' 탭).

> ⚠ 이 파일은 2026-07-26 기준 **git 미추적(신규·미커밋)** 상태다 — 병행 작업분이므로 아래 인용 라인번호는 커밋 후 이동할 수 있다.

파일 자체 주석(`BizDashboard.tsx:21-24`)이 현 상태를 정확히 자백한다: *"업체 자기 대시보드 — 지금 확보 가능한 지표만 노출한다. 노출수/누적 조회수/추이 등 서버에 데이터가 없는 지표는 넣지 않는다."*

| 현재 표시 | 근거 | 데이터 출처 |
|---|---|---|
| 평점 + 후기 수 | `BizDashboard.tsx:96-102` | `fetchBizReviews`(`api/biz.ts:626`) |
| 단골 수 | `BizDashboard.tsx:103-107` | `fetchBusinessPublicProfile().followerCount`(`api/biz.ts:468`) |
| 소식 건수 | `BizDashboard.tsx:108-112` | 상위(BizManage)에서 주입 |
| 최근 후기 목록 + 빈 상태 | `BizDashboard.tsx:115-155` | `<StateBlock>` 사용 — 빈 상태 규약 준수 |

**즉 "광고" 성과는 대시보드에 단 한 줄도 없다.** 광고비를 낸 광고주가 볼 수 있는 것은 후기·단골·소식 뿐이며, 이는 광고를 사지 않아도 쌓이는 무료 지표다. 대표 지적의 실체가 여기다.

### 1-G. 발주 전제 중 코드와 달랐던 것 (정정)

| # | 주어진 전제 | 코드 확인 결과 | 영향 |
|---|---|---|---|
| 1 | `BusinessAd` 모델/컬럼 | **모델 없음.** `marketplace_ads` 단일 테이블 + `BusinessAdOut` 스키마 투영(`schemas.py:1127`) | 신규 테이블 FK 는 `marketplace_ads.id` 하나로 통일 |
| 2 | CTA 후보에 "길찾기/경로안내" | **광고·업체 화면에 길찾기 CTA 없음.** `google.com/maps/dir` 는 `pages/ride/RideNav.tsx:287,331` 뿐(라이딩 내비). `AdDetail`/`BizPublic` 의 주소 행은 텍스트 표시만(`AdDetail.tsx:153-163`) | 길찾기는 **계측 대상이 아니라 신규 기능 제안**으로 분리(§8 F-4) |
| 3 | 외부 링크(`link_url`) CTA | 컬럼·API·프론트 타입은 있으나 **렌더되는 화면 없음** (`api/market.ts:198,219` 에서 끝) | 지표 정의에서 제외. 죽은 경로로 기록만 |
| 4 | "광고가 사용자에게 노출된다" | **주 노출면 S1~S4 가 `ADS_ENABLED=false` 로 전부 꺼져 있음**(`lib/adPlacement.ts:18`) | 계측만 붙여도 숫자가 안 쌓인다. §9 1단계에 노출 재개를 함께 묶음 |
| 5 | "엔진에서 미구현된 사항" | 광고는 **엔진 out-of-scope**(`engine/sre-design-spec.md:70-78`). 미구현 주체는 BFF+DB+프론트 | §6 에서 엔진 미사용 근거 명시. 엔진 변경 항목 0건 |
| 6 | `view-ping` = 계측 자산 | 30초 Redis 윈도우 **동시 열람자**, 영속 없음, 누적 불가(`biz.py:57-70`) | "누적화" 는 신규 구현이며 오표기 위험 큼 → §9 후보 B 에서 조건부 제시 |
| 7 | 업체소식에 impression/click 없음 | 확인됨(`models.py:713-732`) — `view_count` 도 없음 | 소식 열람은 §2 CTA-5 로 신규 계측 |
| 8 | 동네지도/소식 피드가 광고 노출면 | **광고와 무관** (S7/S8, `biz.py:497-505,555-558`) | 유료 노출에 합산 금지 |

---

## 2. 지표 정의

**설계 원칙: 광고주에게 보여주는 모든 숫자는 "광고비를 냈기 때문에 생긴 것"이어야 한다.** 무료로도 생기는 노출(S7/S8)과 섞으면 지표가 아니라 마케팅 문구가 된다.

### 2-1. 노출 (Impression)

| 항목 | 정의 |
|---|---|
| **1회 카운트 기준** | 광고 크리에이티브 영역의 **50% 이상이 뷰포트에 연속 1초 이상** 보인 시점에 1회. (MRC display 표준 차용) 렌더 시점 기준은 채택하지 않는다 — `adAtIndex`(`lib/adPlacement.ts:26-32`)가 스크롤 도달 전 슬롯을 미리 만들어 두므로 렌더=노출로 세면 **과대 집계**된다 |
| **판정 위치** | 프론트(IntersectionObserver). 선례 있음: `hooks/useInfiniteScroll.ts`, `pages/map/PostPanel.tsx` 가 이미 IntersectionObserver 사용 |
| **유료 노출 (report 대상)** | S1~S4(피드/홈 카드) + S6(비즈프로필 광고 카드) + S5(광고 상세 진입). **S7/S8 제외** |
| **반복 노출** | 같은 사용자에게 같은 광고가 여러 번 보이는 것은 **허용하고 각각 센다**(`adAtIndex` 가 `ord % ads.length` 로 의도적 반복 노출을 만든다 — `adPlacement.ts:31`). 단 아래 중복 제거 창을 통과해야 함 |
| **중복 제거 (dedup)** | `(ad_id, user_key, surface, 30초 버킷)` 1회. 30초는 `view-ping` 의 `_VIEW_TTL_SEC`(`biz.py:57`)와 같은 값을 재사용해 시스템 내 시간 상수를 늘리지 않는다. 스크롤 왕복으로 같은 카드가 반복 진입하는 것을 흡수한다 |
| **파생: 도달(Reach)** | `COUNT(DISTINCT user_key)` — 일 단위. "노출 1,200 / 도달 340명" 형태로 함께 보여야 노출수가 뻥튀기로 안 보인다 |
| **미확인** | Capacitor WebView 에서 IntersectionObserver 의 저사양 안드로이드 성능 — 실측 필요. 측정 실패 시 스크롤 스로틀 기반 폴백 필요 여부는 실측 후 결정 |

### 2-2. 클릭 (Click) / CTR

| 항목 | 정의 |
|---|---|
| **클릭 1회** | 광고 카드 탭 = `<AdCard>` 버튼 클릭(`AdCard.tsx:12`) 또는 그에 상응하는 홈 카드 클릭(`WorldMapV2.tsx:438`), 비즈프로필 내 광고카드 클릭(`BizPublic.tsx:359`). 목적지는 `adHref`(`api/market.ts:235-237`)가 결정 — 소유 프로필 있으면 `/biz/{id}`, 없으면 `/market/ad/{id}` |
| **중복 제거** | `(ad_id, user_key, 5초)` — 더블탭 방지 목적. 의도적 재클릭은 센다 |
| **CTR** | `클릭 / 유료 노출`. **분모가 유료 노출임을 UI 라벨에 명시**한다. 노출 100 미만 구간에서는 CTR 표시 금지(§7 빈 상태 규칙) |
| **주의** | S5(광고 상세) 자체 진입은 클릭의 *결과*다. 클릭과 상세 진입을 둘 다 세면 이중 계상 — **클릭만 지표로 쓰고, 상세 진입은 검증용 내부 이벤트로만 둔다** |

### 2-3. CTA 전환 (Conversion)

**코드에 실제로 존재하는 액션만** 열거한다. 존재하지 않는 액션(길찾기·외부링크)은 §1-G 로 배제했다.

| 코드 | CTA | 발생 위치 (근거) | 서버 판정 가능? | 별도 지표? |
|---|---|---|---|---|
| **CTA-1** | **전화 걸기** | `AdDetail.tsx:36-39` (`native.openUrl('tel:…')`), `BizPublic.tsx:182-185`, sticky CTA 버튼 `AdDetail.tsx:213-220` / `BizPublic.tsx:502-508` | ❌ 프론트 전송 필수 (tel: 은 서버를 안 거침) | ✅ **독립 지표 — 최상위 KPI.** 오프라인 업종에서 "전화 왔다"가 광고 가치의 실감 단위다 |
| **CTA-2** | **단골 맺기 (follow)** | `BizPublic.tsx:94` → `followBusiness`(`api/biz.ts:486`) → `POST /biz/follow/{id}`(`routers/biz.py:932`) | ✅ 서버 판정 | ✅ 독립 지표. 재방문 자산이므로 광고주 체감 가치 큼 |
| **CTA-3** | **찜 (favorite)** | `BizPublic.tsx:81` → `addBizFavorite`(`api/biz.ts:711`) → `POST /biz/favorites/{id}`(`routers/biz.py:867`) | ✅ 서버 판정 | ✅ 독립 지표 (단골과 별개 개념 — `models.py:621-622` 주석에 명시) |
| **CTA-4** | **후기 작성** | `BizPublic.tsx:162` → `BizReviewSheet` → `upsertBizReview`(`api/biz.ts:657`) → `POST /biz/public/{id}/reviews`(`routers/biz.py:811`) | ✅ 서버 판정 | ✅ 독립 지표 (이미 대시보드에 후기 수 있음 — **광고 유입분만 분리**해야 의미가 생김) |
| **CTA-5** | **소식 열람** | 펼치기 `BizPublic.tsx:406`, 더보기 `BizPublic.tsx:170` | ❌ 프론트 전송 필수 (펼침은 클라 상태) | 🔸 **묶음** — 단독 가치가 낮아 "콘텐츠 열람" 하위 항목으로 |
| **CTA-6** | **업체 프로필 진입** (광고 상세 → 가게 프로필) | `AdDetail.tsx:184-198` (`navigate('/biz/{id}')`) | ❌ SPA 내부 내비 | 🔸 **묶음** — 퍼널 중간 단계이므로 §7 퍼널에만 |
| **CTA-7** | **공유** | `AdDetail.tsx:41-44`, `BizPublic.tsx:187-189` (`native.share`) | ❌ 프론트 전송 필수 | 🔸 묶음 (발생 빈도 낮음 예상) |

**묶음 판단 근거:** 광고주가 보는 카드에 7개 숫자를 늘어놓으면 어느 것도 안 읽힌다. 대표가 요구한 것은 "몇 건 노출, CTA 몇 건" — 즉 **큰 숫자 3~4개**다. 따라서

- **Primary CTA = CTA-1(전화) + CTA-2(단골) + CTA-3(찜) + CTA-4(후기)** → 각각 표시 + 합계 `문의·관심 N건`
- **Secondary = CTA-5/6/7** → 합계 1줄(`콘텐츠 열람 N`)로만, 상세 펼침에서 분해

**전환율 정의:** `CVR = Primary CTA 합계 / 클릭`. (노출 대비가 아니라 클릭 대비 — 오프라인 업종에서 노출 대비 전환율은 항상 0.x% 로 나와 광고주 사기를 떨어뜨린다.)

**어트리뷰션(귀속) 규칙 — 반드시 지킬 것:** CTA-2/3/4 는 광고를 안 거쳐도(동네지도 S7 등) 발생한다. 따라서 **광고 클릭 후 동일 사용자·동일 업체의 CTA 만** 광고 성과로 귀속한다.
- 창(window): **클릭 후 24시간, last-click 기준.**
- 구현: 클릭 시 `(user_key, business_profile_id) → ad_id` 를 Redis 24h TTL 로 저장(`services/redis_cache.py` 사용). CTA 서버 핸들러가 이 키를 조회해 `attributed_ad_id` 를 함께 기록한다.
- 대시보드에는 **`광고 경유 N건` / `전체 N건` 두 숫자를 나란히** 둔다. 광고 경유분만 보여주면 축소로, 전체만 보여주면 과대 귀속으로 각각 오해된다.

### 2-4. 광고비 대비 효과

`monthly_price_snapshot_vnd`(`models.py:798`)와 게시기간(`starts_at`/`ends_at`, `models.py:790-791`)으로 계산한다. 티어 정가는 `ad_tiers.monthly_price_vnd`(199,000 / 499,000 — `database/init/150_ad_tier_prices.sql`)이지만, **리포트는 반드시 스냅샷 값을 쓴다**(가격 개정 후 과거 리포트가 바뀌면 안 됨).

| 지표 | 산식 | 비고 |
|---|---|---|
| 기간 광고비 | `monthly_price_snapshot_vnd × (리포트 일수 / 30)` | 30일 정규화. `is_ongoing=true`(무기한, `models.py:788`)면 `starts_at`~오늘로 일수 계산 |
| **CPM** (노출 1,000회당) | `기간 광고비 / 유료노출 × 1000` | 광고주에게는 "1,000명에게 보이는 데 ₫N" 로 표현 |
| **CPC** (클릭당) | `기간 광고비 / 클릭` | |
| **CPA** (Primary CTA 1건당) | `기간 광고비 / Primary CTA 합계` | **가장 설득력 있는 숫자** — "전화 한 통에 ₫N" |
| 표시 규칙 | 분모가 0 이면 지표 자체를 **숨긴다**(∞·`—` 표시 금지) | §7 빈 상태 |

> **판단:** CPM/CPC/CPA 를 광고주에게 직접 노출할지에는 리스크가 있다. 초기 노출량이 적으면 CPC 가 비상식적으로 높게 나와 오히려 "광고비가 아깝다"는 역효과를 낸다. → **§7 에서 "노출·클릭·CTA 최소 표본 도달 전에는 비용 지표를 숨긴다"** 는 게이트를 둔다. 관리자 콘솔에서는 표본 무관하게 항상 보인다.

---

## 3. 이벤트 수집 지점

### 3-1. 프론트 판정 vs 서버 판정

| 지표 | 판정 주체 | 이유 |
|---|---|---|
| 노출(viewability) | **프론트만 가능** | 뷰포트 가시성은 클라이언트만 안다. §1-B — `/market/ads` 응답은 최대 120건 시퀀스이므로 응답=노출이 아니다 |
| 클릭 | **프론트 전송** (+ 서버 교차검증) | 클릭 직후 `/market/ads/{id}` 또는 `/biz/public/{id}` 호출이 발생하므로(`market.py:190`, `biz.py:612`) 서버 로그로 상한 검증 가능 |
| CTA-1 전화 / CTA-5 소식 / CTA-6 진입 / CTA-7 공유 | **프론트만 가능** | `tel:`·SPA 내비·클라 상태 변경은 서버를 안 거친다 |
| CTA-2 단골 / CTA-3 찜 / CTA-4 후기 | **서버 판정** | 이미 존재하는 POST 핸들러에서 직접 기록(`biz.py:932,867,811`) — 프론트 신뢰 불필요 |

**원칙: 서버가 판정할 수 있는 것은 절대 프론트를 믿지 않는다.** 프론트 보고 이벤트(노출·클릭·전화)는 위조 가능하므로 §3-3 필터를 통과시킨다.

### 3-2. 수집 엔드포인트 (신규)

```
POST /api/bff/market/ads/events        # 배치 — 프론트 판정 이벤트 전용
Headers: X-User-Id, X-Session-Token    # 기존 세션 규약 (deps.py:54-85)
Body: { events: [ { ad_id, type, surface, occurred_at, nonce } ], ... }  # 최대 20건/요청
```

- **인증:** `optional_user_session`(`deps.py:88-96`) — 익명 노출도 세되 `user_key` 는 null. **`verify_user_session` 강제는 하지 않는다**(로그아웃 사용자 노출도 광고주에겐 노출이므로).
- **배치 전송:** 노출 이벤트를 개별 POST 하면 저사양 기기에서 요청 폭증한다. 프론트에서 **5초 debounce + 최대 20건** 으로 묶어 보낸다. 화면 이탈 시 `visibilitychange` 로 flush (선례: `useBizViewerCount.ts:20-22`).
- **클릭은 즉시 전송** (내비게이션으로 화면이 사라지므로 배치 대기 불가). `navigator.sendBeacon` 은 §8 네이티브 브리지 규칙(`navigator.*` 직접 접근 금지 — ESLint error)에 걸리므로 **사용 금지**. 대신 클릭 이벤트는 목적지 화면 마운트 후에도 유효한 pending 큐(localStorage)에 넣고 다음 flush 에 태운다.
- **적재 경로:** 요청 핸들러가 DB INSERT 를 직접 하지 않고 **Redis Stream 에 XADD** 한다 — `services/noti_events.py:38-45` `publish()` 패턴을 그대로 미러(`ad:events` 스트림). 이유: 노출 이벤트는 유실 허용(best-effort)이고 요청 지연에 민감하기 때문. **CTA 는 다르다** — 서버 판정 CTA(2/3/4)는 도메인 트랜잭션과 같은 커밋에 넣어야 하므로 `enqueue()`(transactional outbox, `noti_events.py:29-33`) 패턴을 쓴다.

### 3-3. 봇 · 자기 노출 · 중복 필터

| 필터 | 규칙 | 판정 위치 | 근거 |
|---|---|---|---|
| **자기 노출 (광고주 본인)** | 이벤트의 `user_id` 가 `marketplace_ads.owner_business_profile_id → business_profile.user_id` 와 같으면 **`is_self=true` 로 기록하되 집계에서 제외**(버리지 않음 — 광고주가 "내가 본 것도 세나?" 물을 때 답할 수 있어야 함) | 서버(수집 시) | `models.py:774-776`, `models.py:566-568` |
| **같은 계정의 다른 프로필** | 1계정 최대 3프로필(`routers/biz.py:53` `MAX_PROFILES_PER_USER=3`) → `user_id` 단위로 비교하면 자동 커버 | 서버 | |
| **중복 (노출)** | Redis `SETNX` 키 `ad:dedup:imp:{ad_id}:{user_key}:{surface}:{bucket30s}`, TTL 60s. 실패 시 드롭 | 서버 | 30s = `_VIEW_TTL_SEC` 재사용(`biz.py:57`) |
| **중복 (클릭)** | 동일 방식, 5초 버킷 | 서버 | |
| **재생 공격 (replay)** | 이벤트 `nonce` + `occurred_at` 검증: 서버 수신 시각 대비 **±5분 밖은 드롭**. `nonce` 는 Redis SETNX 10분 | 서버 | |
| **레이트 리밋** | 세션당 `POST /market/ads/events` **분당 12회 / 이벤트 200건**. 초과분 드롭 + 로그 | 서버 | `services/admin_login_throttle.py` 의 throttle 패턴 참조 |
| **미인증 트래픽** | `user_key` = null 인 이벤트는 **IP+UA 해시 기반 임시 키**로 dedup 하고, 집계 시 `anonymous` 로 분리 집계. 익명 비중이 30% 를 넘으면 리포트에 경고 | 서버 | 개인정보 §10 준수 |
| **비활성 광고 이벤트** | `launching_ad_conditions`(`ad_gating.py:26-50`) 를 통과하지 못하는 광고에 대한 이벤트는 **드롭**. 게시 중지된 광고에 노출이 쌓이면 청구 분쟁이 된다 | 서버 | |
| **봇/스크립트** | 1단계에서는 위 dedup+레이트리밋으로만 대응. **명시적 봇 탐지(디바이스 핑거프린팅·비정상 패턴 학습)는 범위 밖** — 필요해지면 엔진의 Anti-Abuse 모듈(`engine/sre-design-spec.md:104-108`) 재사용을 검토한다(§6) | — | |

> **미확인:** 현재 BFF 에 전역 레이트리밋 미들웨어가 있는지는 확인하지 못했다(`admin_login_throttle.py` 는 어드민 로그인 전용). 신규 엔드포인트용 throttle 을 새로 만들어야 할 수 있다 → §8 B-6.

---

## 4. 데이터 모델

### 4-1. 마이그레이션 번호 규약

`database/init/NNN_*.sql` 3자리 번호 + snake_case. 현재 최댓값 **152**(`152_business_follow.sql`). 단 `138` 은 중복 사용됨(`138_flood_confirmation_policy.sql`, `138_legacy_district_boundaries.sql`) — 신규는 중복을 만들지 않는다. **다음 가용 번호 = `153`.** 모든 DDL 은 기존 관례대로 **멱등**(`IF NOT EXISTS` / `DO $$ … IF NOT EXISTS`)으로 작성한다(`148_marketplace_ads_exposure.sql` 참조). 파티션 테이블 선례는 저장소에 **없다**(`database/init/` 내 `PARTITION` 0건).

> 이 문서는 설계만 한다. **SQL 파일은 생성하지 않았다.**

### 4-2. `ad_events` — 원시 이벤트 (제안: `153_ad_events.sql`)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | `BIGSERIAL PK` | 원시 로그이므로 UUID 불필요(공간·인덱스 비용). 기존 도메인 테이블(UUID)과 성질이 다름을 의도적으로 구분 |
| `ad_id` | `UUID NOT NULL REFERENCES marketplace_ads(id) ON DELETE CASCADE` | |
| `business_profile_id` | `UUID NULL REFERENCES business_profile(id) ON DELETE SET NULL` | 조회 시 조인 회피용 비정규화(대시보드는 프로필 단위 조회) |
| `event_type` | `VARCHAR(24) NOT NULL` | `impression` / `click` / `cta_call` / `cta_follow` / `cta_favorite` / `cta_review` / `cta_news_view` / `cta_profile_enter` / `cta_share` — CHECK 제약 |
| `surface` | `VARCHAR(24) NOT NULL` | `feed` / `feed_top` / `home` / `home_empty` / `ad_detail` / `biz_profile` — §1-C 의 S1~S6 에 1:1 대응 |
| `user_key` | `UUID NULL` | 인증 사용자면 `users.id`. **FK 는 걸지 않는다**(회원 탈퇴 시 이벤트 유실·CASCADE 폭발 방지 — §10 참조) |
| `anon_key` | `CHAR(32) NULL` | 익명 dedup 용 해시 (§10 — IP/UA 원문 저장 안 함) |
| `is_self` | `BOOLEAN NOT NULL DEFAULT FALSE` | 광고주 본인 노출 (집계 제외, 기록 유지) |
| `attributed_ad_id` | `UUID NULL` | CTA 행에만 채움. last-click 24h 귀속 결과 (§2-3) |
| `occurred_at` | `TIMESTAMPTZ NOT NULL` | 클라 보고 시각 (±5분 검증 통과분) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | 서버 수신 시각 |
| `stat_date` | `DATE NOT NULL` | **VN 로컬 일자**. `(occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` 를 적재 시 계산해 저장. 선례: `admin_api/dashboard.py:234`, `modules/ads/application.py:293` |

**인덱스**

| 인덱스 | 목적 |
|---|---|
| `(ad_id, stat_date, event_type)` | 롤업 배치의 주 스캔 경로 |
| `(business_profile_id, stat_date)` | 프로필 단위 백필/검증 |
| `(stat_date)` | 보존기간 삭제 |
| `(user_key, ad_id, occurred_at DESC)` WHERE `user_key IS NOT NULL` | 어트리뷰션 검증·분쟁 대응 |

**보존기간 / 파티셔닝**

- 원시 이벤트 **90일 보존**, 이후 삭제. 롤업(§4-3)은 무기한 보존 → 광고주 리포트는 롤업만 본다.
- 1단계는 **파티셔닝 없이** 단일 테이블 + `stat_date` 인덱스 + 일별 삭제 배치. 근거: 저장소에 파티션 선례가 없어 운영 복잡도를 새로 만들지 않는다(카파시 §2). 
- **전환 트리거:** 일 100만 행(≈ DAU 3만 × 노출 30건)을 넘거나 삭제 배치가 5분을 초과하면 `PARTITION BY RANGE (stat_date)` 월 파티션으로 전환. 이 임계값을 문서에 남겨 판단을 미루지 않는다.

### 4-3. `ad_daily_stats` — 일별 롤업 (제안: `154_ad_daily_stats.sql`)

대시보드 조회가 **절대** `ad_events` 를 스캔하지 않게 하는 것이 이 테이블의 존재 이유다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `ad_id` | `UUID NOT NULL REFERENCES marketplace_ads(id) ON DELETE CASCADE` | PK 1 |
| `stat_date` | `DATE NOT NULL` | PK 2 (VN 로컬) |
| `business_profile_id` | `UUID NULL` | 프로필 단위 합산용 |
| `surface` | `VARCHAR(24) NOT NULL` | PK 3 — 면별 분해 보존(합산은 조회 시). `all` 행은 만들지 않음(합계 중복 방지) |
| `impressions` | `INTEGER NOT NULL DEFAULT 0` | `is_self=false` 만 |
| `reach` | `INTEGER NOT NULL DEFAULT 0` | 해당 일자 `COUNT(DISTINCT user_key)` |
| `clicks` | `INTEGER NOT NULL DEFAULT 0` | |
| `cta_call` / `cta_follow` / `cta_favorite` / `cta_review` | `INTEGER NOT NULL DEFAULT 0` | Primary CTA 4종 |
| `cta_secondary` | `INTEGER NOT NULL DEFAULT 0` | CTA-5/6/7 합계 |
| `self_impressions` | `INTEGER NOT NULL DEFAULT 0` | `is_self=true` 분 (감사·문의 대응) |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

- **PK:** `(ad_id, stat_date, surface)`. 보조 인덱스 `(business_profile_id, stat_date)`.
- **비용 지표는 저장하지 않는다** — CPM/CPC/CPA 는 `monthly_price_snapshot_vnd` 와 기간으로 조회 시 계산. 가격은 스냅샷이라 불변이므로 저장할 이유가 없다(중복 진실 금지).
- **CTR/CVR 도 저장하지 않는다** — 파생값이므로 조회 시 계산.

> **대안 검토 — Materialized View:** `refresh_repair_stats.py:12-18` 의 `REFRESH MATERIALIZED VIEW CONCURRENTLY repair_shop_stats` 선례가 있다. 그러나 광고 롤업은 **원시 이벤트가 90일 후 삭제되는데 롤업은 영구 보존**해야 하므로 MV(전체 재계산)로는 불가능하다. → 실체 테이블 + 증분 upsert 채택.

---

## 5. 집계 전략

```
프론트 IntersectionObserver / 클릭 핸들러
        │ (5s debounce, 최대 20건)
        ▼
POST /api/bff/market/ads/events  ── 필터(§3-3) ──▶ Redis Stream `ad:events`  (XADD, best-effort)
        │                                                    │ XREADGROUP
서버 판정 CTA(follow/favorite/review)                        ▼
  └─ notification_outbox 패턴(enqueue) ────────────▶  ad_events 워커 → INSERT ad_events
                                                             │
                                            ┌────────────────┴─────────────────┐
                                            │ ① 5분 간격 증분 upsert (오늘분)   │
                                            │ ② 매일 00:20 ICT 전일 확정 재계산 │
                                            └────────────────┬─────────────────┘
                                                             ▼
                                                      ad_daily_stats
                                                             │
대시보드 / 관리자 콘솔 ◀── 롤업만 조회 (원시 스캔 금지) ──────┘
```

| 항목 | 결정 | 근거 |
|---|---|---|
| 원시 적재 담당 | **`noti_worker` 를 재사용하지 않고 별도 컨슈머**를 둔다. `noti_worker` 는 사용자 대면 알림 파이프라인(`noti_worker/__main__.py:1-8`)이고, 광고 이벤트 폭주가 알림 지연을 유발하면 안 된다. 스트림 키만 분리(`ad:events`)하고 소비 루프 패턴(xreadgroup / xpending+xclaim / DLQ / graceful shutdown)은 `noti_worker/__main__.py` 를 미러 | 장애 격리 |
| 증분 롤업 주기 | **5분** — `INSERT … ON CONFLICT (ad_id, stat_date, surface) DO UPDATE`. 오늘분만 재계산 | `refresh_repair_shop_stats` 가 `IntervalTrigger(minutes=5)`(`main.py:82-88`)로 이미 5분 주기 선례 |
| 전일 확정 | **매일 00:20 ICT** 전일 `stat_date` 전체 재계산(지연 도착 이벤트 흡수). 이후 해당 일자는 불변 | `AsyncIOScheduler(timezone="Asia/Ho_Chi_Minh")`(`main.py:66`) + `CronTrigger` 선례 |
| 보존 삭제 | **매일 03:30 ICT** `DELETE FROM ad_events WHERE stat_date < today-90` (배치 10만 행 단위 루프) | `expire_stale_flood_reports`(`main.py:89-95`) 패턴 |
| 스케줄러 위치 | `backend/app/jobs/rollup_ad_stats.py` + `backend/app/jobs/purge_ad_events.py` 신규, `main.py` lifespan 등록 | `jobs/` 디렉터리 관례 |
| `reach` 계산 | `COUNT(DISTINCT user_key)` 는 증분 upsert 로 누적 불가(중복 계상) → **일자별 전량 재계산**. 오늘분 5분 재계산 시 당일 전체를 다시 센다. 일 이벤트 수가 위 임계값(§4-2)을 넘으면 HLL(`postgresql-hll`) 도입 검토 — **1단계 범위 밖** | 정확성 우선 |
| 멱등성 | 롤업은 항상 "해당 일자 전체 재계산 후 upsert" 이므로 재실행 안전. 워커 재처리로 `ad_events` 에 중복 행이 들어가면 dedup 키(§3-3)에서 이미 걸러졌어야 하나, 이중 안전장치로 `(ad_id, user_key, event_type, occurred_at)` UNIQUE 는 **걸지 않는다** — 의도적 반복 노출(§2-1)이 정상이기 때문. 대신 워커의 스트림 메시지 ID 기반 멱등 처리로 해결 | |
| 조회 성능 목표 | 광고주 대시보드 1회 조회 = 롤업 테이블 인덱스 스캔 1~2회, **P95 < 100ms**. 원시 테이블 조회는 관리자 감사 화면에서만 허용 | |

---

## 6. 엔진 vs BFF 책임 분리

### 결론: **전량 BFF + DB. 엔진 변경 0건.**

| 근거 | 내용 |
|---|---|
| 도메인 경계 | `engine/sre-design-spec.md:61-68` in-scope = RP·미션·보상·다양성·등급·어뷰징·감사로그. `:70-78` out-of-scope 에 **"피드 게시물/댓글"·"결제"** 명시. 광고는 마켓/BM 도메인이므로 out-of-scope 쪽이다 |
| 채널 중립성 | 엔진의 존재 이유는 "채널 중립 RP 엔진"(`sre-design-spec.md:61`). 광고 노출 계측은 **특정 UI 표면(피드 카드 위치·뷰포트)에 강하게 결합**되어 있어 채널 중립이 될 수 없다 |
| 데이터 근접성 | 성과 리포트는 `marketplace_ads` / `ad_tiers` / `business_profile` 조인이 필수다. 이 테이블은 **모두 BFF 소유**다. 엔진에 두면 `engine_client.py` 왕복 + BFF DB 조인 불가로 설계가 뒤집힌다 |
| **BFF↔Engine 불변식** | `/CLAUDE.md`: *"BFF 는 Engine DB 테이블에 직접 접근 금지 — 오직 `engine_client.py` HTTP API 만."* 만약 `ad_events` 를 엔진 DB 스키마에 두면 BFF 대시보드가 그것을 조인할 수 없다. **반대로 BFF 스키마에 두면 어떤 불변식도 위반하지 않는다** |
| 결제/청구 | 광고비는 오프라인 입금 확인 후 admin 이 `subscription_status='active'` 전환(`application.py:428-432`). 결제는 엔진 out-of-scope(`sre-design-spec.md:75`) |

### 그럼에도 엔진과 접점이 생길 수 있는 지점 (지금은 하지 않음)

| 시나리오 | 처리 |
|---|---|
| **어뷰징 판정 고도화** | 엔진 Anti-Abuse 모듈(`sre-design-spec.md:104-108`)이 GPS 속도·빈도·중복 검증 로직을 이미 갖고 있다. 광고 이벤트에 **본격 봇 탐지가 필요해지면** `engine_client.post_event()`(`engine_client.py:27`)로 판정을 위임하고 **결과 boolean 만** 받는 형태가 유일하게 허용되는 배치다. 원시 이벤트를 엔진 DB 에 넘기지 않는다. **1단계 범위 밖** |
| **광고 노출로 RP 지급** (예: "광고 보고 RP 받기") | 이는 RP 도메인이므로 명확히 엔진 일이다. 현재 요구에 없음 — 하지 않는다 |
| 광고 이벤트 → 알림 | `noti_events.py` 경유 BFF 내부 처리. 엔진 무관 |

---

## 7. 대시보드 화면 요소

대상 화면: `frontend/src/pages/biz/BizDashboard.tsx` (탭 호스트 `BizManage.tsx:306-307`). 광고 성과는 **기존 후기·단골·소식 카드 위에 새 섹션**으로 올린다 — 광고비를 낸 사람이 첫 화면에서 광고 성과를 봐야 한다.

### 7-1. "돈 낸 가치"를 만드는 4요소

| 요소 | 왜 필요한가 | 구현 |
|---|---|---|
| **① 절대 숫자 (큰 글씨)** | "몇 건 노출됐나"가 대표 요구의 1번. 노출 · 클릭 · 문의(Primary CTA 합계) 3개를 크게 | `.num` 전역 클래스 필수(`context/design-system.md:34-43`) |
| **② 기간 비교 (증감)** | 절대 숫자만으로는 "많은 건가?"를 판단할 수 없다. `최근 7일 vs 이전 7일` 증감률(▲12%) | 롤업 2구간 조회 |
| **③ 비용 환산** | "전화 1통에 ₫9,980" 이 광고비 정당화의 핵심 문장. CPA 우선, CPC/CPM 보조 | §2-4. **표본 게이트 적용** |
| **④ 퍼널** | 노출 → 클릭 → 문의의 단계별 수와 전환율. 어디서 빠지는지 보이면 광고주가 크리에이티브를 개선할 동기가 생긴다 | 3단 가로 바 |

### 7-2. 화면 구성 (제안)

```
┌ 광고 성과 ─────────────────── [최근 7일 ▾] ┐   ← 기간 선택: 7일 / 30일 / 게시 전체
│  노출 1,240        클릭 38        문의 6     │   ← ① 큰 숫자 3개 (.num)
│  ▲12% (전주)       CTR 3.1%       CVR 15.8% │   ← ② 비교 + 파생율
├─────────────────────────────────────────────┤
│  도달 340명 · 광고 경유 단골 4 · 찜 2        │   ← 귀속 분해 (전체 단골 N 중 광고 경유 4)
├─────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 노출 1,240                 │   ← ④ 퍼널
│  ▓▓ 클릭 38 (3.1%)                          │
│  ▓ 문의 6 (15.8%)                           │
├─────────────────────────────────────────────┤
│  전화 한 통당 ₫9,980 · 클릭당 ₫1,576         │   ← ③ 표본 게이트 통과 시에만
│  (기간 광고비 ₫59,880 기준)                  │
└─────────────────────────────────────────────┘
```

- **기간 기본값 = 최근 7일.** 30일은 초기엔 데이터가 없어 빈 구간이 길고, "게시 전체"는 기간이 짧을 때 오해를 만든다.
- **면(surface)별 분해는 접어둔다** — 광고주에게 "피드/홈/프로필별 노출"은 인지 부담만 준다. 펼침 아코디언 안에만.
- **관리자 콘솔**(`admin-frontend`)에는 동일 데이터를 **표본 게이트 없이** 전면 노출 + 광고별 랭킹 + `self_impressions` 를 보여준다. 청구·분쟁 대응 창구이므로.

### 7-3. 빈 상태 (신규 광고주) — **가장 중요한 판단**

> 빈 차트·0 숫자·`—` 를 보여주는 것은 역효과다. "돈 냈는데 아무것도 없다"로 읽힌다.

| 상태 | 조건 | 화면 |
|---|---|---|
| **A. 광고 없음** | 해당 프로필의 광고 0건 | 광고 성과 섹션 자체를 **렌더하지 않는다.** 대신 `<StateBlock>` 으로 광고 상품 안내 + "광고 시작하기" CTA (`BizAdsNew` 진입) |
| **B. 심사 대기 / 입금 대기** | `review_status='PENDING'` 또는 `subscription_status='pending_payment'` | 숫자 대신 **진행 안내**: "심사 중이에요 · 승인되면 노출이 시작됩니다". 0 을 보여주지 않는다 |
| **C. 게시 시작 24시간 미만** | `now - starts_at < 24h` | "집계 중이에요 — 첫 성과는 게시 다음 날부터 보여드려요" + 게시 시작 시각 표시. **숫자·차트 없음** |
| **D. 게시 24시간 경과, 노출 100 미만** | `impressions < 100` | 노출·클릭·문의 **절대 숫자만** 표시. **CTR/CVR/CPA/CPC/CPM·증감률·퍼널 전부 숨김**. 안내문: "표본이 적어 비율은 아직 보여드리지 않아요" |
| **E. 정상** | `impressions >= 100` | 7-2 전체 |
| **F. 게시 중지** | `is_active=false` 또는 `ends_at` 경과 | 마지막 집계까지의 성과를 **읽기 전용**으로 유지 + "게시 종료" 배지. 데이터를 감추지 않는다 |
| **G. 조회 실패** | API 오류 | `<StateBlock tone="error">` (`design-system.md:137`) |
| 로딩 | — | `sys.skelBar` 조합으로 **실제 골격 미러** — 숫자 3개 자리·퍼널 3줄 자리 (`design-system.md:145`) |

**임계값 100 의 근거:** CTR 3% 가정 시 노출 100 = 기대 클릭 3건. 이 미만에서 CTR 을 계산하면 0% 또는 5% 로 요동쳐 신뢰를 깎는다. **정확한 값은 실데이터 확보 후 조정 대상**이며, 코드에 상수 1개(`MIN_SAMPLE_FOR_RATIO`)로 두어 조정 가능하게 한다.

### 7-4. 광고 상품과의 연결 (BM 훅)

`ad_tiers.features_json`(`models.py:811`, `151_biz_verification.sql:55`)에 이미 플랜 피처 목록 슬롯이 있다. **성과 리포트 깊이를 티어 차별화 요소로 쓸 수 있다** — 예: 일반=요약 3숫자 / 프리미엄=퍼널·면별 분해·기간 비교. 다만 이는 BM 결정이므로 **이 문서는 제안만 하고 결정하지 않는다**(대표 판단 필요).

---

## 8. 미구현 항목 체크리스트 (발주서 본체)

우선순위: **P0** = 이것 없이는 어떤 숫자도 못 보여줌 / **P1** = 대표 요구("노출·CTA 보여주기")의 최소 충족 / **P2** = 신뢰성·정확도 / **P3** = 확장·차별화.

### DB

| ID | 항목 | 레이어 | 우선순위 |
|---|---|---|---|
| D-1 | `ad_events` 테이블 + 인덱스 4종 (`153_ad_events.sql`) | **DB** | **P0** |
| D-2 | `ad_daily_stats` 테이블 + PK/보조 인덱스 (`154_ad_daily_stats.sql`) | **DB** | **P0** |
| D-3 | `ad_events` 90일 보존 삭제 배치 | **DB/BFF** | P2 |
| D-4 | 월 파티셔닝 전환 (임계값 §4-2 도달 시) | **DB** | P3 |

### BFF

| ID | 항목 | 레이어 | 우선순위 |
|---|---|---|---|
| B-1 | `POST /market/ads/events` 수집 엔드포인트 (배치, `optional_user_session`) | **BFF** | **P0** |
| B-2 | 필터 파이프라인: 자기노출 · dedup(Redis SETNX) · 게시상태 검증 · nonce/시각 검증 | **BFF** | **P0** |
| B-3 | 서버 판정 CTA 훅 — `POST /biz/follow/{id}`(`biz.py:932`) · `POST /biz/favorites/{id}`(`biz.py:867`) · `POST /biz/public/{id}/reviews`(`biz.py:811`) 3곳에 이벤트 적재(outbox 패턴) | **BFF** | **P1** |
| B-4 | 어트리뷰션: 클릭 시 `(user, profile)→ad_id` Redis 24h 저장 + CTA 시 조회·`attributed_ad_id` 기록 | **BFF** | **P1** |
| B-5 | `ad:events` Redis Stream + 전용 컨슈머 워커(`noti_worker` 패턴 미러, DLQ 포함) + compose 서비스 등록 | **BFF** | **P1** |
| B-6 | 신규 엔드포인트용 레이트리밋(세션당 분당 12요청/200이벤트) — *기존 전역 throttle 유무 미확인* | **BFF** | P2 |
| B-7 | 롤업 잡 `jobs/rollup_ad_stats.py` (5분 증분 + 00:20 ICT 전일 확정) + `main.py` lifespan 등록 | **BFF** | **P1** |
| B-8 | `GET /biz/ads/{ad_id}/stats?period=7d|30d|all` — 롤업 조회 + CTR/CVR/CPA/CPC/CPM 계산 + 표본 게이트 플래그 반환 | **BFF** | **P1** |
| B-9 | `GET /biz/profiles/{id}/ad-stats-summary` — 프로필의 전체 광고 합산(대시보드 상단용) | **BFF** | **P1** |
| B-10 | 관리자 API: 광고별 성과 랭킹 · `self_impressions` · 원시 이벤트 감사 조회 | **BFF** | P2 |
| B-11 | 익명 이벤트 비중 모니터링·경고 (30% 초과 시) | **BFF** | P3 |
| B-12 | 엔진 Anti-Abuse 위임(봇 판정) — `engine_client.post_event()` 경유, boolean 만 수신 | **BFF** | P3 |

### 프론트

| ID | 항목 | 레이어 | 우선순위 |
|---|---|---|---|
| F-1 | **`ADS_ENABLED` 재개 결정** (`lib/adPlacement.ts:18`) — 현재 `false` 라 S1~S4 노출 0. **대표 결정 필요** | **프론트 (+대표 결정)** | **P0** |
| F-2 | 노출 계측 훅 `useAdImpression` — IntersectionObserver 50%/1s, 5초 debounce 배치, `visibilitychange` flush. 적용: `AdCard`(S1/S2) · `WorldMapV2`(S3/S4) · `BizPublic` 광고카드(S6) | **프론트** | **P0** |
| F-3 | 클릭 이벤트 전송 — `AdCard` onClick / `WorldMapV2.tsx:438` / `BizPublic.tsx:359`. localStorage pending 큐(내비게이션 유실 방지). **`navigator.sendBeacon` 금지**(§8 브리지 규칙) | **프론트** | **P0** |
| F-4 | 전화 CTA 이벤트 — `AdDetail.tsx:36-39`, `BizPublic.tsx:182-185` 의 `handleCall` 에 전송 추가 | **프론트** | **P1** |
| F-5 | 대시보드 광고 성과 섹션 (`BizDashboard.tsx`) — 7-2 레이아웃, `.num` 준수 | **프론트** | **P1** |
| F-6 | **빈 상태 7종(A~G) 분기** — §7-3. `<StateBlock>`/`sys.skelBar` 사용 | **프론트** | **P1** |
| F-7 | 기간 선택(7일/30일/전체) + 증감 표시 | **프론트** | P2 |
| F-8 | 퍼널 시각화 3단 바 | **프론트** | P2 |
| F-9 | 소식 열람·프로필 진입·공유 CTA 이벤트 (Secondary) | **프론트** | P2 |
| F-10 | i18n — ko/en/vi 3개국어 라벨 (광고주 다수가 베트남어) | **프론트** | **P1** |
| F-11 | 관리자 콘솔 광고 성과 화면 (`admin-frontend`) | **프론트** | P2 |
| F-12 | 면별 분해 아코디언 | **프론트** | P3 |
| F-13 | 길찾기 CTA **신규 기능** 추가 후 계측 (현재 광고·업체 화면에 길찾기 없음 — §1-G #2) | **프론트** | P3 |

### 엔진

| ID | 항목 | 레이어 | 우선순위 |
|---|---|---|---|
| — | **없음.** §6 근거로 엔진 변경 0건. (P3 의 B-12 만 엔진 API 재사용 후보) | **엔진** | — |

### 정책 / 결정 대기

| ID | 항목 | 담당 | 우선순위 |
|---|---|---|---|
| X-1 | `ADS_ENABLED` 재개 시점 (F-1 의 전제) | **대표 결정** | **P0** |
| X-2 | 성과 리포트를 티어 차별 피처로 쓸지 (`features_json`) | **대표 결정** | P2 |
| X-3 | 광고주에게 CPM/CPC/CPA 를 노출할지 (역효과 리스크 — §2-4) | **대표 결정** | **P1** |
| X-4 | `MIN_SAMPLE_FOR_RATIO=100` 확정값 | 실데이터 후 조정 | P2 |
| X-5 | 개인정보 처리방침에 광고 성과 계측 문구 추가 | **정책/법무** | **P1** |

---

## 9. 단계적 구현 제안

### 1단계 — "정직한 3숫자" (P0 + 핵심 P1)

**목표(검증 가능):** 게시 중인 광고 1건에 대해 광고주 대시보드에서 `노출 N · 클릭 N · 전화문의 N` 이 표시되고, 그 숫자가 수동 재현(광고 카드 스크롤 노출 → 탭 → 전화 버튼)과 **정확히 일치**한다.

- 범위: D-1, D-2, B-1, B-2, B-5, B-7, B-8, F-1(X-1 결정 후), F-2, F-3, F-4, F-5, F-6(빈 상태 A~D 최소), F-10
- **비율 지표(CTR/CVR)·비용 지표·증감·퍼널은 넣지 않는다.** 표본이 없으니 어차피 숨겨진다(§7-3 D).
- 검증: ① 수동 재현 일치 ② 자기 노출이 `self_impressions` 로 분리되는지 ③ 롤업 재실행 시 값 불변(멱등) ④ 대시보드 조회가 `ad_events` 를 스캔하지 않는지(`EXPLAIN`)

### 2단계 — "비교와 정당화"

- 범위: B-3, B-4(어트리뷰션), B-6, B-9, F-7, F-8, F-9, D-3, B-10, F-11 + X-3 결정 반영(CPA/CPC)
- 검증: 광고 클릭 후 24h 내 단골 등록이 `attributed_ad_id` 를 갖는가 / 클릭 없이 지도(S7)로 들어온 단골은 귀속되지 **않는가**

### 3단계 — 확장

- 범위: D-4(파티셔닝), B-11, B-12, F-12, F-13, X-2 반영

### 후보 B — 지금 당장 근사치로 보여줄 수 있는 것 (⚠ 비권장)

| 후보 | 방법 | 오표기 위험 | 판단 |
|---|---|---|---|
| `view-ping` 누적화 | `biz.py:57-70` 의 Redis ZSET 대신/추가로 DB 카운터를 올린다 | **높음.** ① 이것은 **업체 프로필 열람**이지 **광고 노출**이 아니다 — 동네지도(S7)·검색·직접 링크 유입이 전부 섞인다. 광고비를 안 낸 트래픽을 광고 성과로 표기하는 셈. ② 15초 폴링(`useBizViewerCount.ts:7`)이므로 한 사람이 1분 머물면 **4회 증가**한다 → 노출수 4배 부풀림. ③ 자기 노출·중복 필터 전무 | ❌ **하지 않는다.** 부풀린 숫자는 발각 시 신뢰를 영구히 잃는다 |
| `marketplace_listings.view_count` 미러 | 광고에 `view_count` 컬럼 추가, 상세 진입마다 +1 (`market.py:410` 패턴) | **중간.** 광고 *상세 진입*은 실제로 클릭의 결과이므로 "클릭"의 하한선으로는 유효. 그러나 ① 중복·자기 조회 필터 없음(원본도 없다) ② **노출은 여전히 0** — 대표 요구의 절반(노출)을 못 채운다 | 🔸 **1단계의 임시 폴백으로만 허용.** 라벨을 "클릭"이 아니라 **"광고 상세 열람"** 으로 정확히 쓰고, 노출 자리에는 §7-3 C/D 안내문을 둔다 |
| 관리자용 MRR 재사용 | `application.py:270-291` 의 `monthly_price_snapshot_vnd` 합계 | 없음 (이미 정확) | ✅ 광고주 화면의 "기간 광고비" 분자로 즉시 사용 가능 |

> **원칙: 없는 데이터를 그럴싸하게 만들지 않는다.** `BizDashboard.tsx:21-24` 의 기존 주석이 이미 이 원칙을 택했다 — 그 판단을 뒤집지 않는다. 대신 §7-3 의 빈 상태 문구로 "곧 보여드립니다"를 정직하게 말한다.

---

## 10. 개인정보 / 정책

| 규칙 | 내용 |
|---|---|
| **광고주에게 개별 사용자 정보 절대 비공개** | 대시보드·API 응답 어디에도 `user_id`·닉네임·전화번호·프로필 사진을 넣지 않는다. **집계 수치만**. "누가 전화했는지"는 광고주가 물어도 제공하지 않는다 |
| 최소 집계 단위 | 도달(reach)·CTA 등 사람 수 기반 지표는 **5명 미만이면 정확한 수 대신 `5명 미만`** 으로 표기(소수 집단 재식별 방지). 예: 단골 1명일 때 광고주가 "그 시간에 온 사람"을 특정할 수 있는 경로를 막는다 |
| 저장하는 식별자 | `ad_events.user_key` = `users.id`(UUID) 만. **IP·User-Agent 원문·디바이스 ID 는 저장하지 않는다** |
| 익명 식별자 | `anon_key` = `sha256(salt + ip + ua)` 앞 32자. salt 는 `.env` 관리(§agent-guidelines §4 — 코드 하드코딩 금지), **일 단위 로테이션**으로 장기 추적 불가하게 한다 |
| FK 미설정 이유 | `user_key` 에 `users.id` FK 를 걸지 않는다. 탈퇴(`users.deleted_at`) 시 CASCADE 로 광고주 리포트 숫자가 소급 변경되면 청구 근거가 무너진다. 대신 **탈퇴 시 `user_key` 를 NULL 로 익명화**하는 처리를 넣는다(집계 수치 보존 + 개인 연결 절단) |
| 보존기간 | 원시 이벤트(개인 연결 가능) **90일**, 롤업(개인 연결 없음) 무기한. 90일은 청구 분쟁 대응 최소 기간 기준 — 법률 검토 대상(**미확인**) |
| 크로스 앱 추적 없음 | 서드파티 SDK 를 도입하지 않는다. 현재 프론트에 애널리틱스 SDK 가 0개인 상태(§1-D)를 **유지**한다. 계측은 자사 서버로만 |
| 고지 | 개인정보 처리방침 / 서비스 약관에 "광고 노출·클릭 통계 수집" 항목 추가 필요 (X-5, **P1**). 베트남 개인정보보호법(Decree 13/2023) 적용 여부 **미확인 — 법률 검토 필요** |
| 광고주 약관 | 성과 수치의 정의(노출=50%/1s 등)와 필터 정책(자기 노출 제외)을 광고 계약 문서에 명시해야 청구 분쟁을 예방한다. **미작성** |

---

## 부록 A. 지표 정의 요약 (1줄)

| 지표 | 정의 |
|---|---|
| 유료 노출 | 광고 크리에이티브 50%+ 가 뷰포트에 1초 이상 보인 횟수 (S1~S6 만, 30초 dedup, 자기 노출 제외) |
| 도달 | 해당 기간 노출을 받은 고유 사용자 수 |
| 클릭 | 광고 카드 탭 횟수 (5초 dedup) |
| CTR | 클릭 / 유료 노출 (노출 100 미만 시 숨김) |
| Primary CTA | 전화 + 단골 + 찜 + 후기 (광고 클릭 후 24h last-click 귀속분) |
| Secondary CTA | 소식 열람 + 프로필 진입 + 공유 합계 |
| CVR | Primary CTA / 클릭 |
| 기간 광고비 | `monthly_price_snapshot_vnd × 기간일수 / 30` |
| CPM / CPC / CPA | 기간 광고비 ÷ (노출/1000) / 클릭 / Primary CTA |

## 부록 B. 신규 파일 목록 (설계 — 아직 생성하지 않음)

| 파일 | 내용 |
|---|---|
| `database/init/153_ad_events.sql` | §4-2 |
| `database/init/154_ad_daily_stats.sql` | §4-3 |
| `backend/app/modules/ads/metrics.py` (또는 `services/ad_metrics.py`) | 필터·dedup·어트리뷰션 |
| `backend/app/jobs/rollup_ad_stats.py` | 5분 증분 + 전일 확정 |
| `backend/app/jobs/purge_ad_events.py` | 90일 보존 삭제 |
| `backend/app/ad_worker/__main__.py` | `ad:events` 스트림 컨슈머 (`noti_worker` 미러) |
| `frontend/src/hooks/useAdImpression.ts` | IntersectionObserver 계측 |
| `frontend/src/api/adMetrics.ts` | 이벤트 배치 전송 + 성과 조회 |

---

## 변경 이력

- **2026-07-26 v0.1** — 최초 작성. 현황 전수 조사(광고 도메인 모델·노출 소비처 S1~S8·계측 자산·엔진 경계) + 지표 정의 + 데이터 모델 + 집계 전략 + 대시보드 요소 + 미구현 체크리스트(DB 4 / BFF 12 / 프론트 13 / 엔진 0 / 정책 5). 발주 전제 8건 정정(§1-G).
