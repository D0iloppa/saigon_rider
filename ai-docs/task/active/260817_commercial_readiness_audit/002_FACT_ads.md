# 002 — 광고 팩트시트 (읽기전용 재검증)

기준 커밋: `ae4064d` · 조사 일시: 2026-08-17 저녁 (000_SYNTHESIS/W3_partner 이후 후속 재검증)
소스 변경 0건. 아래는 W3_partner.md/000_SYNTHESIS.md §3④⑤⑥가 이미 확인한 사실의 재확인 + 1건의 신규 발견(§C-6)이다.

---

## A. 광고 상품·판매

| 항목 | 상태 | 근거 | 비고 |
|---|---|---|---|
| 티어 정의 | 있음 | `database/init/149_ads_tiers.sql`, `models.py:802-813` | 프리미엄 499,000/일반 199,000 VND, `exposure_weight` 3/1 |
| 구매 플로우(신청→승인→계약서명→노출) | 있음, 결제만 수동 | `backend/app/routers/biz.py:410-436`(신청), `admin_api/biz.py:687-741`(심사), `backend/app/routers/ad_contract.py`(전자서명), `admin_api/biz.py:770-790`(수동 활성화) | 계좌이체+관리자 1건씩 승인. 자동 갱신/재결제 로직 grep 무결과 |
| 심사 큐(어드민) | 있음 | `admin-frontend/src/pages/biz/BizAdListPage.tsx`, `BizAdDetailPage.tsx`, `admin_api/biz.py:687-741` | 승인/반려만. 반려 사유는 광고주에게 알림 경로로 전달(코드 확인은 W3 범위, 본 시트 미재확인) |
| 인보이스·VAT·세금계산서 | 없음 | `grep -rniE "invoice|vat_|세금계산서" backend/app` → **0건**(테스트 제외) | `BizApply`/`BizAccountCreateRequest` 에 사업자등록번호·세금 필드 자체가 없음 |

## B. 광고 노출

| 항목 | 상태 | 근거 | 비고 |
|---|---|---|---|
| 킬스위치(`ADS_ENABLED`) | 소스 상수, 현재 `false` | `frontend/src/lib/adPlacement.ts:18` `export const ADS_ENABLED = false;` | 런타임 플래그 아님 — 켜려면 프론트 재빌드·재배포 필요 |
| 근접광고 킬스위치 | DB row, 현재 `FALSE` | `database/init/174_proximity_policy.sql:27-29`(`is_enabled DEFAULT FALSE`) | DB row 값이라 소스 재배포 없이 껐다 켤 수 있음(어드민 UPDATE 필요, 어드민 화면에서 노출 여부는 미확인) |
| 노출면 8종 활성 여부 | S1~S4/근접 OFF, S5/S6/S7/S8 ON | `lib/adPlacement.ts:18`(공통 플래그), `pages/market/MarketMain.tsx`, `pages/home/WorldMapV2.tsx`, `pages/market/AdDetail.tsx`, `pages/biz/BizPublic.tsx:359`, `routers/biz.py:484-542`(지도 핀, 광고 무관), `routers/biz.py:549-560`(소식, 광고 무관) | S7/S8 은 APPROVED 프로필 전체 노출이라 광고비와 무관 — 성과 지표에 합산 시 오표기 |
| 선택 로직 | 결정적 smooth weighted round-robin. 경매/입찰 없음 | `backend/app/services/ad_exposure.py:16-46` | `weight = max(1, tier.exposure_weight) * max(1, ad.ad_fee)`. `ad_fee` 전 행 1 정규화(`149_ads_tiers.sql` 말미) → 사실상 티어 가중치만 작동 |
| 게이트 | 있음 | `backend/app/services/ad_gating.py:26-50` | APPROVED+is_active+게시기간+(무소속 또는 파트너 `verification_status='verified'`) |
| 인벤토리 상한/빈도제한 | 일반 광고 없음. 근접광고만 있음 | `ad_exposure.py`/`ad_gating.py` grep 무결과(빈도제한) / `174_proximity_policy.sql:22-23`(`cooldown_hours=24`,`daily_notify_cap`) | 게이트 통과 광고는 전부 시퀀스 포함(`MAX_SEQUENCE_LENGTH=120`) — 밀려나는 광고 없음 |
| 타겟팅 축 | `district_id` 하나뿐 | `backend/app/modules/ads/application.py:217-225` | 카테고리·시간대·사용자속성 타겟팅 코드 없음 |

## C. 효과 측정 파이프라인

| 항목 | 상태 | 근거 | 비고 |
|---|---|---|---|
| `ad_events` 테이블 | 완성 | `database/init/153_ad_events.sql:12-24` | `id BIGSERIAL`, `event_type VARCHAR(24)` CHECK(9종+`174`에서 2종 추가=11종), `surface VARCHAR(24)` **CHECK 없음**(자유 문자열), `stat_date DATE` |
| `ad_daily_stats` 테이블 | 완성 | `database/init/154_ad_daily_stats.sql:11-25` | PK `(ad_id, stat_date, surface)`. `ad_id` 는 **FK 없음**(의도적, 영구보존 근거 — 파일 주석 12-14행) |
| `bff_migrate` 등록 | 확인됨 | `docker-compose.yml:168,172,295-296` | 파일만 있고 미등록인 사례 아님 |
| ORM 모델 | 있음 | `backend/app/models.py:899-925`(`AdEvent`), `970-`(`AdDailyStat`) | `AdEvent` 클래스 주석(`901-903`): "근접 광고 엔드포인트가 최초 실 삽입 경로" |
| **쓰기 경로(신규 발견)** | **`proximity.py` 1곳에서만 실제 INSERT** | `backend/app/routers/proximity.py:19,137-145` — `db.add(AdEvent(..., event_type="proximity_impression", surface="proximity", ...))` | **W3_partner.md 의 "B-1 수집 엔드포인트 grep 무결과"는 일반 마켓 광고(S1~S6) 기준으로는 맞지만, 근접광고 경로는 이미 쓰기 코드가 존재한다.** 단 `proximity_policy.is_enabled=FALSE`(킬스위치 OFF)라 이 코드가 지금 실행 조건에 도달하지 않음(§B 참조) — **결과적으로 여전히 0행**이나, "코드가 아예 없다"는 서술은 근접광고에 한해 부정확 |
| 마켓/홈 피드 광고(S1~S6)용 수집 엔드포인트 | 없음 | `grep -rn "POST.*ads/events\|ad_events" backend/app/routers` → `proximity.py` 외 매치 없음. `market.py`/`biz.py` 에 이벤트 INSERT 코드 없음 | `POST /market/ads/events` 같은 범용 엔드포인트는 설계 문서(`ad-performance-metrics.md` §3-2)에만 있고 미구현 |
| 프론트 계측 훅 | 없음 | `frontend/src/hooks/` 에 `useAdImpression` 류 파일 없음, `AdCard.tsx`/`WorldMapV2.tsx`/`AdDetail.tsx` 에 노출·클릭 전송 코드 없음(W3 §6 F-2/F-3 재확인) | 프론트에서 서버로 노출/클릭을 보내는 유일한 경로는 `proximity/enter` 호출(근접 진입 시 클라 로컬 판정 후 서버 보고) — 이건 일반 광고 계측이 아님 |
| 롤업 배치 | 없음 | `backend/app/jobs/` 디렉터리 실제 파일: `backup_db.py`,`expire_flood_reports.py`,`fetch_fuel_prices.py`,`predict_flood_risk.py`,`purge_deleted_accounts.py`,`refresh_repair_stats.py`,`retry_quest_rewards.py` — `rollup_ad_stats.py` 없음. `main.py:75-129` 등록된 스케줄러 잡 7개 중 광고 관련 0개 | 대체물 `backend/scripts/seed_ad_daily_stats.py` — 파일 자체 docstring이 "DEV ONLY", "rollup_ad_stats 배치가 아직 없어 대시보드가 늘 0/no_ads" 라고 명시. **운영 배치 아님, 개발자 수동 시드** |
| `ad:events` Redis Stream 워커 | 없음 | `backend/app/ad_worker/` 디렉터리 자체가 없음(`noti_worker` 만 존재) | |
| 조회 API | 완성 | `backend/app/routers/biz.py:533-636`(`ad-stats-summary`), `639-811`(`ad-stats-series`) | CTR/CVR/CPM/CPC/CPA 계산(`600-611`,`789-795`), 표본 게이트 `MIN_SAMPLE_FOR_RATIO=100`(`biz.py:81`), 광고비 기간안분 `_ad_spend_for_period()`(`biz.py:517-530`) |
| 90일 보존 삭제 배치 | 없음 | `backend/app/jobs/` grep 무결과 | |
| 월 파티셔닝 | 없음(트리거 임계 미도달) | `database/init/` 전체 `PARTITION` 0건 | 데이터가 없으니 애초에 필요조건 미충족 |

**파이프라인 단절 도식 (2026-08-17 재확인):**

```
[프론트 노출/클릭 계측]  →  [범용 수집 API]  →  [Redis Stream 워커]  →  [일별 롤업 배치]  →  [ad_daily_stats]  →  [대시보드/조회 API]
      ❌ 훅 없음            ❌ market/biz 광고용 없음   ❌ ad_worker 없음      ❌ rollup_ad_stats.py 없음   ✅ 테이블+INSERT코드 있음(근접만)   ✅ 완성

[근접광고 전용 경로]
[클라 로컬 진입 판정] → [POST /proximity/enter] → [AdEvent INSERT (surface=proximity)] → (롤업 없음, 여기서 끊김) → ad_daily_stats
      ✅ 있음                ✅ 있음(proximity.py:137)         ✅ 실제 INSERT 코드 존재                    ❌ 롤업 배치 없음 → 조회 API 도달 불가
      but: proximity_policy.is_enabled=FALSE (킬스위치 OFF) → 이 경로 자체가 지금 실행되지 않음
```

일반 광고(S1~S6)는 **1번째 관문(프론트 훅)에서 끊김**. 근접광고는 **원시 이벤트까지는 쌓일 수 있는 코드가 있으나 (a) 킬스위치 OFF, (b) 롤업 배치 부재 2중으로 막혀 있음**.

## D. 파트너에게 주는 지표·보고서

| 항목 | 상태 | 근거 | 비고 |
|---|---|---|---|
| 대시보드 UI | 완성(골격) | `frontend/src/pages/biz/BizDashboard.tsx` 전체, 탭 호스트 `BizManage.tsx:306-307` | 기간선택(7/14/30일), 증감 표시, 트렌드 차트, 광고별 분해, 지출액, 빈 상태 5종(`no_ads`/`pending`/`warming_up`/`low_sample`/`normal`) 분기 확인 |
| 입력 데이터 없을 때 화면 | `no_ads`(광고 0건) 또는 `pending`/`warming_up`/`low_sample` 중 하나 — 광고가 있어도 `ad_daily_stats` 가 항상 0행이므로 **정상 상태(`normal`)에 도달 불가** | `biz.py:81`(임계값), `biz.py:556`(`state="no_ads"`), `biz.py:595`(`low_sample`) | 대시보드가 거짓을 보여주진 않음(0을 0이라 정직하게 표시) — 다만 "정상 성과"를 절대 볼 수 없는 상태가 항구화됨 |
| CSV/PDF/엑셀 export | 없음 | `grep -niE "reportlab\|weasyprint\|openpyxl\|pdfkit" backend/requirements.txt` → 매치 0 / `grep -rniE "text/csv\|csv\.writer\|StreamingResponse" backend/app/routers` → 매치 0 | 광고 도메인 export 엔드포인트 0 |
| 이메일 발송 인프라 | 없음 | `grep -rniE "smtplib\|sendgrid\|ses_client\|smtp\." backend/app` → 매치 0 | `requirements.txt` 에 `boto3>=1.34` 는 있으나(line 18) SES 클라이언트 사용 코드 0건 — 잠재 가능성만 있음, 실사용 없음 |
| 재사용 가능 스케줄러 | 있음 | `backend/app/main.py:75-129` — `AsyncIOScheduler(timezone="Asia/Ho_Chi_Minh")`, `CronTrigger`/`IntervalTrigger` 로 7개 잡 이미 등록(`fuel_fetch`, `flood_risk`, `refresh_repair_shop_stats`, `expire_stale_flood_reports`, `retry_failed_quest_rewards`, `purge_deleted_accounts`, `backup_db`) | 이메일 리포트 잡을 같은 패턴으로 추가하는 것 자체는 인프라 재사용 가능 |
| 어드민 광고 성과 화면 | 없음 | `grep -niE "impression\|클릭\|노출\|click" admin-frontend/src/pages/biz/BizAdListPage.tsx BizAdDetailPage.tsx` → 매치 0(제목/파트너명/승인·반려 액션만) | 운영자도 광고 성과를 볼 화면이 없음 |
| 업체 프로필 편집 가능/불가 항목 | 가능: 정보/사진/카테고리/위치(`biz.py:301-345`), 소식(`biz.py:1190-1246`), 가격표(`biz.py:1279-1323`) / 불가: 영업시간(스키마에 필드 없음), 후기 답글(작성/upsert만 존재, 오너 응답 없음) | `biz.py:301-345,1190-1246,1279-1323,1330-1441` | W3_partner.md P-3b/P-3e 재확인, 라인 근거만 재검증 |

## `ad-performance-metrics.md` 체크리스트 재검증 요약 (문서 vs 실측)

| 영역 | 문서(2026-07-26) | 실측(2026-08-17, 본 시트) |
|---|---|---|
| DB 4건 | 전부 미구현 | **2건 완료**(`ad_events`/`ad_daily_stats`, bff_migrate 등록 확인) / 2건 미구현(90일 삭제, 파티셔닝) |
| BFF 12건 | 전부 미구현 | **2건 완료**(조회 API 2종) / **1건 부분 완료(신규 확인)** — B-1 수집 엔드포인트는 일반광고 기준 미구현이나 **근접광고 전용 INSERT 코드는 존재**(`proximity.py:137`) / 나머지 9건 미구현(필터·어트리뷰션·Stream워커·레이트리밋·관리자랭킹·익명모니터링·엔진위임) |
| 프론트 13건 | 전부 미구현 | **4건 완료**(대시보드 UI, 빈상태 분기, 기간선택, i18n) / 나머지 미구현(계측훅·클릭전송·전화CTA·어드민화면) |
| 정책 5건 | 전부 미결 | 그대로 5건 미결(대표 결정/법무 사안 — 코드로 확인 불가) |

문서의 "0% 구현"(§0 한 줄 결론)은 **작성 시점(7/26) 기준으로는 맞았으나 현재는 낡았다** — 조회 계층과 스키마는 이미 상당 부분 만들어졌고, 근접광고 도메인 한정으로 원시 이벤트 쓰기 코드도 이미 존재한다. 다만 "광고주가 성과를 실제로 볼 수 있는가"라는 결론(0%에 가까움)은 **여전히 유효** — 조회할 데이터 자체가 없기 때문.

## 확인하지 못한 것

- `admin_api/biz.py` 의 광고 반려 사유가 광고주에게 전달되는 정확한 알림 문구/경로(라인 단위 재확인 안 함 — W3 §1 P-5c 서술을 그대로 인용).
- `proximity_policy.is_enabled` 를 어드민이 토글할 수 있는 화면이 있는지(테이블 UPDATE 만 확인, 어드민 UI 자체는 미탐색).
- `boto3` 가 requirements 에 있는 실제 사용처(S3/SES 외 다른 용도일 가능성 — 코드 전체 사용처를 추적하지 않음, SES 클라이언트 인스턴스화 코드가 없다는 것만 grep 으로 확인).
- `ad_events.surface`/`event_type` 에 실제로 몇 행이 쌓여 있는지(런타임 DB 조회 안 함 — `proximity_policy.is_enabled=FALSE` 이므로 이론상 0행으로 추정되나 실측 아님).
- `BizAdListPage.tsx`/`BizAdDetailPage.tsx` 전체 라인 미열람 — grep 매치 0건 기반 판단(W3 §8 스스로 밝힌 한계와 동일).

---

## 반환값 요지

**광고 구매의 이유(효과 증명)를 지금 코드가 제공할 수 있는가 — 아니오.** 조회 API·대시보드 UI·DB 스키마는 완성돼 있으나, 이를 채우는 쓰기 파이프라인이 일반 광고(S1~S6, 유료 노출 전량)에는 전혀 없다. 유일한 예외인 근접광고 쓰기 코드(`proximity.py:137`)조차 킬스위치(`is_enabled=FALSE`)와 롤업 배치 부재 이중으로 막혀 실질 데이터가 0이다. 결과적으로 광고주는 대시보드를 열어도 항상 빈 상태만 본다.

**단절 지점 (일반 광고, S1~S6):** ① 프론트 노출/클릭 계측 훅 없음 → ② 범용 수집 엔드포인트(`POST /market/ads/events`) 없음 → ③ `ad:events` Redis Stream 워커 없음 → ④ `rollup_ad_stats.py` 롤업 배치 없음. ①에서 이미 끊긴다.

**단절 지점 (근접광고):** 원시 INSERT 코드는 존재(`proximity.py:137-145`)하지만 (a) `proximity_policy.is_enabled=FALSE` 킬스위치로 미실행, (b) 설사 켜도 롤업 배치가 없어 `ad_daily_stats` 에 반영 안 됨.
