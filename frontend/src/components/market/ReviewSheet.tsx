import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { createReview, type ReviewRating } from '@/api/market';
import { useUserStore } from '@/store/useUserStore';
import { loadSession } from '@/lib/session';
import styles from './ReviewSheet.module.css';

const MANNER_TAGS = ['PUNCTUAL', 'KIND', 'FAST_REPLY', 'GOOD_ITEM'] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  targetId: string;
  listingId?: string;
  onSubmitted?: () => void;
}

/** 거래 후기 작성 시트 — DM(거래완료 후)·프로필 거래이력 공용. */
export default function ReviewSheet({ open, onClose, targetId, listingId, onSubmitted }: Props) {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const reviewerId = loadSession()?.userId ?? user?.id;

  const [rating, setRating] = useState<ReviewRating | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) { setRating(null); setTags([]); setComment(''); }
  }, [open]);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));

  const submit = async () => {
    if (!reviewerId || !rating || sending) return;
    setSending(true);
    try {
      await createReview({
        reviewerId,
        targetId,
        listingId,
        rating,
        mannerTags: tags,
        comment: comment.trim() || undefined,
      });
      toast.success(t('dm.reviewSent', { defaultValue: '후기를 보냈습니다' }));
      onSubmitted?.();
      onClose();
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <h2 className={styles.title}>{t('dm.sendReview', { defaultValue: '거래 후기 보내기' })}</h2>

        <label className={styles.label}>{t('dm.satisfaction', { defaultValue: '만족도' })}</label>
        <div className={styles.ratingRow}>
          <button type="button" className={`${styles.ratingBtn} ${rating === 'GOOD' ? styles.ratingGood : ''}`}
            onClick={() => setRating('GOOD')}>
            👍 {t('dm.ratingGood', { defaultValue: '좋아요' })}
          </button>
          <button type="button" className={`${styles.ratingBtn} ${rating === 'BAD' ? styles.ratingBad : ''}`}
            onClick={() => setRating('BAD')}>
            👎 {t('dm.ratingBad', { defaultValue: '별로예요' })}
          </button>
        </div>

        <label className={styles.label}>{t('dm.mannerTags', { defaultValue: '매너 칭찬 (선택)' })}</label>
        <div className={styles.tagRow}>
          {MANNER_TAGS.map((tag) => (
            <button key={tag} type="button"
              className={`${styles.tagChip} ${tags.includes(tag) ? styles.tagChipActive : ''}`}
              onClick={() => toggleTag(tag)}>
              {t(`dm.tag_${tag.toLowerCase()}`)}
            </button>
          ))}
        </div>

        <label className={styles.label}>{t('dm.reviewComment', { defaultValue: '후기 (선택)' })}</label>
        <textarea className={styles.input} rows={3} value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('dm.reviewPlaceholder', { defaultValue: '거래 경험을 남겨주세요' })} />

        <div className={styles.submit}>
          <Button onClick={submit} disabled={!rating || sending}>
            {t('dm.reviewSubmit', { defaultValue: '후기 보내기' })}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
