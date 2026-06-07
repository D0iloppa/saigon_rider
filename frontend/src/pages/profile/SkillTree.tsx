import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { toast } from '@/components/ui/Toast';
import type { SkillKey } from '@/api/types';
import styles from './SkillTree.module.css';

// SGR-280: 스킬은 3단계, 단계당 3 SP. 내부 저장은 0~9 서브포인트(skills[key]), 단계 = //3.
const MAX_TIER = 3;
const SUB_PER_TIER = 3;
const MAX_SUB = MAX_TIER * SUB_PER_TIER; // 9
// 아이템 착용효과 4축과 1:1 정합. value(tier)는 effect i18n의 {{value}} 표시값.
const SKILLS: { key: SkillKey; emoji: string; value: (tier: number) => number }[] = [
  { key: 'distance_rider', emoji: '🛣️', value: (tier) => tier * 5 },   // RP_MULT: EXP +5%/단계
  { key: 'gold_hunter', emoji: '💰', value: (tier) => tier * 5 },       // GOLD_MULT: Gold +5%/단계
  { key: 'quest_slot', emoji: '🎯', value: (tier) => (tier >= 3 ? 1 : 0) }, // QUEST_SLOT: 단계3에서 +1
  { key: 'cost_discount', emoji: '💸', value: (tier) => tier * 2 },     // COST_DISCOUNT: -2%/단계
];

/** SGR-280: 스킬 트리 — SP 투자(1 SP → 서브포인트 +1, 3칸=1단계, 최대 9). 효과는 rewards.ts 가산. */
export function SkillTree() {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const investSkill = useUserStore((s) => s.investSkill);
  const [busy, setBusy] = useState<SkillKey | null>(null);

  if (!user) return null;
  const sp = user.skillPoints;

  const onInvest = async (key: SkillKey) => {
    if (busy) return;
    setBusy(key);
    const ok = await investSkill(key);
    setBusy(null);
    if (!ok) toast.error(t('skill.invest_failed'));
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.title}>{t('skill.title')}</span>
        <span className={sp > 0 ? styles.pointsHot : styles.points}>
          ⚡ {t('skill.points_available', { count: sp })}
        </span>
      </div>
      {SKILLS.map(({ key, emoji, value }) => {
        const sub = user.skills[key];        // 0~9 서브포인트
        const tier = Math.floor(sub / 3);    // 0~3 단계 (효과 기준)
        const maxed = sub >= MAX_SUB;
        const canInvest = sp >= 1 && !maxed;
        return (
          <div key={key} className={styles.row}>
            <span className={styles.emoji}>{emoji}</span>
            <div className={styles.info}>
              <div className={styles.name}>{t(`skill.${key}.name`)}</div>
              <div className={styles.effect}>{t(`skill.${key}.effect`, { value: value(tier) })}</div>
              <div className={styles.dots}>
                {Array.from({ length: MAX_TIER }).map((_, ti) => (
                  <div key={ti} className={styles.tierGroup}>
                    {Array.from({ length: SUB_PER_TIER }).map((_, j) => {
                      const idx = ti * SUB_PER_TIER + j;
                      return <span key={j} className={idx < sub ? styles.segOn : styles.segOff} />;
                    })}
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              className={styles.investBtn}
              disabled={!canInvest || busy === key}
              onClick={() => onInvest(key)}
              aria-label={t('skill.invest')}
            >
              {maxed ? t('skill.max') : '+'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
