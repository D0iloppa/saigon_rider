import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { createFeedPost } from '@/api/feed';
import { api } from '@/api/client';
import { nativeInterface, NATIVE_KEYS } from '@/lib/native';
import { useUserStore } from '@/store/useUserStore';
import { toast } from '@/components/ui/Toast';
import styles from './FeedCreate.module.css';

export default function FeedCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);

  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageContentId, setImageContentId] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [posting, setPosting] = useState(false);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      if (user) form.append('owner_id', user.id);
      const res = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      setImageContentId(res.id);
    } catch (err: any) {
      toast.error(err.message ?? t('feedCreate.uploadError'));
    }
  };

  const handleLocation = async () => {
    if (location) {
      setLocation(null);
      return;
    }
    try {
      const result = await nativeInterface.request(NATIVE_KEYS.GET_LOCATION) as any;
      if (result?.lat != null && result?.lng != null) {
        setLocation({ lat: result.lat, lng: result.lng });
      }
    } catch {
      toast.error(t('feedCreate.locationError'));
    }
  };

  const handlePost = async () => {
    if (!user || (!content.trim() && !imageContentId)) return;
    setPosting(true);
    try {
      await createFeedPost({
        userId: user.id,
        content: content.trim() || undefined,
        imageContentId: imageContentId ?? undefined,
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

  const canPost = !posting && (content.trim() || imageContentId);

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
        <textarea
          className={styles.textarea}
          placeholder={t('feedCreate.textPlaceholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          maxLength={2000}
        />

        {imagePreview && (
          <div className={styles.previewWrap}>
            <img src={imagePreview} alt="" className={styles.preview} />
            <button
              className={styles.removeImg}
              onClick={() => {
                setImageFile(null);
                setImagePreview(null);
                setImageContentId(null);
              }}
            >
              ✕
            </button>
          </div>
        )}

        <div className={styles.toolbar}>
          <label className={styles.toolBtn}>
            📷 {t('feedCreate.addPhoto')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleImageSelect}
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
