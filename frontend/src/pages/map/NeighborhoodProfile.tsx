import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Heart, MapPinned, Pencil, Star, Store } from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import { useLocationStore } from '@/store/useLocationStore';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { findWardAt } from '@/components/maps/SaigonMapV5';
import MarkerLocationPicker from '@/components/maps/MarkerLocationPicker';
import PlaceSuggestSheet from '@/pages/map/PlaceSuggestSheet';
import { formatRelativeTime } from '@/lib/format';
import { fetchMyRepairReviews, type MyRepairReviewsResult } from '@/api/info';
import { fetchMyPlaceSuggestions, type PlaceSuggestion } from '@/api/map';
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

/** 동네지도 전용 프로필. 퀵메뉴·나의 후기·장소 제안 실배선(P-FE). */
export default function NeighborhoodProfile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const storedLocation = useLocationStore((s) => s.location);
  const savedCoords = storedLocation && storedLocation.accountId === user?.id ? storedLocation.coords : null;
  const nickname = user?.nickname || t('map.neighborhoodProfile.defaultNickname');

  const [reviewData, setReviewData] = useState<MyRepairReviewsResult | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  // 위치 [수정]으로 사용자가 직접 찍은 좌표 — 기본값(savedCoords ?? fallbackCoords)보다 우선
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    fetchMyRepairReviews().then(setReviewData).catch(() => setReviewData(null));
    fetchMyPlaceSuggestions().then(setSuggestions).catch(() => setSuggestions([]));
  }, []);

  // 동네지도 + 메뉴 "장소 제안하기"에서 넘어온 ?openPlaceForm= 1회 소비 — NeighborhoodMap
  // ?category= 소비 패턴 미러. 새 폼을 만들지 않고 기존 시트를 원격으로 연다.
  useEffect(() => {
    if (!searchParams.get('openPlaceForm')) return;
    setSheetOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const shortcuts = [
    { label: t('map.neighborhoodProfile.shortcuts.wishlist'), Icon: Heart, onClick: () => navigate('/map/favorites') },
    {
      label: t('map.neighborhoodProfile.shortcuts.favorites'),
      Icon: Store,
      onClick: () => toast.info(t('map.neighborhoodProfile.regularsComingSoon')),
    },
  ];

  const summary = reviewData?.summary ?? null;
  const avgRatingText = summary?.avgRating != null ? summary.avgRating.toFixed(1) : '–';
  const reviews = reviewData?.reviews ?? [];

  const coords = pickedCoords ?? savedCoords ?? fallbackCoords();
  const wardName = coords ? findWardAt(coords.lat, coords.lng)?.region.name ?? null : null;

  function statusLabel(status: PlaceSuggestion['status']) {
    if (status === 'CONFIRMED') return t('map.neighborhoodProfile.placeForm.statusConfirmed');
    if (status === 'REJECTED') return t('map.neighborhoodProfile.placeForm.statusRejected');
    return t('map.neighborhoodProfile.placeForm.statusPending');
  }

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ArrowLeft size={28} />
        </button>
        <h1>{t('map.neighborhoodProfile.title')}</h1>
      </header>

      <div className={styles.body}>
      <section className={styles.userRow}>
        <div className={styles.avatar}>
          {user?.avatarUrl ? <AppImage src={user.avatarUrl} alt="" variant="circle" /> : <span>{nickname.charAt(0).toUpperCase()}</span>}
        </div>
        <div><strong>{nickname}</strong><p>{t('map.neighborhoodProfile.activityComingSoon')}</p></div>
      </section>

      <section className={styles.shortcuts}>
        {shortcuts.map(({ label, Icon, onClick }) => (
          <button type="button" className={styles.shortcut} key={label} onClick={onClick}>
            <span><Icon size={25} strokeWidth={2} /></span>{label}
          </button>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('map.neighborhoodProfile.reviews')}</h2>
          <button type="button" onClick={() => navigate('/info/repair')}>
            <Pencil size={18} /> {t('map.neighborhoodProfile.writeReview')}
          </button>
        </div>
        <div className={styles.reviewSummary}>
          <div><span>{t('map.neighborhoodProfile.averageRating')}</span><strong className={styles.star}>★ {avgRatingText}</strong></div>
          <div><span>{t('map.neighborhoodProfile.statReviews')}</span><strong>{summary?.reviewCount ?? 0}</strong></div>
          <div><span>{t('map.neighborhoodProfile.statUpvotes')}</span><strong>{summary?.totalUpvotes ?? 0}</strong></div>
        </div>
        <div className={styles.notice}><span>🏷️</span><strong>{t('map.neighborhoodProfile.reviewBannerText')}</strong></div>
        {reviews.length === 0 ? (
          <p className={styles.empty}>{t('map.neighborhoodProfile.noReviews')}</p>
        ) : (
          <div className={styles.reviewList}>
            {reviews.map((r) => (
              <div className={styles.reviewCard} key={r.reviewId}>
                <div className={styles.reviewCardHead}>
                  <strong>{r.shopName}</strong>
                  <span className={styles.reviewRating}><Star size={14} fill="currentColor" strokeWidth={0} /> {r.rating}</span>
                </div>
                {r.comment && <p className={styles.reviewComment}>{r.comment}</p>}
                <span className={styles.reviewTime}>{formatRelativeTime(r.reviewedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2>{t('map.neighborhoodProfile.placeSuggestion')}</h2>
        {suggestions.length > 0 && (
          <ul className={styles.suggestionList}>
            {suggestions.map((s) => (
              <li key={s.id} className={styles.suggestionItem}>
                <span>{s.name}</span>
                <span className={`${styles.suggestionBadge} ${s.status === 'CONFIRMED' ? styles.badgeConfirmed : s.status === 'REJECTED' ? styles.badgeRejected : styles.badgePending}`}>
                  {statusLabel(s.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {suggestions.length === 0 ? (
          <div className={styles.placeEmpty}>
            <MapPinned size={34} strokeWidth={1.7} />
            <p>{t('map.neighborhoodProfile.placeHint')}</p>
            <button type="button" onClick={() => setSheetOpen(true)}>{t('map.neighborhoodProfile.addPlace')}</button>
          </div>
        ) : (
          <button type="button" className={styles.addPlaceBtn} onClick={() => setSheetOpen(true)}>
            {t('map.neighborhoodProfile.addPlace')}
          </button>
        )}
      </section>
      </div>

      {sheetOpen && (
        <PlaceSuggestSheet
          coords={coords}
          wardName={wardName}
          hidden={pickerOpen}
          onPickLocation={() => setPickerOpen(true)}
          onClose={() => setSheetOpen(false)}
          onSubmitted={() => fetchMyPlaceSuggestions().then(setSuggestions).catch(() => {})}
        />
      )}

      {/* 프로필엔 지도가 없어 위치 [수정]은 탭-투-드롭 픽커(BizApply 등과 공용)로 처리 */}
      <MarkerLocationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={coords}
        onConfirm={(loc) => setPickedCoords({ lat: loc.lat, lng: loc.lng })}
      />
    </main>
  );
}
