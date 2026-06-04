# 재화 경제 체계 정립 보고서 (SGR-228)

> 작성: 2026-06-04 · 상태: 정립 완료 (RP·쿠폰·코스메틱·마일리지·레벨업·Gold 구현. 이벤트 RP·monthly_quota는 설계상 후속)
> 관련: [`sink-economy-design.md`](sink-economy-design.md) (사용처 설계) · Plane SGR-228 · Notion 260604
> 목적: 재화 3종의 상대 가치(비중)·산정 근거, 그에 따른 쿠폰 가격·획득처(퀘스트/마일리지/레벨업) 보상 조정 내역을 한 곳에 기록한다.

---

## 1. 재화 3종과 상대 가치(비중)

| 재화 | 성격 | 획득처 | 사용처(sink) |
|---|---|---|---|
| **RP (크리스탈)** | 행동 기반 프리미엄·희소 | 이벤트 퀘스트 (※데일리 0) | 쿠폰/기프티콘 교환, GC 가챠 |
| **골드 (Gold)** | 파밍 소프트 | 퀘스트 + 레벨업 | 아이템 상점, GP 가챠 |
| **스킬포인트 (SP)** | 성장 | 레벨업 | 스킬 트리 |

### 환율 (비중)

```
골드 100  :  스킬포인트 10  :  크리스탈(RP) 1
```

- **RP가 최상위 희소 재화**(1 RP = 골드 100의 가치). 따라서 RP 수치는 항상 골드보다 작게 유지한다.
- 비중의 의미: 같은 "가치 1단위"를 얻는 데 골드는 100, SP는 10, RP는 1이 필요 ⇒ RP > SP > 골드 순으로 귀하다.

---

## 2. RP의 절대 가치 기준 — 1 RP = 100 VND

경제의 앵커는 **커피 한 잔**이다.

- 호치민 커피 1잔 ≈ 51,677 VND → 설계상 **50,000 VND**로 정규화.
- **커피 한 잔 = 500 RP** 로 확정 ⇒ **1 RP = 100 VND**.

### 근거 (왜 500 RP이고, 50,000 RP나 3,000 RP가 아닌가)

| 후보 | 함의 | 판정 |
|---|---|---|
| 50,000 RP (VND 1:1 페그) | 환율상 커피 = 골드 5,000,000. 가챠(200~1,500)·아이템(300~35,000) 스케일 붕괴. RP가 "현금"으로 인식 → 어뷰징·규제 리스크 | ✗ |
| 3,000 RP (KRW 1:1) | 환율상 커피 = 골드 300,000. 과대 | △ |
| **500 RP (VND 1/100)** | 환율상 커피 = 골드 50,000. 1 골드 ≈ 1 VND 로 가챠/아이템 스케일과 정합. RP는 작고 희소하게 유지 | **✓ 채택** |

> `face_value_vnd`(실물 정산값)와 `required_rp`(게임 내 가격)는 분리 관리한다. RP는 추상 게임 가격이며 fiat 1:1 페그가 아니다.

---

## 3. 경제 보호 설계 — "손잡이 분리" 원칙

지속가능성의 핵심: **단일 손잡이(그라인드 기간)로 이탈과 출혈을 동시에 막으려 하지 않는다.** 기간을 늘려 예산을 지키면 동기부여가 죽고, 줄이면 출혈한다(같은 손잡이라 trade-off에 갇힘). 손잡이를 셋으로 분리한다.

| 손잡이 | 막는 것 | 설정 |
|---|---|---|
| ① RP 공급원 = **이벤트 퀘스트 전용** | 출혈 (재고 예측) | 데일리 RP=0. 운영자가 이벤트로 RP 발행량 직접 통제 ⇒ 쿠폰 소진 = 예측 가능 |
| ② `monthly_quota` | 출혈 (회로차단) | 월 발급 하드캡. 초기 예산 100만원 ≈ 커피 333장 → 6개월 파일럿 가정 시 월 ~55장 권장 |
| ③ 무비용 sink (코스메틱) | 출혈 (전환율 희석) | face_value=0 뱃지/프레임이 캐주얼 RP를 흡수 → 실물 커피 전환은 "진짜 꾸준한 유저"로 자연 필터링 |

- ①로 인해 "재고 예측 가능"이 성립한다. 데일리에서 RP를 빼고 이벤트로만 공급하므로, 무상 발행이 운영 통제 하에 든다.
- "기간(그라인드)"은 **동기부여 전용 손잡이**로만 쓴다(예산 보호 책임을 지우지 않는다).

---

## 4. 쿠폰 카탈로그 재가격 (구현: mig sre040 / sre041)

### 실물가치 항목 — `face_value_vnd / 100` (1 RP = 100 VND) · sre040

| item_code | 품목 | face_value (VND) | RP (before→after) |
|---|---|---|---|
| DATA_1GB | Viettel 데이터 1GB | 14,000 | 300 → **140** |
| GOTIT_50K | Got It 50K VND (**커피 티어**) | 50,000 | 1,200 → **500** |
| GOTIT_100K | Got It 100K VND | 100,000 | 3,000 → **1,000** |

### 무비용 코스메틱 — 커피(500) 기준 재배치 · sre041

| item_code | 품목 | RP (before→after) | 의도 |
|---|---|---|---|
| BADGE_FOUNDER | 창립 멤버 뱃지 | 200 → **100** | 초기 진입 sink |
| FRAME_NEON | 네온 프로필 프레임 | 800 → **300** | 커피 아래 캐주얼 sink |
| BADGE_LEGEND_FIRST100 | Legend 1~100호 뱃지 | 7,000 → **2,000** | 프레스티지(커피 위 유지) |

---

## 5. 획득처 보상 조정

### 5.1 퀘스트

| 항목 | before | after | 비고 |
|---|---|---|---|
| 데일리 퀘 RP | `reward_exp × 0.3` (예: 30) | **0** | `ride.py` payload.rp→0. RP는 이벤트 전용 |
| 데일리 퀘 Gold | `reward_gold` (예: 50) | **현행 유지(50)** | 확정 — Gold sink(아이템 C300~L35000, 가챠 200/1500) 대비 합리적. 레벨업 GOLD 200/레벨과 병행 |
| 이벤트 퀘 RP | — | (미도입) | 경제밸런스 확정 후 이벤트 한정 도입. 분기 미구현, 현재 일괄 0 |

> RP 공급을 이벤트로 한정한 것이 본 정립의 핵심. 데일리는 exp+gold(+아이템)로만 보상.

### 5.2 마일리지 (누적 주행거리 마일스톤) — **EXP 전용** (구현: mig sre042)

| 정책 | 조건 | 보상 | 상태 |
|---|---|---|---|
| MILEAGE_EXP | 누적 매 1km | EXP 10 (BFF 레벨링 exp) | ✅ 유지 |
| MILEAGE_XP | 누적 매 5km | XP 30 (엔진 고아 화폐) | ❌ **비활성** |
| BADGE_10KM | 누적 10km | 뱃지 | 유지 |

→ 마일리지는 **레벨링 EXP만 소폭** 지급하도록 정리. 사용처 없는 고아 XP 적립 제거.

### 5.3 레벨업 — **단일 발동점 + 정책 주도** (구현 완료, BFF 일원화)

**문제(이전):** 보상이 두 시스템·두 레벨정의에 분산.
- skill_pt +1 → BFF `apply_level_up` (BFF 레벨, 곡선 200·500·1000·2000·×2)
- GOLD 50 + 고아 XP 100 → 엔진 `LEVELUP_REWARD` 정책 (엔진 레벨 `total_exp//per_level`, 선형) — 발동 시점이 사용자 레벨업과 어긋남.

**해결(구현):**
- **단일 진입점 `gain_exp(db, user, amount)`** (`backend/app/utils.py`) — exp 적립 → 레벨업 판정 → 레벨업 보상 적용까지 한 함수가 처리. 모든 exp 획득(퀘스트·마일리지·내부 grant)이 이 함수를 거친다. `apply_level_up` 폐기.
- **수치는 하드코딩 금지·정책(DB) 주도** — BFF `levelup_reward_policy` 단일행 config 테이블(`gold`, `skill_pt`) seed. `gain_exp`가 레벨업 시 읽어 레벨당 적립. seed: **GOLD 200 + SKILL_PT 1**.
- 엔진 `LEVELUP_REWARD` 정책 **비활성**(mig sre044) — 중복·고아 XP·레벨 어긋남 제거.
- 레벨링이 BFF 소관이므로 보상도 BFF로 통합 ⇒ 트리거·값·적용이 한 서비스에 모임(엔진 왕복 없음).
- 부수 교정: 기존 `quests.py` 퀘스트 완료 경로가 exp만 더하고 레벨업을 안 하던 누락도 `gain_exp` 경유로 해소.

---

## 6. 가챠 통화 라벨 정정 (구현)

엔진 통화는 `GP`(골드)/`GC`(크리스탈)인데 프론트가 크리스탈을 `XP`로 오기 → **`RP`로 통일**.
- BFF `gacha.py` `_CURRENCY_MAP`(GC→RP)/`_gacha_type`
- 프론트 `gacha.ts`(타입·목), `GachaMain.tsx`(세그먼트), i18n `tab_gc` (ko/vi/en)
- wallet `xp_balance` 필드는 실제 `gc_balance`(RP)를 담고 있었음(화면 표시는 이미 RP).

---

## 7. 미결 / 후속

1. **이벤트 퀘스트 RP 도입** — 경제밸런스 확정 후. 이벤트 한정 발행(데일리 0 유지).
2. **`monthly_quota` 실제 값 설정** — 예산·예상 가동월수 기준(파일럿 6개월 → 월 ~55장). 비즈니스 입력 필요.
3. **마이그/스키마 활성화** — 엔진 `alembic upgrade`(sre040~044; sre043은 SGR-229 criteria, sre044가 LEVELUP_REWARD 비활성), BFF `levelup_reward_policy` 테이블(기존 DB는 `database/init/049` 수동 적용; fresh DB는 자동). 적용 후 E2E(레벨업 gold·skill_pt, 마일리지 exp만, 쿠폰 500RP).

> `sink-economy-design.md` 의 `reward_exp×0.3` 서술은 OBSOLETE 배너로 정정 완료(2026-06-04).

> 참고: Gold 보상은 확정 — 퀘 50/건 유지 + 레벨업 정책 GOLD 200/레벨(§5.3). 추가 조정은 DB값 변경으로 가능.

---

## 부록 — 변경 파일·마이그레이션

| 영역 | 변경 |
|---|---|
| 엔진 mig | `sre040`(쿠폰 face 재가격 → `required_xp`), `sre041`(코스메틱 재가격), `sre042`(마일리지 EXP 전용), `sre044`(LEVELUP_REWARD 비활성). ※`sre043`은 SGR-229(criteria)로 점유 → levelup은 sre044로 체이닝 |
| BFF | `routers/ride.py`(데일리 퀘 RP→0, gain_exp), `routers/gacha.py`(라벨 RP), `utils.py`(`gain_exp` 신설·`apply_level_up` 폐기), `models.py`(`LevelupRewardPolicy`), `routers/internal.py`·`routers/quests.py`(gain_exp 경유) |
| BFF DB | `database/init/049_levelup_reward_policy.sql` (단일행 config + seed 200/1) |
| 프론트 | `api/gacha.ts`, `pages/gacha/GachaMain.tsx`, `locales/{ko,vi,en}/translation.json` |
| 검증 | ruff / tsc 통과 |
