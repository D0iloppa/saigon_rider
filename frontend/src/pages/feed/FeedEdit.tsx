import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { fetchFeedPost, updateFeedPost } from '@/api/feed';
import { api } from '@/api/client';
import { useUserStore } from '@/store/useUserStore';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import styles from './FeedCreate.module.css';

const MAX_IMAGES = 10;

interface ExistingImage {
  type: 'existing';
  url: string;
  contentId: string;
}

interface NewImage {
  type: 'new';
  file: File;
  preview: string;
  contentId: string | null;
  uploading: boolean;
}

type ImageSlot = ExistingImage | NewImage;

export default function FeedEdit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { postId } = useParams<{ postId: string }>();
  const user = useUserStore((s) => s.user);

  const [content, setContent] = useState('');
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!postId) return;
    fetchFeedPost(postId).then((post) => {
      const fullText = [
        post.caption ?? '',
        ...post.hashtags.map((t) => `#${t}`),
      ].filter(Boolean).join(' ');
      setContent(fullText);

      if (post.photoUrls.length > 0) {
        setImageSlots(post.photoUrls.map((url, i) => ({
          type: 'existing' as const,
          url,
          contentId: post.imageContentIds[i] ?? '',
        })));
      }
      setLoaded(true);
    });
  }, [postId]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';

    const slots = MAX_IMAGES - imageSlots.length;
    const toAdd = files.slice(0, slots);

    const newItems: NewImage[] = toAdd.map((f) => ({
      type: 'new',
      file: f,
      preview: URL.createObjectURL(f),
      contentId: null,
      uploading: true,
    }));
    const startIdx = imageSlots.length;
    setImageSlots((prev) => [...prev, ...newItems]);

    for (let i = 0; i < toAdd.length; i++) {
      try {
        const form = new FormData();
        form.append('file', toAdd[i]);
        form.append('owner_type', 'user');
        if (user) form.append('owner_id', user.id);
        const res = await api.realFetchForm<{ id: string }>('/contents/upload', form);
        setImageSlots((prev) =>
          prev.map((slot, idx) => {
            if (idx !== startIdx + i || slot.type !== 'new') return slot;
            return { ...slot, contentId: res.id, uploading: false };
          }),
        );
      } catch (err: any) {
        toast.error(err.message ?? t('feedCreate.uploadError'));
        setImageSlots((prev) =>
          prev.map((slot, idx) => {
            if (idx !== startIdx + i || slot.type !== 'new') return slot;
            return { ...slot, uploading: false };
          }),
        );
      }
    }
  };

  const removeSlot = (idx: number) => {
    setImageSlots((prev) => {
      const removed = prev[idx];
      if (removed?.type === 'new' && removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSave = async () => {
    if (!user || !postId) return;
    setSaving(true);
    try {
      const contentIds = imageSlots
        .map((s) => s.contentId)
        .filter((id): id is string => !!id);

      await updateFeedPost(postId, {
        userId: user.id,
        content: content.trim() || undefined,
        imageContentIds: contentIds,
      });
      toast.success(t('feedEdit.saveSuccess'));
      navigate('/profile', { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? t('feedEdit.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const allUploaded = imageSlots.every((s) => s.type === 'existing' || !s.uploading);
  const canSave = !saving && loaded && allUploaded;

  return (
    <div className={styles.page}>
      <TopBar
        title={t('feedEdit.title')}
        rightContent={
          <Button
            onClick={handleSave}
            disabled={!canSave}
            style={{ minWidth: 64 }}
          >
            {saving ? t('feedEdit.saving') : t('feedEdit.saveBtn')}
          </Button>
        }
      />

      <div className={styles.body}>
        <textarea
          className={styles.textarea}
          placeholder={t('feedCreate.textPlaceholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          maxLength={2000}
        />

        {imageSlots.length > 0 && (
          <div className={styles.previewGrid}>
            {imageSlots.map((slot, idx) => (
              <div key={idx} className={styles.previewItem}>
                {slot.type === 'existing' ? (
                  <AppImage src={slot.url} alt="" className={styles.previewThumb} />
                ) : (
                  <>
                    <img src={slot.preview} alt="" className={styles.previewThumb} />
                    {slot.uploading && <div className={styles.uploadingOverlay}>⏳</div>}
                  </>
                )}
                <button className={styles.removeImg} onClick={() => removeSlot(idx)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.toolbar}>
          <label className={styles.toolBtn}>
            📷 {t('feedCreate.addPhoto')} {imageSlots.length > 0 && `(${imageSlots.length}/${MAX_IMAGES})`}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageSelect}
              disabled={imageSlots.length >= MAX_IMAGES}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
