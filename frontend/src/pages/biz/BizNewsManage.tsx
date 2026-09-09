import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Newspaper, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { extractDetail } from '@/api/client';
import { fetchBizPublicNews, deleteBizNews, type BizNewsItem } from '@/api/biz';
import { formatRelativeTime } from '@/lib/format';
import sys from '@/styles/system.module.css';
import styles from './BizNewsManage.module.css';

const NEWS_PAGE = 20;

interface LocationState {
  profileId?: string;
  profileName?: string;
  profilePhotoUrl?: string | null;
}

/** 소식 관리 — 파트너 라운지 '내 소식' 진입점에서 분리된 별도 화면 (BizPriceManage.tsx 구조 레퍼런스).
 * 목록은 offset 페이지네이션(더보기) — BizDashboard.tsx 후기 더보기 패턴 미러. */
export default function BizNewsManage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const profileId = state?.profileId ?? null;

  const [news, setNews] = useState<BizNewsItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BizNewsItem | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'oldest'>('latest');

  useEffect(() => {
    if (!profileId) {
      navigate('/biz/manage', { replace: true });
      return;
    }
    let cancelled = false;
    fetchBizPublicNews(profileId, { limit: NEWS_PAGE, offset: 0 })
      .then((list) => {
        if (!cancelled) {
          setNews(list);
          setHasMore(list.length === NEWS_PAGE);
        }
      })
      .catch(() => {
        if (!cancelled) { setNews([]); setLoadError(true); }
      });
    return () => { cancelled = true; };
  }, [profileId, navigate, reloadKey]);

  const visibleNews = useMemo(() => {
    if (!news) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase(i18n.language);
    return news
      .filter((item) => !normalizedQuery || `${item.title} ${item.body ?? ''}`.toLocaleLowerCase(i18n.language).includes(normalizedQuery))
      .sort((a, b) => (sortOrder === 'latest' ? 1 : -1) * (Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  }, [i18n.language, news, query, sortOrder]);

  if (!profileId) return null;

  const handleMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchBizPublicNews(profileId, { limit: NEWS_PAGE, offset: news?.length ?? 0 });
      setNews((prev) => {
        if (!prev) return more;
        const existingIds = new Set(prev.map((item) => item.id));
        return [...prev, ...more.filter((item) => !existingIds.has(item.id))];
      });
      setHasMore(more.length === NEWS_PAGE);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBizNews(deleteTarget.id);
      setNews((prev) => (prev ? prev.filter((n) => n.id !== deleteTarget.id) : prev));
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(extractDetail(err, t('biz.newsDeleteError', { defaultValue: '소식 삭제에 실패했습니다' })));
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.newsManageTitle', { defaultValue: '내 소식' })} />
      <div className={styles.body}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>{t('biz.newsManageEyebrow')}</span>
            <h1>{t('biz.newsManageTitle')}</h1>
            <p>{t('biz.newsManagePurpose')}</p>
            {news !== null && !loadError && <span className={`${styles.count} num`}>{t('biz.newsManageCount', { count: `${news.length}${hasMore ? '+' : ''}` })}</span>}
          </div>
          <Button onClick={() => navigate('/biz/news/new', { state: { profileId } })}>
            <Plus size={17} />{t('biz.newsCreateCta')}
          </Button>
        </section>
        {news !== null && !loadError && news.length > 0 && <section className={styles.controls} aria-label={t('biz.newsControlsLabel')}>
          <label className={styles.searchField}>
            <Search size={17} aria-hidden="true" />
            <span className={styles.srOnly}>{t('biz.newsSearchLabel')}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('biz.newsSearchPlaceholder')} type="search" />
          </label>
          <select className={styles.sortSelect} value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'latest' | 'oldest')} aria-label={t('biz.newsSortLabel')}>
            <option value="latest">{t('biz.newsSortLatest')}</option>
            <option value="oldest">{t('biz.newsSortOldest')}</option>
          </select>
          <p>{t('biz.newsLoadedScope')}</p>
        </section>}
        <div className={sys.sectionHead}><h2 className={sys.sectionLabel}>{t('biz.newsListTitle')}</h2>{query.trim() && <span className={`${styles.resultCount} num`}>{t('biz.newsSearchCount', { count: visibleNews.length })}</span>}</div>
        {loadError ? (
          <div className={`${sys.card} ${styles.emptyCard}`}><StateBlock icon={AlertCircle} tone="error" title={t('biz.newsLoadError')} actionLabel={t('common.retry')} onAction={() => { setLoadError(false); setNews(null); setReloadKey((key) => key + 1); }} /></div>
        ) : news === null ? (
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        ) : news.length === 0 ? (
          <div className={`${sys.card} ${styles.emptyCard}`}><StateBlock
            icon={Newspaper}
            title={t('biz.newsManageEmpty')}
            desc={t('biz.newsManagePurpose')}
          /></div>
        ) : visibleNews.length === 0 ? (
          <div className={`${sys.card} ${styles.emptyCard}`}><StateBlock
            icon={Search}
            title={t('biz.newsSearchEmptyTitle')}
            desc={t('biz.newsSearchEmptyDesc')}
            actionLabel={t('biz.newsSearchReset')}
            onAction={() => setQuery('')}
          /></div>
        ) : (
          <div className={styles.list}>
            {visibleNews.map((n) => (
              <article
                key={n.id}
                className={styles.row}
              >
                {n.photos[0] ? <AppImage src={n.photos[0]} alt="" className={styles.thumb} /> : <div className={styles.thumbFallback}><Newspaper size={20} /></div>}
                <div className={styles.rowBody}>
                  <span className={styles.rowTitle}>{n.title}</span>
                  <span className={styles.rowMeta}>{t('biz.newsCreatedAt', { time: formatRelativeTime(n.createdAt) })}</span>
                  <span className={styles.rowText}>{n.body || t('biz.newsPreviewEmpty')}</span>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.manageAction} onClick={() => navigate(`/biz/news/${n.id}`, {
                      state: {
                        news: n,
                        profileId,
                        profileName: state?.profileName,
                        profilePhotoUrl: state?.profilePhotoUrl,
                      },
                    })}><Pencil size={15} />{t('biz.newsManageCta')}</button>
                    <button type="button" className={styles.deleteAction} onClick={() => setDeleteTarget(n)} aria-label={t('biz.newsDeleteCta')}>
                      <Trash2 size={14} />{t('biz.newsDeleteCta')}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {news !== null && !loadError && news.length > 0 && hasMore && (
          <button type="button" className={styles.moreBtn} onClick={handleMore} disabled={loadingMore}>
            {t('biz.publicNewsMore', { defaultValue: '소식 더보기' })}
          </button>
        )}
      </div>
      <AlertDialog open={deleteTarget !== null} title={t('biz.newsDeleteCta')} message={t('biz.newsDeleteConfirm')} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} confirmLabel={t('biz.newsDeleteCta')} />
    </div>
  );
}
