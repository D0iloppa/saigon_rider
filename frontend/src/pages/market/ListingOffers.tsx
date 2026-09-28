import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Tag } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { acceptPriceOffer, declinePriceOffer } from '@/api/dm';
import { fetchListingOffers, type ListingOffer } from '@/api/market';
import { formatPriceVnd } from './marketFormat';
import styles from './ListingRequests.module.css';

/** F-S0-02 FR-5: 매물에 들어온 가격 제안 목록 (판매자 전용) */
export default function ListingOffers() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [items, setItems] = useState<ListingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    fetchListingOffers(id)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async (offer: ListingOffer) => {
    setActingId(offer.id);
    try {
      await acceptPriceOffer(offer.id);
      load();
    } catch {
      toast.error(t('market.offerActionError', { defaultValue: '처리에 실패했어요' }));
    } finally {
      setActingId(null);
    }
  };

  const handleDecline = async (offer: ListingOffer) => {
    setActingId(offer.id);
    try {
      await declinePriceOffer(offer.id);
      load();
    } catch {
      toast.error(t('market.offerActionError', { defaultValue: '처리에 실패했어요' }));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className={styles.root}>
      <TopBar title={t('market.offersTitle', { defaultValue: '가격 제안 목록' })} />
      <div className={styles.scroll}>
        {loading ? (
          <div className={`shimmer ${styles.rowSkeleton}`} />
        ) : error ? (
          <StateBlock
            icon={AlertCircle}
            tone="error"
            title={t('market.loadError', { defaultValue: '불러오지 못했어요' })}
            actionLabel={t('common.retry')}
            onAction={load}
          />
        ) : items.length === 0 ? (
          <StateBlock
            icon={Tag}
            title={t('market.offersEmpty', { defaultValue: '아직 들어온 가격 제안이 없어요' })}
          />
        ) : (
          items.map((o) => (
            <div key={o.id} className={styles.row} onClick={() => navigate(`/dm/${o.conversationId}`)}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{o.counterpartNickname ?? '—'}</span>
                <span className={`${styles.rowAmount} num`}>{formatPriceVnd(o.amount, t)}</span>
              </div>
              <div className={styles.rowSub}>
                <span className={styles.rowStatus}>{t(`market.offerStatus_${o.status}`, { defaultValue: o.status })}</span>
                {o.status === 'PROPOSED' && (
                  <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                    <button
                      className={styles.declineBtn}
                      type="button"
                      disabled={actingId === o.id}
                      onClick={() => void handleDecline(o)}
                    >
                      {t('market.offerDecline', { defaultValue: '거절' })}
                    </button>
                    <button
                      className={styles.acceptBtn}
                      type="button"
                      disabled={actingId === o.id}
                      onClick={() => void handleAccept(o)}
                    >
                      {t('market.offerAccept', { defaultValue: '수락' })}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
