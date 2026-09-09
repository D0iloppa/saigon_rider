import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, Copy, Ticket } from 'lucide-react';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { native } from '@/lib/native';
import { formatRelativeTime } from '@/lib/format';
import { fetchMyBizCoupons, type BizCouponClaim } from '@/api/biz';
import styles from './MapCoupons.module.css';

type CouponStatus = 'usable' | 'used' | 'expired';

function couponStatus(c: BizCouponClaim): CouponStatus {
  if (c.redeemedAt) return 'used';
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return 'expired';
  return 'usable';
}

/** 내 쿠폰 보관함 (고객) — 동네지도 프로필의 찜/단골 숏컷과 같은 위치에 진입점을 둔다(F061,
 * 새 탭바 메뉴 없이 기존 IA 하위에 배치). MapFollows.tsx 구조 미러. */
export default function MapCoupons() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [claims, setClaims] = useState<BizCouponClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchMyBizCoupons()
      .then((data) => { setClaims(data); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(() => setReloadKey((v) => v + 1), []),
  );

  const handleCopy = async (code: string) => {
    await native.copyToClipboard(code);
    toast.success(t('map.coupons.codeCopied', { defaultValue: '코드를 복사했습니다' }));
  };

  const statusLabel: Record<CouponStatus, string> = {
    usable: t('map.coupons.statusUsable', { defaultValue: '사용 가능' }),
    used: t('map.coupons.statusUsed', { defaultValue: '사용 완료' }),
    expired: t('map.coupons.statusExpired', { defaultValue: '기간 만료' }),
  };
  const statusClass: Record<CouponStatus, string> = {
    usable: styles.badgeUsable,
    used: styles.badgeUsed,
    expired: styles.badgeExpired,
  };

  return (
    <main className={styles.root}>
      <div className={styles.scrollArea} ref={containerRef as React.RefObject<HTMLDivElement>}>
      <div style={contentStyle}>
      <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ArrowLeft size={28} />
        </button>
        <h1>{t('map.coupons.title', { defaultValue: '내 쿠폰함' })}</h1>
      </header>

      {loading ? (
        <div className={styles.listArea}>
          {[1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}
        </div>
      ) : claims.length === 0 && error ? (
        <div className={styles.listArea}>
          <StateBlock
            icon={AlertCircle}
            tone="error"
            title={t('map.coupons.loadError', { defaultValue: '쿠폰을 불러오지 못했습니다' })}
            actionLabel={t('common.retry')}
            onAction={() => setReloadKey((v) => v + 1)}
          />
        </div>
      ) : claims.length === 0 ? (
        <div className={styles.listArea}>
          <StateBlock icon={Ticket} title={t('map.coupons.emptyTitle', { defaultValue: '받은 쿠폰이 없어요' })} desc={t('map.coupons.emptyDesc', { defaultValue: '업체 프로필에서 쿠폰을 받아보세요' })} />
        </div>
      ) : (
        <div className={styles.list}>
          {claims.map((c) => {
            const status = couponStatus(c);
            return (
              <div key={c.id} className={styles.card} onClick={() => navigate(`/biz/${c.profileId}`)}>
                <div className={styles.cardTop}>
                  <span className={styles.storeName}>{c.profileName}</span>
                  <span className={`${styles.badge} ${statusClass[status]}`}>{statusLabel[status]}</span>
                </div>
                <span className={styles.title}>{c.title}</span>
                {c.description && <span className={styles.desc}>{c.description}</span>}
                <span className={styles.meta}>{t('map.coupons.claimedAt', { time: formatRelativeTime(c.claimedAt), defaultValue: '{{time}} 받음' })}</span>
                {status === 'usable' && (
                  <button
                    type="button"
                    className={styles.code}
                    onClick={(e) => { e.stopPropagation(); handleCopy(c.id); }}
                  >
                    {t('map.coupons.codeLabel', { defaultValue: '매장 제시용 코드' })}: <strong>{c.id}</strong> <Copy size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
      </div>
    </main>
  );
}
