import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ShoppingBag } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { ScrollSentinel } from '@/components/ui/ScrollSentinel';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { fetchListings, type ListingCard as MarketListing } from '@/api/market';
import ProfileListingCard from './ProfileListingCard';
import sys from '@/styles/system.module.css';
import styles from './ProfileListings.module.css';

/** 공개 프로필 '판매 중인 매물' 더보기 — UserProfile.tsx 레일의 전체 목록 드릴다운. */
export default function ProfileListings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();

  const fetchPage = useCallback(
    (page: number) => fetchListings({ sellerId: userId!, hideSold: true, publicView: true, page, size: 20 }),
    [userId],
  );
  const { items: listings, isLoading, isLoadingMore, hasMore, error, sentinelRef, reset } =
    useInfiniteScroll<MarketListing>(fetchPage, 20, [userId]);

  return (
    <div className={sys.page}>
      <TopBar title={t('userProfile.marketSection')} />
      <div className={`${sys.scroll} ${styles.scroll}`}>
        {isLoading ? (
          <SkeletonRows count={2} />
        ) : error ? (
          <StateBlock icon={AlertCircle} tone="error" title={t('userProfile.marketError')} actionLabel={t('common.retry')} onAction={reset} />
        ) : listings.length === 0 ? (
          // FR-4 제안 ③ — 빈 상태 CTA(B0-4): 타인 프로필이므로 생성이 아니라 레일로 되돌아가기
          <StateBlock
            icon={ShoppingBag}
            title={t('userProfile.marketEmpty')}
            actionLabel={t('common.back', { defaultValue: '뒤로' })}
            onAction={() => navigate(-1)}
          />
        ) : (
          <>
            <div className={styles.grid}>
              {listings.map((listing) => (
                <ProfileListingCard key={listing.id} listing={listing} onClick={() => navigate(`/market/${listing.id}`)} />
              ))}
            </div>
            <ScrollSentinel sentinelRef={sentinelRef} isLoadingMore={isLoadingMore} hasMore={hasMore} />
          </>
        )}
      </div>
    </div>
  );
}
