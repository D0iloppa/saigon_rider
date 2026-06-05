import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { toast } from '@/components/ui/Toast';
import type { SkillKey } from '@/api/types';
import styles from './SkillTree.module.css';

const MAX_LEVEL = 3;
// 아이템 착용효과 4축과 1:1 정합. value(lv)는 effect i18n의 {{value}} 표시값.
const SKILLS: { key: SkillKey; emoji: string; value: (lv: number) => number }[] = [
  { key: 'distance_rider', emoji: '🛣️', value: (lv) => lv * 5 },   // RP_MULT: EXP +5%/lv
  { key: 'gold_hunter', emoji: '💰', value: (lv) => lv * 5 },       // GOLD_MULT: Gold +5%/lv
  { key: 'quest_slot', emoji: '🎯', value: (lv) => (lv >= 3 ? 1 : 0) }, // QUEST_SLOT: Lv3에서 +1
  { key: 'cost_discount', emoji: '💸', value: (lv) => lv * 2 },     // COST_DISCOUNT: -2%/lv
];

/** SGR-209 A4: 스킬 트리 — SP 투자(1 SP → 레벨 +1, 최대 3). 효과는 rewards.ts 가산. */
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
        const lv = user.skills[key];
        const maxed = lv >= MAX_LEVEL;
        const canInvest = sp >= 1 && !maxed;
        return (
          <div key={key} className={styles.row}>
            <span className={styles.emoji}>{emoji}</span>
            <div className={styles.info}>
              <div className={styles.name}>{t(`skill.${key}.name`)}</div>
              <div className={styles.effect}>{t(`skill.${key}.effect`, { value: value(lv) })}</div>
              <div className={styles.dots}>
                {Array.from({ length: MAX_LEVEL }).map((_, i) => (
                  <span key={i} className={i < lv ? styles.dotOn : styles.dotOff} />
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
