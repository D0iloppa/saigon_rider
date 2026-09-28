import type { ReactNode } from 'react';
import styles from './CardBubble.module.css';

export type CardBubbleSubtype = 'item' | 'walkie';

interface CardBubbleProps {
  /** F-DM-02(260928) — 알림톡풍 제네릭 카드. subtype 은 헤더 라벨/색상만 가른다(플러그인 없음). */
  subtype: CardBubbleSubtype;
  isMine: boolean;
  headerLabel: string;
  title: string;
  subtitle?: string;
  body?: ReactNode;
  button?: ReactNode;
  timeLabel?: string;
}

/** 매물 카드(subtype='item')와 워키토키 초대(subtype='walkie') 가 공유하는 렌더 셸.
 * 카카오톡 알림톡 스타일 — 색 헤더 스트립 → 소제목 → 굵은 제목 → 구분선 → 본문 → 버튼. */
export function CardBubble({ subtype, isMine, headerLabel, title, subtitle, body, button, timeLabel }: CardBubbleProps) {
  return (
    <div className={`${styles.card} ${isMine ? styles.cardMine : styles.cardTheirs}`}>
      <div className={styles.cardHeader} data-subtype={subtype}>
        {headerLabel}
      </div>
      <div className={styles.cardContent}>
        {subtitle && <div className={styles.cardSubtitle}>{subtitle}</div>}
        <div className={styles.cardTitle}>{title}</div>
        <div className={styles.cardDivider} />
        {body && <div className={styles.cardBody}>{body}</div>}
        {button && <div className={styles.cardButtonSlot}>{button}</div>}
      </div>
      {timeLabel && <div className={styles.cardTime}>{timeLabel}</div>}
    </div>
  );
}

export default CardBubble;
