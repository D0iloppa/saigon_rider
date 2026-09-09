import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronRight, Newspaper, Plus, Trash2 } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { extractDetail } from '@/api/client';
import { fetchBizPublicNews, deleteBizNews, type BizNewsItem } from '@/api/biz';
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
  const { t } = useTranslation();
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

  useEffect(() => {
    if (!profileId) {
      navigate('/biz/manage', { replace: true });
      return;
    }
    fetchBizPublicNews(profileId, { limit: NEWS_PAGE, offset: 0 })
      .then((list) => {
        setNews(list);
        setHasMore(list.length === NEWS_PAGE);
      })
      .catch(() => { setNews([]); setLoadError(true); });
  }, [profileId, navigate, reloadKey]);

  if (!profileId) return null;

  const handleMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchBizPublicNews(profileId, { limit: NEWS_PAGE, offset: news?.length ?? 0 });
      setNews((prev) => (prev ? [...prev, ...more] : more));
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
          <Button fullWidth={false} onClick={() => navigate('/biz/news/new', { state: { profileId } })}>
            <Plus size={17} />{t('biz.newsCreateCta')}
          </Button>
        </section>
        <div className={sys.sectionHead}><h2 className={sys.sectionLabel}>{t('biz.newsListTitle')}</h2></div>
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
        ) : (
          <div className={styles.list}>
            {news.map((n) => (
              <article
                key={n.id}
                className={styles.row}
              >
                {n.photos[0] ? <AppImage src={n.photos[0]} alt="" className={styles.thumb} /> : <div className={styles.thumbFallback}><Newspaper size={20} /></div>}
                <div className={styles.rowBody}>
                  <span className={styles.rowTitle}>{n.title}</span>
                  <span className={styles.rowText}>{n.body || t('biz.newsPreviewEmpty')}</span>
                  <div className={styles.rowActions}>
                    <button type="button" className={`${sys.actionChip} ${sys.actionNeutral}`} onClick={() => navigate(`/biz/news/${n.id}`, {
                      state: {
                        news: n,
                        profileId,
                        profileName: state?.profileName,
                        profilePhotoUrl: state?.profilePhotoUrl,
                      },
                    })}>{t('biz.newsManageCta')}<ChevronRight size={14} /></button>
                    <button type="button" className={`${sys.actionChip} ${styles.deleteAction}`} onClick={() => setDeleteTarget(n)} aria-label={t('biz.newsDeleteCta')}>
                      <Trash2 size={14} />{t('biz.newsDeleteCta')}
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {hasMore && (
              <button type="button" className={styles.moreBtn} onClick={handleMore} disabled={loadingMore}>
                {t('biz.publicNewsMore', { defaultValue: '소식 더보기' })}
              </button>
            )}
          </div>
        )}
      </div>
      <AlertDialog open={deleteTarget !== null} title={t('biz.newsDeleteCta')} message={t('biz.newsDeleteConfirm')} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} confirmLabel={t('biz.newsDeleteCta')} />
    </div>
  );
}
