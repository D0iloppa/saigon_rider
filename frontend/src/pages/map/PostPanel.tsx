import { useEffect, useRef } from 'react';
import { Eye, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import { formatRelativeTime } from '@/lib/format';
import type { BizMapItem } from '@/api/biz';
import styles from './PostPanel.module.css';

// 업체 포스트 패널 (W2, 당근 레퍼런스) — 핀 직접 터치 시 바텀시트를 대체하는 가로 스와이프
// 캐러셀. 스냅 감지는 IntersectionObserver(useInfiniteScroll.ts 관례) — scrollend 는 구형
// WebView 신뢰도가 낮아 배제. 카드 = 업체 최신 소식(없으면 소개 폴백).
interface PostPanelProps {
  items: BizMapItem[];
  index: number;
  viewerCount: number | null;
  catLabel: (c: string | null) => string;
  onIndexChange: (i: number) => void;
  onCardTap: (biz: BizMapItem) => void;
  onClose: () => void;
  onHeightChange: (px: number) => void;
}

export function PostPanel({ items, index, viewerCount, catLabel, onIndexChange, onCardTap, onClose, onHeightChange }: PostPanelProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reportedIdx = useRef(index);

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

  // 스냅 감지 — 캐러셀 안에서 60% 이상 보이는 카드가 바뀌면 포커싱 전환
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
  }, [items.length, onIndexChange]);

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
      <div ref={scrollRef} className={styles.scroller}>
        {items.map((b, i) => {
          const news = b.latestNews;
          const photo = news?.photos[0];
          return (
            <div key={b.id} ref={(el) => { cardRefs.current[i] = el; }} className={styles.card}>
              <button type="button" className={styles.cardBody} onClick={() => onCardTap(b)}>
                <div className={styles.cardHead}>
                  <AppImage src={b.photoUrl ?? undefined} alt="" className={styles.avatar} />
                  <div className={styles.headText}>
                    <span className={styles.bizName}>{b.name}</span>
                    <span className={styles.meta}>
                      {b.category && <span className={styles.cat}><BizCatIcon category={b.category} size={12} />{catLabel(b.category)}</span>}
                      {news && <span className={styles.time}>{formatRelativeTime(news.createdAt)}</span>}
                    </span>
                  </div>
                </div>
                <div className={styles.cardMain}>
                  <p className={styles.copy}>
                    {news
                      ? news.title
                      : <>{b.category ? t('map.bizNews.categoryCopy', { category: catLabel(b.category) }) : ''}{b.address ?? t('map.bizNews.fallbackCopy')}</>}
                  </p>
                  {photo && (
                    <div className={styles.thumbWrap}>
                      <AppImage src={photo} alt="" className={styles.thumb} />
                      {news!.photos.length > 1 && <span className={styles.thumbMore}>+{news!.photos.length - 1}</span>}
                    </div>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
