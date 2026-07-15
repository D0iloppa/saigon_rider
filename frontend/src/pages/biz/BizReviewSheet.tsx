import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { useKeyboard } from '@/hooks/useKeyboard';
import { native } from '@/lib/native';
import { extractDetail } from '@/api/client';
import { fetchMyBizReview, upsertBizReview, type BizReview } from '@/api/biz';
import styles from './BizReviewSheet.module.css';

interface Props {
  profileId: string;
  profileName: string;
  onClose: () => void;
  /** 등록/수정 성공 시 (목록 갱신용) — 시트는 성공 후 스스로 닫힌다 */
  onSubmitted?: (review: BizReview) => void;
}

/**
 * 업체 후기 작성 바텀시트 — 별점 5개 탭 + 텍스트. 본인 기존 후기가 있으면 불러와
 * 수정 모드로 전환한다(서버 upsert). NeighborhoodProfile 장소 제안 시트 패턴 미러.
 */
export default function BizReviewSheet({ profileId, profileName, onClose, onSubmitted }: Props) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  const isIosNative = native.platform === 'ios';

  // 기존 후기 프리필 — 실패(네트워크 등)해도 신규 작성으로 진행 가능해야 하므로 조용히 무시
  useEffect(() => {
    let cancelled = false;
    fetchMyBizReview(profileId)
      .then((mine) => {
        if (cancelled || !mine) return;
        setRating(mine.rating);
        setBody(mine.body);
        setEditMode(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profileId]);

  const handleSubmit = async () => {
    if (submitting || rating === 0 || !body.trim()) return;
    setSubmitting(true);
    try {
      const review = await upsertBizReview(profileId, { rating, body: body.trim() });
      toast.success(editMode ? t('biz.review.successEdit') : t('biz.review.success'));
      onSubmitted?.(review);
      onClose();
    } catch (err) {
      toast.error(extractDetail(err, t('biz.review.error')));
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        style={
          isIosNative && kb.visible
            ? {
                maxHeight: 'calc(100% - var(--status-bar-height, 0px) - 12px)',
                paddingBottom: `calc(${kb.height}px + 20px)`,
              }
            : undefined
        }
      >
        <div className={styles.title}>{editMode ? t('biz.review.titleEdit') : t('biz.review.title')}</div>
        <div className={styles.bizName}>{profileName}</div>
        <div className={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.starBtn} ${n <= rating ? styles.starActive : ''}`}
              onClick={() => setRating(n)}
              aria-label={`${n}/5`}
              aria-pressed={n <= rating}
            >
              <Star size={36} strokeWidth={1.5} fill="currentColor" />
            </button>
          ))}
        </div>
        <textarea
          className={styles.bodyField}
          value={body}
          placeholder={t('biz.review.bodyPlaceholder')}
          rows={4}
          maxLength={1000}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={submitting}>
            {t('biz.review.cancel')}
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={submitting || rating === 0 || !body.trim()}
          >
            {submitting ? t('biz.review.submitting') : editMode ? t('biz.review.submitEdit') : t('biz.review.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
