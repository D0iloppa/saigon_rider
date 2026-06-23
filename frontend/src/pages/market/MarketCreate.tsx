import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MapPin } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { toast } from '@/components/ui/Toast';
import { api } from '@/api/client';
import { native } from '@/lib/native';
import { useUserStore } from '@/store/useUserStore';
import { fetchDistricts, type District } from '@/api/master';
import { createListing, fetchCategories, localizedName, resolveDistrict, type MarketCategory } from '@/api/market';
import CategoryPickerSheet from './CategoryPickerSheet';
import LocationPickerSheet from './LocationPickerSheet';
import styles from './MarketCreate.module.css';

const MAX_IMAGES = 10;

interface ImageItem {
  file: File;
  preview: string;
  contentId: string | null;
  uploading: boolean;
}

export default function MarketCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [price, setPrice] = useState(''); // digits only
  const [negotiable, setNegotiable] = useState(false);
  const [description, setDescription] = useState('');
  const [districts, setDistricts] = useState<District[]>([]);
  const [district, setDistrict] = useState<District | null>(null);
  const [tradeCoords, setTradeCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // 거래 희망 장소 default = 내 위치의 구 (HCMC 밖이면 Bình Thạnh 폴백). 이후 picker 로 변경 가능.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchDistricts().catch(() => [] as District[]);
      if (cancelled) return;
      setDistricts(list);
      const fallback = list.find((d) => d.code === 'BINH_THANH') ?? list[0] ?? null;
      try {
        await native.ensureLocationPermission();
        const pos = await native.getLocation();
        if (cancelled) return;
        setDistrict(resolveDistrict(pos.lat, pos.lng, list) ?? fallback);
      } catch {
        if (!cancelled) setDistrict(fallback);
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

    const toAdd = files.slice(0, MAX_IMAGES - images.length);
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
        setImages((prev) => prev.map((img, idx) => (idx === startIdx + i ? { ...img, contentId: res.id, uploading: false } : img)));
      } catch (err: any) {
        toast.error(err.message ?? t('market.uploadError', { defaultValue: '이미지 업로드 실패' }));
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

  const contentIds = images.filter((i) => i.contentId).map((i) => i.contentId!);
  const allUploaded = images.every((i) => !i.uploading);
  const canPost =
    !posting && allUploaded && !!user && title.trim().length > 0 && contentIds.length > 0 && district !== null;
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;

  const handleSubmit = async () => {
    if (!canPost || !user) return;
    setPosting(true);
    try {
      const { id } = await createListing({
        sellerId: user.id,
        categoryId,
        title: title.trim(),
        description: description.trim() || undefined,
        priceVnd: price ? parseInt(price, 10) : 0,
        isNegotiable: negotiable,
        districtId: district?.id ?? null,
        latitude: tradeCoords?.lat ?? district?.center_lat ?? null,
        longitude: tradeCoords?.lng ?? district?.center_lng ?? null,
        imageContentIds: contentIds,
      });
      navigate(`/market/${id}`, { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? t('market.createError', { defaultValue: '등록 실패' }));
    } finally {
      setPosting(false);
    }
  };

  const priceLabel = price ? `₫${parseInt(price, 10).toLocaleString('vi-VN')}` : '';

  return (
    <div className={styles.page}>
      <TopBar
        title={t('market.create', { defaultValue: '매물 등록' })}
        rightContent={
          <Button onClick={handleSubmit} disabled={!canPost} style={{ minWidth: 64 }}>
            {posting ? t('market.posting', { defaultValue: '등록 중' }) : t('market.submit', { defaultValue: '완료' })}
          </Button>
        }
      />

      <div className={styles.body}>
        {/* Photos */}
        <div className={styles.photoRow}>
          <label className={styles.addPhoto}>
            📷
            <span className={styles.addPhotoCount}>
              {images.length}/{MAX_IMAGES}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageSelect}
              disabled={images.length >= MAX_IMAGES}
            />
          </label>
          {images.map((img, idx) => (
            <div key={idx} className={styles.previewItem}>
              <img src={img.preview} alt="" className={styles.previewThumb} />
              {img.uploading && <div className={styles.uploadingOverlay}>⏳</div>}
              <button className={styles.removeImg} onClick={() => removeImage(idx)} aria-label={t('market.removeImage', { defaultValue: '삭제' })}>
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Title */}
        <input
          className={styles.titleInput}
          placeholder={t('market.titlePlaceholder', { defaultValue: '제목' })}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />

        {/* Category (선택 — 지정 시 노출↑) */}
        <p className={styles.label}>{t('market.category', { defaultValue: '카테고리' })}</p>
        <button className={styles.catSelect} onClick={() => setCatSheetOpen(true)}>
          <span className={selectedCategory ? styles.catSelectValue : styles.catSelectPlaceholder}>
            {selectedCategory
              ? `${selectedCategory.icon ? `${selectedCategory.icon} ` : ''}${localizedName(selectedCategory)}`
              : t('market.categoryPlaceholder', { defaultValue: '카테고리 선택 (선택)' })}
          </span>
          <ChevronRight size={18} className={styles.catSelectChev} />
        </button>
        <p className={styles.catHint}>
          💡 {t('market.categoryHint', { defaultValue: '카테고리를 지정하면 더 빨리 팔려요' })}
        </p>

        {/* Price */}
        <p className={styles.label}>{t('market.price', { defaultValue: '가격' })}</p>
        <div className={styles.priceField}>
          <span className={styles.pricePrefix}>₫</span>
          <input
            className={styles.priceInput}
            inputMode="numeric"
            placeholder="0"
            value={price ? parseInt(price, 10).toLocaleString('vi-VN') : ''}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className={styles.negotiableRow}>
          <span>{t('market.negotiableToggle', { defaultValue: '가격 제안 받기' })}</span>
          <Toggle checked={negotiable} onChange={setNegotiable} />
        </div>
        {priceLabel === '' && <p className={styles.freeHint}>{t('market.freeHint', { defaultValue: '비워두면 나눔으로 등록됩니다' })}</p>}

        {/* Description */}
        <p className={styles.label}>{t('market.descLabel', { defaultValue: '설명' })}</p>
        <textarea
          className={styles.textarea}
          placeholder={t('market.descPlaceholder', { defaultValue: '상품 상태, 거래 방법 등을 적어주세요' })}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={2000}
        />

        {/* 거래 희망 장소 (지도 picker, default=내 위치 구) */}
        <p className={styles.label}>{t('market.tradeLocation', { defaultValue: '거래 희망 장소' })}</p>
        <button className={styles.catSelect} onClick={() => setLocOpen(true)}>
          <span className={district ? styles.locValue : styles.catSelectPlaceholder}>
            <MapPin size={16} className={styles.locPin} />
            {district ? localizedName(district) : t('market.locating', { defaultValue: '위치 확인 중…' })}
          </span>
          <ChevronRight size={18} className={styles.catSelectChev} />
        </button>
      </div>

      <CategoryPickerSheet
        open={catSheetOpen}
        onClose={() => setCatSheetOpen(false)}
        categories={categories}
        selectedId={categoryId}
        onSelect={(c) => setCategoryId(c?.id ?? null)}
      />

      <LocationPickerSheet
        open={locOpen}
        onClose={() => setLocOpen(false)}
        value={district?.center_lat != null && district?.center_lng != null ? { lat: district.center_lat, lng: district.center_lng } : null}
        onConfirm={({ districtCode, lat, lng }) => {
          setDistrict(districts.find((d) => d.code === districtCode) ?? district);
          setTradeCoords({ lat, lng });
        }}
      />
    </div>
  );
}
