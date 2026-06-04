# 사용처(Sink) 경제 설계 — 스킬포인트 & 쿠폰 BM

> **기획 관점**: 玉樹真一郎(다마키 신이치로) 체험 디자인 3층 — 직감(直感)·놀라움(驚き)·이야기(物語).
> **SoT**: 진행 상태는 Plane(SGR). 이 문서는 *체험 설계 + 기술 그라운딩*의 상세 본문이며 Notion에 미러된다.
> **작성**: 2026-06-03

---

## 0. 왜 지금 — 문제 정의

게임 내 화폐가 5종(`exp`/`xp`/`gold`/`skill_pt` + 엔진 `RP`)인데 **두 화폐가 sink가 없는 고아 상태**다:

- `skill_pt` — 저장 컬럼만 있고 **적립·소비·효과가 전무**. 사용자는 영원히 0. (SGR-209)
- `xp`(소비용 포인트) — `reward_exp×0.3`으로 적립되지만 쓸 곳이 없음. → **이 문서의 직접 대상 아님. 별도 정리 필요(미결정 §7).**

동시에 **핵심 BM**인 "RP로 실물 기프티콘(커피 등) 교환"이 미구비. 두 과제는 별개가 아니라 **하나의 "성장→환금" 경제 체험**의 앞뒤 절이므로 함께 설계한다.

### 사용처 구분 원칙 — 재화↔sink 1:1

| 재화 | 성격 | 사용처(sink) | 추적 |
|---|---|---|---|
| **Gold** | 파밍형 소프트 화폐 | 아이템 상점·가챠 (기존) | — |
| **Skill Point** | 레벨업 적립 성장 화폐 | **스킬 트리** (패시브 강화) | SGR-209 |
| **RP** | 행동 기반 가치 화폐 | **쿠폰/기프티콘 교환** (신규 BM) | 신규 티켓 |

→ 세 화폐, 세 sink, 겹침 없음. 성장 보상(SP)과 실물 환금(RP)을 **섞지 않는다** (밸런싱·어뷰징 격리).

---

## 1. 체험 곡선 — 하나의 이야기

```
매일 라이딩 → 레벨업(SP 적립) → 스킬 투자(직감·성장 실감)
            → RP 적립 ───────────────────→ 쿠폰 교환(가상→실물의 "놀라움")
                                                → 내 쿠폰함 → 실제 커피 (物語 완결)
```

### 직감(直感) — 설명 없이 손이 가게
- **SP**: 레벨업 순간 프로필 ⚡아이콘에 **빛/배지** → "쓸 게 생겼다"는 가설을 말없이 유발. 탭 → 3갈래 트리 → 투자 시 **즉시** 수치 상승 = 환희.
- **쿠폰**: 상점 `아이템 | 쿠폰` 탭. 쿠폰 탭엔 익숙한 브랜드 썸네일 + **내 RP 잔액 + 가격** 한 화면 → "내 RP로 받겠는데?" 즉발.

### 놀라움(驚き) — 직감을 배신하는 결정적 순간
- **최대 놀라움 = "게임 포인트가 진짜 커피가 된다"** (가상→실물 전환). BM이기 전에 *감정 사건*. → **교환 완료 화면은 영수증이 아니라 연출(시네마틱)**. SGR-211 가챠 시네마틱 자산 재사용 검토.
- **SP 작은 놀라움**: `safe_rider` 특정 레벨 도달 시 **퀘스트 슬롯이 "열리는"** 발견 — 티켓이 요구한 "퀘스트 연계"를 *놀라움의 형태*로 회수.

### 이야기(物語) — 플레이어 자신의 이야기로
- 스킬 빌드(거리형/골드형/안전형) = **"나는 어떤 라이더인가"** 정체성.
- RP 적립이 **"커피 한 잔까지 80%"** 진행감으로 의미화 → 지루한 적립이 *목표 있는 여정*.
- "내 쿠폰함" = 단순 보관함이 아니라 **달려서 얻어낸 전리품의 기록**.

---

## 2. Part A — 스킬 트리 (SGR-209)

### 현황 (그라운딩)
- 적립: 없음. **소비 골격만**: `useUserStore.investSkill()` (1 SP→1레벨, 최대 3) — 단 프론트 로컬만, DB 미반영.
- 효과 공식 **일부 이미 존재**: `frontend/src/lib/rewards.ts:40` — `gold_hunter`/`distance_rider` 레벨 → Gold/RP 배수 가산.
- 스킬 3종: `distance_rider`(RP 배수) / `gold_hunter`(Gold 배수) / `safe_rider`(퀘스트 슬롯·리워드).

### 효과 매핑 — SGR-210 착용효과 프레임에 합류
스킬 효과는 새 엔진을 만들지 않고 SGR-210 `EquipEffects`(`engine/app/services/equip_effects.py:29`)와 **같은 카테고리**에 누적:

| 스킬 | 효과 카테고리 | 레벨당(초안) |
|---|---|---|
| `distance_rider` | `rp_mult_pct` | +5%/lv |
| `gold_hunter` | `gold_mult_pct` | +5%/lv |
| `safe_rider` | `quest_slot_bonus` (또는 리워드) | 1·2·3lv → 슬롯/리워드 단계 |

> **효과 적용 위치 결정**: 현재 `rewards.ts`가 스킬을, BFF `quests.py`가 아이템 슬롯을 각각 적용 → **이원화**. 권장: 스킬 레벨을 서버(BFF/engine)로 올려 **아이템 효과와 동일 합산 경로**로 통일. (Phase A2)

### 구현 통합 지점 (그라운딩 결과)
1. **적립 훅**: `backend/app/utils.py:95 apply_level_up()` 의 `user.level += 1` 직후 `user.skill_pt += 1`. (호출처: `ride.py:112`, `internal.py:46` — 훅 한 곳이면 양쪽 커버)
2. **영속화**: `backend.users`에 스킬 레벨 컬럼 없음 → **추가 필요**. 옵션 A 개별 컬럼 3개 / 옵션 B JSONB `skills`. → **권장 A**(쿼리·제약 단순, 효과 합산 조인 용이).
3. **투자 API**: `POST /users/{id}/skills/{key}/invest` — 검증(`skill_pt>=1` & `level<3`) + 원자적 차감/증가 + 갱신 User 반환. `investSkill()`이 이 API 호출 후 로컬 동기화.
4. **me 응답 매핑**: `apiGetMe()` → `dtoToUser()`에 `skills` 매핑.

### 체험 요구(1급 산출물)
- 레벨업 → 프로필 ⚡ **빛/배지** 신호.
- 스킬 트리 화면(투자 UI): 3갈래, 레벨/효과/잔여 SP 한눈에, 투자 즉시 수치 애니메이션.
- `safe_rider` 슬롯 해금 시 "열리는" 연출.

---

## 3. Part B — 쿠폰/기프티콘 BM (신규 티켓)

### 결정 사항
- **구매 재화**: **RP** (현금 결제 없음 — 엔진 RP 원장 재사용, 스코프 최소).
- **상점 구조**: **기존 상점 내 "쿠폰" 탭 분기** (별도 상점 X).
- **발급 방식**: **provider 추상화** — `재고풀(코드 사전등록)` MVP + `외부 쿠폰 API` 확장. 발급체를 인터페이스로 추상화.

### 그라운딩 — 인프라 거의 존재
| 필요 | 재사용 가능 코드 |
|---|---|
| RP 차감 | `engine/app/services/xp_ledger.py:119 debit()` (`source_type="REDEMPTION"`, FIFO 만료 소진) |
| 멱등성·바우처 발급 | `engine/app/services/reward.py:15 redeem()` (`idempotency_key`, `RewardRedemption`) ← **기존 reward_catalog/RewardRedemption 재사용 vs 신규 coupon 엔티티 — Phase 0 결정** |
| RP 잔액 조회 | `GET /v1/users/{uuid}/wallet` |
| 구매 트랜잭션 패턴 | `purchase_shop_item()` PL/pgSQL + `_spend_currency()` |
| 어드민 CRUD | `engine admin.py:291` 아이템 CRUD 패턴 + BFF `templates/admin/` |
| 이미지 | `contents` + `*_content_id` FK + `build_imgproxy_url()` (`backend/app/utils.py:25`) |
| 보유 인벤토리 | `user_item` + `GET /inventory/{uuid}/items` + `Inventory.tsx` 필터/통계 |

> **핵심 설계 분기 (Phase 0)**: 엔진에 이미 `reward_catalog`/`RewardRedemption`(바우처) 개념이 있음. 쿠폰을 **(a) reward_catalog의 한 종류로 흡수** vs **(b) 신규 `coupon_definition`/`user_coupon` 엔티티**. 재고풀·외부 API provider·만료·실물 가치 관리가 필요하므로 (b) 신규 엔티티 + reward 패턴(멱등성/원장) 재사용이 유력. Phase 0에서 확정.

### 데이터 모델 (초안, Phase 0 확정 대상)
- `coupon_definition`: `coupon_code`(PK), `display_name`, `provider_type`(STOCKPOOL/EXTERNAL_API), `price_rp`, `thumbnail_content_id` FK, `is_shop_visible`, `expire_policy`, `partner_brand`.
- `coupon_stock`: 재고풀용 — `coupon_code` FK, `voucher_code`(암호화), `status`(AVAILABLE/ISSUED/USED), `issued_to`, `issued_at`.
- `user_coupon`: `user_id`, `coupon_code`, `voucher_code`/`redemption_ref`, `acquired_at`, `status`(ACTIVE/USED/EXPIRED), `expire_at`, `redemption_tx_id`.

### provider 추상화
```
CouponProvider (interface)
 ├─ StockPoolProvider   : coupon_stock에서 AVAILABLE 1건 원자적 점유 → voucher 반환
 └─ ExternalApiProvider : 외부 기프티콘 API 호출 → 발급 코드 반환 (계약·인증·장애처리)
```
교환 흐름: RP 차감(`debit`, 멱등키) → provider.issue() → `user_coupon` 적재 → (실패 시 RP 보상/롤백).

### 체험 요구(1급 산출물)
- 상점 쿠폰 탭: 브랜드 썸네일 + **RP 잔액/가격/"N% 더 모으면" 진행감**.
- **교환 완료 연출**(시네마틱) — 가상→실물의 놀라움.
- 내 쿠폰함: 전리품 기록 톤. 바우처 코드/바코드 표시, 사용 처리, 만료 표기.
- 어드민: 쿠폰 정의 CRUD + 재고 코드 일괄 등록 + provider 설정.

---

## 4. Phase 분해 (티켓 구조)

### SGR-209 (스킬 트리) — 독립 진행
- **A1 적립**: 레벨업 훅 `skill_pt += 1` + 검증.
- **A2 영속화·효과 통일**: 스킬 레벨 DB 컬럼 + 효과 합산 경로 서버 통일(아이템 효과와 동일 경로).
- **A3 투자 API + 프론트 연동**: invest API + `investSkill()` 서버 동기화 + me 매핑.
- **A4 스킬 트리 UI + 체험**: 투자 화면 + 레벨업 ⚡신호 + 슬롯 해금 연출.

### 신규 티켓 — 쿠폰/기프티콘 커머스 (RP 교환) — phase 서브이슈
> **P0 결론(§6)으로 재조정됨.** 기존 reward 엔진 재사용 → P1 대폭 축소.
- **P0 ✅ 설계 확정**: reward_catalog/redemption/partner + adapter 재사용 확정. 신규 coupon 엔티티 폐기. 발급은 MANUAL/Stub로 시작.
- **P1 백엔드 노출·보강**: `reward_catalog.thumbnail_asset_uri` 컬럼(마이그) + BFF `engine_client`(list_catalog/create_redemption/list_redemptions) + 앱 BFF 라우트. 발급=MANUAL(수동 fulfill).
- **P2 어드민**: catalog/partner CRUD + 썸네일(asset_uri→imgproxy) + **수동 발급 처리**(voucher_code 입력→FULFILLED).
- **P3 상점 통합**: 상점 "쿠폰" 탭(`/v1/catalog` 소비) + RP 잔액/진행감 UI + 교환 플로우 + **완료 연출**.
- **P4 내 쿠폰함**: `/v1/users/{id}/redemptions` 소비 — 보유/상태/만료 + 바우처 표시.
- **P5 QA/검증**: E2E(교환 성공/잔액부족/멱등 재시도/만료), RP 원장 정합성.

---

## 6. P0 결론 (SGR-214 확정) — 2026-06-03

### 결정: 기존 reward 엔진 재사용 (신규 coupon 엔티티 폐기)
쿠폰 BM 백엔드는 엔진에 **이미 완전체로 존재**. 병렬 테이블 신설은 완성 시스템 중복 → 폐기.

| 구성 | 기존 자산 (engine) |
|---|---|
| 카탈로그 | `reward_catalog` — `item_code`/`item_name`/`required_xp`(=RP가격)/`face_value_vnd`/`category_code`/`monthly_quota`·`monthly_issued`/`is_active`/`visible_from·until` |
| 교환 원장 | `reward_redemption` — `status`(REQUESTED/FULFILLED/FAILED/REFUNDED/CANCELLED)/`voucher_code`/`external_response`/**`idempotency_key`(unique)**/`requested_at`/`fulfilled_at`/`expires_at` |
| 파트너·발급 | `reward_partner` + `integration_type` enum: INTERNAL/GOTIT/URBOX/TELCO/MANUAL (+`api_config` JSONB) |
| provider 추상화 | `PartnerAdapter` Protocol → `issue_voucher()→VoucherResult`. 구현: `InternalAdapter`(즉시 UUID), `StubPartnerAdapter`(QUEUED/수동). `get_adapter(integration_type, partner_code)` |
| 서비스 | `reward.redeem()` — 멱등성·월쿼터·잔액검사·`xp_ledger.debit(source_type="REDEMPTION")`·audit·commit 완비 |
| API | `GET /v1/catalog`·`/v1/catalog/{id}`, `POST·GET /v1/users/{id}/redemptions` |

### 발급 방식 결정: **MANUAL/Stub로 시작** (사용자 확정)
- 재고풀(코드 사전등록 자동차감)·외부 API(GotIt/UrBox)는 **후속**. → **신규 테이블·enum 변경 없음** (slot enum 이중갱신 회피).
- 교환 시 Stub/MANUAL 어댑터가 `REQUESTED`(QUEUED)로 적재 → 운영자가 어드민에서 `voucher_code` 입력해 `FULFILLED` 처리.

### 실제 갭 (남은 작업)
1. **BFF 노출** — `engine_client.py`에 reward 메서드 부재(wallet·season만). → `list_catalog`/`create_redemption`/`list_redemptions` + 앱 BFF 라우트(`/api/bff/...`). (P1)
2. **쿠폰 썸네일** — `reward_catalog`에 이미지 컬럼 없음 + `contents`는 **BFF 전용 DB**(엔진서 FK 불가). → 엔진엔 `thumbnail_asset_uri`(문자열, `ItemDefinition.asset_uri` 동일 패턴), BFF가 `build_imgproxy_url()` 변환. (P1 마이그)
3. **어드민 CRUD** — 엔진 admin엔 RewardPolicy CRUD만. catalog/partner CRUD + **수동 발급 처리** 화면 부재. (P2)
4. **프론트** — 상점 쿠폰 탭·교환 연출·내 쿠폰함 전부 신규. (P3/P4)

### 구현 메모 (2026-06-03 진행)
- **엔진 계약 정렬**: `/v1/users/{user_id}/redemptions`(정수 PK) → **`{user_uuid}`** 로 변경(`get_or_create_user` 해석). wallet/inventory와 일치. 기존 BFF 호출자 없어 무위험.
- **마이그**: `engine/alembic` sre037(reward_catalog.thumbnail_asset_uri) / `database/init/048`(users 스킬 3컬럼). **적용+재시작 필요**(P5).

### 교환 트랜잭션·롤백
`reward.redeem()`이 단일 commit 내 처리(멱등키 선점→어댑터 발급→`debit`→레코드). 어댑터 실패 시 `VoucherResult.success=False` → `status=FAILED`, RP 미차감(차감 전 호출 순서). **MANUAL은 외부 실패 없음** → 롤백 신규 설계 불필요.

## 7. 미결정 / 리스크
- **`xp`(소비용 포인트) 고아 화폐** — `skill_pt`와 역할 중복. 통합(제거) vs 명확 분리 (본 티켓 범위 밖, 별도 정리 권장).
- **효과 적용 이원화**(rewards.ts vs quests.py) — A2에서 서버 통일.
- **재고풀·외부 API(GotIt/UrBox)** — 후속 페이즈. 어댑터만 추가하면 카탈로그·원장·UI 그대로 재사용.
- **쿠폰 만료 정책** — `reward_redemption.expires_at` 활용. 정책값 미정(P2 어드민에서 설정).
- **교환 완료 연출 자산** — SGR-211 시네마틱 재사용 가능 여부 P3에서 확인.

## 8. 구현 완료 현황 (2026-06-03) + ⚠️ 출시 전 확인

### 완료 (정적검증 통과: ruff / tsc 0err / eslint 0err)
- **SGR-209 A1~A4**: 레벨업 `skill_pt+=1` 훅 / `users` 스킬3컬럼+마이그048+`UserOut.skills`+DTO매핑 / `POST /users/me/skills/{key}/invest`+프론트동기화 / `SkillTree` UI(프로필)+펄스 SP신호. `distance_rider` 효과(EXP+5%/lv)도 `rewards.ts`에 추가(gold_hunter/safe_rider와 동일 패턴).
- **쿠폰 P1**: 마이그 sre037 + 엔진 redemptions uuid 정렬 + BFF `engine_client` 3메서드 + `/api/coupons` 라우터.
- **쿠폰 P2(엔진 API)**: 엔진 admin reward_catalog/partner CRUD + 수동발급(`/redemptions/{id}/fulfill`). **BFF 어드민 HTML 페이지는 미구현(후속)** — 현재는 엔진 admin API/seed로 카탈로그 등록.
- **쿠폰 P3/P4**: `CouponShop`(목록+교환+완료 연출 오버레이) / `MyCoupons`(보유·상태·바우처) + 라우트 + 상점 진입 버튼 + i18n(ko/vi/en).

### ✅ 통화 모델 — 확정 (2026-06-03, 사용자 정정)
**두 화폐를 명확히 분리:**
- **GOLD = `current_balance`(엔진 GP)** — 상점 아이템 구매. 라벨 "골드"(유지). 아이콘 🪙.
- **RP = `gc_balance`(엔진 GC)** — **쿠폰 교환 전용**. 기존 앱 라벨 "XP" → **"RP"로 개명**(`currency.xp` i18n + 하드코딩 XP표기 일괄). 아이콘 **💎**.

**구현**:
- 엔진 `reward.redeem`: 차감원 `current_balance`(GP) → **`gc_balance`(GC)** 로 변경. 잔액검사도 gc_balance. (xp_transaction_id=None, audit 유지)
- BFF CouponShop: 잔액 = `wallet.xp_balance`(=gc_balance=RP) 표시, 💎 아이콘.
- 프론트 전역 "XP" 표기(프로필 셀·상점/가챠 잔액·아이템 XP가격) → "RP"(`currency.xp`="RP").

### ⚠️ RP 적립 경로 (2026-06-03 구현) — **SGR-228(2026-06-04)로 폐기·대체**

> **OBSOLETE**: 아래 `reward_exp×0.3` per-quest RP 적립은 **데일리 퀘스트 RP=0** 으로 변경됨(`ride.py` payload.rp→0). RP 수급은 **이벤트 퀘스트 전용**(재고 예측, 현재 일괄 0·후속 도입). RP 가치 기준도 **1 RP = 100 VND**(커피 500 RP)로 확정. 최신 상태는 [`economy-balance-report.md`](economy-balance-report.md). 아래는 역사적 기록으로만 보존.

**RP는 퀘스트 완료 전용, per-quest 값으로 적립, 상한 없음. 표시=적립=사용 일치.**
- **per-quest RP = rewardXpPoints (`reward_exp*0.3`)** — 화면 표시값과 동일(난이도별 18/24/30…).
- 흐름: BFF `ride.py`가 `QUEST_COMPLETE` 이벤트 payload에 `rp=int(reward_exp*0.3+0.5)` 전달 → 엔진 `event_bus`가 그 값으로 `gc_balance`(RP) 무상한 크레딧(`xp_ledger.credit_gc`). 골드(current_balance)는 별도로 일일상한·어뷰징 적용.
- `action_definition.rp_grant`(sre038)는 폴백/비-퀘스트용으로 유지, `QUEST_COMPLETE`는 0(sre039) — 퀘스트는 payload.rp가 천(per-quest).
- **무상한 안전 근거**: 일일 퀘스트 슬롯(BFF `_daily_claimable_max`)이 자연 천장. 라이딩(RIDE_KM)엔 RP 미부여(가짜 GPS farm 차단). 잔존 어뷰징 표면 = "퀘스트 완료 판정 견고함"(기존 과제).
- **표시 일치(2026-06-03)**: 퀘스트 상세 "XP"→"RP" 라벨, 퀘스트 목록 💎가 `reward_exp`(잘못)→`rewardXpPoints`로. 이제 화면 RP = 적립 gc_balance = 쿠폰 사용 RP.
- 잔여: 프론트 `addExp`가 로컬 `users.xp`에도 rewardXpPoints를 더하나 표시 RP는 wallet(gc_balance) 기준이라 무해(레거시 정리 대상).

### 런타임 활성화 (P5, 미실행)
1. 엔진: `alembic upgrade head`(sre037) + 재시작
2. BFF DB: `database/init/048_user_skill_levels.sql` 적용 + BFF 재시작
3. 프론트 재빌드
4. E2E: 레벨업→SP적립, 스킬투자, 쿠폰 교환(성공/잔액부족/멱등), 어드민 수동발급→FULFILLED→내쿠폰함 표시
