import React from 'react';
import { useTranslation } from 'react-i18next';
import { getQuestCard, getCardLabels, type Rarity } from './quest-card-map';
import styles from './QuestCard.module.css';

export interface QuestCardProps {
  missionCode: string | null | undefined;
  rarity?: Rarity | null;
  title: string;
  level?: number;
  rating?: number;
  badges?: string[];
  distance?: string;
  rewards?: {
    xp?: number;
    gp?: number;
    gc?: number;
    items?: number;
  };
  onClick?: () => void;
  variant?: 'list' | 'detail' | 'mini';
  className?: string;
}

export default function QuestCard({
  missionCode,
  rarity,
  title,
  level,
  rating,
  badges,
  distance,
  rewards,
  onClick,
  variant = 'list',
  className,
}: QuestCardProps) {
  const { t } = useTranslation();
  const card = getQuestCard(missionCode, rarity);
  const labels = getCardLabels(card.cardCode, card.category);
  const cls = [
    styles.questCard,
    styles[variant],
    styles[card.category],
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className={styles.illustration}>
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <use href={card.href} />
        </svg>
        <div className={styles.cardLabels}>
          <span className={styles.cardLabelCategory}>
            {labels.season
              ? t(`questCard.season.${labels.season}`)
              : t(`questCard.category.${labels.category}`)}
          </span>
          {labels.window && (
            <span className={styles.cardLabelWindow}>
              {t(`questCard.window.${labels.window}`)}
            </span>
          )}
        </div>
      </div>

      <div className={styles.overlay}>
        {(level !== undefined || (badges && badges.length > 0)) && (
          <div className={styles.badgeRow}>
            {level !== undefined && <span className={styles.badge}>Lv.{level}+</span>}
            {badges?.map((b, i) => (
              <span key={`${b}-${i}`} className={styles.badge}>{b}</span>
            ))}
          </div>
        )}

        <h3 className={styles.title}>{title}</h3>

        {(distance || rating) && (
          <div className={styles.meta}>
            {distance && <span>{distance}</span>}
            {distance && rating ? <span> · </span> : null}
            {rating && (
              <span className={styles.rating}>
                {'★'.repeat(rating)}{'☆'.repeat(Math.max(0, 5 - rating))}
              </span>
            )}
          </div>
        )}

        {rewards && variant !== 'mini' && (
          <div className={styles.rewards}>
            {rewards.xp !== undefined && rewards.xp > 0 && (
              <span className={styles.rewardChip}>EXP +{rewards.xp.toLocaleString()}</span>
            )}
            {rewards.gp !== undefined && rewards.gp > 0 && (
              <span className={styles.rewardChip}>G +{rewards.gp.toLocaleString()}</span>
            )}
            {rewards.gc !== undefined && rewards.gc > 0 && (
              <span className={styles.rewardChip}>GC +{rewards.gc}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
