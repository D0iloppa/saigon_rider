import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { useDialogStore } from '@/store/useDialogStore';
import { fetchWallet } from '@/api/wallet';
import { fetchCoupons, redeemCoupon, type CouponItem, type RedemptionItem } from '@/api/coupons';
import { formatNumber } from '@/lib/format';
import styles from './CouponShop.module.css';

/** SGR-213 P3: 상점 쿠폰 탭 — RP(엔진 잔액)로 기프티콘 교환 + 완료 연출. */
export default function CouponShop() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openDialog = useDialogStore((s) => s.open);
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState<RedemptionItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, wallet] = await Promise.all([fetchCoupons(), fetchWallet()]);
      setCoupons(list);
      setBalance(wallet.xp_balance); // RP = gc_balance (BFF wallet.xp_balance)
    } catch {
      toast.error(t('coupon.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRedeem = (c: CouponItem) => {
    if (redeeming) return;
    if (balance < c.required_rp) {
      toast.error(t('coupon.insufficient'));
      return;
    }
    openDialog({
      title: c.item_name,
      message: t('coupon.confirm', { rp: formatNumber(c.required_rp) }),
      onConfirm: async () => {
        setRedeeming(c.catalog_id);
        try {
          const result = await redeemCoupon(c.catalog_id);
          setCelebrate(result);
          await load();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t('coupon.redeem_failed'));
        } finally {
          setRedeeming(null);
        }
      },
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerBg} />
        <button className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>‹</button>
        <div className={styles.headerTitle}>{t('coupon.shop_title')}</div>
        <button className={styles.myBtn} onClick={() => navigate('/coupons/mine')}>
          {t('coupon.my_box')}
        </button>
        <div className={styles.balance}>
          <span className={styles.balanceLabel}>💎 {t('coupon.balance')}</span>
          <span className={styles.balanceValue}>{formatNumber(balance)}</span>
        </div>
      </div>

      <div className={styles.body}>
      {loading ? (
        <div className={styles.empty}>{t('common.loading')}</div>
      ) : coupons.length === 0 ? (
        <div className={styles.empty}>{t('coupon.empty')}</div>
      ) : (
        <div className={styles.grid}>
          {coupons.map((c) => {
            const affordable = balance >= c.required_rp;
            return (
              <div key={c.catalog_id} className={styles.card}>
                <div className={styles.thumb}>
                  {c.thumbnail_url ? (
                    <AppImage src={c.thumbnail_url} alt={c.item_name} />
                  ) : (
                    <span className={styles.thumbFallback}>🎁</span>
                  )}
                </div>
                <div className={styles.name}>{c.item_name}</div>
                {c.face_value_vnd != null && (
                  <div className={styles.face}>{formatNumber(c.face_value_vnd)}₫</div>
                )}
                <button
                  className={affordable ? styles.redeemBtn : styles.redeemBtnDim}
                  disabled={redeeming === c.catalog_id}
                  onClick={() => onRedeem(c)}
                >
                  💎 {formatNumber(c.required_rp)}
                </button>
                {!affordable && (
                  <div className={styles.gap}>
                    {t('coupon.more_needed', { rp: formatNumber(c.required_rp - balance) })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* 교환 완료 연출 — 가상→실물의 놀라움 */}
      {celebrate && (
        <div className={styles.celebrateOverlay} onClick={() => setCelebrate(null)}>
          <div className={styles.celebrateCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.burst}>🎉</div>
            <div className={styles.celebrateTitle}>{t('coupon.redeemed_title')}</div>
            <div className={styles.celebrateItem}>{celebrate.item_name}</div>
            <div className={styles.celebrateDesc}>
              {celebrate.voucher_code
                ? t('coupon.voucher_ready')
                : t('coupon.voucher_pending')}
            </div>
            <button className={styles.celebrateBtn} onClick={() => { setCelebrate(null); navigate('/coupons/mine'); }}>
              {t('coupon.go_my_box')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
