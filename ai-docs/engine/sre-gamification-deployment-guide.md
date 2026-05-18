# Saigon Rider — 게이미피케이션 통합 배포 가이드 v2.0

> 발행일: 2026-05-18
> 핵심 변경 (v1.1 → v2.0): **RPG 경제 패러다임 도입**
> - 미션은 통화(GP/GC) 파밍이 본업, 아이템 직접 지급은 시즌 정복자(7개)만
> - 신규 시스템: **가챠 5종 + 상점 구매 + 일일 추천 + 천장**
> - 14개 결과물을 순서대로 적용하면 v1 완성

---

## 0. RPG 경제 코어 루프

```
                ┌──── 라이딩 / 미션 클리어 ────┐
                │                              │
                ▼                              │
            GP / GC 적립                       │
                │                              │
        ┌───────┴────────┐                     │
        ▼                ▼                     │
  ┌─ 상점 구매 ─┐   ┌─ 가챠 5종 ─┐              │
  │ 원하는 아이템 │   │ 도박성 재미 │              │
  │ 직접 선택    │   │ 천장 + 10연 │              │
  └──────┬──────┘   └──────┬──────┘             │
         │                 │                    │
         └────────┬────────┘                    │
                  ▼                             │
            user_item (Soul-bound)              │
                  │                             │
                  ▼                             │
              착용 / 자랑                       │
                  │                             │
                  └────── 다음 라이딩 동기 ─────┘

* 미션 보상에서 아이템 직접 지급은 "시즌 정복자 + 주년 마일스톤"만 (7개/년)
  = 보스 드랍 감성. 나머지는 모두 사용자가 의지로 얻는다.
```

---

## 1. 결과물 목록 (총 14개)

| # | 파일 | 종류 | 라인 | 역할 |
|---|---|---|---:|---|
| 1 | `sre-mission-item-reward-spec.md` | 설계서 | 1,014 | 통합 설계 원문 (v1 베이스) |
| 2 | `migration-step1-alter.sql` | DDL | 134 | 기존 4테이블 ALTER |
| 3 | `migration-step2-new-tables.sql` | DDL | 345 | ENUM 6 + 테이블 10 |
| 4 | **`migration-step3-gacha-shop.sql`** | DDL | 245 | **신규: ENUM 1 + 테이블 5 (가챠/상점)** |
| 5 | `sre-action-definition-extension.sql` | DML | 138 | 신규 액션 14개 |
| 6 | `sre-item-seed.sql` | DML | 252 | 컬렉션 7 + 아이템 213 + 박스 8 |
| 7 | **`sre-gacha-seed.sql`** | DML | 130 | **신규: 가챠 5종 시드** |
| 8 | **`sre-mission-reward-bundle.sql`** | DML | 252 | **v2: 240 UPDATE (아이템 52→7, 박스 72→0)** |
| 9 | `sre-reward-dispatcher.sql` | 함수 | 834 | 미션 보상 디스패처 10개 함수 |
| 10 | **`sre-shop-gacha-functions.sql`** | 함수 | 595 | **신규: 가챠/상점 PL/pgSQL 6개 함수** |
| 11 | `sre-gamification-deployment-guide.md` | 가이드 | (this) | 본 가이드 |
| 12 | `item_definition.csv` | 검토용 | 214 | 213 아이템 검토 |
| 13 | `mission_reward_bundle.csv` | 검토용 | 241 | 240 미션 보상 검토 |
| 14 | `build_*.py` × 3 | 생성기 | - | 시드 재생성기 |

---

## 2. 적용 순서 (7단계, 한 번씩)

```bash
# Step 1: 기존 SRE 테이블 확장
psql -d sre -f migration-step1-alter.sql

# Step 2: 게이미피케이션 신규 테이블 (ENUM 6 + 테이블 10)
psql -d sre -f migration-step2-new-tables.sql

# Step 3: 가챠/상점 신규 테이블 (ENUM 1 + 테이블 5)
psql -d sre -f migration-step3-gacha-shop.sql

# Step 4: 신규 액션 코드 14개
psql -d sre -f sre-action-definition-extension.sql

# Step 5: 시드 데이터 적재
psql -d sre -f sre-item-seed.sql                  # 컬렉션 7 + 아이템 213 + 박스 8
psql -d sre -f sre-gacha-seed.sql                 # 가챠 5종
psql -d sre -f sre-mission-reward-bundle.sql      # 240 미션 reward_bundle v2

# Step 6: PL/pgSQL 함수 (16개)
psql -d sre -f sre-reward-dispatcher.sql          # 미션 보상 디스패처 10개
psql -d sre -f sre-shop-gacha-functions.sql       # 가챠/상점 6개

# Step 7: 시즌 1 활성화 (운영 시점)
psql -d sre -c "
INSERT INTO season (season_code, display_name, collection_code,
                     starts_at, ends_at, status,
                     max_level, sxp_per_level, daily_sxp_cap)
VALUES ('TET_S1', '2027 Tết Season', 'TET_FESTIVAL',
        '2027-01-15 00:00:00+07', '2027-02-28 23:59:59+07',
        'ACTIVE', 30, 100, 500);"
```

---

## 3. RPG 경제 인플레이션 시뮬레이션

**1년 동안 1유저가 모든 미션 풀클리어 시:**

| 항목 | 발행량 | 환산 |
|---|---:|---|
| GP | 181,820 | BASIC_PULL ~909회 OR PREMIUM_PULL ~121회 |
| GC | 1,835 | GC_PREMIUM ~61회 OR SEASON ~73회 OR LEGEND ~22회 |
| SXP | 25,252 | 시즌 패스 8개 시즌 만렙 가능 (Lv30 × 100) |
| 미션 아이템 | 7개 | 시즌 정복자 6 + 주년 1 (Mythic 포함 LEGEND 컬렉션) |

**평균 사용자(WAU 기준 50% 클리어율) 시:**
- GP ~90k → 상점 Common 30~60개 + 가챠 100회 정도
- GC ~900 → 시즌 가챠 36회 → Epic 10여 개

가챠 / 상점에서 빠지는 양은 사용자 의지에 달림. 미션이 100% 발행, 가챠·상점이 100% 소모하는 닫힌 경제.

---

## 4. 가챠 시스템 디테일

| 가챠 코드 | 통화 | 1회 | 10연 | 풀 | 천장 | 10연 보장 | 천장 리셋 |
|---|:---:|---:|---:|---|---:|---|---|
| BASIC_PULL | GP | 200 | 1,800 | C 70 / R 28 / E 2 | 없음 | Rare | - |
| PREMIUM_PULL | GP | 1,500 | 13,500 | R 65 / E 33 / L 2 | 100회 | Epic | 영구 |
| GC_PREMIUM_PULL | GC | 30 | 270 | R 50 / E 40 / L 9 / M 1 | 80회 | Epic | 영구 |
| SEASON_PULL | GC | 25 | 225 | R 60 / E 30 / L 9 / M 1 | 60회 | Epic | **시즌 종료 시** |
| LEGEND_PULL | GC | 80 | 720 | E 70 / L 25 / M 5 | 50회 | Legendary | 영구 |

**도박성 보호 장치:**
- 10연차 = 10% 할인 + 보장 등급 1개 포함
- 천장: 99회 연속 보장 등급 실패 시 100회차에서 강제 보장 → 카운터 리셋
- 중복 보유: 등급별 환산률로 GP 또는 GC 환원 (`_grant_item` 기존 로직 재사용)
- 시즌 가챠: 시즌 종료 시 천장 카운터 리셋 (시즌 끝물 압박 회피)

---

## 5. 상점 시스템

**기본 구매 흐름:**
```sql
SELECT purchase_shop_item(
  p_user_id   := 1001,
  p_item_code := 'HELMET_NEON_SAIGON_R_03',
  p_currency  := 'GP'   -- or 'GC'
);
```

**핵심 보호 규칙:**
- `is_shop_visible = FALSE` 아이템 (Mythic / Tết 한정 L+M) 구매 불가
- 시즌 잠금 아이템은 활성 시즌일 때만 구매 가능
- Soul-bound: 이미 보유 중인 아이템 재구매 EXCEPTION
- 잔액 부족 시 EXCEPTION (트랜잭션 자동 ROLLBACK)
- 모든 구매는 `shop_purchase_log`에 정가/할인/실비 기록

**일일 추천 (Daily Featured):**
```sql
-- 매일 자정에 실행 (스케줄러 권장)
SELECT refresh_daily_featured();
-- 등급 균형 자동 선정: C 1 + R 2 + E 1 = 총 4개, 30% 할인
```

사용자는 일일 추천 아이템을 보고 "오늘만 30% 할인이니까 사야지" 충동 구매 유도.

---

## 6. End-to-End 테스트 시나리오

### 시나리오 A: 신규 가입 → 라이딩 → 첫 가챠

```sql
-- 0) 유저 생성
INSERT INTO sre_user (external_user_uuid, account_type, status)
VALUES ('test-001', 'STANDARD', 'ACTIVE') RETURNING user_id;  -- 1001
INSERT INTO rp_balance (user_id) VALUES (1001);

-- 1) Onboarding 졸업 (O-MX-03)
INSERT INTO user_mission_progress (user_id, mission_id, current_value, target_value, status)
SELECT 1001, mission_id, 8, 8, 'COMPLETED'
  FROM mission_definition WHERE mission_code = 'O-MX-03'
RETURNING progress_id;  -- 9001

SELECT dispatch_mission_reward(9001);
-- 결과: GP +1500, GC +30, 아이템 0개

SELECT current_balance, gc_balance FROM rp_balance WHERE user_id = 1001;
-- GP=1500, GC=30

-- 2) BASIC_PULL 7회 (1500 / 200 = 7회 + 100 GP 남음)
SELECT pull_gacha(1001, 'BASIC_PULL', FALSE);  -- 200 GP 차감
SELECT pull_gacha(1001, 'BASIC_PULL', FALSE);
-- ... 7번

SELECT COUNT(*) FROM user_item WHERE user_id = 1001;
-- 기대: 약 5~7개 (중복은 GP 환원)
```

### 시나리오 B: 10연 PREMIUM_PULL (보장 동작 검증)

```sql
-- 미션으로 GP 15k 모음
UPDATE rp_balance SET current_balance = 15000 WHERE user_id = 1001;

-- 10연차 1회
SELECT pull_gacha(1001, 'PREMIUM_PULL', TRUE);
-- 결과: cost=13500, results 10개, 중 1개는 Epic 이상 보장
--      pity_count_after는 0~9 (Legendary 안 나오면 천장 카운터 누적)

-- 결과 검증
SELECT picked_rarity, was_10pull_guarantee, was_pity_hit
  FROM gacha_pull_log
 WHERE user_id = 1001 AND is_10_pull = TRUE
 ORDER BY pull_log_id DESC LIMIT 10;
```

### 시나리오 C: 천장 발동 (PREMIUM_PULL 100회)

```sql
-- 시뮬레이션: pity_count = 99로 강제 설정
UPDATE user_gacha_pity
   SET pity_count = 99
 WHERE user_id = 1001 AND gacha_code = 'PREMIUM_PULL';

-- 다음 1회 → Legendary 강제 보장
UPDATE rp_balance SET current_balance = 5000 WHERE user_id = 1001;
SELECT pull_gacha(1001, 'PREMIUM_PULL', FALSE);
-- 결과: picked_rarity=L, was_pity_hit=true, pity_count_after=0
```

### 시나리오 D: 상점 구매 + 일일 추천 할인

```sql
-- 1) 일일 추천 갱신
SELECT refresh_daily_featured();
SELECT item_code, discount_pct
  FROM daily_featured_item WHERE featured_date = CURRENT_DATE;

-- 2) 추천 아이템 구매 (30% 할인 적용)
UPDATE rp_balance SET current_balance = 100000 WHERE user_id = 1001;
SELECT purchase_shop_item(1001,
  (SELECT item_code FROM daily_featured_item
    WHERE featured_date = CURRENT_DATE LIMIT 1),
  'GP');
-- 결과: cost_amount = base_price * 70 / 100, was_featured=true

-- 3) 같은 아이템 재구매 시도 → EXCEPTION
SELECT purchase_shop_item(1001,
  (SELECT item_code FROM daily_featured_item
    WHERE featured_date = CURRENT_DATE LIMIT 1),
  'GP');
-- ERROR: item already owned (Soul-bound, 재구매 불가)
```

### 시나리오 E: 시즌 종료 → SEASON_PULL 천장 리셋

```sql
SELECT * FROM expire_season_boxes('TET_S1');     -- 박스 자동 개봉
SELECT reset_season_gacha_pity('TET_S1');         -- 가챠 천장 리셋

-- 검증
SELECT pity_count FROM user_gacha_pity
 WHERE gacha_code = 'SEASON_PULL' AND user_id = 1001;
-- 기대: 0
```

---

## 7. 운영 대시보드 핵심 쿼리

### 일일 발행/소모 (인플레 모니터링)

```sql
SELECT
  DATE(occurred_at) AS day,
  currency,
  SUM(amount) FILTER (WHERE tx_type = 'EARN')  AS earned,
  SUM(amount) FILTER (WHERE tx_type = 'SPEND') AS spent,
  SUM(amount) FILTER (WHERE tx_type = 'EARN')
    - SUM(amount) FILTER (WHERE tx_type = 'SPEND') AS net
FROM rp_transaction
WHERE occurred_at >= NOW() - INTERVAL '7 days'
GROUP BY day, currency
ORDER BY day DESC, currency;
-- net이 지속적으로 양수면 GP/GC가 사용자 잔고에 누적되어 인플레 발생 신호
-- → 가챠 가격 인상 또는 신규 매력 아이템 출시 검토
```

### 가챠별 ROI 분석

```sql
SELECT
  gacha_code,
  COUNT(*) AS pulls,
  COUNT(DISTINCT user_id) AS unique_users,
  AVG(CASE picked_rarity WHEN 'C' THEN 1 WHEN 'R' THEN 2 WHEN 'E' THEN 3
                          WHEN 'L' THEN 4 WHEN 'M' THEN 5 END) AS avg_rarity_score,
  SUM(CASE WHEN was_pity_hit THEN 1 ELSE 0 END) AS pity_hits,
  SUM(CASE WHEN was_duplicate THEN 1 ELSE 0 END) AS duplicates,
  ROUND(100.0 * SUM(CASE WHEN was_duplicate THEN 1 ELSE 0 END) / COUNT(*), 1)
    AS dup_rate_pct
FROM gacha_pull_log
WHERE pulled_at >= NOW() - INTERVAL '30 days'
GROUP BY gacha_code
ORDER BY pulls DESC;
-- dup_rate_pct가 60% 이상이면 풀이 좁다는 신호 → 아이템 추가 또는 컬렉션 신규
```

### 가챠 vs 상점 사용 비율

```sql
SELECT
  source,
  COUNT(*) AS purchases,
  COUNT(DISTINCT user_id) AS users
FROM (
  SELECT user_id, 'GACHA' AS source FROM gacha_pull_log
   WHERE pulled_at >= NOW() - INTERVAL '30 days'
  UNION ALL
  SELECT user_id, 'SHOP' AS source FROM shop_purchase_log
   WHERE purchased_at >= NOW() - INTERVAL '30 days'
) t
GROUP BY source;
-- 보통 가챠:상점 = 7:3 정도가 RPG 게임 통상치 (도박이 더 매력적)
```

### 천장 도달자 분포 (도박성 보호 정책 효과 측정)

```sql
SELECT
  gacha_code,
  pity_count,
  COUNT(*) AS users
FROM user_gacha_pity
WHERE total_pulls > 0
GROUP BY gacha_code, pity_count
ORDER BY gacha_code, pity_count DESC;
-- 천장(100/80/60/50) 직전에 사용자가 몰려있으면 "마지막 한 번"으로 결제 유도되는 중
```

---

## 8. 향후 작업 후보 (v3)

| 영역 | 확장 내용 |
|---|---|
| **합성 (Crafting)** | 중복 환원이 아니라 "파편(Shard)" 환원으로 변경 → 5×Common Shard = R 가챠 1회권 |
| **강화 (Enhancement)** | 아이템 +0 → +10 강화 시스템. 실패 시 등급 다운 / 파괴 (리니지 풍 도박성) |
| **거래소** | 동일 등급 1:1 교환 (현금 거래 차단) |
| **시즌 패스 Premium** | GC 결제로 Premium 트랙 해제 — 별도 모듈 |
| **GC IAP** | Apple/Google IAP 영수증 검증 후 GC 적립 |
| **픽업 캠페인** | 특정 아이템 확률 2배 (1~2주 한정) |
| **클라이언트 UI** | 가챠 연출, 상점 카탈로그, 인벤토리, 시즌패스 UI |

---

## 9. v1 → v2 변경 요약

| 항목 | v1 | v2 |
|---|---|---|
| 미션 보상 채널 | GP+GC+SXP+아이템+박스 (5개) | GP+GC+SXP가 메인, 아이템은 시즌 정복자만 |
| 아이템 직접 지급 미션 | 52개 | **7개** (87% 감소) |
| 박스 직접 지급 미션 | 72개 | **0개** (제거) |
| 신규 시스템 | - | **가챠 5종 + 상점 구매 + 일일 추천 + 천장** |
| 신규 테이블 | 10개 | **15개** (+5: gacha_definition, user_gacha_pity, gacha_pull_log, daily_featured_item, shop_purchase_log) |
| 신규 PL/pgSQL 함수 | 10개 | **16개** (+6) |
| 적용 SQL 파일 | 6개 | **8개** (+2: step3-gacha-shop, shop-gacha-functions) |

---

## 10. 한 줄 요약

> **미션은 골드를 발행한다. 사용자는 상점에서 사거나 가챠에서 도박한다. 시즌 정복자만 보스 드랍을 받는다. 리니지처럼.**

`Saigon Rider` 사용자는 이제 "오늘 라이딩 80km로 GP 1,500 모았으니 PREMIUM_PULL 한 번 굴려볼까" 같은 능동적 게임 경제 안에서 살게 됩니다.

---

(끝)
