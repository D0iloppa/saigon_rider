import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, MapPin, Heart, Star } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { useUserStore } from '@/store/useUserStore';
import {
  fetchBusinessPublicProfile,
  fetchBizCategories,
  bizCategoryLabel,
  fetchBizFavorites,
  addBizFavorite,
  removeBizFavorite,
  fetchBizPublicNews,
  fetchBizReviews,
  type BusinessPublicProfile,
  type BizCategory,
  type BizNewsItem,
  type BizReview,
} from '@/api/biz';
import BizReviewSheet from './BizReviewSheet';
import { formatRelativeTime } from '@/lib/format';
import { markBizNewsRead } from '@/lib/bizNewsRead';
import styles from './BizPublic.module.css';

const NEWS_PAGE = 10;
const REVIEW_PAGE = 5;

/** 3줄 클램프를 넘길 개연성 판단 — 정밀 측정 대신 간단 휴리스틱 (길이·줄수) */
function isLongBody(body: string): boolean {
  return body.length > 90 || (body.match(/\n/g)?.length ?? 0) >= 3;
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
  const user = useUserStore((s) => s.user);
  const [reviews, setReviews] = useState<BizReview[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewAvg, setReviewAvg] = useState<number | null>(null);
  const [reviewHasMore, setReviewHasMore] = useState(false);
  const [reviewLoadingMore, setReviewLoadingMore] = useState(false);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);

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
        title={profile.name}
        rightContent={
          <button
            type="button"
            className={styles.favoriteBtn}
            onClick={handleToggleFavorite}
            aria-label={t('biz.favoriteToggle', { defaultValue: '관심 업체' })}
            aria-pressed={favorited}
          >
            <Heart size={22} strokeWidth={2} fill={favorited ? 'currentColor' : 'none'} />
          </button>
        }
      />
      <div className={styles.body}>
        <div className={styles.heroWrap}>
          <AppImage src={profile.photoUrl ?? undefined} alt={profile.name} className={styles.heroImg} />
        </div>

        <h1 className={styles.name}>{profile.name}</h1>
        {profile.category && (
          <span className={styles.categoryBadge}>
            {(() => {
              const cat = categories.find((c) => c.code === profile.category);
              return cat ? bizCategoryLabel(cat, i18n.language) : profile.category;
            })()}
          </span>
        )}

        {(profile.phone || profile.address) && (
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
        )}

        <h3 className={styles.sectionTitle}>{t('biz.publicNewsTitle', { defaultValue: '소식' })}</h3>
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
                    <div className={styles.newsThumbWrap}>
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

        <div className={styles.reviewSectionHead}>
          <h3 className={styles.sectionTitle}>
            {reviewTotal > 0 ? t('biz.review.sectionTitleCount', { count: reviewTotal }) : t('biz.review.sectionTitle')}
            {/* 요약 별점은 데이터가 있을 때만 — 0건이면 숨김 (섹션 헤더 전용, 타이틀 영역 개편은 범위 밖) */}
            {reviewTotal > 0 && reviewAvg != null && (
              <span className={styles.reviewAvg}>
                <Star size={14} strokeWidth={0} fill="currentColor" />
                {reviewAvg.toFixed(1)}
              </span>
            )}
          </h3>
          <button type="button" className={styles.reviewWriteBtn} onClick={handleWriteReview}>
            {t('biz.review.write')}
          </button>
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

        <h3 className={styles.sectionTitle}>{t('biz.publicAdsTitle', { defaultValue: '게시중인 광고' })}</h3>
        {profile.ads.length === 0 ? (
          <div className={styles.adsEmpty}>
            <p>{t('biz.publicAdsEmpty', { defaultValue: '아직 게시중인 광고가 없어요' })}</p>
          </div>
        ) : (
          <div className={styles.adList}>
            {profile.ads.map((ad) => (
              <button key={ad.id} className={styles.adRow} onClick={() => navigate(`/market/ad/${ad.id}`)}>
                <AppImage src={ad.imageUrl ?? undefined} alt="" className={styles.adThumb} />
                <span className={styles.adRowTitle}>{ad.title}</span>
              </button>
            ))}
          </div>
        )}
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
    </div>
  );
}
