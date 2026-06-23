import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import { StarIcon } from '@/components/ui/StarIcon';
import { formatPriceVnd } from '@/pages/market/marketFormat';
import type { TradeHistory } from '@/api/market';
import styles from './TradeRow.module.css';

interface Props {
  trade: TradeHistory;
  /** 항목(매물 썸네일·제목) 탭 — 거래한 매물 상세로. */
  onOpen: () => void;
  /** 후기 남기기(미작성 시). 없으면 버튼 숨김. */
  onReview?: () => void;
  /** 'card'(독립 카드, 전체 페이지) | 'plain'(섹션 카드 안의 행). 기본 card. */
  variant?: 'card' | 'plain';
}

/** 거래일시 YYYY.MM.DD */
function fmtDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '.');
}

/** 거래 이력 1행 — 프로필 요약·전체 이력 페이지 공용. 매물·역할·상대·거래일시·내 후기. */
export default function TradeRow({ trade: tr, onOpen, onReview, variant = 'card' }: Props) {
  const { t } = useTranslation();
  return (
    <div className={variant === 'plain' ? styles.rowPlain : styles.row}>
      <button type="button" className={styles.main} onClick={onOpen}>
        <div className={styles.thumb}>
          <AppImage src={tr.thumbnailUrl ?? undefined} alt="" />
        </div>
        <div className={styles.info}>
          <div className={styles.titleRow}>
            <span className={styles.roleBadge} data-role={tr.role}>
              {tr.role === 'sold' ? t('profile.tradeSold', { defaultValue: '판매' }) : t('profile.tradeBought', { defaultValue: '구매' })}
            </span>
            <span className={styles.title}>{tr.listingTitle}</span>
          </div>
          <span className={styles.meta}>
            {formatPriceVnd(tr.priceVnd, t)} · {tr.counterpartNickname ?? '—'} · {fmtDate(tr.completedAt)}
          </span>
          {tr.myReview && (
            <span className={styles.myReview}>
              <StarIcon size={11} />
              <span className={styles.myRatingVal}>{tr.myReview.rating}.0</span>
              {tr.myReview.comment ? ` · ${tr.myReview.comment}` : ` · ${t('profile.reviewDone', { defaultValue: '후기완료' })}`}
            </span>
          )}
        </div>
      </button>
      {!tr.reviewLeft && onReview && (
        <button type="button" className={styles.reviewBtn} onClick={onReview}>
          {t('profile.leaveReview', { defaultValue: '후기 남기기' })}
        </button>
      )}
    </div>
  );
}
