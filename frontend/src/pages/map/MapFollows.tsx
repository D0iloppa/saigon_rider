import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, Bell, Newspaper } from 'lucide-react';
import { AppImage } from '@/components/ui/AppImage';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import StateBlock from '@/components/ui/StateBlock';
import { PullIndicator } from '@/components/ui/PullIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import {
  fetchBizFollows,
  unfollowBusiness,
  fetchBizCategories,
  bizCategoryLabel,
  type BizFollow,
  type BizCategory,
} from '@/api/biz';
import styles from './MapFollows.module.css';

/** 단골 업체(소식 구독) 목록 — 찜(MapFavorites)과 별개 화면. 소식이 있는 업체를 먼저 보여준다(SGR-330). */
export default function MapFollows() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [follows, setFollows] = useState<BizFollow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [categories, setCategories] = useState<BizCategory[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // P2-13: 조회 실패를 "단골 0곳"으로 위장하지 않는다 — 실패 시 기존 목록(stale)은 유지하고 error 만 세운다
  useEffect(() => {
    setLoading(true);
    fetchBizFollows()
      .then((data) => { setFollows(data); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
  }, [reloadKey]);

  const { containerRef, pullDistance, isRefreshing, contentStyle } = usePullToRefresh(
    useCallback(() => setReloadKey((v) => v + 1), []),
  );

  function catLabel(code: string | null) {
    if (!code) return '';
    const cat = categories.find((c) => c.code === code);
    return cat ? bizCategoryLabel(cat, i18n.language) : code;
  }

  async function handleUnfollow(id: string) {
    setFollows((prev) => prev.filter((b) => b.id !== id));
    try {
      await unfollowBusiness(id);
    } catch {
      // 실패 시에도 목록 화면에서는 재조회하지 않는다 — 다음 진입 시 서버 상태로 정정
    }
  }

  // 소식이 주인공 — 최신 소식이 있는 업체를 먼저 보여준다.
  const sorted = [...follows].sort((a, b) => {
    if (!!a.latestNews === !!b.latestNews) return 0;
    return a.latestNews ? -1 : 1;
  });

  return (
    <main className={styles.root}>
      <div className={styles.scrollArea} ref={containerRef as React.RefObject<HTMLDivElement>}>
      <div style={contentStyle}>
      <PullIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ArrowLeft size={28} />
        </button>
        <h1>{t('map.follows.title')}</h1>
      </header>

      {loading ? (
        <div className={styles.listArea}>
          {[1, 2, 3].map((i) => <div key={i} className={`shimmer ${styles.skeleton}`} />)}
        </div>
      ) : follows.length === 0 && error ? (
        <div className={styles.listArea}>
          <StateBlock
            icon={AlertCircle}
            tone="error"
            title={t('map.follows.loadError')}
            actionLabel={t('common.retry')}
            onAction={() => setReloadKey((v) => v + 1)}
          />
        </div>
      ) : follows.length === 0 ? (
        <div className={styles.listArea}>
          <StateBlock icon={Bell} title={t('map.follows.emptyTitle')} desc={t('map.follows.emptyDesc')} />
        </div>
      ) : (
        <div className={styles.list}>
          {sorted.map((b) => (
            <div key={b.id} className={styles.card} onClick={() => navigate(`/biz/${b.id}`)}>
              <div className={styles.cardTop}>
                <AppImage src={b.photoUrl ?? undefined} alt="" className={styles.thumb} />
                <div className={styles.body}>
                  <span className={styles.name}>{b.name}</span>
                  <span className={styles.meta}>
                    {b.category && <span className={styles.cat}><BizCatIcon category={b.category} size={12} />{catLabel(b.category)}</span>}
                    {b.address && <span className={styles.address}>{b.address}</span>}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.bellBtn}
                  aria-label={t('common.remove', { defaultValue: '삭제' })}
                  onClick={(e) => { e.stopPropagation(); handleUnfollow(b.id); }}
                >
                  <Bell size={20} fill="currentColor" strokeWidth={0} />
                </button>
              </div>
              {b.latestNews ? (
                <div className={styles.newsBox}>
                  <span className={styles.newsLabel}><Newspaper size={13} />{t('map.follows.newsLabel')}</span>
                  <p className={styles.newsTitle}>{b.latestNews.title}</p>
                </div>
              ) : (
                <p className={styles.noNews}>{t('map.follows.noNews')}</p>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
      </div>
    </main>
  );
}
