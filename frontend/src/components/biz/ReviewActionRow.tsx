import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '@/lib/format';
import styles from './ReviewActionRow.module.css';

interface ReviewLike {
  id: string;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
}

interface Props<T extends ReviewLike> {
  review: T;
  /** 사장님 답글 배지에 쓸 업체명 */
  businessName: string;
  /** 이 화면을 보는 사람이 업체 오너인지 — true 면 답글 달기/수정/삭제 버튼을 보여준다 */
  isOwner: boolean;
  /** 이 후기가 내(로그인 사용자) 후기인지 — true 면 신고 대신 "내 후기 삭제" 버튼 */
  isMine: boolean;
  onReply: (review: T) => void;
  onDeleteReply: (review: T) => void;
  onDeleteMine: () => void;
  onReport: (review: T) => void;
}

/** 후기 사장님 답글 표시 + 답글/신고 액션 버튼줄 — BizPublic(공개 프로필)·BizDashboard(파트너
 * 라운지) 공용. BizPublic.tsx 에 있던 인라인 JSX(ownerReplyBlock+reviewActions) 를 그대로
 * 옮긴 순수 리팩토링 — 오너 게이팅(isOwner)·본인 후기 배제(isMine) 조건은 호출부가 넘긴다. */
export default function ReviewActionRow<T extends ReviewLike>({
  review,
  businessName,
  isOwner,
  isMine,
  onReply,
  onDeleteReply,
  onDeleteMine,
  onReport,
}: Props<T>) {
  const { t } = useTranslation();
  return (
    <>
      {review.ownerReply && (
        <div className={styles.ownerReplyBlock}>
          <div className={styles.ownerReplyHead}>
            <span className={styles.ownerReplyBadge}>{businessName}</span>
            {review.ownerRepliedAt && (
              <span className={styles.ownerReplyTime}>{formatRelativeTime(review.ownerRepliedAt)}</span>
            )}
          </div>
          <p className={styles.ownerReplyBody}>{review.ownerReply}</p>
        </div>
      )}
      <div className={styles.reviewActions}>
        {isOwner && (
          <button type="button" className={styles.reviewActionBtn} onClick={() => onReply(review)}>
            {review.ownerReply
              ? t('biz.review.reply.editCta', { defaultValue: '답글 수정' })
              : t('biz.review.reply.cta', { defaultValue: '답글 달기' })}
          </button>
        )}
        {isOwner && review.ownerReply && (
          <button type="button" className={styles.reviewActionBtn} onClick={() => onDeleteReply(review)}>
            {t('biz.review.reply.deleteCta', { defaultValue: '답글 삭제' })}
          </button>
        )}
        {isMine ? (
          <button type="button" className={styles.reviewActionBtnDanger} onClick={onDeleteMine}>
            {t('biz.review.deleteCta', { defaultValue: '내 후기 삭제' })}
          </button>
        ) : (
          <button type="button" className={styles.reviewActionBtn} onClick={() => onReport(review)}>
            {t('biz.review.report.cta', { defaultValue: '신고' })}
          </button>
        )}
      </div>
    </>
  );
}
