# 근접 광고 — 계약(과금) 형태 설계안

> **3줄 요약**
> 1. **추천: 옵션 A — tier 내장 속성.** `ad_tiers.proximity_enabled` 컬럼 1개를 추가해 "프리미엄 = 노출 3배 + 근접알림 / 일반 = 노출만"으로 재정의하고, 두 tier 가격을 이번에 함께 확정한다.
> 2. 근거는 셋이다 — **정산 근거가 정액 월구독 하나로 유지**되고(설계서 §3-2 경고 회피), 기존 `compute_weights`/`build_exposure_sequence` 를 **한 줄도 안 고치며**, 광고주 UX가 **지금의 플랜 선택 화면 그대로**다.
> 3. 옵션 B(add-on)는 A의 상위호환이라 **나중에 override 컬럼 하나로 승격 가능**하고, 옵션 C(건별 과금)는 **광고주용 잔액 원장이 이 레포에 전무**해 8월 오픈 범위에서 배제 판정한다.

> 작성: 2026-08-10 · 상위 설계서: [`260806_proximity_ad_design.md`](260806_proximity_ad_design.md)
> 범위: **계약 단위(과금 형태) 결정만.** 근접 판정 로직·RP 적립량(D-5)·구현 순서는 상위 설계서 소관.
> 이번 세션 코드 변경: **없음** (문서만)

---

## 0. 전제와 가정

### 0-1. 확정 전제 (뒤집지 않음)

| 항목 | 값 | 출처 |
|---|---|---|
| 오픈 스코프 | **8월 오픈 범위 포함** | 대표 지시 (상위 설계서 §7 D-6 "제외" 판정을 **번복**) |
| 기존 피드 광고 | 근접푸시와 **함께 재개** (P-1 해제) | 대표 지시 |
| D-3 반경 | notify 300m / visit 50m / dwell 120s | 상위 설계서 §8 |
| D-4 상한 | ~~daily_notify_cap 5~~ → **daily_notify_cap 2**(같은 날 후속 리서치로 재확정, `research/260810_proximity_ad_contract_research/`) / cooldown 24h / daily_rp_cap 3 | 상위 설계서 §8 |
| D-5 RP | 10 RP/방문 (미확정, 참고) | 본 문서 범위 밖 |
| 집계 | `ad_events.surface='proximity'` → 기존 `ad_daily_stats` 통합, 기존 광고주 대시보드에 노출 | 상위 설계서 §2, §5-1 |

> **문서 상태 충돌 주의**: 상위 설계서 §7·§8 D-6 은 아직 "오픈 범위 **제외**"로 적혀 있다. 대표 지시가 이를 뒤집었으므로 **`260806_proximity_ad_design.md` §7/§8 을 함께 갱신해야 한다.** 본 문서만 갱신하면 두 문서가 상충한다 (GPS 정책 3회 반전과 같은 유형).

### 0-2. 명시적 가정 (틀리면 결론이 바뀜)

- **A-1.** 결제 수단은 계속 **오프라인 입금 + admin 수동 토글**이다. PG/카드 연동은 이 레포에 없다 (조사 확인: `backend/app/routers/admin_api/biz.py:770-790` `activate-subscription` 이 유일한 과금 개시 경로).
- **A-2.** 8월 오픈 시점 유료 가맹점 수는 **수십~수백 건 규모**(P-3 알바 사전등록 320건 계획). 즉 초기에는 **광고주 수도 적고 이벤트 볼륨도 작다** → 정교한 사용량 과금의 정확도 요구가 낮다.
- **A-3.** 근접푸시의 희소 자원은 **광고 지면이 아니라 사용자 알림 쿼터**다 (`daily_notify_cap=2`, 2026-08-10 재확정). 즉 "누구에게 파느냐"보다 **"하루 2칸을 어떻게 배분하느냐"** 가 계약 설계의 실질이다.
- **A-4.** 가격 숫자(VND)는 본 문서에서 **제안만** 한다. 확정은 대표 소관.

### 0-3. 현재 계약 자산 (코드 확인 결과)

```
ad_tiers            : 프리미엄(weight 3) / 일반(weight 1), monthly_price_vnd 둘 다 0
                      → database/init/149_ads_tiers.sql:13-17
tier 가 파는 것     : "피드/마켓 목록 광고자리 순번 가중치" 하나뿐
                      → database/init/155_ad_tier_features.sql:14-28 (카피 4줄 전부 노출 순번 얘기)
과금 상태            : marketplace_ads.subscription_status (pending_payment/active/expired)
                      → database/init/151_biz_verification.sql:61-71
가격 스냅샷          : marketplace_ads.monthly_price_snapshot_vnd (가입 시점 tier 가격 고정)
                      → database/init/149_ads_tiers.sql:20, application.py:208
활성화              : AdsApplication.activate_subscription() — admin 입금확인 후 1회 토글
                      → backend/app/modules/ads/application.py:426-435
가중치 계산          : compute_weights = exposure_weight × ad_fee (ad_fee 는 전건 1)
                      → backend/app/services/ad_exposure.py:16-18
```

**핵심 관찰: 지금 계약 모델은 "정액 월구독 1종 × tier 2단계"가 전부다.** 사용량·잔액·크레딧 개념이 **하나도 없다.** 이게 옵션 C 평가의 출발점이다.

### 0-4. 조사에서 나온 별건 결함 (계약 형태와 무관하게 선행 수정 필요)

`launching_ad_conditions()` (`backend/app/services/ad_gating.py:32-50`) 는 노출 게이트로 `review_status=APPROVED`, `is_active`, 게시기간, 소유 파트너 `verified` 4가지만 본다. **`subscription_status` 를 보지 않는다.**

- 현재(피드 광고): 입금 전(`pending_payment`)에도 노출된다. 손실은 "공짜 노출" 정도다.
- **근접푸시에서는 등급이 다르다** — 푸시는 **취소 불가**다. 미입금 상태로 푸시가 나가면 회수할 수 없고, 사용자 일일 쿼터(5칸)를 미납 광고주가 소진한다.

> **결정 필요 (어느 옵션을 고르든 공통)**: 근접 경로의 후보 쿼리에는 `subscription_status = 'active'` 조건을 **반드시 추가**한다. 피드 광고의 기존 동작은 건드리지 않는다(회귀 방지 — 카파시 §3).

---

## 옵션 A — tier 내장 속성

### A-1. 개념

"근접알림"을 별도 상품이 아니라 **프리미엄 tier가 제공하는 기능**으로 정의한다. 지금 tier 가 파는 것이 "노출 순번 3배" 하나뿐이라, 여기에 두 번째 가치를 얹는 구조다.

```
일반    : 목록 광고자리 노출 (순번 1배)                     — 저가
프리미엄 : 목록 광고자리 노출 (순번 3배) + 근접알림 발송      — 고가
```

### A-2. 스키마 변경

```sql
-- 174_ad_tiers_proximity.sql (신규, 멱등)
ALTER TABLE ad_tiers
  ADD COLUMN IF NOT EXISTS proximity_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE ad_tiers SET proximity_enabled = TRUE, updated_at = NOW()
 WHERE id = '00000000-0000-4000-8000-000000000001';  -- 프리미엄

-- 가격 확정 (150_ad_tier_prices.sql 의 id 고정 UPDATE 패턴 그대로)
UPDATE ad_tiers SET monthly_price_vnd = <프리미엄가>, updated_at = NOW()
 WHERE id = '00000000-0000-4000-8000-000000000001';
UPDATE ad_tiers SET monthly_price_vnd = <일반가>, updated_at = NOW()
 WHERE id = '00000000-0000-4000-8000-000000000002';

-- features_json 카피 갱신 (155 패턴 — 가짜 수치 금지, 코드 확인값만)
UPDATE ad_tiers SET features_json = jsonb_build_array(
  '적극적으로 알려서 부가가치를 만들고 싶은 가게용 플랜',
  '광고 자리 순번을 일반 플랜의 3배로 배정하는 설계 (노출 가중치 3 : 1)',
  '목록 6개마다 열리는 광고 자리에, 한쪽으로 몰리지 않게 고르게 분산 배치',
  '홈 탭과 마켓 탭 목록 두 곳에 함께 실리는 구성',
  '가게 반경 300m 안에 들어온 라이더에게 알림을 보내는 구성 (한 사람에게 24시간에 1번까지)'
), updated_at = NOW()
 WHERE id = '00000000-0000-4000-8000-000000000001';
```

**추가 컬럼 0개** — `marketplace_ads` 는 손대지 않는다. `monthly_price_snapshot_vnd` 가 이미 가입 시점 가격을 고정하므로, 근접 포함 여부의 대가도 그 스냅샷 안에 들어간다. **가격 진실이 한 곳이다.**

> 선택: 후속에 `ad_tiers.proximity_daily_cap INTEGER` (tier별 발송 상한)도 가능하나, `proximity_policy.daily_notify_cap` (사용자 단위 상한)이 이미 스팸을 막으므로 **오픈 범위에서는 불필요**(카파시 §2 — 요청 이상 금지).

### A-3. 기존 로직과의 충돌

**충돌 없음.** 근접 후보 쿼리에 JOIN 조건 하나가 늘 뿐이다.

```python
# modules/proximity — 후보 조회 (신규 코드, 기존 파일 무수정)
select(MarketplaceAd, AdTier)
  .join(AdTier, AdTier.id == MarketplaceAd.tier_id)
  .where(
      *launching_ad_conditions(now),                    # 기존 헬퍼 재사용
      AdTier.proximity_enabled == True,                 # ← 추가
      MarketplaceAd.subscription_status == "active",    # ← §0-4 게이트
      func.ST_DWithin(BusinessProfile.geom, point, radius),
  )
```

- `compute_weights` / `build_exposure_sequence` (`ad_exposure.py:16-46`): **무수정.** 후보가 여러 건 경합할 때 그대로 호출하면 프리미엄끼리의 순번 배분이 자동으로 성립한다 (전건 프리미엄이므로 weight 가 전부 3 → gcd 나눗셈으로 1:1, 정상 동작).
- `AdsApplication` (`application.py`): `WeightedAd`/`TierRead` 에 `proximity_enabled` 필드 1개 추가(선택). `public_ads()` 등 기존 메서드는 무수정.
- `_tier_read()` 에 필드 1개 추가 시 tier 목록 API 응답에 자동 반영 → 프론트 플랜 선택 화면이 근접 포함 여부를 표시할 수 있다.

### A-4. 광고주 이해도 (BizManage.tsx 대비)

**가장 이질감 없다.** 광고주가 보는 흐름은 지금과 동일하다:

```
BizManage "내 광고" (BizManage.tsx:454-495)
  → [광고 등록] → 플랜 선택 (features_json 카피 4줄 → 5줄)
  → 심사 → 입금 → 게시중
```

새 화면·새 결제 단계·새 상태가 **하나도 없다.** 카피 한 줄이 늘 뿐이다. 베트남 소상공인 대상 첫 상품으로서 "월 얼마 내면 이만큼"이 한 문장으로 끝나는 것이 실질적 이점이다.

### A-5. 정산/분쟁 리스크 — **최저**

상위 설계서 §3-2 의 경고("정산 근거가 두 곳으로 갈라지면 과금 분쟁")를 **구조적으로 회피**한다:

- **청구 금액 = `monthly_price_snapshot_vnd` 하나.** 이벤트 카운트는 청구서가 아니라 **성과 리포트**로만 쓰인다.
- `ad_daily_stats` 의 `surface='proximity'` 행이 몇 건이든 **청구액이 변하지 않는다** → 집계 누락·중복이 발생해도 **환불 분쟁이 아니라 리포트 정정**으로 끝난다.
- 이는 `ad-performance-metrics.md:308` 의 "비용 지표는 저장하지 않는다 — CPM/CPC/CPA 는 `monthly_price_snapshot_vnd` 와 기간으로 조회 시 계산" 원칙과 **완전 정합**한다. 가격이 하나면 CPM 분모도 하나다.

**남는 분쟁 씨앗 1개**: "프리미엄 샀는데 알림이 하루 2건밖에 안 나갔다." → 정액 상품은 **성과를 보장하지 않는다**는 문구가 약관에 필요하다 (`ad-performance-metrics.md:538` 이 이미 "광고 계약 문서 **미작성**"으로 지적한 항목).

### A-6. 구현 난이도 — **최저 (1~2일)**

| 작업 | 규모 |
|---|---|
| 마이그레이션 SQL 1개 | 컬럼 1 + UPDATE 3 |
| `models.py` `AdTier` 필드 1줄 | 1줄 |
| `TierRead`/`_tier_read` 필드 1개 | 2줄 |
| 근접 후보 쿼리 WHERE 2줄 | 신규 모듈 내부 |
| features_json 카피 + i18n(vi/ko/en) | 카피 작업 |
| **기존 노출 가중치 코드** | **0줄 수정** |

### A-7. A의 실질 쟁점 — 가격 재산정

> **질문(원문)**: "두 tier 가격이 둘 다 0인 상태에서 근접푸시를 넣으려면 가격을 어떻게 다시 매길 것인가? 일반 tier 구독자가 '근접푸시 없는 대신 싸다'를 원할 수도 있다."

**지금이 오히려 가장 좋은 타이밍이다.** 두 tier 가격이 **둘 다 0**이고(`149_ads_tiers.sql:15-16`), 유료 광고주가 **0건**이며(P-3), 노출도 꺼져 있다(P-1). **재산정 대상 기존 계약이 존재하지 않는다** — 가격 인상 통보도, 스냅샷 소급 문제도 없다. 근접푸시를 tier에 넣을 수 있는 창은 **오픈 전 지금뿐**이다. 오픈 후에는 기존 구독자의 `monthly_price_snapshot_vnd` 가 고정돼 있어 tier 정의 변경이 곧 "같은 값 내고 다른 걸 받는 사람"을 만든다.

**가격 구조 제안** (숫자는 대표 확정 대상 — A-4 가정):

| tier | 파는 것 | 성격 |
|---|---|---|
| 일반 | 목록 노출(순번 1배)만 | **진입 상품.** 낮은 가격, "우리 가게가 앱에 있다"는 존재 증명 |
| 프리미엄 | 순번 3배 + 근접알림 | **주력 상품.** 근접알림이 유일한 차별점이자 가격 근거 |

두 tier 가격차는 **근접알림의 가치 그 자체**로 설명된다. "일반이 싸서 좋다"는 니즈는 그대로 충족된다 — 일반 tier는 없애지 않고, **오히려 근접알림이 프리미엄으로 빠지면서 일반 tier의 저가 포지션이 명확해진다** (지금은 "3배냐 1배냐"라는 약한 차이뿐이라 일반 tier의 존재 이유가 흐릿하다).

**A-3 가정과의 연결**: 하루 2칸(2026-08-10 재확정, 원래 5칸)이라는 알림 쿼터는 희소 자원이다. 이걸 **프리미엄 구독자에게만 개방**하면 자원 경합이 완화되고(프리미엄 구독자 수 ≪ 전체 광고주 수), 동시에 프리미엄의 가격 정당성이 생긴다. 전 tier에 개방하면 쿼터 경합이 심해져 **"돈 냈는데 순번에 밀려 못 나갔다"** 분쟁이 오히려 늘어난다.

### A-8. A의 약점 (정직하게)

1. **번들 강제.** "노출은 필요 없고 근접알림만 원한다"는 가게(예: 골목 안 정비소 — 목록보다 지나가는 라이더가 중요)가 프리미엄 전체를 사야 한다. → 완화: 후속에 옵션 B로 승격(A-9).
2. **가격 협상 여지가 없다.** 정액 2단계뿐이라 큰 가맹점·체인에 맞춘 상품이 없다.
3. **성과 무보장.** 정액이므로 알림이 0건 나가도 요금이 같다. 초기 사용자 수가 적을 때(오픈 직후) 광고주 체감 가치가 낮을 수 있다. → 완화: 오픈 초기 프리미엄 무료/할인 프로모션.

### A-9. A → B 승격 경로 (중요)

A는 B의 **부분집합**이며, 나중에 **컬럼 1개로 승격**된다. 버리는 작업이 없다.

```sql
-- 훗날 add-on 이 필요해지면:
ALTER TABLE marketplace_ads
  ADD COLUMN IF NOT EXISTS proximity_override BOOLEAN NULL;  -- NULL = tier 기본값 따름

-- 판정: COALESCE(marketplace_ads.proximity_override, ad_tiers.proximity_enabled)
```

기존 구독자는 `NULL` → tier 기본값 그대로 동작(무회귀). 개별 판매가 필요한 건만 `TRUE`. **A를 먼저 하는 것은 B로 가는 길을 막지 않는다.**

---

## 옵션 B — 별도 add-on 상품

### B-1. 개념

tier와 무관하게 "근접알림 패키지"를 월정액으로 추가 구독한다. 일반 tier + 근접알림 조합이 가능해진다.

### B-2. 스키마 — 두 갈래

#### B-경량: `marketplace_ads` 컬럼 2개

```sql
ALTER TABLE marketplace_ads
  ADD COLUMN IF NOT EXISTS proximity_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS proximity_price_snapshot_vnd INTEGER NOT NULL DEFAULT 0
    CHECK (proximity_price_snapshot_vnd >= 0);
```

> 질문 원문("`proximity_enabled BOOLEAN` 하나만 추가해도 되는가?")에 답하면: **불린 하나만으로는 부족하다.** 가격 스냅샷이 없으면 add-on 요금이 `ad_tiers` 현재값을 조회하게 되고, 관리자가 가격을 올리는 순간 **기존 구독자의 과거 청구액이 소급 변경**된다. `monthly_price_snapshot_vnd` 가 존재하는 이유(`149:20`)와 정확히 같은 이유로 스냅샷이 필수다.

#### B-정식: 애드온 테이블 2개

```sql
CREATE TABLE IF NOT EXISTS ad_addons (
    id                UUID PRIMARY KEY,
    code              VARCHAR(40) NOT NULL UNIQUE,   -- 'PROXIMITY_PUSH'
    name              VARCHAR(80) NOT NULL,
    monthly_price_vnd INTEGER NOT NULL DEFAULT 0 CHECK (monthly_price_vnd >= 0),
    features_json     JSONB NULL,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    display_order     SMALLINT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_ad_addons (
    ad_id                UUID NOT NULL REFERENCES marketplace_ads(id) ON DELETE CASCADE,
    addon_id             UUID NOT NULL REFERENCES ad_addons(id) ON DELETE RESTRICT,
    price_snapshot_vnd   INTEGER NOT NULL DEFAULT 0,
    subscription_status  VARCHAR(20) NOT NULL DEFAULT 'pending_payment'
        CHECK (subscription_status IN ('pending_payment','active','expired')),
    starts_at            TIMESTAMPTZ NULL,
    ends_at              TIMESTAMPTZ NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ad_id, addon_id)
);
```

### B-3. 기존 로직과의 충돌 — 없음, 단 "구독 상태 이중화"

가중치 로직(`ad_exposure.py`)과는 **무충돌**이다 (A와 동일하게 후보 쿼리 WHERE 조건일 뿐).

**진짜 문제는 다른 데 있다 — `subscription_status` 가 두 개가 된다.**

```
현재:   광고 1건 = 구독 상태 1개 = admin 토글 1번
B 이후: 광고 1건 = 본구독 상태 1개 + 애드온 구독 상태 1개 = admin 토글 2번
```

파급:
- `activate_subscription()` (`application.py:426-435`) 이 **애드온용으로 하나 더** 필요 (또는 파라미터 확장).
- admin API `POST /ads/{id}/activate-subscription` (`admin_api/biz.py:770-790`) 과 대응 화면(`admin-frontend/src/pages/biz/BizAdDetailPage.tsx:68-105`, `BizAdListPage.tsx:129-158`) 이 상태 2개를 다뤄야 한다.
- 상태 조합 4가지(본구독×애드온 각 pending/active)에 대한 노출 판정 매트릭스가 생긴다. "본구독 미납 + 애드온 납부"는 어떻게 동작하나? → **일어날 수 있는 시나리오**라 에러 처리가 실제로 필요하다(카파시 §2 면제 대상 아님).

### B-4. 광고주 이해도 — 보통

BizManage 광고 상세에 토글 한 줄이 늘어난다. 개념 자체("추가 기능 구독")는 통신사 부가서비스와 같아 베트남에서도 낯설지 않다.

다만 **입금을 두 번 받는 흐름**이 생기면 이해도가 급락한다 — "광고비 냈는데 왜 알림이 안 나가요?"는 오픈 직후 CS 1순위가 될 가능성이 높다. 완화하려면 **본구독 + 애드온을 한 번에 청구/한 번에 활성화**해야 하는데, 그러면 사실상 A(번들)와 같아진다.

### B-5. 정산/분쟁 리스크 — 중간

- 청구액은 여전히 **정액 합계**(`monthly_price_snapshot_vnd + proximity_price_snapshot_vnd`)라 이벤트 카운트가 청구서가 되지는 않는다. C보다 훨씬 안전하다.
- **다만 가격이 두 개가 되면서 CPM/CPC 분모가 모호해진다.** `ad-performance-metrics.md:308` 은 "CPM/CPC/CPA 는 `monthly_price_snapshot_vnd` 와 기간으로 조회 시 계산"이라고 **단수 가격을 전제**한다. surface='proximity' 성과의 비용 분모를 애드온 가격으로 할지 합계로 할지 **규칙을 새로 정의**해야 하며, 이 규칙이 문서화되지 않으면 그대로 분쟁 씨앗이 된다.
- 부분 기간 문제: 애드온만 중도 해지하면 일할 계산이 필요하다. 현재 시스템에 일할 계산 개념이 없다.

### B-6. 구현 난이도 — 중 (경량 3~4일 / 정식 1~2주)

경량안이라도 admin 토글 2개, 프론트 애드온 선택 UI, 노출 판정 매트릭스, i18n 3개 국어가 붙는다. **8월 오픈에 넣기에는 A 대비 명확히 무겁고, 얻는 것은 "일반 tier + 근접알림" 조합 하나뿐이다.**

---

## 옵션 C — 건별 과금 (사용량제)

### C-1. 개념

알림 발송 건수 또는 방문 확정 건수만큼 과금한다. 선불 충전 후 차감.

### C-2. 필요한 스키마 (전부 신규)

```sql
-- 단가
CREATE TABLE IF NOT EXISTS ad_usage_rates (
    id                     SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    proximity_notify_vnd   INTEGER NOT NULL DEFAULT 0,   -- 알림 1건당
    proximity_visit_vnd    INTEGER NOT NULL DEFAULT 0,   -- 방문 확정 1건당
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 광고주 잔액 (engine XpBalance 패턴 미러)
CREATE TABLE IF NOT EXISTS ad_credit_balance (
    business_profile_id UUID PRIMARY KEY REFERENCES business_profile(id) ON DELETE CASCADE,
    balance_vnd         BIGINT NOT NULL DEFAULT 0 CHECK (balance_vnd >= 0),
    lifetime_charged    BIGINT NOT NULL DEFAULT 0,
    lifetime_spent      BIGINT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- append-only 원장 (engine GcTransaction 패턴 미러)
CREATE TABLE IF NOT EXISTS ad_credit_transaction (
    id                  BIGSERIAL PRIMARY KEY,
    business_profile_id UUID NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
    tx_type             VARCHAR(20) NOT NULL,   -- 'charge' | 'debit' | 'refund' | 'adjust'
    amount_vnd          BIGINT NOT NULL,
    balance_after_vnd   BIGINT NOT NULL,
    source_type         VARCHAR(24) NULL,       -- 'proximity_notify' | 'proximity_visit' | 'admin_deposit'
    source_id           BIGINT NULL,            -- proximity_hit.id
    idempotency_key     VARCHAR(64) NULL UNIQUE,
    admin_id            UUID NULL,
    memo                TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON ad_credit_transaction (source_type, source_id)
  WHERE source_id IS NOT NULL;   -- 이중 차감 방지
```

추가로 `marketplace_ads.billing_mode VARCHAR(12)` (`subscription` | `usage`) 로 정액/사용량 광고를 구분해야 한다 — 기존 광고 전건은 `subscription`.

### C-3. **이 레포에 광고주용 잔액 인프라가 전무하다** (조사 결과)

`database/init/*.sql` 173개 전체 + `backend/app/models.py` 를 `prepaid|credit|balance|wallet|ledger|metering` 키워드로 훑은 결과:

- **광고주(B2B) 잔액/크레딧/충전/차감 테이블: 0건.**
- 존재하는 유일한 원장은 **사용자용 RP/XP** — `engine/app/models.py:143-206` (`XpBalance` / `XpTransaction` / `GcTransaction`).
- 그런데 **BFF 는 Engine DB 테이블 직접 접근 금지**(CLAUDE.md 핵심 제약)다. 광고는 BFF 소유(`marketplace_ads`, `ad_tiers`)이므로 **Engine 원장을 재사용할 수 없다.** BFF 쪽에 원장을 새로 만들거나, 광고 과금을 Engine으로 옮겨야 하는데 후자는 `sre-design-spec.md:75` "결제는 엔진 out-of-scope" 와 충돌한다.
- **충전 수단도 없다.** A-1 가정대로 전 과금이 오프라인 입금 + admin 수동 토글이므로, 선불 충전 역시 "입금 확인 → admin이 크레딧 수동 적립" 이 된다. 즉 **admin 운영부하가 광고주 수 × 충전 횟수로 증가**한다 (정액은 광고주당 월 1회).

> **리스크로 기록**: C는 재사용할 코드가 사실상 0이다. `GcTransaction` (`engine/app/models.py:185-206`) 이 좋은 **설계 참고 패턴**(잔액 컬럼 + append-only tx + `balance_after` 스냅샷 + `source_type/source_id` origin 추적)이지만, 다른 서비스에 있어 **패턴만 베끼고 코드는 새로 쓴다.**

### C-4. 기존 로직과의 충돌 — 큼

- `build_exposure_sequence` 는 **weight 기반**이다. 사용량 과금에서는 "잔액이 있는 광고주만 후보" + "입찰가(단가) 기반 순위"가 자연스러운데, 이는 weight 순번 배분과 **다른 알고리즘**이다. 두 모델이 공존하면 `compute_weights` 를 우회하는 두 번째 선택 경로가 생긴다.
- `monthly_price_snapshot_vnd` 기반 CPM 계산(`ad-performance-metrics.md:308`)이 usage 광고에는 **적용 불가** → 대시보드 비용 지표가 billing_mode별로 분기한다.
- 잔액 소진 시 노출 즉시 중단 로직 필요 → `launching_ad_conditions` 에 잔액 조건이 붙거나 별도 게이트가 생긴다.

### C-5. 정산/분쟁 리스크 — **최고**

**상위 설계서 §3-2 경고가 정확히 겨냥한 지점이다.** 건별 과금은 `ad_events`/`ad_daily_stats` 를 **성과 리포트에서 청구서로 승격**시킨다. 그 순간:

1. **집계 파이프라인이 미구현이다.** `ad_events` 수집 엔드포인트도, `jobs/rollup_ad_stats.py` 도 **파일 자체가 존재하지 않는다** (`153_ad_events.sql:5-6`, `154_ad_daily_stats.sql:6-7` 주석이 명시, `backend/app/jobs/` 실 파일 목록에 없음). 즉 **청구 근거 파이프라인을 0에서 만들면서 동시에 그것으로 돈을 받는다.**
2. **이벤트 드롭 정책이 곧 돈이 된다.** `ad-performance-metrics.md:242` 는 게시 중지 상태 이벤트를 서버에서 드롭한다고 정의하는데, 정액에서는 리포트 정확도 문제였던 것이 사용량제에서는 **환불 청구 사유**가 된다.
3. **푸시는 회수 불가다.** 알림 발송 건당 과금인데 FCM 발송 실패·기기 미수신을 광고주가 문제 삼으면, "발송 시도"와 "도달"을 구분하는 계측이 필요하다. 현재 없다.
4. **방문 확정 건당 과금은 더 위험하다.** 방문 판정은 GPS 기반이고 상위 설계서 R-2가 "GPS 스푸핑 = 금전 탈취"로 이미 경고했다. **사용자 RP 탈취 + 광고주 과다 청구가 동시에 발생**한다 — 공격 1회에 피해 2건. 광고주가 "이 방문은 조작"이라 주장하면 반증 책임이 우리에게 생긴다.

### C-6. 구현 난이도 — 최대 (3~5주+)

신규 테이블 3~4개 + 원장 트랜잭션 정합성 + 멱등 차감 + admin 충전 화면 + 잔액 부족 처리 + 대시보드 분기 + P-2(계측) 선행 완성. **8월 오픈 범위에 넣을 수 없다.**

### C-7. C가 정당해지는 조건

- 광고주가 수백~수천 건이 되어 정액 2단계로 지불의사 스펙트럼을 못 담을 때
- P-2 계측이 **검증된 상태로 수개월 운영**되어 집계 신뢰도가 증명됐을 때
- QR 스캔 방문 확정(상위 설계서 R-2 대안, `html5-qrcode` 이미 의존성 보유)으로 위조 리스크가 제거됐을 때
- 온라인 결제 수단이 도입돼 자동 충전이 가능할 때

**즉 C는 v2/v3 상품이지 v1 상품이 아니다.**

---

## 비교표

| 기준 | A. tier 내장 | B. add-on | C. 건별 과금 |
|---|---|---|---|
| 스키마 변경 | 컬럼 **1개** | 컬럼 2개 / 테이블 2개 | 테이블 **3~4개** + 컬럼 |
| `ad_exposure.py` 수정 | **0줄** | 0줄 | 알고리즘 분기 필요 |
| `AdsApplication` 수정 | 필드 1개 | 활성화 메서드 확장 | 대폭 |
| admin 흐름 | 변화 없음 | 토글 2개 | 충전 화면 신규 |
| 광고주 이해도 | **매우 쉬움** (카피 1줄) | 보통 (입금 2회 리스크) | 어려움 (잔액 개념) |
| 청구 근거 | 정액 스냅샷 **1개** | 정액 스냅샷 2개 | **이벤트 카운트** |
| 분쟁 리스크 | **낮음** | 중간 (CPM 분모 모호) | **높음** (집계=청구서) |
| P-2 계측 의존 | 없음 (리포트용) | 없음 | **필수 선행** |
| 8월 오픈 | **가능** | 빠듯 | **불가** |
| 가격 유연성 | 낮음 (2단계) | 중간 | 높음 |
| 승격 경로 | → B (컬럼 1개) | → C | — |

---

## 추천 — 옵션 A (tier 내장 속성)

### 추천 근거

1. **8월 오픈 제약이 지배적이다.** A는 컬럼 1개 + 카피 갱신이면 끝나고 기존 가중치 코드를 한 줄도 안 건드린다. B는 admin 흐름이 2배가 되고, C는 미구현 계측 파이프라인(`jobs/rollup_ad_stats.py` **파일 없음**) 위에 청구를 얹는 구조라 착수 자체가 불가하다.

2. **청구 근거 단일화가 이 프로젝트의 최우선 방어선이다.** 상위 설계서 §3-2 는 "머니 경로 이중화는 이 프로젝트에서 가장 비싼 실수 유형"이라고 못박았다. A는 **집계가 틀려도 청구가 틀리지 않는** 유일한 옵션이다. 첫 광고 상품에서 과금 분쟁이 터지면 P-3 로 힘들게 모은 가맹점 신뢰가 한 번에 날아간다.

3. **가격을 다시 매길 수 있는 창이 지금뿐이다.** 두 tier 가격이 **둘 다 0**이고(`149:15-16`) 유료 광고주가 **0건**이다. 기존 계약도 스냅샷도 없다. 오픈 후에는 `monthly_price_snapshot_vnd` 고정 때문에 tier 정의 변경이 곧 형평성 문제가 된다.

4. **지금 tier는 팔 것이 약하다.** `155_ad_tier_features.sql:14-28` 의 카피 4줄이 전부 "노출 순번" 얘기다. 근접알림은 tier에 **처음 생기는 진짜 차별점**이고, 이걸 프리미엄에 붙이면 프리미엄의 가격 근거와 일반의 저가 포지션이 **동시에** 명확해진다.

5. **되돌릴 수 있다.** A→B 승격이 `marketplace_ads.proximity_override BOOLEAN NULL` 컬럼 1개(§A-9)로 끝난다. A를 먼저 해도 버려지는 작업이 없다. 반대로 B/C를 먼저 하면 오픈이 밀린다.

### 추천안에 반드시 따라붙는 3가지

| # | 항목 | 이유 |
|---|---|---|
| **G-1** | 근접 후보 쿼리에 `subscription_status='active'` 조건 추가 | §0-4. **푸시는 회수 불가** — 미납 광고주가 사용자 일일 쿼터 5칸을 소진하는 것을 막는다. 피드 광고 기존 동작은 무변경 |
| **G-2** | 광고 계약 문구에 "정액 상품은 발송 건수를 보장하지 않는다" 명시 | `ad-performance-metrics.md:538` 이 이미 "광고 계약 문서 **미작성**"으로 지적 |
| **G-3** | 위치 이력(`proximity_hit.hit_lat/lng`) 개인정보처리방침 반영 | 상위 설계서 R-5. `260802_legal_review_request.md` 항목 추가 |

### 대표 결정이 필요한 항목

| # | 항목 | 선택지 |
|---|---|---|
| **D-7** | 계약 형태 | **A(추천)** / B / C |
| **D-8** | 프리미엄 월 요금 (VND) | 미정 — A는 이 숫자가 확정돼야 출고 가능 |
| **D-9** | 일반 월 요금 (VND) | 미정 |
| **D-10** | 오픈 초기 프리미엄 프로모션 | 무료 N개월 / 할인 / 없음 (§A-8-3 완화책) |
| **D-11** | 일반 tier에도 근접알림을 줄 것인가 | 안 줌(추천, §A-7) / 줌 — 주면 A의 가격 근거가 소멸한다 |

### 반대 의견 (정직하게)

A를 고르면 **"근접알림만 사고 싶다"는 수요를 초기에 못 받는다.** 근접알림은 목록 노출보다 골목 상권에 더 잘 맞는 상품이라, 정작 가장 원하는 가게가 프리미엄 전체 가격에 막힐 수 있다. 이 수요가 영업 현장에서 실제로 크다는 신호가 나오면 **A-9 경로로 즉시 B로 승격**하는 것이 답이고, 그 비용은 컬럼 1개다. 그래서 A로 시작하는 것이 이 수요를 **포기하는 것이 아니라 연기하는 것**이다.

C는 장기적으로 가장 공정한 과금 모델이 맞다. 다만 **집계 파이프라인이 코드로 존재하지 않는 상태에서 그 집계로 청구서를 발행하는 것**이 문제지, 모델 자체가 틀린 게 아니다. §C-7 조건이 충족되면 재검토 가치가 있다.

---

## 후속 문서 갱신 필요

- [`260806_proximity_ad_design.md`](260806_proximity_ad_design.md) §7 · §8 D-6 — "오픈 범위 **제외**" → 대표 지시로 **포함** 확정. D-3/D-4 결정값도 반영. **본 문서와 상충 상태**
- [`spec/ad-performance-metrics.md`](spec/ad-performance-metrics.md) — `surface='proximity'` 추가 시 §4/§7 지표 정의, `:538` 광고 계약 문구(G-2)
- `database/init/155_ad_tier_features.sql` — 근접 카피 추가 시 가짜 수치 금지 원칙(`:3`) 유지, i18n vi/ko/en 동시 갱신
- `260802_legal_review_request.md` — 위치 이력 보관·동의(G-3)
