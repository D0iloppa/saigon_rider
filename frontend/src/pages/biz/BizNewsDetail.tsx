import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { extractDetail } from '@/api/client';
import { useConfirmStore } from '@/store/useConfirmStore';
import { deleteBizNews, type BizNewsItem } from '@/api/biz';
import { formatRelativeTime } from '@/lib/format';
import styles from './BizNewsDetail.module.css';

interface LocationState {
  news?: BizNewsItem;
  profileName?: string;
  profilePhotoUrl?: string | null;
}

/** 소식 상세 — BizManage 소식 카드 탭 진입면. BizPublic.tsx 의 소식 카드 마크업을 레퍼런스로
 * '고객에게 보이는 형태' 미리보기 + 삭제만 제공한다(수정 API 없음. 댓글/좋아요/조회수 컬럼 없음). */
export default function BizNewsDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const openConfirm = useConfirmStore((s) => s.open);
  const state = location.state as LocationState | null;
  const news = state?.news ?? null;
  const [deleting, setDeleting] = useState(false);

  // 진입 컨텍스트(news) 없이 URL 직접 접근된 경우 — 관리 화면으로 복귀
  useEffect(() => {
    if (!news) navigate('/biz/manage', { replace: true });
  }, [news, navigate]);

  if (!news) return null;

  const handleDelete = () => {
    openConfirm(
      { mode: 'text', value: t('biz.newsDeleteConfirm', { defaultValue: '이 소식을 삭제할까요?' }) },
      async () => {
        setDeleting(true);
        try {
          await deleteBizNews(news.id);
          navigate('/biz/manage', { replace: true });
        } catch (err: any) {
          toast.error(extractDetail(err, t('biz.newsDeleteError', { defaultValue: '소식 삭제에 실패했습니다' })));
        } finally {
          setDeleting(false);
        }
      },
    );
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.newsDetailTitle', { defaultValue: '소식 상세' })} />
      <div className={styles.body}>
        <p className={styles.previewLabel}>{t('biz.newsDetailPreviewLabel', { defaultValue: '고객에게 이렇게 보여요' })}</p>

        <article className={styles.newsCard}>
          <div className={styles.newsHead}>
            <AppImage src={state?.profilePhotoUrl ?? undefined} alt="" variant="circle" className={styles.avatar} />
            <div className={styles.headText}>
              <span className={styles.bizName}>{state?.profileName}</span>
              <span className={styles.time}>{formatRelativeTime(news.createdAt)}</span>
            </div>
          </div>
          <p className={styles.title}>{news.title}</p>
          {news.body && <p className={styles.bodyText}>{news.body}</p>}
          {news.photos.length > 0 && (
            <div className={styles.thumbWrap}>
              <AppImage src={news.photos[0]} alt="" className={styles.thumb} />
              {news.photos.length > 1 && <span className={styles.thumbMore}>+{news.photos.length - 1}</span>}
            </div>
          )}
        </article>
      </div>

      <div className={styles.footer}>
        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? t('biz.newsDeleting', { defaultValue: '삭제 중' }) : t('biz.newsDeleteCta', { defaultValue: '소식 삭제' })}
        </Button>
      </div>
    </div>
  );
}
