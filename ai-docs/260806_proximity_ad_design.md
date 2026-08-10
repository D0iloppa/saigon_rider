# 근접 광고(Proximity Ad) + 방문 포인트 — 설계서

> 작성: 2026-08-06 · 근거: 대표 지시 2026-08-06 18:47~18:50 (카톡)
> 상태: **정정(2026-08-10): 8월 오픈 범위 포함으로 확정.** D-1~D-9/D-11 확정, D-10 미정(§8). §9 백엔드 구현(1~6)·프론트 진입감지(7) 착수 대상. 계약형태는 [`260810_proximity_ad_contract_model.md`](260810_proximity_ad_contract_model.md) 옵션 A(tier 내장 속성) 확정.
> ~~구 상태(2026-08-06): 범위 A 착수 확정 — D-1/D-2/D-6 확정, D-3/D-4/D-5 미결. §9 전부 미착수(오픈 범위 밖, §7)~~
> 관련: [`spec/ad-performance-metrics.md`](spec/ad-performance-metrics.md) · [`context/architecture.md`](context/architecture.md) · [`context/service-rules.md`](context/service-rules.md) · [`260810_proximity_ad_contract_model.md`](260810_proximity_ad_contract_model.md)

---

## 1. 사업모델 정의 (2026-08-06 최초 공유분 고정)

대표 지시 원문:

> "그래야 이동하면서 변화하는 정보를 수신하지"
> "알림으로 받게도하고 / 유료광고는 / 지점 진입전에"
> "사용자는 켜놔야 포인트 쌓이니 서로 윈윈"
> "광고 수신하고 / 좋은가계 방문하고 / 포인트도 받고 / 유료가계는 알림으로 지도 진입시 알림 발송하고"
> "그게 사업모델이잖아"

**정식화:**

```
사용자가 앱을 켜고 라이딩
      ↓
위치 변화 감지 (지도가 사용자를 따라감)
      ↓
유료 가맹점 반경 진입 "전" → 광고 노출 + 푸시 알림
      ↓
사용자가 해당 가게 방문
      ↓
포인트 적립 (사용자) / 광고비 과금 근거 (가맹점)
```

**수익 구조:** 가맹점이 tier 구독료를 낸다 → 근접 노출 가중치를 받는다. 사용자는 앱을 켜둘 유인(포인트)을 갖는다.

**이 모델이 요구하는 전제 — 이게 GPS 정책의 근거다:**

- 지도는 **사용자 위치를 지속 추적**해야 한다 (`follow` + 나침반 회전)
- GPS 는 선택이 아니라 **기본**이다 (2026-08-06 08:48 지시와 일치)
- 마켓·동네지도에도 동일 적용 (2026-08-06 18:47 지시)

> **결정 이력 주의**: GPS 정책은 3회 변경됐다. ①원안 GPS 기반 → ②2026-07-25 02:09 "GPS 는 지도에서 빼고 경로안내에만" → ③2026-08-06 08:48 "전 화면 GPS 기본". 본 모델은 ③과만 정합하다. ②로 되돌리면 **이 사업모델은 성립하지 않는다.** 재변경 시 이 문서를 먼저 갱신한다.

---

## 2. 기존 자산 인벤토리 — 새로 만들지 않는 것

| 자산 | 위치 | 근접 광고에서의 역할 |
|---|---|---|
| `AdsApplication` (435줄) | `backend/app/modules/ads/application.py` | 광고 조회·tier 가중 노출·게시 상태. **이미 use-case 경계로 박스화됨** |
| `ad_tiers.exposure_weight` | `database/init/149_ads_tiers.sql` | 근접 노출 경합 시 가중치 — 그대로 사용 |
| `ad_events` (surface 컬럼) | `database/init/153_ad_events.sql` | **`surface` 가 이미 노출면 개념을 가진다** → `surface='proximity'` 추가 |
| `ad_daily_stats` | `database/init/154_ad_daily_stats.sql` | 일별 집계 — 그대로 사용 |
| PostGIS geo 쿼리 패턴 | `backend/app/routers/biz.py:931`, `info_gas.py:131`, `info_flood.py:102` | `ST_DWithin(geom, ..., :radius)` geography 캐스트. `business_profile.geom` 존재(migration 143) |
| `notification_outbox` + `noti_worker` | `backend/app/services/noti_events.py`, `backend/app/noti_worker/` | FD-6 트랜잭셔널 아웃박스. 핸들러 추가만 |
| FCM 발송 | `engine/app/services/fcm_push.py` (BFF → `engine_client.notify_user_push`) | 그대로 사용 |
| `action_definition.rp_grant` | `engine/alembic/versions/038_action_rp_grant.py` | **액션 코드별 RP 적립이 이미 범용화**. 액션 코드 1개 추가로 적립 경로 확보 |
| `native.watchLocation` | `frontend/src/lib/native.ts:160` | 포그라운드 위치 스트림 — 이미 존재 |
| `MapCanvas.follow()` | `frontend/src/components/ride/MapCanvas.tsx:113` | 카메라 추적 — 이미 존재 (경로안내 한정) |

**즉 새로 만들 것은 "근접 판정 + 트리거 정책" 하나다.**

---

## 3. 모듈 경계 결정

### 3-1. 결론

```
신규:  backend/app/modules/proximity/     ← 근접 판정 · 쿨다운 · 트리거 정책
재사용: modules/ads/AdsApplication         ← 광고 선택 (surface='proximity' 추가)
재사용: notification_outbox → noti_worker  ← 알림 발송
재사용: engine_client → action rp_grant    ← 포인트 적립
```

### 3-2. "광고를 새 모듈로 만들면 안 되는 이유"

근접 광고는 **새로운 광고 시스템이 아니라 새로운 노출면(surface)** 이다. `ad_events.surface` 컬럼이 이미 그 전제로 설계돼 있다.

새 광고 모듈을 만들면:
- **정산 근거가 두 곳으로 갈라진다** → `ad_daily_stats` 와 신규 집계가 불일치하면 과금 분쟁이 된다
- tier 가중치 로직이 이중화된다 → 한쪽만 고치는 회귀가 반복된다
- 광고주 대시보드(`BizAdsNew.tsx`, `test_biz_ad_stats_*`)가 근접 성과를 못 본다

**머니 경로 이중화는 이 프로젝트에서 가장 비싼 실수 유형이다.** 광고는 `AdsApplication` 하나로 유지한다.

### 3-3. "포인트·알림도 새로 만들지 않는 이유"

- 포인트: `action_definition.rp_grant` 가 이미 범용 액션→RP 적립을 제공한다. 신규 액션 코드 `BIZ_PROXIMITY_VISIT` 추가로 끝난다. **BFF 는 Engine DB 직접 접근 금지** → `engine_client` 경유 (CLAUDE.md 제약).
- 알림: `noti_worker` 가 FD-6 트랜잭셔널 아웃박스 + 멱등성(`test_noti_worker_idempotency`)을 이미 갖췄다. 핸들러 `_handle_proximity_hit` 추가.

### 3-4. 그래서 `modules/proximity/` 가 소유하는 것

1. **후보 조회**: 현재 위치 반경 N m 내 활성 유료 가맹점 (PostGIS)
2. **진입 판정**: 반경 진입/이탈 상태 전이
3. **쿨다운 정책**: 같은 가맹점 재알림 금지 기간, 사용자별 일일 알림 상한
4. **적립 자격 판정**: 방문으로 인정할 조건 (체류 시간·거리·속도)
5. **위조 방어**: 위치 일관성 검증

이 다섯 개는 광고도 알림도 포인트도 아니다. **새 관심사이므로 새 경계가 맞다.**

---

## 4. 판정 위치 — 하이브리드 (핵심 설계 결정)

| | 클라이언트 판정 | 서버 판정 |
|---|---|---|
| 응답성 | 즉시 | 왕복 지연 (베트남 4G) |
| 트래픽 | 없음 | 위치 주기 전송 |
| 위조 방어 | **불가** | 가능 |
| 가맹점 목록 노출 | 노출됨 | 비노출 |

**결정:**

```
알림 트리거  → 클라이언트 1차 판정 (즉시성 우선, 틀려도 손실 작음)
포인트 적립  → 서버 확정 (금전 가치, 위조 방어 필수)
```

**근거:** 알림이 한 번 잘못 떠도 손실은 사용자 짜증이다. 포인트는 기프티콘으로 환금되므로 **위치 위조 = 금전 탈취**다. 클라이언트 판정만으로 적립하면 GPS 스푸핑으로 무한 파밍이 된다.

### 흐름

```
[앱]  watchLocation 스트림
  → 진입 시 앱 시작 시 후보 목록 1회 수신 (반경 3km 내 유료 가맹점, 좌표만)
  → 로컬 거리 계산으로 진입 감지
  → 알림/광고 카드 즉시 표시 (UX)
  → 서버에 진입 이벤트 보고 (POST /api/bff/proximity/enter)

[BFF] modules/proximity
  → ST_DWithin 재검증 (클라이언트 주장 위치가 실제 반경 내인가)
  → 위치 일관성 검증 (직전 좌표 대비 이동 속도가 물리적으로 가능한가)
  → 쿨다운·일일상한 확인
  → AdsApplication 으로 노출 광고 확정 (tier 가중)
  → ad_events(surface='proximity', event_type='proximity_impression') 기록
  → notification_outbox enqueue (같은 트랜잭션, FD-6)
  → 방문 확정 시 engine_client → action BIZ_PROXIMITY_VISIT → RP 적립
```

---

## 5. 데이터 모델 변경

### 5-1. `ad_events` — CHECK 제약 확장

```sql
-- event_type 추가: 'proximity_impression', 'proximity_visit'
-- surface 값 추가: 'proximity'
ALTER TABLE ad_events DROP CONSTRAINT ad_events_event_type_check;
ALTER TABLE ad_events ADD CONSTRAINT ad_events_event_type_check
  CHECK (event_type IN (
    'impression', 'click', 'cta_call', 'cta_follow', 'cta_favorite',
    'cta_review', 'cta_news_view', 'cta_profile_enter', 'cta_share',
    'proximity_impression', 'proximity_visit'          -- 신규
  ));
```

### 5-2. 신규 — 근접 진입 상태·쿨다운

```sql
CREATE TABLE IF NOT EXISTS proximity_hit (
    id                  BIGSERIAL PRIMARY KEY,
    user_key            UUID NOT NULL,
    business_profile_id UUID NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
    ad_id               UUID NULL REFERENCES marketplace_ads(id) ON DELETE SET NULL,
    hit_lat             DOUBLE PRECISION NOT NULL,   -- 감사·분쟁 대응
    hit_lng             DOUBLE PRECISION NOT NULL,
    distance_m          INTEGER NOT NULL,
    notified_at         TIMESTAMPTZ NULL,            -- 알림 발송 시각
    visit_confirmed_at  TIMESTAMPTZ NULL,            -- 방문 인정 시각
    rp_granted          BOOLEAN NOT NULL DEFAULT FALSE,
    occurred_at         TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON proximity_hit (user_key, business_profile_id, occurred_at DESC);  -- 쿨다운 조회
CREATE INDEX ON proximity_hit (user_key, occurred_at DESC);                        -- 일일상한 조회
```

### 5-3. 정책 파라미터 — 하드코딩 금지, 테이블화

```sql
CREATE TABLE IF NOT EXISTS proximity_policy (
    id                      SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    notify_radius_m         INTEGER NOT NULL DEFAULT 300,   -- "진입 전" 알림 반경
    visit_radius_m          INTEGER NOT NULL DEFAULT 50,    -- 방문 인정 반경
    visit_dwell_sec         INTEGER NOT NULL DEFAULT 120,   -- 방문 인정 체류시간
    cooldown_hours          INTEGER NOT NULL DEFAULT 24,    -- 동일 가맹점 재알림 금지
    daily_notify_cap        INTEGER NOT NULL DEFAULT 2,     -- 사용자별 일일 알림 상한 (2026-08-10 리서치로 5→2 하향)
    daily_rp_cap            INTEGER NOT NULL DEFAULT 3,     -- 사용자별 일일 적립 상한
    max_speed_kmh           INTEGER NOT NULL DEFAULT 120,   -- 위조 판정 임계 (오토바이 기준)
    candidate_radius_m      INTEGER NOT NULL DEFAULT 3000,  -- 클라이언트 후보 배포 반경
    is_enabled              BOOLEAN NOT NULL DEFAULT FALSE  -- 킬스위치
);
```

> `is_enabled=FALSE` 로 시작한다. `ADS_ENABLED` 선례(`lib/adPlacement.ts`)와 같은 패턴.

---

## 6. 리스크 — 착수 전 결정이 필요한 항목

### R-1. 백그라운드 위치 추적은 **불가**하다 (제일 중요)

`@capacitor/geolocation` 의 `watchPosition` 은 **포그라운드 전용**이다. 앱이 백그라운드로 가면 스트림이 멈춘다(iOS 는 특히 엄격).

**다행히 대표 지시와 정합적이다** — "사용자는 **켜놔야** 포인트 쌓이니"는 앱을 켜둔 상태를 전제한다. 따라서 **포그라운드 전용으로 확정한다.**

**만약 백그라운드를 요구하면** 규모가 몇 배가 된다:
- 별도 플러그인 도입 (`@capacitor-community/background-geolocation` 등)
- iOS: `UIBackgroundModes: location` + **App Store 심사 시 상시 위치 사용 사유 소명** (거절 사유 1순위)
- Android: `ACCESS_BACKGROUND_LOCATION` + Play 정책 심사 (별도 승인 절차)
- 배터리 소모 → 앱 삭제율 상승
- 베트남 중저가 Android 기기 + 4G 환경에서 검증 부담

→ **결정 필요: 포그라운드 전용으로 확정하는가?** (권고: 예. 백그라운드는 v2 이후.)

### R-2. GPS 스푸핑 = 금전 탈취

포인트가 기프티콘으로 환금되므로 위치 위조는 실제 금전 피해다. §4 서버 확정 + 속도 일관성 검증이 최소 방어선이다. 추가 방어(기기 무결성, 가맹점 QR 스캔 병행)는 v2.

> 참고: `html5-qrcode` 가 이미 의존성에 있다. **방문 확정을 QR 스캔으로 바꾸면 위조 문제가 거의 사라진다.** 대안으로 검토 권고.

### R-3. 알림 스팸 = 앱 삭제

호치민 1군 밀도에서 가맹점 300건이 등록되면 반경 300m 알림은 하루 수십 건이 된다. `daily_notify_cap` + `cooldown_hours` 는 선택이 아니라 필수다.

### R-4. 배터리·데이터

베트남 중저가 Android + 불안정 4G 가 타깃이다(기존 설계 제약과 동일). 위치 전송 주기를 좌표 변화 기반 스로틀링으로 제한한다 — 고정 주기 폴링 금지.

### R-5. 개인정보

위치 이력(`proximity_hit.hit_lat/lng`)은 개인정보다. 보관 기간·동의 문구가 개인정보처리방침에 반영돼야 한다. **`260802_legal_review_request.md` 에 항목 추가 필요.**

---

## 7. 범위 판정

> **정정: 2026-08-10 대표 지시로 포함 확정.** 아래 원문 판정("8월 오픈 범위 밖")은 2026-08-06 시점 근거이며 이후 대표 지시로 뒤집혔다. 원문은 판정 근거 기록으로 남기고 지우지 않는다 — GPS 정책 3회 반전(§1)과 같은 방식. 최신 판정은 §8 D-6 을 본다.

**이 기능은 8월 오픈 범위 밖이다.** ~~(2026-08-06 판정 — 2026-08-10 대표 지시로 번복됨)~~

근거: `260802_remaining_blockers.md` §1(출시를 막는 것)에 이 항목이 없다. §1 은 서명빌드·법무·Apple 로그인·S3 자격증명 등 **전부 대표/외부 소관**이며 개발 소관은 0건이다. 근접 광고를 오픈 범위에 넣으면:

- 신규 테이블 3개 + 머니 경로(포인트 적립) 추가 → 출시 게이트 재감사 필요
- 개인정보처리방침 개정 → 법무 재검토 필요 (현재 이미 미수령 상태)
- 위치 상시 사용에 대한 스토어 심사 사유 소명 (백그라운드 도입 시)

### 7-1. 선행조건 3개 — 코드가 아니다 (2026-08-06 추가)

> **원안 결함 정정**: 원안은 "선행조건은 가맹점 수"라고만 적었다. 그 앞에 **두 개가 더 있고, 둘 다 이미 대표 지시로 닫혀 있는 상태다.** 이걸 빠뜨리면 만들어도 노출되지 않고 과금 근거도 쌓이지 않는다.

| # | 선행조건 | 현재 상태 | 소관 |
|---|---|---|---|
| **P-1** | **광고 노출 스위치** | ❌ **꺼짐.** `frontend/src/lib/adPlacement.ts:16-18` — *"광고 노출 시기상조 — **대표 지시(2026-07-25)** 로 피드 광고카드 노출만 숨긴다"* → `ADS_ENABLED = false`. 파트너 페이지 광고 섹션도 `GET /app-config` 의 `is_dev` 가 true 일 때만 렌더(`BizManage.tsx:458-461`, i18n `biz.adsDevOnlyBadge` = "현재 개발 중인 광고 기능으로, 개발 서버에만 표출됩니다", fail-closed) | **대표 결정** |
| **P-2** | **광고 계측(collection) 구현** | ❌ **미구현.** `ad_events`/`ad_daily_stats` 는 데이터 모델만 존재(`153_ad_events.sql` 주석: *"수집 엔드포인트/워커는 후속 단계 — ADS_ENABLED 가 꺼져 있어 채울 이벤트가 없다"*). 잔여 작업은 [`spec/ad-performance-metrics.md`](spec/ad-performance-metrics.md) §9 | 개발 (P-1 결정 후) |
| **P-3** | 유료 가맹점 수 | ❌ 0건. 알바 320건 사전등록 계획 진행 중 | 대표/영업 |

**P-1 과 P-2 는 같은 결정 라인에 있다** — `ad-performance-metrics.md:78` 이 이미 명시한다: *"⚠ 최대 리스크: 유료 광고의 주 노출면(S1~S4)이 지금 전부 꺼져 있다. … 계측 구현과 노출 재개는 같은 결정 라인에 있다."* 또한 [`context/build-retrospective-260726.md:216`](context/build-retrospective-260726.md) 은 **"광고 대시보드 추가 작업 중단 권고 — 광고주 확보 전까지"** 로 판정해뒀다.

> **결정 이력 충돌 주의**: 근접 광고 모델(2026-08-06 지시)은 **광고 노출을 전제**하지만, 광고 노출은 **2026-07-25 지시로 꺼져 있다.** 두 지시가 서로 상충한다. 이 문서는 후자를 무효화하지 않는다 — **P-1 을 켜는 시점을 대표가 확정해야 P-2·본 기능이 착수 가능하다.** GPS 정책 3회 반전(§1)과 같은 유형의 충돌이므로 같은 방식으로 기록한다.
>
> **정정: 2026-08-10 대표 지시로 P-1 해제 확정.** 기존 피드 광고(`ADS_ENABLED`)를 근접푸시와 **함께 재개**한다. 위 "P-1 이 대표 결정 대기"인 상태는 종료됐다 — 실제 플래그 반전(`frontend/src/lib/adPlacement.ts`)은 §9 구현 순서에 포함해 진행한다.

### 7-2. 권고 순서

1. **8월 오픈**: GPS 기본 통일 + 카메라 추적 — **UI 계층만.** (마켓·동네지도 회전은 [`260806_svg_map_v6_rotation_design.md`](260806_svg_map_v6_rotation_design.md) 참조 — SVG 렌더러라 별건이고, 3-state 토글로 성립한다.) **이 단계는 P-1/P-2 와 무관하게 진행 가능하다** — 광고를 켜지 않아도 위치 추적 UI 자체는 독립이다.
2. **P-1 결정 대기**: 광고 노출 재개 시점 확정 (대표)
3. **P-1 확정 후**: P-2 광고 계측 구현 → 그때 비로소 노출·과금 근거가 쌓인다
4. **스키마 선반영**: `proximity_policy.is_enabled=FALSE` 로 무동작 병합 (오픈 안 막음)
5. **P-3 충족 후**(가맹점 확보): 킬스위치 ON + 소규모 검증

**즉 이 기능의 착수 가능 시점은 코드 준비도가 아니라 P-1 결정 시점에 종속된다.**

---

## 8. 착수 전 필요한 결정 (대표 승인 항목)

> **2026-08-10 갱신**: D-3~D-11 전부 대표 확정. D-7~D-11 은 계약형태 세부 결정으로, 상세 근거는 [`260810_proximity_ad_contract_model.md`](260810_proximity_ad_contract_model.md) §D-7~D-11 을 본다.

| # | 결정 항목 | 권고안 | 결정 |
|---|---|---|---|
| D-1 | 백그라운드 위치 추적 도입 여부 | **미도입** (포그라운드 전용) — R-1 | **확정(2026-08-06): 미도입** |
| D-2 | 방문 확정 방식 | GPS 체류 + **QR 스캔 병행 검토** — R-2 | **확정(2026-08-06): GPS 체류 + 속도 일관성. QR 스캔은 v2** |
| D-3 | 알림 반경 / 방문 반경 / 체류시간 | 300m / 50m / 120s (조정 가능, 테이블화됨) | **확정(2026-08-10): notify_radius_m=300, visit_radius_m=50, visit_dwell_sec=120** |
| D-4 | 일일 알림 상한 / 쿨다운 / 일일 적립 상한 | 5건 / 24h / 3건 — R-3 | ~~확정(2026-08-10): daily_notify_cap=5~~ → **재확정(2026-08-10): daily_notify_cap=2** (근접광고_계약형태_가격정책_조사.md — 업계 권장 1~2건/일, 5건은 opt-out 리스크 과다). cooldown_hours=24, daily_rp_cap=3 은 유지 |
| D-5 | 포인트 적립량 | `action_definition.rp_grant` 값 — 미정 | **확정(2026-08-10): 10 RP/방문 (액션코드 `BIZ_PROXIMITY_VISIT`)** |
| D-6 | 오픈 범위 포함 여부 | **제외.** §7 | ~~확정(2026-08-06): 오픈 범위 제외~~ → **정정 확정(2026-08-10): 오픈 범위 포함** (§7 정정 참고) |
| D-7 | 계약(과금) 형태 | 옵션 A(tier 내장 속성) — `260810_proximity_ad_contract_model.md` | **확정(2026-08-10): 옵션 A.** `ad_tiers.proximity_enabled` 컬럼 1개, 프리미엄만 TRUE |
| D-8 | 프리미엄 월 요금 (VND) | 미정 — A는 이 숫자가 확정돼야 출고 가능 | **미정 (2026-08-10).** 스키마만 준비, `monthly_price_vnd` 는 당분간 0 유지 |
| D-9 | 일반 월 요금 (VND) | 미정 | **미정 (2026-08-10).** D-8 과 동일 취급 |
| D-10 | 오픈 초기 프리미엄 프로모션 | 무료 N개월 / 할인 / 없음 | **미정 (2026-08-10).** 이번엔 결정하지 않고 미정으로만 기록 |
| D-11 | 일반 tier 에도 근접알림을 줄 것인가 | 안 줌(추천) | **확정(2026-08-10): 안 줌.** 근접알림은 프리미엄 전용 |

---

## 9. 구현 순서 (승인 후)

> **2026-08-06 현재 1~7 전부 미착수.** 이번 범위(A)는 §7 권고 1번(UI 계층)뿐이다.
> **2026-08-10 갱신**: 오픈 범위 포함(D-6) 확정으로 1~7 전부 착수 대상. 계약형태(D-7 옵션 A)와 G-1 게이트가 들어가는 지점을 단계별로 주석 표기했다 — 상세는 [`260810_proximity_ad_contract_model.md`](260810_proximity_ad_contract_model.md).

```
1. proximity_policy · proximity_hit 테이블 + ad_events CHECK 확장
   → 검증: 마이그레이션 적용 후 기존 ad_events 삽입이 깨지지 않는지 테스트
   ※ 옵션 A(D-7) 스키마도 이 단계에서 함께: ad_tiers.proximity_enabled 컬럼 1개 (별도 마이그레이션, `260810_proximity_ad_contract_model.md` §A-2)
2. modules/proximity/application.py — 후보조회 · 진입판정 · 쿨다운
   → 검증: 반경/쿨다운/일일상한 단위테스트 (기존 test_ads_application.py 패턴 미러)
   ※ 후보조회 WHERE 절에 AdTier.proximity_enabled=True 조건(D-7) + subscription_status='active' 조건(G-1) 필수 추가 — 미납 광고주가 사용자 일일 알림 쿼터(daily_notify_cap=2)를 소진하는 것을 막는다. 피드 광고 기존 동작은 무변경(회귀 방지)
3. 위치 일관성 검증 (max_speed_kmh)
   → 검증: 위조 좌표 주입 테스트가 거부되는지
4. POST /api/bff/proximity/enter + ad_events 기록
   → 검증: surface='proximity' 이벤트가 ad_daily_stats 에 집계되는지
5. noti_worker _handle_proximity_hit 핸들러
   → 검증: 멱등성 테스트 (기존 test_noti_worker_idempotency 패턴)
6. engine_client → BIZ_PROXIMITY_VISIT RP 적립 (D-5: 10 RP/방문)
   → 검증: 중복 적립 방지 (rp_granted 플래그) 테스트
7. 프론트: 후보 수신 + 로컬 진입 감지 + 광고 카드
   → 검증: 실기기에서 이동 시 알림 1회만 뜨는지
```

각 단계는 `is_enabled=FALSE` 상태로 병합 가능하다 — 무동작이므로 오픈을 막지 않는다.
