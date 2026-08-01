import { useEffect, useRef, useState } from 'react';
import { Eye, Flame, Heart, MessageCircle, MessageSquareQuote, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import { StarIcon } from '@/components/ui/StarIcon';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import { formatRelativeTime } from '@/lib/format';
import { addBizFavorite, fetchBizFavorites, removeBizFavorite, type BizMapItem } from '@/api/biz';
import { localizedName, type ListingCard as Listing } from '@/api/market';
import { formatDistance, formatPriceVnd, relativeTime, statusLabelKey } from '@/pages/market/marketFormat';
import type { FeedPost } from '@/api/types';
import styles from './PostPanel.module.css';

// 업체 포스트 패널 (W2, 당근 레퍼런스) — 핀 직접 터치 시 바텀시트를 대체하는 가로 스와이프
// 캐러셀. 스냅 감지는 IntersectionObserver(useInfiniteScroll.ts 관례) — scrollend 는 구형
// WebView 신뢰도가 낮아 배제. 카드 = 업체 최신 소식(없으면 소개 폴백).
// 패키지 C: 매물/피드 핀에도 같은 팝업 카드를 쓰도록 items 를 kind 별 union 으로 일반화.
// 업체 카드 마크업(cardHead/bizName/favBtn)은 회귀 하네스가 의존하므로 그대로 유지한다.
export type PanelItem =
  | { kind: 'biz'; biz: BizMapItem }
  | { kind: 'listing'; listing: Listing }
  | { kind: 'feed'; post: FeedPost };

function panelItemId(it: PanelItem): string {
  return it.kind === 'biz' ? it.biz.id : it.kind === 'listing' ? it.listing.id : it.post.id;
}

interface PostPanelProps {
  items: PanelItem[];
  index: number;
  /** 업체 전용 — 실시간 조회 칩 (매물/피드 팝업은 미노출) */
  viewerCount?: number | null;
  /** 업체 전용 — 카테고리 코드 라벨 */
  catLabel?: (c: string | null) => string;
  onIndexChange: (i: number) => void;
  onCardTap: (item: PanelItem) => void;
  onClose: () => void;
  onHeightChange: (px: number) => void;
}

export function PostPanel({ items, index, viewerCount, catLabel, onIndexChange, onCardTap, onClose, onHeightChange }: PostPanelProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reportedIdx = useRef(index);
  // 찜 상태 (P-FE) — 단건 조회 API 가 없어 목록 1회 로드 후 낙관적 토글 (업체 카드 전용)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const hasBiz = items.some((it) => it.kind === 'biz');

  useEffect(() => {
    if (!hasBiz) return;
    fetchBizFavorites()
      .then((favs) => setFavoriteIds(new Set(favs.map((f) => f.id))))
      .catch(() => {});
  }, [hasBiz]);

  const toggleFavorite = async (id: string) => {
    const next = !favoriteIds.has(id);
    setFavoriteIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(id); else s.delete(id);
      return s;
    });
    try {
      if (next) await addBizFavorite(id);
      else await removeBizFavorite(id);
    } catch {
      setFavoriteIds((prev) => {
        const s = new Set(prev);
        if (next) s.delete(id); else s.add(id);
        return s;
      });
    }
  };

  // 패널 실높이 → 지도 bottomInset (시트의 onVisibleHeightChange 역할 대체)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  // 후보 갱신(매물/피드 지도 이동 재검색, 패키지 C) 시 캐러셀을 index 카드로 정렬 —
  // 재구성(사용자 팬, index 0 리셋)이면 선두 포커스로 복귀, append(플리킹 recenter,
  // index 불변·끝쪽 추가)면 현재 카드 재센터링 no-op. 이전 scrollLeft 가 새 배열의 다른
  // 카드를 가리키면 IO 가 엉뚱한 인덱스를 보고해 recenter 가 튀는 것 방지.
  // 업체 팝업은 열림 중 items 불변이라 이 이펙트가 재실행되지 않는다.
  useEffect(() => {
    const root = scrollRef.current;
    const card = cardRefs.current[index];
    if (!root || !card) return;
    reportedIdx.current = index;
    root.scrollLeft += card.getBoundingClientRect().left - root.getBoundingClientRect().left
      - (root.clientWidth - card.clientWidth) / 2;
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps -- index 는 재구성 시점 값만 사용

  // 스냅 감지 — 캐러셀 안에서 60% 이상 보이는 카드가 바뀌면 포커싱 전환.
  // deps 는 items 참조 — 재구성 시 카드 DOM 이 통째로 교체되므로 observer 재연결 필수.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const best = entries.reduce((a, b) => (b.intersectionRatio > a.intersectionRatio ? b : a));
      if (best.intersectionRatio > 0.6) {
        const idx = cardRefs.current.findIndex((el) => el === best.target);
        if (idx >= 0 && idx !== reportedIdx.current) {
          reportedIdx.current = idx;
          onIndexChange(idx);
        }
      }
    }, { root, threshold: [0.6] });
    cardRefs.current.slice(0, items.length).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [items, onIndexChange]);

  const renderCard = (it: PanelItem) => {
    if (it.kind === 'biz') {
      const b = it.biz;
      const news = b.latestNews;
      const photo = news?.photos[0];
      return (
        <>
          {/* cardBody(button) 안에 button 중첩은 불가 — 형제로 두고 cardHead 우측에 absolute 배치 */}
          <button
            type="button"
            className={styles.favBtn}
            aria-pressed={favoriteIds.has(b.id)}
            aria-label={t('map.favorites.title')}
            onClick={(e) => { e.stopPropagation(); toggleFavorite(b.id); }}
          >
            <Heart size={18} strokeWidth={2} fill={favoriteIds.has(b.id) ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className={styles.cardBody} onClick={() => onCardTap(it)}>
            <div className={styles.cardHead}>
              <AppImage src={b.photoUrl ?? undefined} alt="" className={styles.avatar} />
              <div className={styles.headText}>
                <span className={styles.bizName}>{b.name}</span>
                <span className={styles.meta}>
                  {b.category && catLabel && <span className={styles.cat}><BizCatIcon category={b.category} size={12} />{catLabel(b.category)}</span>}
                  {news && <span className={styles.time}>{formatRelativeTime(news.createdAt)}</span>}
                </span>
              </div>
            </div>
            {/* 말풍선(bizNewsOverlay)과 정보량 균형 — 찜 수는 favBtn(Heart 토글)과 아이콘이 겹쳐
                오독을 만들므로 여기 넣지 않는다(별=평점, 사람=단골 규칙은 유지). */}
            {(b.rating != null || b.followerCount > 0) && (
              <div className={styles.metaRow}>
                {b.rating != null && (
                  <span className={styles.rating}>
                    <StarIcon size={12} />
                    <strong className="num">{b.rating.toFixed(1)}</strong>
                    <small className="num">({b.reviewCount})</small>
                  </span>
                )}
                {b.followerCount > 0 && (
                  <span className={styles.count}>
                    <Users size={12} strokeWidth={2} />
                    {t('map.bizCard.followers', { count: b.followerCount })}
                  </span>
                )}
              </div>
            )}
            <div className={styles.cardMain}>
              <p className={styles.copy}>
                {news
                  ? news.title
                  : <>{b.category && catLabel ? t('map.bizNews.categoryCopy', { category: catLabel(b.category) }) : ''}{b.address ?? t('map.bizNews.fallbackCopy')}</>}
              </p>
              {photo && (
                <div className={styles.thumbWrap}>
                  <AppImage src={photo} alt="" className={styles.thumb} />
                  {news!.photos.length > 1 && <span className={styles.thumbMore}>+{news!.photos.length - 1}</span>}
                </div>
              )}
            </div>
            {b.reviewPreviews[0] && (
              <div className={styles.reviewLine}>
                <MessageSquareQuote size={12} />
                <strong>{t('map.bizCard.reviewPill', { rating: b.reviewPreviews[0].rating.toFixed(1) })}</strong>
                <span>{b.reviewPreviews[0].body}</span>
              </div>
            )}
          </button>
        </>
      );
    }
    if (it.kind === 'listing') {
      // 바텀시트 ListingCard(REF-02)와 같은 정보 수준 — 상태태그·지역·거리·시간·찜·채팅.
      // listingTitle/listingPrice 클래스는 회귀 하네스(regr-map S5)가 의존 — 이름 유지.
      const l = it.listing;
      return (
        <button type="button" className={styles.cardBody} onClick={() => onCardTap(it)}>
          <div className={styles.listingRow}>
            <span className={styles.listingThumbWrap}>
              <AppImage src={l.thumbnailUrl ?? undefined} alt="" className={styles.listingThumb} />
              {l.status !== 'ON_SALE' && <span className={styles.listingStatusTag}>{t(statusLabelKey(l.status))}</span>}
            </span>
            <div className={styles.listingBody}>
              <p className={styles.listingTitle}>{l.title}</p>
              <span className={styles.listingMeta}>
                {[localizedName(l.district), formatDistance(l.distanceM, t), relativeTime(l.bumpedAt, t)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {l.description?.trim() ? (
                <p className={styles.listingDescription}>{l.description}</p>
              ) : (
                <p className={`${styles.listingDescription} ${styles.listingDescriptionEmpty}`}>
                  {t('map.postPanel.noDescription')}
                </p>
              )}
            </div>
          </div>
          <span className={styles.listingFooter}>
            <span className={styles.listingPrice}>{formatPriceVnd(l.priceVnd, t)}</span>
            <span className={styles.listingCounts}>
              <span><Heart size={13} strokeWidth={2.2} aria-hidden="true" /> {l.likeCount}</span>
              <span><MessageCircle size={13} strokeWidth={2.2} aria-hidden="true" /> {l.chatCount}</span>
            </span>
          </span>
        </button>
      );
    }
    // 피드 카드 — [아바타 닉네임 · 시간] / [본문 2줄 클램프 | 정사각 썸네일] / [🔥 💬].
    // 해시태그 줄은 제거(스케치 기준), 빈 caption 이면 해시태그를 본문 자리에 폴백.
    const p = it.post;
    return (
      <button type="button" className={styles.cardBody} onClick={() => onCardTap(it)}>
        <div className={styles.feedHead}>
          <AppImage src={p.userAvatarUrl ?? undefined} alt="" className={styles.feedAvatar} variant="circle" />
          <span className={styles.feedName}>{p.userNickname ?? '—'}</span>
          <span className={styles.feedTime}>· {relativeTime(p.createdAt, t)}</span>
        </div>
        <div className={styles.cardMain}>
          <p className={styles.feedCopy}>{p.caption || p.hashtags.map((tag) => `#${tag}`).join(' ')}</p>
          {p.photoUrl && (
            <div className={styles.thumbWrap}>
              <AppImage src={p.photoUrl} alt="" className={styles.feedThumb} />
              {p.photoUrls.length > 1 && <span className={styles.thumbMore}>+{p.photoUrls.length - 1}</span>}
            </div>
          )}
        </div>
        <div className={styles.feedFooter}>
          <span><Flame size={13} strokeWidth={2.2} aria-hidden="true" /> {p.cheerCount}</span>
          <span><MessageCircle size={13} strokeWidth={2.2} aria-hidden="true" /> {p.commentCount}</span>
        </div>
      </button>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.aboveRow}>
        {viewerCount != null && viewerCount > 0 && (
          <span className={styles.viewerChip}>
            <Eye size={14} strokeWidth={2.2} /> {t('map.postPanel.viewing', { n: viewerCount })}
          </span>
        )}
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>
          <X size={20} strokeWidth={2.2} />
        </button>
      </div>
      <div ref={scrollRef} className={`${styles.scroller} ${items.length === 1 ? styles.scrollerSingle : ''}`}>
        {items.map((it, i) => (
          <div key={panelItemId(it)} ref={(el) => { cardRefs.current[i] = el; }} className={styles.card}>
            {renderCard(it)}
          </div>
        ))}
      </div>
    </div>
  );
}
