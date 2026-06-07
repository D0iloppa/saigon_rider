# 스킬 단계당 비용 1→3 SP (서브포인트 0~9 체계) 밸런싱

> 발행 2026-06-07. SoT. SGR-228 경제 후속. Plane Feature/Todo·Notion 미러 연동.

## 목적 / 결정

스킬은 4종 × 최대 3단계(효과 단계 0~3 유지). 기존 **1 SP = 1단계**를 **3 SP = 1단계**로 3배화한다. 이를 시각적으로 보여주기 위해 **한 단계 칸을 3개 서브칸으로 쪼개** 1 SP씩 채우고, 3칸이 차면 실제 +1단계.

- **효과 단계는 0~3 그대로** (EXP +5%/단계, Gold +5%/단계, 슬롯 단계3에서 +1, 할인 -2%/단계).
- **내부 저장 = 0~9 서브포인트** (1 SP=1칸, **단계 = 서브포인트 // 3**).
- **invest 비용은 클릭당 1 SP** (점진적). 한 단계 = 3클릭 = 3 SP.
- **SP 적립 1/레벨업 유지**, **누적 상한 12 → 36** (= 4스킬 × 9서브포인트). 평생 레벨업 29회 ≈ 29 SP → 4스킬 중 ~3개만 풀 가능(선택 강제, 사용자 합의).
- **기존 데이터 보존**: 현 단계값(0~3)을 ×3 하여 서브포인트로 이관(단계 동일 유지). 파괴적 리셋 아님.

## Phase

### P1 — DB 마이그 (`database/init/072_skill_subpoints.sql`)
- `users_skill_{distance_rider,gold_hunter,quest_slot,cost_discount}_check` DROP → 기존값 ×3 UPDATE → CHECK `BETWEEN 0 AND 9` 재생성.
- dev DB 수동 적용(init은 fresh에서만 실행).

### P2 — BFF 코드
- `utils.py:152-153` 보너스: `skill_distance_rider // 3 * 5`, `skill_gold_hunter // 3 * 5`.
- `utils.py:159` 할인: `skill_cost_discount // 3 * 2`.
- `utils.py:100` `MAX_SKILL_PT_TOTAL` 12 → 36.
- `quests.py:121` 슬롯: `skill_quest_slot >= 9` (= 단계3).
- `users.py:84` invest 캡 `>= 3` → `>= 9` (비용 `skill_pt -= 1` 유지).
- `schemas.py`: 변경 없음(raw 0~9 노출, 프론트가 단계 계산).

### P3 — 프론트 `SkillTree.tsx`
- `user.skills[key]` = 0~9 서브포인트. 단계 = `Math.floor(v/3)`.
- 시각화: 3단계 칸, 각 칸을 3 서브칸으로 분할(총 9칸) — 채워진 서브포인트만큼 fill.
- 효과 텍스트는 단계(tier) 기준. invest 버튼 disabled = `v>=9 || sp<1`. MAX 표기 `v>=9`.
- `useUserStore.investSkill` 캡 `>= 3` → `>= 9`.

### P4 — 검증
- ruff/eslint/tsc 0, frontend build, BFF 기동.
- invest 3회 → 단계 +1, 보너스가 단계 기준으로 반영. 캡(서브 9·누적 36) 동작.

## 범위 밖
- 단계 최대(3)·효과 수치(±5%/2%)·스킬 종류는 불변. SP 환율(골드100:SP10:RP1) 불변.
