import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, MapPin, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { createFeedPost } from '@/api/feed';
import { api } from '@/api/client';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import { resolveDistrict, localizedName } from '@/api/market';
import { fetchDistricts, type District } from '@/api/master';
import { toast } from '@/components/ui/Toast';
import MarkerLocationPicker from '@/components/maps/MarkerLocationPicker';
import type { PickedLocation } from '@/pages/market/LocationPickerSheet';
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
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [district, setDistrict] = useState<District | null>(null);
  const [locOn, setLocOn] = useState(false);
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 textarea 아래 여백이 키보드에 가려진다 —
  // 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다. (ai-docs/context/keyboard-ux.md 케이스 1)
  const isIosNative = native.platform === 'ios';

  const handleLocationConfirm = (loc: PickedLocation) => {
    setCoords({ lat: loc.lat, lng: loc.lng });
    fetchDistricts()
      .then((list) => setDistrict(resolveDistrict(loc.lat, loc.lng, list)))
      .catch(() => {});
    setLocOn(true);
  };

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

  const handlePost = async () => {
    const contentIds = images.filter((i) => i.contentId).map((i) => i.contentId!);
    if (!user || (!content.trim() && contentIds.length === 0)) return;
    setPosting(true);
    try {
      await createFeedPost({
        userId: user.id,
        content: content.trim() || undefined,
        imageContentIds: contentIds,
        latitude: locOn ? coords?.lat : undefined,
        longitude: locOn ? coords?.lng : undefined,
        districtId: locOn ? district?.id : undefined,
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

      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
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
                  {img.uploading && (
                    <div className={styles.uploadingOverlay}>
                      <span className={`shimmer ${styles.uploadingBar}`} />
                    </div>
                  )}
                  <button className={styles.removeImg} onClick={() => removeImage(idx)} aria-label={t('feedCreate.removeImage')}>
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
            {t('feedCreate.addPhoto')} {images.length > 0 && `(${images.length}/${MAX_IMAGES})`}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageSelect}
              disabled={images.length >= MAX_IMAGES}
            />
          </label>

          {locOn ? (
            <button
              className={`${styles.toolBtn} ${styles.toolBtnActive}`}
              onClick={() => setLocPickerOpen(true)}
            >
              <MapPin size={16} strokeWidth={2.2} />
              {district
                ? localizedName(district)
                : t('feedCreate.locating', { defaultValue: '위치 확인 중…' })}
              <span
                role="button"
                aria-label={t('feedCreate.locationOff', { defaultValue: '위치 끔' })}
                onClick={(e) => { e.stopPropagation(); setLocOn(false); }}
                className={styles.toolBtnX}
              ><X size={13} strokeWidth={2.5} /></span>
            </button>
          ) : (
            <button className={styles.toolBtn} onClick={() => setLocPickerOpen(true)}>
              <MapPin size={16} strokeWidth={2.2} />
              {t('feedCreate.locationOff', { defaultValue: '위치 끔' })}
            </button>
          )}
        </div>
      </div>

      <MarkerLocationPicker
        open={locPickerOpen}
        onClose={() => setLocPickerOpen(false)}
        value={coords}
        onConfirm={handleLocationConfirm}
        title={t('feedCreate.pickLocation', { defaultValue: '게시 위치' })}
        desc={t('feedCreate.pickLocationDesc', { defaultValue: '지도를 탭해 위치에 마커를 찍으세요' })}
      />
    </div>
  );
}
