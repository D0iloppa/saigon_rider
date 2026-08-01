import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bike } from 'lucide-react';
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
          <div className={sys.card} style={{ margin: 0 }}>
            <SkeletonRows count={3} />
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
