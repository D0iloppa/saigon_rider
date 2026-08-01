import { lazy, Suspense, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, MapPin, Heart, Share2, Star } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { ImageViewer } from '@/components/ui/ImageViewer';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { useUserStore } from '@/store/useUserStore';
import type { MapMarkerV2 } from '@/components/maps/v2/region';
import { BIZ_CAT_COLOR, BIZ_CAT_COLOR_FALLBACK, BIZ_CAT_ICON_PATH } from '@/components/maps/bizCategoryIcons';
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
  type BusinessPublicProfile,
  type BizCategory,
  type BizNewsItem,
  type BizReview,
  type BizPriceItem,
} from '@/api/biz';
import BizReviewSheet from './BizReviewSheet';
import { formatRelativeTime } from '@/lib/format';
import { markBizNewsRead } from '@/lib/bizNewsRead';
import { ADS_ENABLED } from '@/lib/adPlacement';
import styles from './BizPublic.module.css';

const SaigonMapV5 = lazy(() => import('@/components/maps/SaigonMapV5'));
const NEWS_PAGE = 10;
const REVIEW_PAGE = 5;
const DETAIL_TABS = ['home', 'news', 'reviews', 'price', 'photos'] as const;
type DetailTab = typeof DETAIL_TABS[number];

/** 3줄 클램프를 넘길 개연성 판단 — 정밀 측정 대신 간단 휴리스틱 (길이·줄수) */
function isLongBody(body: string): boolean {
  return body.length > 90 || (body.match(/\n/g)?.length ?? 0) >= 3;
}

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}

/** 공개 비즈니스 프로필 — AD 카드 탭 진입면(BP-6). 가게 정보 + 게시중 광고 목록. */
export default function BizPublic() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<BusinessPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<BizCategory[]>([]);
  const [favorited, setFavorited] = useState(false);
  const [news, setNews] = useState<BizNewsItem[]>([]);
  const [newsHasMore, setNewsHasMore] = useState(false);
  const [newsLoadingMore, setNewsLoadingMore] = useState(false);
  const [expandedNews, setExpandedNews] = useState<Set<string>>(new Set());
  const [prices, setPrices] = useState<BizPriceItem[]>([]);
  const user = useUserStore((s) => s.user);
  const [reviews, setReviews] = useState<BizReview[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewAvg, setReviewAvg] = useState<number | null>(null);
  const [reviewHasMore, setReviewHasMore] = useState(false);
  const [reviewLoadingMore, setReviewLoadingMore] = useState(false);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [viewerState, setViewerState] = useState<{ srcs: string[]; index: number } | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('home');
  const [compactHeader, setCompactHeader] = useState(false);
  const [tabsPinned, setTabsPinned] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const introRef = useRef<HTMLElement | null>(null);
  const tabsRef = useRef<HTMLElement | null>(null);
  const pendingTabScrollRef = useRef(false);

  useEffect(() => {
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    // 단건 찜 여부 조회 API 는 없음 — 목록에서 포함 여부만 확인(과설계 금지)
    fetchBizFavorites()
      .then((favs) => setFavorited(favs.some((f) => f.id === id)))
      .catch(() => {});
  }, [id]);

  const handleToggleFavorite = async () => {
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
    if (!user) {
      toast.info(t('biz.review.loginRequired'));
      return;
    }
    setReviewSheetOpen(true);
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

  // 위치 지도 카드 — 이 업체 하나만 표시(다른 업체 핀 없음). 동네지도 리치카드와 동일한 색/글리프 규칙.
  const bizMapMarkers = useMemo<MapMarkerV2[]>(() => {
    if (!profile || profile.latitude == null || profile.longitude == null) return [];
    return [{
      id: profile.id,
      lat: profile.latitude,
      lng: profile.longitude,
      kind: 'biz',
      color: (profile.category && BIZ_CAT_COLOR[profile.category]) || BIZ_CAT_COLOR_FALLBACK,
      icon: profile.category ? BIZ_CAT_ICON_PATH[profile.category] : undefined,
      r: 1.6,
    }];
  }, [profile]);

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
          </div>
        }
      />
      <div ref={bodyRef} className={styles.body} onScroll={(e) => handleBodyScroll(e.currentTarget.scrollTop)}>
        <section ref={introRef} className={styles.intro}>
          <h1 className={styles.name}>{profile.name}</h1>
          <div className={styles.profileMeta}>
            {reviewAvg != null && <span><Star size={15} fill="currentColor" strokeWidth={0} /> {reviewAvg.toFixed(1)} · 후기 {reviewTotal}</span>}
            {profile.category && <span>{(() => { const cat = categories.find((c) => c.code === profile.category); return cat ? bizCategoryLabel(cat, i18n.language) : profile.category; })()}</span>}
            {profile.address && <span>{profile.address}</span>}
          </div>
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
              <AppImage src={profile.photoUrl} alt={profile.name} className={styles.heroImg} />
            </div>
          ) : (
            <div className={styles.heroEmpty}>대표 사진이 아직 등록되지 않았습니다</div>
          )}
        </section>

        <nav ref={tabsRef} className={styles.tabs} aria-label="업체 정보">
          {DETAIL_TABS.map((tab) => (
            <button key={tab} type="button" className={activeTab === tab ? styles.tabActive : styles.tab} onClick={() => handleTabChange(tab)}>
              {t(`biz.detailTabs.${tab}`, { defaultValue: { home: '홈', news: '소식', reviews: '후기', price: '가격', photos: '사진' }[tab] })}
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
            ) : <EmptyArea label="업체 정보" />}

            {profile.latitude != null && profile.longitude != null && (
              <div className={styles.mapCard}>
                <Suspense fallback={<div className={sys.mapLoading}>{t('info.mapLoading')}</div>}>
                  <SaigonMapV5
                    height="100%"
                    markers={bizMapMarkers}
                    lightweight
                    markerDepth="l3"
                    initialGps={{ lat: profile.latitude, lng: profile.longitude }}
                    showLocateControl={false}
                  />
                </Suspense>
              </div>
            )}

            <HomePreview title="소식" onMore={() => handleTabChange('news')}>
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
              ) : <EmptyArea label="소식" />}
            </HomePreview>

            <HomePreview title="후기" onMore={() => handleTabChange('reviews')}>
              {reviews[0] ? (
                <article className={styles.previewReview}>
                  <span><Star size={14} fill="currentColor" strokeWidth={0} /> {reviews[0].rating} · {reviews[0].reviewerNickname ?? '—'}</span>
                  <p>{reviews[0].body}</p>
                </article>
              ) : <EmptyArea label="후기" />}
            </HomePreview>

            <HomePreview title="가격" onMore={() => handleTabChange('price')}>
              {prices.length > 0 ? (
                <div className={styles.previewPrices}>
                  {prices.slice(0, 3).map((p) => (
                    <div key={p.id} className={styles.previewPriceRow}>
                      <span className={styles.previewPriceName}>{p.name}</span>
                      <span className={styles.previewPriceValue}>{formatVnd(p.priceVnd)}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyArea label="가격표" />}
            </HomePreview>

            <HomePreview title="사진" onMore={() => handleTabChange('photos')}>
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
              ) : <EmptyArea label="사진" />}
            </HomePreview>

            <h3 className={styles.sectionTitle}>게시중인 광고</h3>
            {/* 광고 노출 시기상조 — 대표 지시(2026-07-27)로 준비중 안내만 노출.
                ADS_ENABLED(adPlacement.ts)를 켜면 아래 캐러셀 렌더가 복원된다 — 로직은 유지, 삭제 금지. */}
            {!ADS_ENABLED ? (
              <div className={styles.adsEmpty}>
                <p>{t('biz.adsComingSoonDesc', { defaultValue: '광고 기능은 준비중이며 조만간 오픈됩니다' })}</p>
              </div>
            ) : profile.ads.length === 0 ? <EmptyArea label="게시중인 광고" /> : (
              <div className={`${styles.adCarousel} ${profile.ads.length === 1 ? styles.adCarouselSingle : ''}`}>
                {profile.ads.map((ad) => (
                  <button key={ad.id} className={styles.bizAdCard} onClick={() => navigate(`/market/ad/${ad.id}`)}>
                    <div className={styles.bizAdImageWrap}>
                      <AppImage src={ad.imageUrl ?? undefined} alt="" className={styles.bizAdImage} />
                    </div>
                    <div className={styles.bizAdBody}>
                      <div className={styles.bizAdLabelRow}>
                        <span className={styles.bizAdLabel}>광고</span>
                        <span className={styles.bizAdPartner}>{ad.partnerName}</span>
                      </div>
                      <strong className={styles.bizAdTitle}>{ad.title}</strong>
                      {ad.body && <span className={styles.bizAdCopy}>{ad.body}</span>}
                      <span className={styles.bizAdCta}>자세히 보기</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>}

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

          {activeTab === 'reviews' && <>
        <div className={styles.reviewSectionHead}>
          {reviewTotal > 0 && reviewAvg != null && (
            <span className={styles.reviewAvg}>
              <Star size={14} strokeWidth={0} fill="currentColor" />
              {reviewAvg.toFixed(1)} · 후기 {reviewTotal}
            </span>
          )}
          {profile?.isOwner ? (
            <span className={styles.reviewOwnerNotice}>{t('biz.review.ownerNotice')}</span>
          ) : (
            <button type="button" className={styles.reviewWriteBtn} onClick={handleWriteReview}>
              {t('biz.review.write')}
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

          {activeTab === 'price' && <>
            {prices.length === 0 ? (
              <EmptyArea label="가격표" />
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

          {activeTab === 'photos' && <>
            {(() => {
              return photoUrls.length === 0 ? <EmptyArea label="사진" /> : (
                <div className={styles.photoGrid}>
                  {photoUrls.map((url, i) => (
                    <AppImage
                      key={url}
                      src={url}
                      alt=""
                      className={styles.galleryImage}
                      onClick={() => setViewerState({ srcs: photoUrls, index: i })}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                </div>
              );
            })()}
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
          onSubmitted={() => loadReviews(id)}
        />
      )}

      {viewerState && (
        <ImageViewer srcs={viewerState.srcs} initialIndex={viewerState.index} onClose={() => setViewerState(null)} />
      )}
    </div>
  );
}

function EmptyArea({ label }: { label: string }) {
  return <div className={styles.adsEmpty}><p>{label}이(가) 아직 등록되지 않았습니다</p></div>;
}

function HomePreview({ title, onMore, children }: { title: string; onMore: () => void; children: ReactNode }) {
  return (
    <section className={styles.homePreview}>
      <div className={styles.previewHead}>
        <h3>{title}</h3>
        <button type="button" onClick={onMore}>자세히 보기</button>
      </div>
      {children}
    </section>
  );
}
