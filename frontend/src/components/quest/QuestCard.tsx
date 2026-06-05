import React from 'react';
import { useTranslation } from 'react-i18next';
import { getQuestCard, getCardByCode, getCardLabels, type Rarity } from './quest-card-map';
import { useQuestCardImages } from './use-quest-card-images';
import { AppImage } from '@/components/ui/AppImage';
import { formatTimeLeft } from '@/lib/format';
import { emojiUrl } from '@/lib/emoji';
import styles from './QuestCard.module.css';

export interface QuestCardProps {
  missionCode: string | null | undefined;
  rarity?: Rarity | null;
  csv?: string | null;
  customImageUrl?: string | null;
  title: string;
  level?: number;
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
  completedAt?: string | null;
  locked?: boolean;
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
  csv,
  customImageUrl,
  title,
  level,
  badges,
  tags,
  distance,
  rewards,
  expiresAt,
  completed = false,
  completedAt,
  locked = false,
  onClick,
  variant = 'list',
  className,
}: QuestCardProps) {
  const { t } = useTranslation();
  // csv(정적 SVG 카드 id)가 있으면 그걸로 카드 렌더, 없으면 mission_code 해석 폴백.
  const card = csv ? getCardByCode(csv) : getQuestCard(missionCode, rarity);
  const labels = getCardLabels(card.cardCode, card.category);
  const cardImages = useQuestCardImages();
  // csv 있으면 SVG 스프라이트를 1순위로 표시(기존 PNG 경로는 csv 없을 때 폴백).
  const imageUrl = csv ? null : (customImageUrl || cardImages[card.cardCode]);
  const cls = [
    styles.questCard,
    styles[variant],
    styles[card.category],
    completed ? styles.completed : null,
    locked ? styles.locked : null,
    className,
  ].filter(Boolean).join(' ');

  const timeLeft = variant === 'list' && !completed ? formatTimeLeft(expiresAt) : null;
  const timerStyle = timeLeft ? getTimerStyle(expiresAt) : null;
  const clickable = !locked && !!onClick;

  return (
    <div className={cls} onClick={clickable ? onClick : undefined} role={clickable ? 'button' : undefined}>
      <div className={styles.illustration}>
        {imageUrl ? (
          <AppImage src={imageUrl} alt="" className={styles.illustrationImg} />
        ) : (
          <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <use href={card.href} />
          </svg>
        )}
      </div>

      {locked && (
        <div className={styles.lockOverlay}>
          <span className={styles.lockIcon}>🔒</span>
          {level !== undefined && (
            <span className={styles.lockLevel}>Lv.{level}+</span>
          )}
        </div>
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

      <div className={styles.overlay}>
        {variant === 'list' && (completed || (tags && tags.length > 0)) && (
          <div className={styles.badgeRow}>
            {completed && (
              <span className={styles.completedBadge}>
                ✓ {completedAt ? t('quest.completedAt', { date: completedAt.slice(0, 10) }) : t('quest.completedBadge')}
              </span>
            )}
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

        {distance && (
          <div className={styles.meta}>
            <span>{distance}</span>
          </div>
        )}

        {rewards && variant !== 'mini' && (
          <div className={styles.rewards}>
            {rewards.xp !== undefined && rewards.xp > 0 && (
              <span className={styles.rewardChip}>
                <img className={styles.rewardChipIcon} src={emojiUrl('1f48e')} width={14} height={14} alt="" />
                {t('currency.xp')} +{rewards.xp.toLocaleString()}
              </span>
            )}
            {rewards.gp !== undefined && rewards.gp > 0 && (
              <span className={styles.rewardChip}>
                <img className={styles.rewardChipIcon} src={emojiUrl('1fa99')} width={14} height={14} alt="" />
                {t('currency.gold')} +{rewards.gp.toLocaleString()}
              </span>
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
