import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Heart, MapPin, MessageSquareText, Pencil, Store } from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import { useLocationStore } from '@/store/useLocationStore';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { StarIcon } from '@/components/ui/StarIcon';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { findWardAt } from '@/components/maps/SaigonMapV5';
import { formatRelativeTime } from '@/lib/format';
import { fetchMyRepairReviews, type MyRepairReviewsResult } from '@/api/info';
import sys from '@/styles/system.module.css';
import styles from './NeighborhoodProfile.module.css';

// 지도 화면(NeighborhoodMap.tsx)이 기억해두는 마지막 뷰포트 — GPS 재측정 없이 "기억된 위치"만 폴백으로 쓴다.
const VIEWPORT_KEY = 'sgr.map.viewport';

function fallbackCoords(): { lat: number; lng: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWPORT_KEY) ?? 'null') as { N?: number; S?: number; E?: number; W?: number } | null;
    if (v && typeof v.N === 'number' && typeof v.S === 'number' && typeof v.E === 'number' && typeof v.W === 'number') {
      return { lat: (v.N + v.S) / 2, lng: (v.E + v.W) / 2 };
    }
  } catch {
    // 손상된 저장값 무시
  }
  return null;
}

/** 동네지도 전용 프로필 — 퀵메뉴 · 나의 후기. (장소 제안 기능은 2026-07-25 제거) */
export default function NeighborhoodProfile() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const storedLocation = useLocationStore((s) => s.location);
  const savedCoords = storedLocation && storedLocation.accountId === user?.id ? storedLocation.coords : null;
  const nickname = user?.nickname || t('map.neighborhoodProfile.defaultNickname');

  const [reviewData, setReviewData] = useState<MyRepairReviewsResult | null>(null);
  const [reviewState, setReviewState] = useState<'loading' | 'error' | 'ready'>('loading');

  // 초기 상태가 'loading' 이므로 이펙트에선 fetch 만 — 재시도 핸들러만 loading 을 되돌린다
  const fetchReviews = useCallback(() => {
    fetchMyRepairReviews()
      .then((d) => { setReviewData(d); setReviewState('ready'); })
      .catch(() => setReviewState('error'));
  }, []);
  useEffect(() => { fetchReviews(); }, [fetchReviews]);
  const retryReviews = () => {
    setReviewState('loading');
    fetchReviews();
  };

  const shortcuts = [
    { label: t('map.neighborhoodProfile.shortcuts.wishlist'), Icon: Heart, onClick: () => navigate('/map/favorites') },
    {
      label: t('map.neighborhoodProfile.shortcuts.favorites'),
      Icon: Store,
      onClick: () => navigate('/map/follows'),
    },
    {
      label: t('biz.menuEntry', { defaultValue: '비즈니스 파트너' }),
      Icon: Store,
      onClick: () => navigate('/biz/status'),
    },
  ];

  const summary = reviewData?.summary ?? null;
  const avgRatingText = summary?.avgRating != null ? summary.avgRating.toFixed(1) : '–';
  const reviews = reviewData?.reviews ?? [];

  // 선택 지역(useLocationStore 파생 스냅샷) 우선, 없으면 마지막 지도 뷰포트 중심 — 동네명 표시용
  const coords = savedCoords ?? fallbackCoords();
  const wardName = coords ? findWardAt(coords.lat, coords.lng)?.region.name ?? null : null;

  const goWriteReview = () => navigate('/info/repair');

  return (
    <div className={sys.page}>
      <TopBar title={t('map.neighborhoodProfile.title')} onBack={() => navigate(-1)} />

      <div className={sys.scroll}>
        {/* 아이덴티티 — 아바타 + 닉네임 + 동네 칩 (동네지도 wardChip 룩) */}
        <section className={styles.identity}>
          <div className={styles.avatar}>
            {user?.avatarUrl ? <AppImage src={user.avatarUrl} alt="" variant="circle" /> : <span>{nickname.charAt(0).toUpperCase()}</span>}
          </div>
          <div className={styles.identityText}>
            <strong className={styles.nickname}>{nickname}</strong>
            {wardName ? (
              <span className={styles.wardChip}>
                <MapPin size={12} strokeWidth={2.5} />
                {wardName}
              </span>
            ) : (
              <p className={styles.identitySub}>{t('map.neighborhoodProfile.activityComingSoon')}</p>
            )}
          </div>
        </section>

        {/* 퀵메뉴 */}
        <section className={styles.shortcuts}>
          {shortcuts.map(({ label, Icon, onClick }) => (
            <button type="button" className={styles.shortcut} key={label} onClick={onClick}>
              <span className={styles.shortcutIcon}><Icon size={16} strokeWidth={2} /></span>
              {label}
            </button>
          ))}
        </section>

        {/* 나의 후기 */}
        <div className={sys.sectionHead}>
          <span className={sys.sectionLabel}>{t('map.neighborhoodProfile.reviews')}</span>
          <button type="button" className={styles.sectionAction} onClick={goWriteReview}>
            <Pencil size={12} strokeWidth={2.5} /> {t('map.neighborhoodProfile.writeReview')}
          </button>
        </div>

        {reviewState === 'loading' ? (
          <div className={sys.card}><SkeletonRows count={3} /></div>
        ) : reviewState === 'error' ? (
          <div className={sys.card}>
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('common.errorUnexpected')}
              actionLabel={t('common.retry')}
              onAction={retryReviews}
            />
          </div>
        ) : (
          <>
            <div className={`${sys.card} ${styles.statsCard}`}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t('map.neighborhoodProfile.averageRating')}</span>
                <strong className={`${styles.statValue} num`}><StarIcon size={15} /> {avgRatingText}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t('map.neighborhoodProfile.statReviews')}</span>
                <strong className={`${styles.statValue} num`}>{summary?.reviewCount ?? 0}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t('map.neighborhoodProfile.statUpvotes')}</span>
                <strong className={`${styles.statValue} num`}>{summary?.totalUpvotes ?? 0}</strong>
              </div>
            </div>

            {reviews.length === 0 ? (
              <div className={`${sys.card} ${styles.cardGap}`}>
                <StateBlock
                  icon={MessageSquareText}
                  title={t('map.neighborhoodProfile.noReviews')}
                  desc={t('map.neighborhoodProfile.reviewBannerText')}
                  actionLabel={t('map.neighborhoodProfile.writeReview')}
                  onAction={goWriteReview}
                />
              </div>
            ) : (
              <div className={`${sys.card} ${styles.cardGap}`}>
                {reviews.map((r) => (
                  <div className={sys.row} key={r.reviewId}>
                    <div className={sys.rowTop}>
                      <span className={sys.rowTitle}>{r.shopName}</span>
                      <span className={`${sys.miniBadge} ${sys.badgeGold} num`}>
                        <StarIcon size={11} /> {r.rating}
                      </span>
                    </div>
                    {r.comment && <p className={styles.rowComment}>{r.comment}</p>}
                    <div className={sys.rowMeta}>{formatRelativeTime(r.reviewedAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
