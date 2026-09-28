import type { ReactNode } from 'react';
import styles from './CardMessage.module.css';

/** F-DM-02(260928) — 채팅방의 모든 카드형 메시지가 거치는 공용 셸. 카드 종류가 늘어도
 * CARD_TYPES 에 한 항목만 추가하면 된다(레이아웃 로직 중복 금지).
 *
 * alignBySender 규칙(기본 true): 사람이 공유하는 콘텐츠(매물 카드·워키토키/위치공유 초대·
 * 현재위치)는 채팅 관례대로 발신자 기준 좌/우 말풍선처럼 붙는다. 반대로 양쪽이 함께
 * 다루는 협상/상태 카드(가격제안·약속·결제·묶음요청·시스템 프롬프트)는 "내 것/네 것"처럼
 * 보이면 안 되므로 중립(가운데, 공유 폭)으로 둔다. */
export type CardMessageType =
  | 'item'
  | 'bundle'
  | 'walkie_invite'
  | 'location_share_invite'
  | 'location_pin'
  | 'price_offer'
  | 'appointment'
  | 'payment'
  | 'prompt';

export const CARD_TYPES: Record<CardMessageType, { alignBySender: boolean }> = {
  item: { alignBySender: true },
  walkie_invite: { alignBySender: true },
  location_share_invite: { alignBySender: true },
  location_pin: { alignBySender: true },
  bundle: { alignBySender: false },
  price_offer: { alignBySender: false },
  appointment: { alignBySender: false },
  payment: { alignBySender: false },
  prompt: { alignBySender: false },
};

interface CardMessageProps {
  type: CardMessageType;
  isMine: boolean;
  /** 메시지별 개별 오버라이드 — 기본은 CARD_TYPES[type] 값을 따른다. */
  alignBySender?: boolean;
  /** 색 헤더 스트립(매물/워키토키/위치공유/현재위치/묶음요청) — 카드 상단 전체폭 라벨. */
  headerLabel?: string;
  /** 아이콘+제목+상태필 같은 커스텀 헤더 행(약속·가격제안·결제·프롬프트류). 본문 패딩 안에 그려진다. */
  header?: ReactNode;
  children: ReactNode;
  timeLabel?: string;
  className?: string;
}

/** 모든 카드형 메시지(매물/워키토키/위치공유/현재위치/묶음요청/가격제안/약속/결제/시스템 프롬프트)의
 * 공용 렌더 셸. 시간 라벨은 항상 본문 패딩 안 우하단에 그려 카드 테두리와 겹치지 않는다. */
export function CardMessage({ type, isMine, alignBySender, headerLabel, header, children, timeLabel, className }: CardMessageProps) {
  const aligned = alignBySender ?? CARD_TYPES[type].alignBySender;
  const alignClass = aligned ? (isMine ? styles.cardMine : styles.cardTheirs) : styles.cardNeutral;
  return (
    <div className={[styles.card, alignClass, className].filter(Boolean).join(' ')} data-card-type={type}>
      {headerLabel && <div className={styles.cardHeaderStrip}>{headerLabel}</div>}
      <div className={styles.cardContent}>
        {header}
        {children}
        {timeLabel && <div className={styles.cardTime}>{timeLabel}</div>}
      </div>
    </div>
  );
}

export default CardMessage;
