import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bike } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import TradeRow from '@/components/market/TradeRow';
import ReviewSheet from '@/components/market/ReviewSheet';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { fetchTrades, type TradeHistory as Trade } from '@/api/market';
import { useUserStore } from '@/store/useUserStore';
import sys from '@/styles/system.module.css';
import styles from './TradeHistory.module.css';

/** 전체 거래 이력 페이지 — 프로필 '거래 이력 > 전체 보기'. 항목 탭 → 거래완료(DM) 화면. */
export default function TradeHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ targetId: string; listingId: string } | null>(null);

  // P1-16: 조회 실패를 "거래 0건"으로 위장하지 않고 구분해 재시도를 제공
  const load = () => {
    if (!user?.id) return;
    fetchTrades(user.id)
      .then((tr) => { setTrades(tr); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!user?.id) {
      // user.id가 끝내 확정되지 않으면(F-S7-03 FR-3) 스켈레톤이 영구 표시되지
      // 않도록 타임아웃 후 실패 상태로 전환해 재시도 버튼을 노출한다.
      const timer = setTimeout(() => { setLoading(false); setError(true); }, 8000);
      return () => clearTimeout(timer);
    }
    load();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.page}>
      <TopBar title={t('profile.tradeHistory', { defaultValue: '거래 이력' })} />
      <div className={styles.list}>
        {loading ? (
          <div className={sys.card} style={{ margin: 0 }}>
            <SkeletonRows count={3} />
          </div>
        ) : error ? (
          <div className={sys.card} style={{ margin: 0 }}>
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('profile.tradesLoadError', { defaultValue: '거래 이력을 불러오지 못했어요' })}
              actionLabel={t('common.retry')}
              onAction={load}
            />
          </div>
        ) : trades.length === 0 ? (
          <div className={sys.card} style={{ margin: 0 }}>
            <StateBlock
              icon={Bike}
              title={t('profile.noTrades', { defaultValue: '아직 거래 내역이 없어요' })}
              desc={t('profile.noTradesSub', { defaultValue: '마켓에서 마음에 드는 매물을 찾아 첫 거래를 시작해보세요' })}
              actionLabel={t('profile.noTradesCta', { defaultValue: '마켓 둘러보기' })}
              onAction={() => navigate('/market')}
            />
          </div>
        ) : (
          trades.map((tr) => (
            <TradeRow
              key={tr.appointmentId}
              trade={tr}
              onOpen={() => navigate(`/dm/${tr.conversationId}`)}
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
