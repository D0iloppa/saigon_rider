import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { toast } from '@/components/ui/Toast';
import type { SkillKey } from '@/api/types';
import styles from './SkillTree.module.css';

const MAX_LEVEL = 3;
const SKILLS: { key: SkillKey; emoji: string }[] = [
  { key: 'distance_rider', emoji: '🛣️' },
  { key: 'gold_hunter', emoji: '💰' },
  { key: 'safe_rider', emoji: '🛡️' },
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
      {SKILLS.map(({ key, emoji }) => {
        const lv = user.skills[key];
        const maxed = lv >= MAX_LEVEL;
        const canInvest = sp >= 1 && !maxed;
        return (
          <div key={key} className={styles.row}>
            <span className={styles.emoji}>{emoji}</span>
            <div className={styles.info}>
              <div className={styles.name}>{t(`skill.${key}.name`)}</div>
              <div className={styles.effect}>{t(`skill.${key}.effect`, { value: lv * 5 })}</div>
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
