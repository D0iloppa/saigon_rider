import { lazy, Suspense, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, MapPin, Heart, Share2, Star, Home, Flag } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { ImageViewer } from '@/components/ui/ImageViewer';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { useUserStore } from '@/store/useUserStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useReviewModeration } from '@/hooks/useReviewModeration';
import { extractErrorCode } from '@/api/client';
import ReviewActionRow from '@/components/biz/ReviewActionRow';
import ReviewModerationSheets from '@/components/biz/ReviewModerationSheets';
import type { MapMarkerV2 } from '@/components/maps/v2/region';
import { BIZ_CAT_COLOR, BIZ_CAT_COLOR_FALLBACK, BIZ_CAT_ICON_PATH } from '@/components/maps/bizCategoryIcons';
import { usePoiMarkers } from '@/components/maps/usePoiMarkers';
import sys from '@/styles/system.module.css';
import {
  fetchBusinessPublicProfile,
  fetchBizCategories,
  bizCategoryLabel,
  fetchBizFavorites,
  addBizFavorite,
  removeBizFavorite,
  followBusiness,
  unfollowBusiness,
  fetchBizPublicNews,
  fetchBizReviews,
  fetchBizPublicPrices,
  fetchMyBizReview,
  deleteBizReview,
  appealBizReview,
  reportBusiness,
  type BusinessPublicProfile,
  type BizCategory,
  type BizNewsItem,
  type BizReview,
  type BizPriceItem,
  type BizReportReason,
} from '@/api/biz';
import { fetchListings, type ListingCard as MarketListing, type MarketAd } from '@/api/market';
import { trackAdEvent, useAdImpression } from '@/hooks/useAdEvents';
import { formatPriceVnd } from '@/pages/market/marketFormat';
import BizReviewSheet from './BizReviewSheet';
import { formatRelativeTime } from '@/lib/format';
import { markBizNewsRead } from '@/lib/bizNewsRead';
import { ADS_ENABLED } from '@/lib/adPlacement';
import styles from './BizPublic.module.css';

const SaigonMapV5 = lazy(() => import('@/components/maps/SaigonMapV5'));
const NEWS_PAGE = 10;
const REVIEW_PAGE = 5;
// T-1: 업체 명의 매물(business_profile_id) 을 이 프로필 페이지에 노출 — marketplace_ads 의
// owner_business_profile_id 노출 패턴(profile.ads) 미러.
// T-2: 6탭→4탭 재구성(2026-08-18) — 사진은 "업체 소개"의 일부라 별도 탭 축이 아니므로 홈 섹션에 흡수.
// T-3: 대표 재지시(2026-08-18) — 가격 탭 복원, 5탭(home/news/price/listings/reviews)으로 재조정.
const DETAIL_TABS = ['home', 'news', 'price', 'listings', 'reviews'] as const;
type DetailTab = typeof DETAIL_TABS[number];

// 소비자→업체 신고 사유(대표 지적 2026-08-18) — C2C 신고 사유와 성격이 달라 별도 세트.
const BIZ_REPORT_REASONS: BizReportReason[] = [
  'FALSE_ADVERTISING',
  'PRICE_MISMATCH',
  'POOR_SERVICE',
  'IMPERSONATION',
  'HEALTH_SAFETY',
  'OTHER',
];

/** 3줄 클램프를 넘길 개연성 판단 — 정밀 측정 대신 간단 휴리스틱 (길이·줄수) */
function isLongBody(body: string): boolean {
  return body.length > 90 || (body.match(/\n/g)?.length ?? 0) >= 3;
}

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}

/** 업체 프로필 광고 카드 1건 — 노출 계측(surface='biz_profile', 세션 내 중복 억제)을 카드 단위로 붙인다.
 * ⚠️ ADS_ENABLED=false 인 동안은 호출부(BizPublic 본문)가 이 컴포넌트를 아예 렌더하지 않으므로
 * 지금은 훅이 발화하지 않는다 — #10(노출 재개) 때 실제로 살아난다. */
function BizAdCard({ ad, onOpen }: { ad: MarketAd; onOpen: (ad: MarketAd) => void }) {
  const { t } = useTranslation();
  const adImpressionRef = useAdImpression(ad.id, 'biz_profile');
  return (
    <button ref={adImpressionRef} className={styles.bizAdCard} onClick={() => onOpen(ad)}>
      <div className={styles.bizAdImageWrap}>
        <AppImage src={ad.imageUrl ?? undefined} alt="" className={styles.bizAdImage} />
      </div>
      <div className={styles.bizAdBody}>
        <div className={styles.bizAdLabelRow}>
          <span className={styles.bizAdLabel}>{t('market.adBadge')}</span>
          <span className={styles.bizAdPartner}>{ad.partnerName}</span>
        </div>
        <strong className={styles.bizAdTitle}>{ad.title}</strong>
        {ad.body && <span className={styles.bizAdCopy}>{ad.body}</span>}
        <span className={styles.bizAdCta}>{t('common.seeMore')}</span>
      </div>
    </button>
  );
}

/** 공개 비즈니스 프로필 — AD 카드 탭 진입면(BP-6). 가게 정보 + 게시중 광고 목록. */
export default function BizPublic() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const requireAuth = useRequireAuth();
  const [profile, setProfile] = useState<BusinessPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<BizCategory[]>([]);
  const [favorited, setFavorited] = useState(false);
  const [news, setNews] = useState<BizNewsItem[]>([]);
  const [newsHasMore, setNewsHasMore] = useState(false);
  const [newsLoadingMore, setNewsLoadingMore] = useState(false);
  const [expandedNews, setExpandedNews] = useState<Set<string>>(new Set());
  const [prices, setPrices] = useState<BizPriceItem[]>([]);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const userId = useUserStore((s) => s.user?.id);
  const [reviews, setReviews] = useState<BizReview[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewAvg, setReviewAvg] = useState<number | null>(null);
  const [reviewHasMore, setReviewHasMore] = useState(false);
  const [reviewLoadingMore, setReviewLoadingMore] = useState(false);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [myReview, setMyReview] = useState<BizReview | null>(null);
  // 답글 작성/수정/삭제 + 후기 신고 — BizDashboard(파트너 라운지) 와 공용(useReviewModeration).
  const reviewMod = useReviewModeration<BizReview>(id, setReviews);

  // 내 후기 숨김 이의제기(대표 지적 2026-08-18) — 서버가 중복 제출 방지 필드를 주지 않아
  // 접수 여부는 이 세션 로컬 상태로만 관리한다(가짜 영속성 금지, 새로고침하면 다시 제출 가능).
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealBody, setAppealBody] = useState('');
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);

  // 소비자→업체 신고 (대표 지적 2026-08-18) — 위 후기 신고 상태와 별개 축(업체 자체가 대상)
  const [bizReportOpen, setBizReportOpen] = useState(false);
  const [bizReportReason, setBizReportReason] = useState<BizReportReason | null>(null);
  const [bizReportNote, setBizReportNote] = useState('');
  const [bizReportSubmitting, setBizReportSubmitting] = useState(false);
  const openConfirm = useConfirmStore((s) => s.open);
  const [viewerState, setViewerState] = useState<{ srcs: string[]; index: number } | null>(null);
  // 업체 위치 복귀(2026-08-18 대표 지시) — 사용자가 지도를 끌고 나간 뒤 되돌아올 수단.
  // focusLatLng 가 아니라 focusPointRef 를 쓰는 이유: focusLatLng 는 ward 선택·토스트
  // 부작용이 따라오는데 이 카드는 polyActive={false} 인 읽기 전용이라 그게 들어오면 안 된다.
  // 줌도 사용자가 맞춰둔 배율을 유지한다 — "업체 위치로 되돌리기"지 "처음으로 초기화"가 아니다.
  const mapFocusPointRef = useRef<((pos: { lat: number; lng: number }) => void) | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('home');
  const [compactHeader, setCompactHeader] = useState(false);
  const [tabsPinned, setTabsPinned] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLElement | null>(null);
  const tabsRef = useRef<HTMLElement | null>(null);
  const pendingTabScrollRef = useRef(false);
  const [mapBbox, setMapBbox] = useState<{ N: number; S: number; E: number; W: number } | null>(null);
  const poiMarkers = usePoiMarkers(mapBbox, i18n.language);

  useEffect(() => {
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!id || !userId) return;
    // 단건 찜 여부 조회 API 는 없음 — 목록에서 포함 여부만 확인(과설계 금지)
    fetchBizFavorites()
      .then((favs) => setFavorited(favs.some((f) => f.id === id)))
      .catch(() => {});
  }, [id, userId]);

  const handleToggleFavorite = async () => {
    if (!requireAuth()) return;
    if (!id) return;
    const next = !favorited;
    setFavorited(next);
    try {
      if (next) await addBizFavorite(id);
      else await removeBizFavorite(id);
    } catch {
      setFavorited(!next);
    }
  };

  // 단골(팔로우) — 찜과 별개 개념 (SGR-326)
  const handleToggleFollow = async () => {
    if (!requireAuth()) return;
    if (!id || !profile) return;
    const next = !profile.isFollowing;
    setProfile((prev) =>
      prev ? { ...prev, isFollowing: next, followerCount: prev.followerCount + (next ? 1 : -1) } : prev,
    );
    try {
      if (next) await followBusiness(id);
      else await unfollowBusiness(id);
    } catch {
      setProfile((prev) =>
        prev ? { ...prev, isFollowing: !next, followerCount: prev.followerCount + (next ? -1 : 1) } : prev,
      );
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchBusinessPublicProfile(id)
      .then(setProfile)
      .catch(() => {
        toast.error(t('biz.publicNotFound', { defaultValue: '가게 정보를 찾을 수 없어요' }));
        navigate(-1);
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    fetchBizPublicNews(id, { limit: NEWS_PAGE, offset: 0 }).then((items) => {
      setNews(items);
      setNewsHasMore(items.length === NEWS_PAGE);
      // 소식을 보여줬으면 지도 핀 unread 뱃지도 꺼지도록 읽음 처리 (최신 = DESC 첫 항목)
      if (items.length > 0) markBizNewsRead(id, items[0].createdAt);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchBizPublicPrices(id).then(setPrices).catch(() => setPrices([]));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchListings({ businessProfileId: id, size: 50 })
      .then((page) => setListings(page.items))
      .catch(() => setListings([]));
  }, [id]);

  const loadReviews = (profileId: string) => {
    fetchBizReviews(profileId, { limit: REVIEW_PAGE, offset: 0 })
      .then((res) => {
        setReviews(res.reviews);
        setReviewTotal(res.total);
        setReviewAvg(res.avgRating);
        setReviewHasMore(res.hasMore);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!id) return;
    loadReviews(id);
  }, [id]);

  // 내 후기 여부 — "후기 쓰기"→"후기 수정" 라벨 전환 + 삭제 진입점 판별용
  useEffect(() => {
    if (!id || !userId) { setMyReview(null); return; }
    setAppealSubmitted(false);
    fetchMyBizReview(id).then(setMyReview).catch(() => {});
  }, [id, userId]);

  const handleMoreReviews = async () => {
    if (!id || reviewLoadingMore) return;
    setReviewLoadingMore(true);
    try {
      const res = await fetchBizReviews(id, { limit: REVIEW_PAGE, offset: reviews.length });
      setReviews((prev) => [...prev, ...res.reviews]);
      setReviewTotal(res.total);
      setReviewAvg(res.avgRating);
      setReviewHasMore(res.hasMore);
    } finally {
      setReviewLoadingMore(false);
    }
  };

  const handleWriteReview = () => {
    if (!requireAuth()) return;
    setReviewSheetOpen(true);
  };

  const handleDeleteReview = () => {
    if (!id || !myReview) return;
    openConfirm(
      { mode: 'text', value: t('biz.review.deleteConfirm', { defaultValue: '내 후기를 삭제할까요? 되돌릴 수 없어요' }) },
      async () => {
        try {
          await deleteBizReview(id, myReview.id);
          toast.success(t('biz.review.deleteSuccess', { defaultValue: '후기를 삭제했어요' }));
          setMyReview(null);
          loadReviews(id);
        } catch {
          toast.error(t('biz.review.deleteError', { defaultValue: '삭제에 실패했어요' }));
        }
      },
    );
  };

  // 답글 작성/수정/삭제 로직은 reviewMod(useReviewModeration) 로 이동 — 여기선 신고 진입 시
  // 로그인 게이팅(requireAuth)만 감싼다(원본 handleOpenReport 동작 그대로, 오너는 이미 로그인 상태라
  // 항상 통과한다).
  const handleOpenReport = (review: BizReview) => {
    if (!requireAuth()) return;
    reviewMod.handleOpenReport(review);
  };

  const handleOpenAppeal = () => {
    if (!requireAuth()) return;
    setAppealOpen(true);
  };

  const handleCloseAppeal = () => {
    setAppealOpen(false);
    setAppealBody('');
  };

  const handleSubmitAppeal = async () => {
    if (!id || !myReview || !appealBody.trim() || appealSubmitting) return;
    setAppealSubmitting(true);
    try {
      await appealBizReview(id, myReview.id, appealBody.trim());
      setAppealSubmitted(true);
      toast.success(
        t('biz.review.appeal.success', {
          defaultValue: '이의제기가 접수되었어요. 검토 후 결과를 알려드릴게요',
        }),
      );
    } catch {
      toast.error(t('biz.review.appeal.error', { defaultValue: '이의제기 접수에 실패했어요' }));
    } finally {
      // 실패해도 시트는 닫는다 (제출 흐름 규약)
      setAppealSubmitting(false);
      handleCloseAppeal();
    }
  };

  const handleOpenBizReport = () => {
    if (!requireAuth()) return;
    setBizReportOpen(true);
  };

  const handleCloseBizReport = () => {
    setBizReportOpen(false);
    setBizReportReason(null);
    setBizReportNote('');
  };

  const handleSubmitBizReport = async () => {
    if (!id || !bizReportReason || bizReportSubmitting) return;
    setBizReportSubmitting(true);
    try {
      await reportBusiness(id, bizReportReason, bizReportNote.trim() || undefined);
      // 016 M1: 신고 ≠ 즉시 조치 — 큐에 쌓여 운영자 판정 후에만 조치되므로 "즉시 반영"으로
      // 오해하면 같은 사유로 반복 신고한다. 문구에 "검토 후 조치" 취지를 명시한다.
      toast.success(t('biz.report.success', { defaultValue: '신고가 접수되었어요. 검토 후 조치됩니다' }));
    } catch (err) {
      // R-3(260819 W3) — 취소한 신고 재시도와 처리 중인 신고 재시도는 다른 문구로 안내(MarketDetail/UserProfile 미러).
      const code = extractErrorCode(err);
      if (code === 'report_already_cancelled') {
        toast.error(t('support.reportAlreadyCancelledError'));
      } else if (code === 'report_already_pending') {
        toast.error(t('support.reportAlreadyPendingError'));
      } else {
        toast.error(t('biz.report.error', { defaultValue: '신고 접수에 실패했어요' }));
      }
    } finally {
      setBizReportSubmitting(false);
      handleCloseBizReport();
    }
  };

  const handleMoreNews = async () => {
    if (!id || newsLoadingMore) return;
    setNewsLoadingMore(true);
    try {
      const items = await fetchBizPublicNews(id, { limit: NEWS_PAGE, offset: news.length });
      setNews((prev) => [...prev, ...items]);
      setNewsHasMore(items.length === NEWS_PAGE);
    } finally {
      setNewsLoadingMore(false);
    }
  };

  const handleCall = () => {
    if (!profile?.phone) return;
    native.openUrl(`tel:${profile.phone}`);
  };

  const handleShare = () => {
    if (!profile) return;
    native.share({ title: profile.name, text: profile.address ?? profile.name, url: window.location.href });
  };

  const scrollToTabsTop = () => {
    const body = bodyRef.current;
    const intro = introRef.current;
    if (body && intro) {
      // sticky 로 stuck 된 .tabs 의 rect 는 고정 위치를 반환하므로, 비-sticky 인 .intro 의 flow 하단(= 탭바의 원래 위치)으로 목표를 계산한다.
      const tabTop = intro.getBoundingClientRect().bottom - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTo({ top: Math.max(0, tabTop), behavior: 'smooth' });
    }
  };

  const handleTabChange = (tab: DetailTab) => {
    if (tab === activeTab) {
      scrollToTabsTop();
      return;
    }
    // 짧은 탭으로 전환 시 콘텐츠 교체로 scrollTop 이 줄어든 scrollHeight 에 클램프되면서 진행 중인 smooth 스크롤을 중단시킨다.
    // 커밋 이후(useLayoutEffect)에 스크롤을 시작해 이 경합을 피한다.
    pendingTabScrollRef.current = true;
    setActiveTab(tab);
  };

  useLayoutEffect(() => {
    if (!pendingTabScrollRef.current) return;
    pendingTabScrollRef.current = false;
    scrollToTabsTop();
  });

  const handleBodyScroll = (scrollTop: number) => {
    setCompactHeader(scrollTop > 72);
    const body = bodyRef.current;
    const tabs = tabsRef.current;
    const tabTop = body && tabs ? tabs.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop : Number.POSITIVE_INFINITY;
    setTabsPinned(scrollTop >= tabTop);
  };

  const photoUrls = useMemo(() => profile
    ? [...new Set([profile.photoUrl, ...news.flatMap((item) => item.photos)].filter((url): url is string => !!url))]
    : [], [profile, news]);

  // 위치 지도 카드 — 이 업체 핀 + 주변 POI 참조 레이어. 동네지도 리치카드와 동일한 색/글리프 규칙.
  const bizMapMarkers = useMemo<MapMarkerV2[]>(() => {
    if (!profile || profile.latitude == null || profile.longitude == null) return poiMarkers;
    return [...poiMarkers, {
      id: profile.id,
      lat: profile.latitude,
      lng: profile.longitude,
      kind: 'biz',
      color: (profile.category && BIZ_CAT_COLOR[profile.category]) || BIZ_CAT_COLOR_FALLBACK,
      icon: profile.category ? BIZ_CAT_ICON_PATH[profile.category] : undefined,
      r: 1.6,
    }];
  }, [profile, poiMarkers]);

  if (loading || !profile) {
    return (
      <div className={styles.page}>
        <TopBar />
        <div className={styles.body}>
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TopBar
        title={compactHeader ? profile.name : undefined}
        rightContent={
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.favoriteBtn}
              onClick={handleToggleFavorite}
              aria-label={t('biz.favoriteToggle', { defaultValue: '관심 업체' })}
              aria-pressed={favorited}
            >
              <Heart size={22} strokeWidth={2} fill={favorited ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className={styles.favoriteBtn} onClick={handleShare} aria-label={t('common.share', { defaultValue: '공유' })}>
              <Share2 size={21} strokeWidth={2} />
            </button>
            {/* 소비자→업체 신고 진입점(대표 지적 2026-08-18) — 내 업체면 숨긴다 */}
            {!profile.isOwner && (
              <button
                type="button"
                className={styles.favoriteBtn}
                onClick={handleOpenBizReport}
                aria-label={t('biz.report.entry', { defaultValue: '업체 신고' })}
              >
                <Flag size={19} strokeWidth={2} />
              </button>
            )}
          </div>
        }
      />
      <div ref={bodyRef} className={styles.body} onScroll={(e) => handleBodyScroll(e.currentTarget.scrollTop)}>
        <section ref={introRef} className={styles.intro}>
          <h1 className={styles.name}>{profile.name}</h1>
          <div className={styles.profileMeta}>
            {reviewAvg != null && <span><Star size={15} fill="currentColor" strokeWidth={0} /> {reviewAvg.toFixed(1)} · {t('biz.reviewCount', { count: reviewTotal })}</span>}
            {profile.category && <span>{(() => { const cat = categories.find((c) => c.code === profile.category); return cat ? bizCategoryLabel(cat, i18n.language) : profile.category; })()}</span>}
            {profile.address && <span>{profile.address}</span>}
          </div>
          {profile.intro && <p className={styles.introText}>{profile.intro}</p>}
          <div className={styles.followRow}>
            <span className={styles.followCount}>
              {t('biz.followerCount', { count: profile.followerCount, defaultValue: '단골 {{count}}' })}
            </span>
            <button
              type="button"
              className={profile.isFollowing ? styles.followBtnActive : styles.followBtn}
              onClick={handleToggleFollow}
              aria-pressed={profile.isFollowing}
            >
              {profile.isFollowing ? t('biz.followCtaActive', { defaultValue: '단골 해제' }) : t('biz.followCta', { defaultValue: '단골 맺기' })}
            </button>
          </div>
          {profile.photoUrl ? (
            <div className={styles.heroWrap}>
              <AppImage src={profile.photoUrl} alt={profile.name} className={styles.heroImg} priority />
            </div>
          ) : (
            <div className={styles.heroEmpty}>{t('biz.publicNoPhoto')}</div>
          )}
        </section>

        <nav ref={tabsRef} className={styles.tabs} aria-label={t('biz.detailTabsLabel')}>
          {DETAIL_TABS.map((tab) => (
            <button key={tab} type="button" className={activeTab === tab ? styles.tabActive : styles.tab} onClick={() => handleTabChange(tab)}>
              {t(`biz.detailTabs.${tab}`)}
            </button>
          ))}
        </nav>

        <div className={`${styles.tabContent} ${tabsPinned ? styles.tabContentPinned : ''}`}>
          {activeTab === 'home' && <>
            {(profile.phone || profile.address) ? (
              <div className={styles.infoCard}>
            {profile.phone && (
              <div className={styles.infoRow}>
                <div className={styles.infoIconWrap}>
                  <Phone size={18} strokeWidth={2} />
                </div>
                <div className={styles.infoValue}>{profile.phone}</div>
              </div>
            )}
            {profile.address && (
              <div className={styles.infoRow}>
                <div className={styles.infoIconWrap}>
                  <MapPin size={18} strokeWidth={2} />
                </div>
                <div className={styles.infoValue}>{profile.address}</div>
              </div>
            )}
              </div>
            ) : <EmptyArea label={t('biz.detailTabsLabel')} />}

            {profile.latitude != null && profile.longitude != null && (
              <div className={styles.mapCard}>
                <Suspense fallback={<div className={sys.mapLoading}>{t('info.mapLoading')}</div>}>
                  <SaigonMapV5
                    height="100%"
                    markers={bizMapMarkers}
                    lightweight={false}
                    // polyActive=false: 구역선택(ward 하이라이트) 기능 제거 지시 — 이 화면은
                    // 단일 업체 위치를 보여주는 읽기 전용 카드라 ward 폴리곤이 필요 없다.
                    // BizLocationPicker.tsx와 동일 근거: initialGps로 L3 임계값(~1.1km) 안쪽에서
                    // 시작해 뷰포트에 1~2개 ward만 걸치므로, 전 지역 조망에서 발생하는
                    // 2.4배/7.5초 비용과는 스케일이 다르다. depth3 fetch는 polyActive와 무관하게
                    // 이미 일어나므로 false는 렌더 필터만 푸는 것 — 추가 네트워크 비용 없음.
                    polyActive={false}
                    initialGps={{ lat: profile.latitude, lng: profile.longitude }}
                    onBboxChange={setMapBbox}
                    // showLocateControl(◎ '내 위치')은 service-rules GPS 원칙 2 대로 계속 끈다.
                    // 아래 버튼은 그것과 별개 — '내 위치'가 아니라 '업체 위치로 복귀'다.
                    showLocateControl={false}
                    focusPointRef={mapFocusPointRef}
                  />
                </Suspense>
                <button
                  type="button"
                  className={styles.mapHomeBtn}
                  aria-label={t('biz.mapRecenter')}
                  onClick={() =>
                    mapFocusPointRef.current?.({ lat: profile.latitude!, lng: profile.longitude! })
                  }
                >
                  <Home size={18} strokeWidth={2.2} />
                </button>
              </div>
            )}

            <HomePreview title={t('biz.publicNewsTitle')} onMore={() => handleTabChange('news')}>
              {news[0] ? (
                <article className={styles.previewNews}>
                  <strong>{news[0].title}</strong>
                  {news[0].body && <p>{news[0].body}</p>}
                  {news[0].photos[0] && (
                    <AppImage
                      src={news[0].photos[0]}
                      alt=""
                      className={styles.previewThumb}
                      onClick={() => setViewerState({ srcs: news[0].photos, index: 0 })}
                      style={{ cursor: 'pointer' }}
                    />
                  )}
                </article>
              ) : <EmptyArea label={t('biz.publicNewsTitle')} />}
            </HomePreview>

            <HomePreview title={t('biz.detailTabs.price')} onMore={() => handleTabChange('price')}>
              {prices.length > 0 ? (
                <div className={styles.previewPrices}>
                  {prices.slice(0, 3).map((p) => (
                    <div key={p.id} className={styles.previewPriceRow}>
                      <span className={styles.previewPriceName}>{p.name}</span>
                      <span className={styles.previewPriceValue}>{formatVnd(p.priceVnd)}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyArea label={t('biz.priceSectionTitle')} />}
            </HomePreview>

            <HomePreview title={t('biz.detailTabs.listings')} onMore={() => handleTabChange('listings')}>
              {listings.length > 0 ? (
                <div className={styles.previewPhotos}>
                  {listings.slice(0, 3).map((l) => (
                    <AppImage
                      key={l.id}
                      src={l.thumbnailUrl ?? undefined}
                      alt={l.title}
                      className={styles.previewPhoto}
                      onClick={() => navigate(`/market/${l.id}`)}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                </div>
              ) : <EmptyArea label={t('biz.detailTabs.listings')} />}
            </HomePreview>

            <HomePreview title={t('biz.detailTabs.reviews')} onMore={() => handleTabChange('reviews')}>
              {reviews[0] ? (
                <article className={styles.previewReview}>
                  <span><Star size={14} fill="currentColor" strokeWidth={0} /> {reviews[0].rating} · {reviews[0].reviewerNickname ?? '—'}</span>
                  <p>{reviews[0].body}</p>
                </article>
              ) : <EmptyArea label={t('biz.detailTabs.reviews')} />}
            </HomePreview>

            <HomePreview
              title={t('biz.detailTabs.photos')}
              onMore={photoUrls.length > 0 ? () => setViewerState({ srcs: photoUrls, index: 0 }) : undefined}
            >
              {photoUrls.length > 0 ? (
                <div className={styles.previewPhotos}>
                  {photoUrls.slice(0, 3).map((url, i) => (
                    <AppImage
                      key={url}
                      src={url}
                      alt=""
                      className={styles.previewPhoto}
                      onClick={() => setViewerState({ srcs: photoUrls, index: i })}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                </div>
              ) : <EmptyArea label={t('biz.detailTabs.photos')} />}
            </HomePreview>

            <h3 className={styles.sectionTitle}>{t('biz.publicAdsTitle')}</h3>
            {/* 광고 노출 시기상조 — 대표 지시(2026-07-27)로 준비중 안내만 노출.
                ADS_ENABLED(adPlacement.ts)를 켜면 아래 캐러셀 렌더가 복원된다 — 로직은 유지, 삭제 금지. */}
            {!ADS_ENABLED ? (
              <div className={styles.adsEmpty}>
                <p>{t('biz.adsComingSoonDesc', { defaultValue: '광고 기능은 준비중이며 조만간 오픈됩니다' })}</p>
              </div>
            ) : profile.ads.length === 0 ? <EmptyArea label={t('biz.publicAdsTitle')} /> : (
              <div className={`${styles.adCarousel} ${profile.ads.length === 1 ? styles.adCarouselSingle : ''}`}>
                {profile.ads.map((ad) => (
                  <BizAdCard
                    key={ad.id}
                    ad={ad}
                    onOpen={(a) => {
                      trackAdEvent(a.id, 'biz_profile', 'click');
                      navigate(`/market/ad/${a.id}`);
                    }}
                  />
                ))}
              </div>
            )}
          </>}

          {activeTab === 'listings' && (
            listings.length === 0 ? (
              <div className={styles.adsEmpty}>
                <p>{t('biz.publicListingsEmpty', { defaultValue: '아직 등록된 매물이 없어요' })}</p>
              </div>
            ) : (
              <div className={styles.previewPhotos}>
                {listings.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={styles.bizAdCard}
                    onClick={() => navigate(`/market/${l.id}`)}
                  >
                    <div className={styles.bizAdImageWrap}>
                      <AppImage src={l.thumbnailUrl ?? undefined} alt={l.title} className={styles.bizAdImage} />
                    </div>
                    <div className={styles.bizAdBody}>
                      <strong className={styles.bizAdTitle}>{l.title}</strong>
                      <span className={styles.bizAdCopy}>{formatPriceVnd(l.priceVnd, t)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {activeTab === 'news' && <>
        {news.length === 0 ? (
          <div className={styles.adsEmpty}>
            <p>{t('biz.publicNewsEmpty', { defaultValue: '아직 등록된 소식이 없어요' })}</p>
          </div>
        ) : (
          <div className={styles.newsList}>
            {news.map((n) => {
              const expanded = expandedNews.has(n.id);
              return (
                <article key={n.id} className={styles.newsCard}>
                  <div className={styles.newsHead}>
                    <AppImage src={profile.photoUrl ?? undefined} alt="" variant="circle" className={styles.newsAvatar} />
                    <div className={styles.newsHeadText}>
                      <span className={styles.newsBizName}>{profile.name}</span>
                      <span className={styles.newsTime}>{formatRelativeTime(n.createdAt)}</span>
                    </div>
                  </div>
                  <p className={styles.newsTitle}>{n.title}</p>
                  {n.body && (
                    <p className={expanded ? styles.newsBody : `${styles.newsBody} ${styles.newsBodyClamp}`}>
                      {n.body}
                    </p>
                  )}
                  {!expanded && n.body != null && isLongBody(n.body) && (
                    <button
                      type="button"
                      className={styles.newsReadMore}
                      onClick={() => setExpandedNews((prev) => new Set(prev).add(n.id))}
                    >
                      {t('biz.publicNewsReadMore', { defaultValue: '더보기' })}
                    </button>
                  )}
                  {n.photos.length > 0 && (
                    <div
                      className={styles.newsThumbWrap}
                      onClick={() => setViewerState({ srcs: n.photos, index: 0 })}
                      style={{ cursor: 'pointer' }}
                    >
                      <AppImage src={n.photos[0]} alt="" className={styles.newsThumb} />
                      {n.photos.length > 1 && <span className={styles.newsThumbMore}>+{n.photos.length - 1}</span>}
                    </div>
                  )}
                </article>
              );
            })}
            {newsHasMore && (
              <button
                type="button"
                className={styles.newsMoreBtn}
                onClick={handleMoreNews}
                disabled={newsLoadingMore}
              >
                {t('biz.publicNewsMore', { defaultValue: '소식 더보기' })}
              </button>
            )}
          </div>
        )}
          </>}

          {activeTab === 'price' && <>
            {prices.length === 0 ? (
              <EmptyArea label={t('biz.priceSectionTitle')} />
            ) : (
              <div className={styles.priceList}>
                {prices.map((p) => (
                  <div key={p.id} className={styles.priceRow}>
                    <span className={styles.priceName}>{p.name}</span>
                    <span className={styles.priceValue}>{formatVnd(p.priceVnd)}</span>
                  </div>
                ))}
              </div>
            )}
          </>}

          {activeTab === 'reviews' && <>
        {myReview?.hiddenAt && (
          <div className={styles.reviewHiddenNotice}>
            <p className={styles.reviewHiddenNoticeTitle}>
              {t('biz.review.appeal.hiddenNotice', { defaultValue: '내 후기가 비공개 처리되었어요' })}
            </p>
            <p className={styles.reviewHiddenNoticeReason}>
              {t('biz.review.appeal.hiddenReasonLabel', { defaultValue: '사유: {{reason}}', reason: myReview.hiddenReason ?? '-' })}
            </p>
            {appealSubmitted ? (
              <p className={styles.reviewHiddenNoticeSubmitted}>
                {t('biz.review.appeal.submittedNotice', { defaultValue: '이의제기가 접수되었어요. 검토 후 결과를 알려드릴게요' })}
              </p>
            ) : (
              <button type="button" className={styles.reviewActionBtn} onClick={handleOpenAppeal}>
                {t('biz.review.appeal.cta', { defaultValue: '이의제기' })}
              </button>
            )}
          </div>
        )}
        <div className={styles.reviewSectionHead}>
          {reviewTotal > 0 && reviewAvg != null && (
            <span className={styles.reviewAvg}>
              <Star size={14} strokeWidth={0} fill="currentColor" />
              {reviewAvg.toFixed(1)} · {t('biz.reviewCount', { count: reviewTotal })}
            </span>
          )}
          {profile?.isOwner ? (
            <span className={styles.reviewOwnerNotice}>{t('biz.review.ownerNotice')}</span>
          ) : (
            <button type="button" className={styles.reviewWriteBtn} onClick={handleWriteReview}>
              {myReview ? t('biz.review.editCta', { defaultValue: '후기 수정' }) : t('biz.review.write')}
            </button>
          )}
        </div>
        {reviews.length === 0 ? (
          <div className={styles.adsEmpty}>
            <p>{t('biz.review.empty')}</p>
          </div>
        ) : (
          <div className={styles.reviewList}>
            {reviews.map((r) => (
              <article key={r.id} className={styles.reviewCard}>
                <div className={styles.reviewHead}>
                  <span className={styles.reviewNick}>{r.reviewerNickname ?? '—'}</span>
                  <span className={styles.reviewStars} aria-label={`${r.rating}/5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        size={13}
                        strokeWidth={0}
                        fill="currentColor"
                        className={n <= r.rating ? styles.starOn : styles.starOff}
                      />
                    ))}
                  </span>
                  <span className={styles.reviewTime}>{formatRelativeTime(r.createdAt)}</span>
                </div>
                <p className={styles.reviewBody}>{r.body}</p>
                <ReviewActionRow
                  review={r}
                  businessName={profile.name}
                  isOwner={profile.isOwner}
                  isMine={myReview?.id === r.id}
                  onReply={reviewMod.handleOpenReply}
                  onDeleteReply={reviewMod.handleDeleteReply}
                  onDeleteMine={handleDeleteReview}
                  onReport={handleOpenReport}
                />
              </article>
            ))}
            {reviewHasMore && (
              <button
                type="button"
                className={styles.newsMoreBtn}
                onClick={handleMoreReviews}
                disabled={reviewLoadingMore}
              >
                {t('biz.review.more')}
              </button>
            )}
          </div>
        )}
          </>}

        </div>
      </div>

      {profile.phone && (
        <div className={styles.ctaBar}>
          <button className={styles.ctaBtn} type="button" onClick={handleCall}>
            <Phone size={20} strokeWidth={2.2} />
            {t('biz.publicCallCta', { defaultValue: '전화 문의하기' })}
          </button>
        </div>
      )}

      {reviewSheetOpen && id && (
        <BizReviewSheet
          profileId={id}
          profileName={profile.name}
          onClose={() => setReviewSheetOpen(false)}
          onSubmitted={(review) => {
            setMyReview(review);
            loadReviews(id);
          }}
        />
      )}

      <ReviewModerationSheets {...reviewMod.sheetProps} />

      <BottomSheet open={appealOpen} onClose={handleCloseAppeal}>
        <div className={styles.reportSheet}>
          <h2 className={styles.replySheetTitle}>{t('biz.review.appeal.title', { defaultValue: '이의제기' })}</h2>
          {myReview?.hiddenReason && (
            <p className={styles.reviewHiddenNoticeReason}>
              {t('biz.review.appeal.hiddenReasonLabel', { defaultValue: '사유: {{reason}}', reason: myReview.hiddenReason })}
            </p>
          )}
          <textarea
            className={styles.replyTextarea}
            value={appealBody}
            maxLength={500}
            rows={4}
            placeholder={t('biz.review.appeal.placeholder', { defaultValue: '왜 이 후기가 정당한지 설명해주세요' })}
            onChange={(e) => setAppealBody(e.target.value)}
          />
          <div className={styles.replySheetActions}>
            <button
              type="button"
              className={styles.replySheetSubmit}
              disabled={!appealBody.trim() || appealSubmitting}
              onClick={handleSubmitAppeal}
            >
              {appealSubmitting
                ? t('biz.review.appeal.submitting', { defaultValue: '제출 중…' })
                : t('biz.review.appeal.submit', { defaultValue: '제출' })}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* 소비자→업체 신고 (대표 지적 2026-08-18) — 사진 첨부 없이 사유+선택 코멘트까지만(이번 범위). */}
      <BottomSheet open={bizReportOpen} onClose={handleCloseBizReport}>
        <div className={styles.reportSheet}>
          <h2 className={styles.replySheetTitle}>{t('biz.report.title', { defaultValue: '업체 신고' })}</h2>
          <div className={styles.reportReasonList}>
            {BIZ_REPORT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className={bizReportReason === reason ? styles.reportReasonBtnActive : styles.reportReasonBtn}
                onClick={() => setBizReportReason(reason)}
              >
                {t(`biz.report.reason_${reason}`)}
              </button>
            ))}
          </div>
          <textarea
            className={styles.reportNoteInput}
            value={bizReportNote}
            maxLength={500}
            rows={3}
            placeholder={t('biz.report.notePlaceholder', { defaultValue: '자세한 내용을 알려주세요 (선택)' })}
            onChange={(e) => setBizReportNote(e.target.value)}
          />
          <div className={styles.replySheetActions}>
            <button
              type="button"
              className={styles.replySheetSubmit}
              disabled={!bizReportReason || bizReportSubmitting}
              onClick={handleSubmitBizReport}
            >
              {bizReportSubmitting
                ? t('biz.report.submitting', { defaultValue: '접수 중…' })
                : t('biz.report.submit', { defaultValue: '신고 접수' })}
            </button>
          </div>
        </div>
      </BottomSheet>

      {viewerState && (
        <ImageViewer srcs={viewerState.srcs} initialIndex={viewerState.index} onClose={() => setViewerState(null)} />
      )}
    </div>
  );
}

function EmptyArea({ label }: { label: string }) {
  const { t } = useTranslation();
  return <div className={styles.adsEmpty}><p>{t('common.notRegisteredYet', { label })}</p></div>;
}

function HomePreview({ title, onMore, children }: { title: string; onMore?: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className={styles.homePreview}>
      <div className={styles.previewHead}>
        <h3>{title}</h3>
        {onMore && <button type="button" onClick={onMore}>{t('common.seeMore')}</button>}
      </div>
      {children}
    </section>
  );
}
