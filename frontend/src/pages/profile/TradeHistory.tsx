import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bike } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import TradeRow from '@/components/market/TradeRow';
import ReviewSheet from '@/components/market/ReviewSheet';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { fetchTrades, fetchListings, listingToTradeRow, type TradeHistory as Trade } from '@/api/market';
import { useUserStore } from '@/store/useUserStore';
import sys from '@/styles/system.module.css';
import styles from './TradeHistory.module.css';

type RoleFilter = 'all' | 'bought' | 'sold';
type SortOrder = 'recent' | 'oldest';

/** 전체 거래 이력 페이지 — 프로필 '거래 이력 > 전체 보기'. 항목 탭 → 매물 상세. */
export default function TradeHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const user = useUserStore((s) => s.user);

  const initialRole = useMemo<RoleFilter>(() => {
    const r = new URLSearchParams(search).get('role');
    return r === 'bought' || r === 'sold' ? r : 'all';
  }, [search]);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(initialRole);
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');

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

  // 260928 실기기 피드백 3차: 판매 이력에 판매중 매물도 포함(당근 판매내역 모델).
  // 예약중(RESERVED)은 이미 trades 의 IN_PROGRESS 행으로 노출되므로 여기선 ON_SALE 만 가져온다.
  const [onSaleListings, setOnSaleListings] = useState<Trade[]>([]);
  useEffect(() => {
    if (!user?.id) return;
    fetchListings({ sellerId: user.id, hideSold: false, size: 20 })
      .then((page) => {
        setOnSaleListings(page.items.filter((l) => l.status === 'ON_SALE').map(listingToTradeRow));
      })
      .catch(() => {});
  }, [user?.id]);

  const visibleTrades = useMemo(() => {
    const filtered = roleFilter === 'all' ? trades : trades.filter((tr) => tr.role === roleFilter);
    // 백엔드가 이미 최신순(updated_at desc)으로 내려주므로 오래된순은 뒤집기만 하면 된다.
    const sorted = sortOrder === 'recent' ? filtered : [...filtered].reverse();
    // 판매중 매물은 정렬 토글 대상이 아니고 항상 최상단 고정.
    return roleFilter === 'bought' ? sorted : [...onSaleListings, ...sorted];
  }, [trades, roleFilter, sortOrder, onSaleListings]);

  return (
    <div className={styles.page}>
      <TopBar title={t('profile.tradeHistory', { defaultValue: '거래 이력' })} />
      <div className={styles.filterRow}>
        {(['all', 'bought', 'sold'] as const).map((r) => (
          <button
            key={r}
            className={`${styles.filterChip} ${roleFilter === r ? styles.filterChipActive : ''}`}
            onClick={() => setRoleFilter(r)}
          >
            {r === 'all'
              ? t('profile.tradeFilterAll', { defaultValue: '전체' })
              : r === 'bought'
              ? t('profile.tradeBought', { defaultValue: '구매' })
              : t('profile.tradeSold', { defaultValue: '판매' })}
          </button>
        ))}
        <button
          className={`${styles.filterChip} ${sortOrder === 'oldest' ? styles.filterChipActive : ''}`}
          onClick={() => setSortOrder(sortOrder === 'recent' ? 'oldest' : 'recent')}
        >
          {sortOrder === 'recent'
            ? t('profile.sortRecent', { defaultValue: '최신순' })
            : t('profile.sortOldest', { defaultValue: '오래된순' })}
        </button>
      </div>
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
        ) : visibleTrades.length === 0 ? (
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
          visibleTrades.map((tr) => (
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
