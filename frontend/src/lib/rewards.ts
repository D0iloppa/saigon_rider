import type { Quest, SafetyGrade, User } from '@/api/types';

export interface RewardResult {
  expEarned: number;       // 레벨 EXP
  xpEarned: number;        // 소모 가능 XP
  goldEarned: number;
  itemsEarned: Array<{ key: string; name: string }>;
  multipliers: {
    safetyBonus: number;
    firstClearBonus: number;
    goldSkill: number;
  };
}

/**
 * 보상 계산 (기획서 §4.2)
 * 기본 보상 × 안전등급 A 보너스 × 첫 클리어 보너스 × 스킬 보너스
 */
export function calculateRewards(opts: {
  quest: Quest;
  user: User;
  finalSafety: SafetyGrade;
  isFirstClearToday: boolean;
}): RewardResult {
  const { quest, user, finalSafety, isFirstClearToday } = opts;

  let expMul = 1.0;
  let goldMul = 1.0;

  // 안전 A 보너스
  const safetyBonus = finalSafety === 'A' ? 0.1 : 0;
  expMul += safetyBonus;
  goldMul += safetyBonus;

  // 오늘 첫 클리어 보너스
  const firstClearBonus = isFirstClearToday ? 0.2 : 0;
  expMul += firstClearBonus;
  goldMul += firstClearBonus;

  // 스킬: gold_hunter Lv.1/2/3 → Gold +5/10/15%
  const goldSkill = user.skills.gold_hunter * 0.05;
  goldMul += goldSkill;

  // 스킬: distance_rider Lv.1/2/3 → EXP +5/10/15% (SGR-209 A4)
  expMul += user.skills.distance_rider * 0.05;

  // 분배: 총 EXP의 70%가 레벨 EXP, 30%가 XP 포인트
  const totalExp = Math.round(quest.rewardExp * expMul);
  const expEarned = Math.round(totalExp * 0.7);
  const xpEarned = Math.round(totalExp * 0.3);

  const goldEarned = Math.round(quest.rewardGold * goldMul);

  return {
    expEarned,
    xpEarned,
    goldEarned,
    itemsEarned: quest.rewardItems,
    multipliers: { safetyBonus, firstClearBonus, goldSkill },
  };
}

/**
 * 레벨업 EXP 테이블 (기획서 §4.3)
 */
export function expRequiredForLevel(level: number): number {
  if (level <= 1) return 200;
  if (level === 2) return 500;
  if (level === 3) return 1000;
  if (level === 4) return 2000;
  // Lv.5+ : 이전 값 × 2
  return expRequiredForLevel(level - 1) * 2;
}

export function expToNextLevel(currentExp: number, currentLevel: number): {
  needed: number;
  progress: number; // 0~1
} {
  const total = expRequiredForLevel(currentLevel);
  const needed = Math.max(total - currentExp, 0);
  const progress = Math.min(currentExp / total, 1);
  return { needed, progress };
}
