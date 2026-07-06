import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';
import { formatPriceVnd } from '@/pages/market/marketFormat';
import styles from './PriceOfferSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  listingTitle: string;
  listingThumbnailUrl: string | null;
  listingPriceVnd: number;
  /** 제안 금액 확정 시 호출. 전송 성공/실패와 시트 닫기는 부모 책임. */
  onSubmit: (amount: number) => void;
  submitting?: boolean;
}

/** 판매가 대비 −1/−3/−5% 감액 칩 — 가격대별 단위(200만 미만 1천, 이상 1만 VND) 절사, 중복 제거. */
function quickSteps(price: number): number[] {
  const unit = price >= 2_000_000 ? 10_000 : 1_000;
  const steps = [0.01, 0.03, 0.05].map(
    (pct) => Math.max(unit, Math.floor((price * pct) / unit) * unit),
  );
  return [...new Set(steps)];
}

/**
 * 가격제안 시트 (당근마켓 참조) — 매물 카드 + 금액 입력 + 빠른 감액 칩.
 * 진입점 2곳(매물 상세, DM 컴포저)에서 공용.
 */
export default function PriceOfferSheet({
  open,
  onClose,
  listingTitle,
  listingThumbnailUrl,
  listingPriceVnd,
  onSubmit,
  submitting = false,
}: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(listingPriceVnd);
  const steps = useMemo(() => quickSteps(listingPriceVnd), [listingPriceVnd]);

  // 열릴 때마다 판매가로 리셋
  useEffect(() => {
    if (open) setAmount(listingPriceVnd);
  }, [open, listingPriceVnd]);

  const discountPct =
    amount > 0 && amount < listingPriceVnd
      ? Math.round(((listingPriceVnd - amount) / listingPriceVnd) * 100)
      : 0;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <h2 className={styles.title}>{t('dm.priceOfferTitle', { defaultValue: '가격제안하기' })}</h2>

        <div className={styles.listingCard}>
          <AppImage src={listingThumbnailUrl ?? undefined} alt="" className={styles.listingThumb} />
          <div className={styles.listingInfo}>
            <span className={styles.listingTitle}>{listingTitle}</span>
            <span className={styles.listingPrice}>{formatPriceVnd(listingPriceVnd, t)}</span>
          </div>
        </div>

        <div className={styles.amountField}>
          <span className={styles.amountPrefix}>₫</span>
          <input
            className={styles.amountInput}
            inputMode="numeric"
            value={amount > 0 ? amount.toLocaleString('vi-VN') : ''}
            onChange={(e) => setAmount(parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
            placeholder="0"
          />
        </div>
        <p className={styles.hint}>
          {discountPct > 0
            ? t('dm.priceOfferBelow', { pct: discountPct, defaultValue: `판매가보다 ${discountPct}% 낮은 제안` })
            : ' '}
        </p>

        <div className={styles.chips}>
          {steps.map((step) => (
            <button
              key={step}
              type="button"
              className={styles.chip}
              onClick={() => setAmount((prev) => Math.max(0, prev - step))}
            >
              −{formatPriceVnd(step, t)}
            </button>
          ))}
        </div>

        <div className={styles.submit}>
          <Button onClick={() => onSubmit(amount)} disabled={amount <= 0 || submitting}>
            {t('dm.priceOfferSend', { defaultValue: '제안 보내기' })}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
