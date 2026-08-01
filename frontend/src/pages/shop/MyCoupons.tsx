import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { AlertCircle, ChevronLeft, Gift } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppImage } from '@/components/ui/AppImage';
import SkeletonRows from '@/components/ui/SkeletonRows';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { fetchMyCoupons, type RedemptionItem } from '@/api/coupons';
import { formatRelativeTime } from '@/lib/format';
import styles from './MyCoupons.module.css';

const STATUS_KEYS = ['REQUESTED', 'FULFILLED', 'FAILED', 'REFUNDED', 'CANCELLED'];

/** SGR-213 P4: 내 쿠폰함 — 달려서 얻어낸 전리품 기록 + QR 발급(더미). */
export default function MyCoupons() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<RedemptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [qrItem, setQrItem] = useState<RedemptionItem | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setItems(await fetchMyCoupons());
    } catch {
      setLoadError(true);
      toast.error(t('coupon.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusLabel = (s: string) =>
    STATUS_KEYS.includes(s) ? t(`coupon.status.${s}`) : s;

  // QR(현재는 voucher_code 더미 인코딩) PNG 저장. 추후 실제 바코드/QR 페이로드로 교체.
  const onSaveQr = async () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas || !qrItem) return;
    try {
      await native.saveImageFile(`coupon-${qrItem.redemption_id}.png`, canvas.toDataURL('image/png'));
    } catch {
      toast.error(t('coupon.qr_save_failed'));
    }
  };

  return (
    <div className={styles.page}>
      <StatusBar />
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ChevronLeft size={24} strokeWidth={2} aria-hidden />
        </button>
        <span className={styles.headerTitle}>{t('coupon.my_box')}</span>
      </div>

      {loading ? (
        <div className={styles.list} aria-hidden>
          <SkeletonRows count={4} />
        </div>
      ) : loadError ? (
        <StateBlock
          icon={AlertCircle}
          tone="error"
          title={t('coupon.load_failed')}
          actionLabel={t('common.retry')}
          onAction={() => void load()}
        />
      ) : items.length === 0 ? (
        <StateBlock icon={Gift} title={t('coupon.box_empty')} />
      ) : (
        <div className={styles.list}>
          {items.map((r) => (
            <div key={r.redemption_id} className={styles.row}>
              <div className={styles.thumb}>
                {r.thumbnail_url ? (
                  <AppImage src={r.thumbnail_url} alt={r.item_name} />
                ) : (
                  <Gift size={22} strokeWidth={1.75} className={styles.thumbFallback} aria-hidden />
                )}
              </div>
              <div className={styles.info}>
                <div className={styles.name}>{r.item_name}</div>
                <div className={styles.meta}>{formatRelativeTime(r.requested_at)}</div>
                {r.voucher_code && <div className={styles.voucher}>{r.voucher_code}</div>}
              </div>
              {r.voucher_code ? (
                <button className={styles.qrBtn} onClick={() => setQrItem(r)}>
                  {t('coupon.show_qr')}
                </button>
              ) : (
                <span className={`${styles.status} ${styles[`s_${r.status}`] || ''}`}>
                  {statusLabel(r.status)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {qrItem && (
        <div className={styles.qrOverlay} onClick={() => setQrItem(null)}>
          <div className={styles.qrCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.qrTitle}>{qrItem.item_name}</div>
            <div className={styles.qrCanvas} ref={qrRef}>
              <QRCodeCanvas value={qrItem.voucher_code ?? ''} size={200} level="M" marginSize={2} />
            </div>
            {qrItem.voucher_code && <div className={styles.qrCode}>{qrItem.voucher_code}</div>}
            <div className={styles.qrHint}>{t('coupon.qr_hint')}</div>
            <div className={styles.qrActions}>
              <button className={styles.qrSave} onClick={onSaveQr}>{t('coupon.qr_save')}</button>
              <button className={styles.qrClose} onClick={() => setQrItem(null)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
