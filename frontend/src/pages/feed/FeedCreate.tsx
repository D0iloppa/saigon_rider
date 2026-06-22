import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { createFeedPost } from '@/api/feed';
import { api } from '@/api/client';
import { native } from '@/lib/native';
import { useUserStore } from '@/store/useUserStore';
import { useLocationStore } from '@/store/useLocationStore';
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
  const [locOn, setLocOn] = useState(true); // 위치 자동 첨부(기본 ON), 끄기만 가능
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  const handleLocationConfirm = (loc: PickedLocation) => {
    setCoords({ lat: loc.lat, lng: loc.lng });
    fetchDistricts()
      .then((list) => setDistrict(resolveDistrict(loc.lat, loc.lng, list)))
      .catch(() => {});
    setLocOn(true);
  };

  // 작성 시 현재 위치 자동 첨부(피드는 '올린 곳' = 현위치). 거부/HCMC 밖이면 홈 선택 동네 → 기본도시 폴백.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchDistricts().catch(() => [] as District[]);
      if (cancelled) return;
      const fallback = list.find((d) => d.code === 'BEN_THANH') ?? list[0] ?? null;
      try {
        await native.ensureLocationPermission();
        const pos = await native.getLocation();
        if (cancelled) return;
        setCoords({ lat: pos.lat, lng: pos.lng });
        setDistrict(resolveDistrict(pos.lat, pos.lng, list) ?? fallback);
      } catch {
        if (cancelled) return;
        const home = useLocationStore.getState().coords;
        if (home) {
          setCoords(home);
          setDistrict(resolveDistrict(home.lat, home.lng, list) ?? fallback);
        } else if (fallback && fallback.center_lat != null && fallback.center_lng != null) {
          setCoords({ lat: fallback.center_lat, lng: fallback.center_lng });
          setDistrict(fallback);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

          {locOn ? (
            <button
              className={`${styles.toolBtn} ${styles.toolBtnActive}`}
              onClick={() => setLocPickerOpen(true)}
            >
              📍 {district
                ? localizedName(district)
                : t('feedCreate.locating', { defaultValue: '위치 확인 중…' })}
              <span
                role="button"
                aria-label={t('feedCreate.locationOff', { defaultValue: '위치 끔' })}
                onClick={(e) => { e.stopPropagation(); setLocOn(false); }}
                style={{ marginLeft: 6, opacity: 0.7 }}
              >✕</span>
            </button>
          ) : (
            <button className={styles.toolBtn} onClick={() => setLocOn(true)}>
              📍 {t('feedCreate.locationOff', { defaultValue: '위치 끔' })}
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
