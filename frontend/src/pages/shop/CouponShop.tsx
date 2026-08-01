import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronLeft, Gift } from 'lucide-react';
import { AppImage } from '@/components/ui/AppImage';
import { RewardIcon } from '@/components/ui/RewardIcon';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { useDialogStore } from '@/store/useDialogStore';
import { fetchWallet } from '@/api/wallet';
import { fetchCoupons, redeemCoupon, type CouponItem, type RedemptionItem } from '@/api/coupons';
import { formatNumber } from '@/lib/format';
import sys from '@/styles/system.module.css';
import styles from './CouponShop.module.css';

/** SGR-213 P3: 상점 쿠폰 탭 — RP(엔진 잔액)로 기프티콘 교환 + 완료 연출. */
export default function CouponShop() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openDialog = useDialogStore((s) => s.open);
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [redeeming, setRedeeming] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState<RedemptionItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [list, wallet] = await Promise.all([fetchCoupons(), fetchWallet()]);
      setCoupons(list);
      setBalance(wallet.xp_balance); // RP = gc_balance (BFF wallet.xp_balance)
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

  const onRedeem = (c: CouponItem) => {
    if (redeeming) return;
    if (balance < c.required_rp) {
      toast.error(t('coupon.insufficient'));
      return;
    }
    // 멱등키는 "교환 의도" 단위(다이얼로그 오픈 시점)로 생성 — 같은 의도의 중복
    // 제출(더블탭/타임아웃 후 즉시 재확인)이 서버에서 원본 반환으로 흡수된다 (E-8)
    const idemKey = crypto.randomUUID();
    openDialog({
      title: c.item_name,
      message: t('coupon.confirm', { rp: formatNumber(c.required_rp) }),
      onConfirm: async () => {
        setRedeeming(c.catalog_id);
        try {
          const result = await redeemCoupon(c.catalog_id, idemKey);
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
        <button className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ChevronLeft size={26} strokeWidth={2} aria-hidden />
        </button>
        <div className={styles.headerTitle}>{t('coupon.shop_title')}</div>
        <button className={styles.myBtn} onClick={() => navigate('/coupons/mine')}>
          {t('coupon.my_box')}
        </button>
        <div className={styles.balance}>
          <span className={styles.balanceLabel}>
            <RewardIcon type="XP" size={16} />
            {t('coupon.balance')}
          </span>
          <span className={styles.balanceValue}>{formatNumber(balance)}</span>
        </div>
      </div>

      <div className={styles.body}>
      {loading ? (
        <div className={styles.grid} aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={styles.card}>
              <div className={sys.skelBar} style={{ width: 104, height: 104, borderRadius: 12, margin: '6px 0 10px' }} />
              <div className={`${sys.skelBar} ${sys.skelBarWide}`} style={{ width: '82%' }} />
              <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} style={{ width: '54%', margin: '8px 0 4px' }} />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <StateBlock
          icon={AlertCircle}
          tone="error"
          title={t('coupon.load_failed')}
          actionLabel={t('common.retry')}
          onAction={() => void load()}
        />
      ) : coupons.length === 0 ? (
        <StateBlock icon={Gift} title={t('coupon.empty')} />
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
                    <Gift size={40} strokeWidth={1.5} className={styles.thumbFallback} aria-hidden />
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
                  <RewardIcon type="XP" size={14} />
                  {formatNumber(c.required_rp)}
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
