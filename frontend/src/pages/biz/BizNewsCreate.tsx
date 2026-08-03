import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, extractDetail } from '@/api/client';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import { createBizNews } from '@/api/biz';
import styles from './BizNewsCreate.module.css';

const MAX_IMAGES = 6;

interface NewsImageItem {
  file: File;
  preview: string;
  contentId: string | null;
  uploading: boolean;
}

interface LocationState {
  profileId?: string;
}

/** 소식 작성 — 홈 탭 인라인 폼에서 분리된 별도 화면 (FeedCreate.tsx UX 레퍼런스). */
export default function BizNewsCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUserStore((s) => s.user);
  const profileId = (location.state as LocationState | null)?.profileId ?? null;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<NewsImageItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 textarea 아래 여백이 키보드에 가려진다 —
  // 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다. (ai-docs/context/keyboard-ux.md 케이스 1)
  const isIosNative = native.platform === 'ios';

  // 진입 컨텍스트(profileId) 없이 URL 직접 접근된 경우 — 관리 화면으로 복귀
  useEffect(() => {
    if (!profileId) navigate('/biz/manage', { replace: true });
  }, [profileId, navigate]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';

    const slots = MAX_IMAGES - images.length;
    const toAdd = files.slice(0, slots);
    const newItems: NewsImageItem[] = toAdd.map((f) => ({
      file: f,
      preview: URL.createObjectURL(f),
      contentId: null,
      uploading: true,
    }));
    const startIdx = images.length;
    setImages((prev) => [...prev, ...newItems]);

    for (let i = 0; i < toAdd.length; i++) {
      try {
        const form = new FormData();
        form.append('file', toAdd[i]);
        form.append('owner_type', 'user');
        if (user) form.append('owner_id', user.id);
        const res = await api.realFetchForm<{ id: string }>('/contents/upload', form);
        setImages((prev) =>
          prev.map((img, idx) => (idx === startIdx + i ? { ...img, contentId: res.id, uploading: false } : img)),
        );
      } catch (err: any) {
        toast.error(err.message ?? t('biz.newsUploadError', { defaultValue: '사진 업로드 실패' }));
        setImages((prev) => prev.map((img, idx) => (idx === startIdx + i ? { ...img, uploading: false } : img)));
      }
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      const removed = prev[idx];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const canSubmit = !submitting && !!profileId && title.trim().length > 0 && images.every((i) => !i.uploading);

  const handleSubmit = async () => {
    if (!canSubmit || !profileId) return;
    setSubmitting(true);
    try {
      await createBizNews({
        profileId,
        title: title.trim(),
        body: body.trim() || null,
        photoContentIds: images.filter((i) => i.contentId).map((i) => i.contentId!),
      });
      navigate(-1);
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.newsCreateError', { defaultValue: '소식 등록에 실패했습니다' })));
    } finally {
      setSubmitting(false);
    }
  };

  if (!profileId) return null;

  return (
    <div className={styles.page}>
      <TopBar
        title={t('biz.newsCreateTitle', { defaultValue: '소식 작성' })}
        rightContent={
          <Button onClick={handleSubmit} disabled={!canSubmit} loading={submitting} style={{ minWidth: 64 }}>
            {submitting ? t('biz.newsSubmitting', { defaultValue: '등록 중' }) : t('biz.newsSubmit', { defaultValue: '등록' })}
          </Button>
        }
      />

      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
        <div className={styles.card}>
          <input
            className={styles.titleInput}
            placeholder={t('biz.newsTitlePlaceholder', { defaultValue: '소식 제목' })}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
          <textarea
            className={styles.textarea}
            placeholder={t('biz.newsBodyPlaceholder', { defaultValue: '소식 내용을 적어주세요 (선택)' })}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={8}
          />

          {images.length > 0 && (
            <div className={styles.previewGrid}>
              {images.map((img, idx) => (
                <div key={idx} className={styles.previewItem}>
                  <img src={img.preview} alt="" className={styles.previewThumb} />
                  {img.uploading && (
                    <div className={styles.uploadingOverlay}>
                      <span className={`shimmer ${styles.uploadingBar}`} />
                    </div>
                  )}
                  <button className={styles.removeImg} onClick={() => removeImage(idx)} aria-label={t('feedCreate.removeImage', { defaultValue: '사진 삭제' })}>
                    <X size={13} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.toolbar}>
          <label className={styles.toolBtn}>
            <Camera size={16} strokeWidth={2.2} />
            {t('biz.newsAddPhoto', { defaultValue: '사진 추가' })} {images.length > 0 && `(${images.length}/${MAX_IMAGES})`}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageSelect}
              disabled={images.length >= MAX_IMAGES}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
