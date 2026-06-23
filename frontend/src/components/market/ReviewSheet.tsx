import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { createReview } from '@/api/market';
import { useUserStore } from '@/store/useUserStore';
import { loadSession } from '@/lib/session';
import styles from './ReviewSheet.module.css';

const MANNER_TAGS = ['PUNCTUAL', 'KIND', 'FAST_REPLY', 'GOOD_ITEM'] as const;

const STAR_LABELS: Record<number, string> = {
  1: '별로예요',
  2: '아쉬워요',
  3: '보통이에요',
  4: '좋아요',
  5: '최고예요!',
};

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

  const [rating, setRating] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) { setRating(null); setHovered(null); setTags([]); setComment(''); }
  }, [open]);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));

  const submit = async () => {
    if (!reviewerId || !rating || sending) return;
    setSending(true);
    try {
      await createReview({ reviewerId, targetId, listingId, rating, mannerTags: tags, comment: comment.trim() || undefined });
      toast.success(t('dm.reviewSent', { defaultValue: '후기를 보냈습니다' }));
      onSubmitted?.();
      onClose();
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setSending(false);
    }
  };

  const displayScore = hovered ?? rating;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <h2 className={styles.title}>{t('dm.sendReview', { defaultValue: '거래 후기 보내기' })}</h2>

        <label className={styles.label}>{t('dm.satisfaction', { defaultValue: '별점' })}</label>
        <div className={styles.starWrap}>
          <div className={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={styles.starBtn}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(null)}
                onTouchStart={() => setHovered(n)}
                onTouchEnd={() => setHovered(null)}
                onClick={() => setRating(n)}
                aria-label={`${n}점`}
              >
                <svg width="36" height="36" viewBox="0 0 24 24"
                  fill={displayScore !== null && n <= displayScore ? '#f59e0b' : 'none'}
                  stroke={displayScore !== null && n <= displayScore ? '#f59e0b' : '#d1d1d6'}
                  strokeWidth="1.5">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            ))}
          </div>
          {displayScore && (
            <p className={styles.starLabel}>{STAR_LABELS[displayScore]}</p>
          )}
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
