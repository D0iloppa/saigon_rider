import React from 'react';
import { useTranslation } from 'react-i18next';
import { getQuestCard, getCardLabels, type Rarity } from './quest-card-map';
import { useQuestCardImages } from './use-quest-card-images';
import { AppImage } from '@/components/ui/AppImage';
import { formatTimeLeft } from '@/lib/format';
import styles from './QuestCard.module.css';

export interface QuestCardProps {
  missionCode: string | null | undefined;
  rarity?: Rarity | null;
  customImageUrl?: string | null;
  title: string;
  level?: number;
  rating?: number;
  badges?: string[];
  tags?: ('HOT' | 'NEW' | 'LIMITED')[];
  distance?: string;
  rewards?: {
    xp?: number;
    gp?: number;
    gc?: number;
    items?: number;
  };
  expiresAt?: string;
  completed?: boolean;
  onClick?: () => void;
  variant?: 'list' | 'detail' | 'mini';
  className?: string;
}

// 만료까지 남은 시간에 따른 타이머 칩 색상 (list variant 전용)
function getTimerStyle(iso?: string): { bg: string; color: string } {
  if (!iso) return { bg: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' };
  const hours = (new Date(iso).getTime() - Date.now()) / 3_600_000;
  if (hours <= 6) return { bg: 'rgba(220,38,38,0.22)', color: '#FF6B6B' };
  if (hours <= 24) return { bg: 'rgba(255,184,0,0.18)', color: '#FFB800' };
  return { bg: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' };
}

export default function QuestCard({
  missionCode,
  rarity,
  customImageUrl,
  title,
  level,
  rating,
  badges,
  tags,
  distance,
  rewards,
  expiresAt,
  completed = false,
  onClick,
  variant = 'list',
  className,
}: QuestCardProps) {
  const { t } = useTranslation();
  const card = getQuestCard(missionCode, rarity);
  const labels = getCardLabels(card.cardCode, card.category);
  const cardImages = useQuestCardImages();
  const imageUrl = customImageUrl || cardImages[card.cardCode];
  const cls = [
    styles.questCard,
    styles[variant],
    styles[card.category],
    completed ? styles.completed : null,
    className,
  ].filter(Boolean).join(' ');

  const timeLeft = variant === 'list' && !completed ? formatTimeLeft(expiresAt) : null;
  const timerStyle = timeLeft ? getTimerStyle(expiresAt) : null;

  return (
    <div className={cls} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className={styles.illustration}>
        {imageUrl ? (
          <AppImage src={imageUrl} alt="" className={styles.illustrationImg} />
        ) : (
          <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <use href={card.href} />
          </svg>
        )}
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
        {variant === 'list' && (completed || (tags && tags.length > 0)) && (
          <div className={styles.badgeRow}>
            {completed && <span className={styles.completedBadge}>✓ {t('quest.completedBadge')}</span>}
            {!completed && tags?.map((tag, i) => (
              <span key={`${tag}-${i}`} className={`${styles.tag} ${styles[`tag${tag}`]}`}>{tag}</span>
            ))}
          </div>
        )}

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
            {timeLeft && timerStyle && (
              <span className={styles.timerChip} style={{ background: timerStyle.bg, color: timerStyle.color }}>
                ⏱ {timeLeft}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
