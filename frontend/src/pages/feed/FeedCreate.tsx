import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { createFeedPost } from '@/api/feed';
import { api } from '@/api/client';
import { native } from '@/lib/native';
import { useUserStore } from '@/store/useUserStore';
import { toast } from '@/components/ui/Toast';
import styles from './FeedCreate.module.css';

const MAX_IMAGES = 10;

interface ImageItem {
  file: File;
  preview: string;
  contentId: string | null;
  uploading: boolean;
}

export default function FeedCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);

  const [content, setContent] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [posting, setPosting] = useState(false);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';

    const slots = MAX_IMAGES - images.length;
    const toAdd = files.slice(0, slots);

    const newItems: ImageItem[] = toAdd.map((f) => ({
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
          prev.map((img, idx) => idx === startIdx + i ? { ...img, contentId: res.id, uploading: false } : img),
        );
      } catch (err: any) {
        toast.error(err.message ?? t('feedCreate.uploadError'));
        setImages((prev) =>
          prev.map((img, idx) => idx === startIdx + i ? { ...img, uploading: false } : img),
        );
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

  const handleLocation = async () => {
    if (location) {
      setLocation(null);
      return;
    }
    try {
      await native.ensureLocationPermission();
      const pos = await native.getLocation();
      setLocation({ lat: pos.lat, lng: pos.lng });
    } catch {
      toast.error(t('feedCreate.locationError'));
    }
  };

  const handlePost = async () => {
    const contentIds = images.filter((i) => i.contentId).map((i) => i.contentId!);
    if (!user || (!content.trim() && contentIds.length === 0)) return;
    setPosting(true);
    try {
      await createFeedPost({
        userId: user.id,
        content: content.trim() || undefined,
        imageContentIds: contentIds,
        latitude: location?.lat,
        longitude: location?.lng,
      });
      navigate('/feed', { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? t('feedCreate.postError'));
    } finally {
      setPosting(false);
    }
  };

  const allUploaded = images.every((i) => !i.uploading);
  const contentIds = images.filter((i) => i.contentId).map((i) => i.contentId!);
  const canPost = !posting && allUploaded && (content.trim() || contentIds.length > 0);

  return (
    <div className={styles.page}>
      <TopBar
        title={t('feedCreate.title')}
        rightContent={
          <Button
            onClick={handlePost}
            disabled={!canPost}
            style={{ minWidth: 64 }}
          >
            {posting ? t('feedCreate.posting') : t('feedCreate.postBtn')}
          </Button>
        }
      />

      <div className={styles.body}>
        <div className={styles.card}>
          <textarea
            className={styles.textarea}
            placeholder={t('feedCreate.textPlaceholder')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            maxLength={2000}
          />

          {images.length > 0 && (
            <div className={styles.previewGrid}>
              {images.map((img, idx) => (
                <div key={idx} className={styles.previewItem}>
                  <img src={img.preview} alt="" className={styles.previewThumb} />
                  {img.uploading && <div className={styles.uploadingOverlay}>⏳</div>}
                  <button className={styles.removeImg} onClick={() => removeImage(idx)} aria-label={t('feedCreate.removeImage')}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.toolbar}>
          <label className={styles.toolBtn}>
            📷 {t('feedCreate.addPhoto')} {images.length > 0 && `(${images.length}/${MAX_IMAGES})`}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageSelect}
              disabled={images.length >= MAX_IMAGES}
            />
          </label>

          <button
            className={`${styles.toolBtn} ${location ? styles.toolBtnActive : ''}`}
            onClick={handleLocation}
          >
            📍 {location ? t('feedCreate.locationAttached') : t('feedCreate.addLocation')}
          </button>
        </div>
      </div>
    </div>
  );
}
