import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Heart, MapPinned, Pencil, Star, Store, Ticket } from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import { useLocationStore } from '@/store/useLocationStore';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { useKeyboard } from '@/hooks/useKeyboard';
import { native } from '@/lib/native';
import { extractDetail } from '@/api/client';
import { formatRelativeTime } from '@/lib/format';
import { fetchMyRepairReviews, type MyRepairReviewsResult } from '@/api/info';
import {
  fetchBizCategories,
  bizCategoryLabel,
  createPlaceSuggestion,
  fetchMyPlaceSuggestions,
  type BizCategory,
  type PlaceSuggestion,
} from '@/api/biz';
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
  const { t, i18n } = useTranslation();
  const user = useUserStore((s) => s.user);
  const savedCoords = useLocationStore((s) => s.coords);
  const nickname = user?.nickname || t('map.neighborhoodProfile.defaultNickname');

  const [reviewData, setReviewData] = useState<MyRepairReviewsResult | null>(null);
  const [categories, setCategories] = useState<BizCategory[]>([]);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const [placeCategory, setPlaceCategory] = useState('');
  const [placeAddress, setPlaceAddress] = useState('');
  const [placeNote, setPlaceNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    fetchMyRepairReviews().then(setReviewData).catch(() => setReviewData(null));
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
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
    { label: t('map.neighborhoodProfile.shortcuts.coupons'), Icon: Ticket, onClick: () => navigate('/coupons/mine') },
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

  const coords = savedCoords ?? fallbackCoords();

  async function handleSubmitPlace() {
    if (!placeName.trim() || !coords || submitting) return;
    setSubmitting(true);
    try {
      await createPlaceSuggestion({
        name: placeName.trim(),
        category: placeCategory || null,
        address: placeAddress.trim() || null,
        lat: coords.lat,
        lng: coords.lng,
        note: placeNote.trim() || null,
      });
      toast.success(t('map.neighborhoodProfile.placeForm.success'));
      setPlaceName('');
      setPlaceCategory('');
      setPlaceAddress('');
      setPlaceNote('');
      setSheetOpen(false);
      fetchMyPlaceSuggestions().then(setSuggestions).catch(() => {});
    } catch (err) {
      toast.error(extractDetail(err, t('map.neighborhoodProfile.placeForm.error')));
    } finally {
      setSubmitting(false);
    }
  }

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

      {sheetOpen && (
        <div
          className={styles.sheetBackdrop}
          onClick={() => !submitting && setSheetOpen(false)}
          style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}
        >
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetTitle}>{t('map.neighborhoodProfile.placeForm.title')}</div>
            <label className={styles.sheetLabel}>{t('map.neighborhoodProfile.placeForm.nameLabel')}</label>
            <input
              className={styles.field}
              placeholder={t('map.neighborhoodProfile.placeForm.namePlaceholder')}
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
            />
            <label className={styles.sheetLabel}>{t('map.neighborhoodProfile.placeForm.categoryLabel')}</label>
            <select className={styles.field} value={placeCategory} onChange={(e) => setPlaceCategory(e.target.value)}>
              <option value="">{t('map.neighborhoodProfile.placeForm.categoryPlaceholder')}</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{bizCategoryLabel(c, i18n.language)}</option>
              ))}
            </select>
            <label className={styles.sheetLabel}>{t('map.neighborhoodProfile.placeForm.addressLabel')}</label>
            <input
              className={styles.field}
              placeholder={t('map.neighborhoodProfile.placeForm.addressPlaceholder')}
              value={placeAddress}
              onChange={(e) => setPlaceAddress(e.target.value)}
            />
            <label className={styles.sheetLabel}>{t('map.neighborhoodProfile.placeForm.noteLabel')}</label>
            <input
              className={styles.field}
              placeholder={t('map.neighborhoodProfile.placeForm.notePlaceholder')}
              value={placeNote}
              onChange={(e) => setPlaceNote(e.target.value)}
            />
            <div className={styles.sheetActions}>
              <button className={styles.sheetCancel} onClick={() => setSheetOpen(false)} disabled={submitting}>
                {t('map.neighborhoodProfile.placeForm.cancel')}
              </button>
              <button
                className={styles.sheetSubmit}
                onClick={handleSubmitPlace}
                disabled={!placeName.trim() || !coords || submitting}
              >
                {submitting ? t('map.neighborhoodProfile.placeForm.submitting') : t('map.neighborhoodProfile.placeForm.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
