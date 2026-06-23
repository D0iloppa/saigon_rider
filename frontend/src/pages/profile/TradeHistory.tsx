import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import TradeRow from '@/components/market/TradeRow';
import ReviewSheet from '@/components/market/ReviewSheet';
import { fetchTrades, type TradeHistory as Trade } from '@/api/market';
import { useUserStore } from '@/store/useUserStore';
import styles from './TradeHistory.module.css';

/** 전체 거래 이력 페이지 — 프로필 '거래 이력 > 전체 보기'. 항목 탭 → 거래완료(DM) 화면. */
export default function TradeHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewTarget, setReviewTarget] = useState<{ targetId: string; listingId: string } | null>(null);

  const load = () => {
    if (!user?.id) return;
    fetchTrades(user.id).then(setTrades).catch(() => setTrades([])).finally(() => setLoading(false));
  };
  useEffect(load, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.page}>
      <TopBar title={t('profile.tradeHistory', { defaultValue: '거래 이력' })} />
      <div className={styles.list}>
        {loading ? (
          [0, 1, 2].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)
        ) : trades.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyEmoji}>🛵</span>
            <p className={styles.emptyTitle}>{t('profile.noTrades', { defaultValue: '아직 거래 내역이 없어요' })}</p>
            <p className={styles.emptySub}>{t('profile.noTradesSub', { defaultValue: '마켓에서 마음에 드는 매물을 찾아 첫 거래를 시작해보세요' })}</p>
            <button type="button" className={styles.emptyCta} onClick={() => navigate('/market')}>
              {t('profile.noTradesCta', { defaultValue: '마켓 둘러보기' })}
            </button>
          </div>
        ) : (
          trades.map((tr) => (
            <TradeRow
              key={tr.appointmentId}
              trade={tr}
              onOpen={() => navigate(`/market/${tr.listingId}`)}
              onReview={() => setReviewTarget({ targetId: tr.counterpartId, listingId: tr.listingId })}
            />
          ))
        )}
      </div>

      <ReviewSheet
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        targetId={reviewTarget?.targetId ?? ''}
        listingId={reviewTarget?.listingId}
        onSubmitted={load}
      />
    </div>
  );
}
