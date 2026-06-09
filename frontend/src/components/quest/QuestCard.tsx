import React from 'react';
import { useTranslation } from 'react-i18next';
import { getQuestCard, getCardLabels, type Rarity } from './quest-card-map';
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
  const card = getQuestCard(missionCode, rarity);
  const labels = getCardLabels(card.cardCode, card.category);
  const cardImages = useQuestCardImages();
  // 이미지(PNG/배너) 우선: 퀘스트별 override → 카드코드 PNG → (없으면) SVG 폴백.
  const imageUrl = customImageUrl || cardImages[card.cardCode];
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

      {variant !== 'mini' && (
        <>
          {/* 상단 우측: 태그 + 카테고리/윈도우 라벨 (떠있는 칩) */}
          <div className={styles.topRow}>
            {!completed && tags?.map((tag, i) => (
              <span key={`${tag}-${i}`} className={`${styles.tag} ${styles[`tag${tag}`]}`}>{tag}</span>
            ))}
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

          {/* 하단 좌측: Lv·제목·거리·보상 (스크림 없이 섀도우/칩으로 가독성) */}
          <div className={styles.overlay}>
            {(level !== undefined || completed || (badges && badges.length > 0)) && (
              <div className={styles.metaRow}>
                {level !== undefined && <span className={styles.badge}>Lv.{level}+</span>}
                {completed && (
                  <span className={styles.completedBadge}>
                    ✓ {completedAt ? t('quest.completedAt', { date: completedAt.slice(0, 10) }) : t('quest.completedBadge')}
                  </span>
                )}
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

            {rewards && (
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
        </>
      )}
    </div>
  );
}
