import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Newspaper, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { extractDetail } from '@/api/client';
import { fetchBizPublicNews, deleteBizNews, type BizNewsItem } from '@/api/biz';
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
      .catch(() => setNews([]));
  }, [profileId, navigate]);

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

  const handleDelete = async (id: string) => {
    try {
      await deleteBizNews(id);
      setNews((prev) => (prev ? prev.filter((n) => n.id !== id) : prev));
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.newsDeleteError', { defaultValue: '소식 삭제에 실패했습니다' })));
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.newsManageTitle', { defaultValue: '내 소식' })} />
      <div className={styles.body}>
        {news === null ? (
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        ) : news.length === 0 ? (
          <StateBlock
            icon={Newspaper}
            title={t('biz.newsManageEmpty', { defaultValue: '아직 작성한 소식이 없어요' })}
          />
        ) : (
          <div className={styles.list}>
            {news.map((n) => (
              <div
                key={n.id}
                className={styles.row}
                onClick={() => navigate(`/biz/news/${n.id}`, {
                  state: {
                    news: n,
                    profileId,
                    profileName: state?.profileName,
                    profilePhotoUrl: state?.profilePhotoUrl,
                  },
                })}
              >
                {n.photos[0] && <AppImage src={n.photos[0]} alt="" className={styles.thumb} />}
                <div className={styles.rowBody}>
                  <span className={styles.rowTitle}>{n.title}</span>
                  {n.body && <span className={styles.rowText}>{n.body}</span>}
                </div>
                <button
                  type="button"
                  className={styles.rowDelete}
                  onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                  aria-label={t('biz.newsDeleteCta', { defaultValue: '소식 삭제' })}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ))}
            {hasMore && (
              <button type="button" className={styles.moreBtn} onClick={handleMore} disabled={loadingMore}>
                {t('biz.publicNewsMore', { defaultValue: '소식 더보기' })}
              </button>
            )}
          </div>
        )}
        <Button onClick={() => navigate('/biz/news/new', { state: { profileId } })}>
          {t('biz.newsCreateCta', { defaultValue: '소식 작성' })}
        </Button>
      </div>
    </div>
  );
}
