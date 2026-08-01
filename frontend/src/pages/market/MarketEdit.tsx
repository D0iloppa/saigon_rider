import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronRight, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, extractDetail } from '@/api/client';
import { AppImage } from '@/components/ui/AppImage';
import { useUserStore } from '@/store/useUserStore';
import { fetchListing, updateListing, fetchCategories, localizedName, type MarketCategory } from '@/api/market';
import CategoryPickerSheet from './CategoryPickerSheet';
import styles from './MarketCreate.module.css';

const MAX_IMAGES = 10;

interface ImageItem {
  preview: string;
  contentId: string | null;
  uploading: boolean;
  /** true면 preview가 로컬 blob URL(신규 추가, <img> 유지) — false면 서버(imgproxy) URL(<AppImage>로 렌더) */
  isLocal: boolean;
}

/** F-6/F-8: 매물 본문(제목/설명/카테고리/사진) 수정 — MarketCreate 와 동일한 업로드 패턴 재사용 */
export default function MarketEdit() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  // s.user?.id 만 선택 — 객체 전체를 구독하면(MarketDetail.tsx 의 myId 선례) 무관한 store
  // mutation(addExp 등)이 user 참조를 새로 만들 때마다 아래 fetchListing effect가 재실행돼
  // 수정 중인 title/description/images 를 서버 값으로 덮어쓴다.
  const userId = useUserStore((s) => s.user?.id);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchListing(id, userId)
      .then((detail) => {
        if (userId && detail.seller.id !== userId) {
          navigate(-1);
          return;
        }
        setTitle(detail.title);
        setDescription(detail.description ?? '');
        setCategoryId(detail.category?.id ?? null);
        setImages(
          detail.imageUrls.map((url, idx) => ({
            preview: url,
            contentId: detail.imageContentIds[idx] ?? null,
            uploading: false,
            isLocal: false,
          })),
        );
      })
      .catch(() => toast.error(t('market.loadError', { defaultValue: '매물을 불러오지 못했어요' })))
      .finally(() => setLoading(false));
  }, [id, userId, navigate, t]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';

    const toAdd = files.slice(0, MAX_IMAGES - images.length);
    const newItems: ImageItem[] = toAdd.map((f) => ({
      preview: URL.createObjectURL(f),
      contentId: null,
      uploading: true,
      isLocal: true,
    }));
    const startIdx = images.length;
    setImages((prev) => [...prev, ...newItems]);

    for (let i = 0; i < toAdd.length; i++) {
      try {
        const form = new FormData();
        form.append('file', toAdd[i]);
        form.append('owner_type', 'user');
        if (userId) form.append('owner_id', userId);
        const res = await api.realFetchForm<{ id: string }>('/contents/upload', form);
        setImages((prev) => prev.map((img, idx) => (idx === startIdx + i ? { ...img, contentId: res.id, uploading: false } : img)));
      } catch (err: any) {
        toast.error(err.message ?? t('market.uploadError', { defaultValue: '이미지 업로드 실패' }));
        setImages((prev) => prev.map((img, idx) => (idx === startIdx + i ? { ...img, uploading: false } : img)));
      }
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const contentIds = images.filter((i) => i.contentId).map((i) => i.contentId!);
  const allUploaded = images.every((i) => !i.uploading);
  const canSave = !saving && allUploaded && title.trim().length > 0 && contentIds.length > 0;
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;

  const handleSubmit = async () => {
    if (!canSave || !id || !userId) return;
    setSaving(true);
    try {
      await updateListing(id, {
        sellerId: userId,
        title: title.trim(),
        description: description.trim() || undefined,
        categoryId,
        imageContentIds: contentIds,
      });
      navigate(`/market/${id}`, { replace: true });
    } catch (err: any) {
      toast.error(extractDetail(err, t('market.updateError', { defaultValue: '수정 실패' })));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <TopBar title={t('market.editListing', { defaultValue: '매물 수정' })} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TopBar
        title={t('market.editListing', { defaultValue: '매물 수정' })}
        rightContent={
          <Button onClick={handleSubmit} disabled={!canSave} style={{ minWidth: 64 }}>
            {saving ? t('market.saving', { defaultValue: '저장 중' }) : t('common.save', { defaultValue: '저장' })}
          </Button>
        }
      />

      <div className={styles.body}>
        {/* Photos */}
        <div className={styles.photoRow}>
          <label className={styles.addPhoto}>
            <Camera size={22} strokeWidth={2} />
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
              {img.isLocal ? (
                <img src={img.preview} alt="" className={styles.previewThumb} />
              ) : (
                <AppImage src={img.preview} alt="" className={styles.previewThumb} />
              )}
              {img.uploading && (
                <div className={styles.uploadingOverlay}>
                  <span className={`shimmer ${styles.uploadingBar}`} />
                </div>
              )}
              <button className={styles.removeImg} onClick={() => removeImage(idx)} aria-label={t('market.removeImage', { defaultValue: '삭제' })}>
                <X size={13} strokeWidth={2.5} />
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

        {/* Category */}
        <p className={styles.label}>{t('market.category', { defaultValue: '카테고리' })}</p>
        <button className={styles.catSelect} onClick={() => setCatSheetOpen(true)}>
          <span className={selectedCategory ? styles.catSelectValue : styles.catSelectPlaceholder}>
            {selectedCategory
              ? `${selectedCategory.icon ? `${selectedCategory.icon} ` : ''}${localizedName(selectedCategory)}`
              : t('market.categoryPlaceholder', { defaultValue: '카테고리 선택 (선택)' })}
          </span>
          <ChevronRight size={18} className={styles.catSelectChev} />
        </button>

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
      </div>

      <CategoryPickerSheet
        open={catSheetOpen}
        onClose={() => setCatSheetOpen(false)}
        categories={categories}
        selectedId={categoryId}
        onSelect={(c) => setCategoryId(c?.id ?? null)}
      />
    </div>
  );
}
