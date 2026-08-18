import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronRight, Lightbulb, MapPin, RotateCw, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';
import { Toggle } from '@/components/ui/Toggle';
import { toast } from '@/components/ui/Toast';
import { api, extractDetail } from '@/api/client';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import { fetchDistricts, type District } from '@/api/master';
import { createListing, fetchCategories, localizedName, type MarketCategory, type PaperStatus } from '@/api/market';
import CategoryPickerSheet from './CategoryPickerSheet';
import LocationPickerSheet from './LocationPickerSheet';
import styles from './MarketCreate.module.css';

const MAX_IMAGES = 10;
const DRAFT_VERSION = 1;
const DRAFT_KEY_PREFIX = 'market-listing-draft';
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface ImageItem {
  localId: string;
  file: File | null;
  preview: string;
  serverPreview: string | null;
  contentId: string | null;
  uploading: boolean;
  failed: boolean;
}

interface MarketDraft {
  version: typeof DRAFT_VERSION;
  title: string;
  categoryId: number | null;
  price: string;
  negotiable: boolean;
  description: string;
  districtId: number | null;
  tradeCoords: { lat: number; lng: number } | null;
  images: { contentId: string; preview: string }[];
  savedAt: string;
}

function readDraft(key: string): MarketDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as MarketDraft | null;
    if (
      !value
      || value.version !== DRAFT_VERSION
      || typeof value.title !== 'string'
      || !Array.isArray(value.images)
      || typeof value.savedAt !== 'string'
      || !Number.isFinite(Date.parse(value.savedAt))
      || Date.now() - Date.parse(value.savedAt) > DRAFT_MAX_AGE_MS
    ) {
      removeDraft(key);
      return null;
    }
    return value;
  } catch {
    removeDraft(key);
    return null;
  }
}

function writeDraft(key: string, draft: MarketDraft): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // 저장공간 제한·비공개 모드에서는 작성 흐름 자체를 막지 않는다.
  }
}

function removeDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 저장소 접근 실패가 이미 생성된 매물을 실패로 보이게 해서는 안 된다.
  }
}

// T-1: BizManage(업체 프로필) → "매물 등록" 진입 시 넘어오는 업체 컨텍스트. BizAdsNew.tsx 패턴 미러.
interface LocationState {
  profileId?: string;
  profileName?: string;
}

export default function MarketCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const businessProfileId = (location.state as LocationState | null)?.profileId ?? null;
  const businessName = (location.state as LocationState | null)?.profileName ?? null;
  const user = useUserStore((s) => s.user);
  const draftKey = user ? `${DRAFT_KEY_PREFIX}:${user.id}:${businessProfileId ?? 'personal'}` : null;
  const initialDraft = useMemo(() => (draftKey ? readDraft(draftKey) : null), [draftKey]);
  const initialDistrictId = initialDraft?.districtId ?? null;

  const [images, setImages] = useState<ImageItem[]>(() => initialDraft?.images.map((image) => ({
    localId: crypto.randomUUID(),
    file: null,
    preview: image.preview,
    serverPreview: image.preview,
    contentId: image.contentId,
    uploading: false,
    failed: false,
  })) ?? []);
  const [title, setTitle] = useState(initialDraft?.title ?? '');
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(initialDraft?.categoryId ?? null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);
  const [price, setPrice] = useState(initialDraft?.price ?? ''); // digits only
  const [negotiable, setNegotiable] = useState(initialDraft?.negotiable ?? false);
  const [description, setDescription] = useState(initialDraft?.description ?? '');
  // 016 §4-6 #41: 선택 표시(D-28=(a)) — 미기재 허용, 초안 저장/복원 대상 아님(경량 필드).
  const [paperStatus, setPaperStatus] = useState<PaperStatus | ''>('');
  const [plateProvince, setPlateProvince] = useState('');
  const [districts, setDistricts] = useState<District[]>([]);
  const [district, setDistrict] = useState<District | null>(null);
  const [tradeCoords, setTradeCoords] = useState<{ lat: number; lng: number } | null>(initialDraft?.tradeCoords ?? null);
  const [locOpen, setLocOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 설명 textarea 아래 여백이 거의 없어
  // 스크롤해도 키보드에 가려진다 — 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다.
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchDistricts()
      .then((items) => {
        if (cancelled) return;
        setDistricts(items);
        if (initialDistrictId != null) {
          setDistrict(items.find((item) => item.id === initialDistrictId) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setDistricts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [initialDistrictId]);

  // 단일 파일 업로드 — 최초 선택과 재시도가 공유한다(재시도 버튼 추가를 위한 최소 추출).
  const uploadImage = async (localId: string, file: File) => {
    setImages((prev) => prev.map((img) => (img.localId === localId ? { ...img, uploading: true, failed: false } : img)));
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      if (user) form.append('owner_id', user.id);
      const res = await api.realFetchForm<{ id: string; imgproxy_url: string }>('/contents/upload', form);
      setImages((prev) => prev.map((img) => (
        img.localId === localId
          ? { ...img, contentId: res.id, serverPreview: res.imgproxy_url, uploading: false, failed: false }
          : img
      )));
    } catch (err: any) {
      toast.error(err.message ?? t('market.uploadError', { defaultValue: '이미지 업로드 실패' }));
      setImages((prev) => prev.map((img) => (img.localId === localId ? { ...img, uploading: false, failed: true } : img)));
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';

    const toAdd = files.slice(0, MAX_IMAGES - images.length);
    const newItems: ImageItem[] = toAdd.map((f) => ({
      localId: crypto.randomUUID(),
      file: f,
      preview: URL.createObjectURL(f),
      serverPreview: null,
      contentId: null,
      uploading: true,
      failed: false,
    }));
    setImages((prev) => [...prev, ...newItems]);

    for (let i = 0; i < toAdd.length; i++) {
      await uploadImage(newItems[i].localId, toAdd[i]);
    }
  };

  const retryImage = (idx: number) => {
    const img = images[idx];
    if (!img?.file || img.uploading) return;
    void uploadImage(img.localId, img.file);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      const removed = prev[idx];
      if (removed?.file && removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const contentIds = images.filter((i) => i.contentId).map((i) => i.contentId!);
  const allUploaded = images.every((i) => !i.uploading);
  // 실패한 사진이 남아 있으면 제출을 막는다 — 종전엔 contentIds 필터로 조용히 빠져
  // "다 올린 줄 알았는데 사진이 빠졌다"는 상황이 됐다(S-6). 삭제하거나 재시도해야 진행 가능.
  const hasFailedImage = images.some((i) => i.failed);
  const postBlockReason = images.length === 0
    ? t('market.postNeedsPhoto', { defaultValue: '사진을 한 장 이상 추가해주세요' })
    : !allUploaded
      ? t('market.postWaitUploads', { defaultValue: '사진 업로드가 끝날 때까지 기다려주세요' })
      : hasFailedImage
        ? t('market.uploadFailedHint', { defaultValue: '업로드 실패한 사진이 있어요. 재시도하거나 삭제해주세요' })
        : contentIds.length === 0
          ? t('market.postNeedsPhoto', { defaultValue: '사진을 한 장 이상 추가해주세요' })
          : title.trim().length === 0
            ? t('market.postNeedsTitle', { defaultValue: '제목을 입력해주세요' })
            : district === null
              ? t('market.postNeedsLocation', { defaultValue: '거래 희망 장소를 선택해주세요' })
              : null;
  const canPost = !posting && !!user && postBlockReason === null;
  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const draft = useMemo<MarketDraft>(() => ({
    version: DRAFT_VERSION,
    title,
    categoryId,
    price,
    negotiable,
    description,
    districtId: district?.id ?? initialDistrictId,
    tradeCoords,
    images: images.flatMap((image) => (
      image.contentId && image.serverPreview
        ? [{ contentId: image.contentId, preview: image.serverPreview }]
        : []
    )),
    savedAt: new Date().toISOString(),
  }), [categoryId, description, district?.id, images, initialDistrictId, negotiable, price, title, tradeCoords]);

  useEffect(() => {
    if (!draftKey) return;
    writeDraft(draftKey, draft);
  }, [draft, draftKey]);

  const handleSubmit = async () => {
    if (!canPost || !user) return;
    if (!businessProfileId && !user.phoneVerified) {
      if (draftKey) writeDraft(draftKey, draft);
      navigate('/auth/phone-verify', { state: { from: { pathname: '/market/new' } } });
      return;
    }
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
        businessProfileId,
        paperStatus: paperStatus || null,
        plateProvince: plateProvince.trim() || null,
      });
      if (draftKey) removeDraft(draftKey);
      navigate(`/market/${id}`, { replace: true });
    } catch (err: any) {
      // 안전망: 라우트 가드를 우회해 도달한 경우(캐시된 store 등) 백엔드가 403으로 막으면 인증 화면으로 보낸다.
      // 업체 명의 등록(businessProfileId 有)은 이 폰인증 안내 화면과 무관 — 리다이렉트하지 않는다.
      if (!businessProfileId && /^HTTP 403 \|/.test(err?.message ?? '')) {
        navigate('/auth/phone-verify', { state: { from: { pathname: '/market/new' } } });
        return;
      }
      toast.error(extractDetail(err, t('market.createError', { defaultValue: '등록 실패' })));
    } finally {
      setPosting(false);
    }
  };


  return (
    <div className={styles.page}>
      <TopBar
        title={
          businessName
            ? t('market.createBusiness', { name: businessName, defaultValue: '매물 등록 · {{name}}' })
            : t('market.create', { defaultValue: '매물 등록' })
        }
        rightContent={
          <Button onClick={handleSubmit} disabled={!canPost} loading={posting} style={{ minWidth: 64 }}>
            {posting ? t('market.posting', { defaultValue: '등록 중' }) : t('market.submit', { defaultValue: '완료' })}
          </Button>
        }
      />

      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
        {postBlockReason && <p className={styles.submitHint} aria-live="polite">{postBlockReason}</p>}
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
            <div key={img.localId} className={styles.previewItem}>
              {img.file
                ? <img src={img.preview} alt="" className={styles.previewThumb} />
                : <AppImage src={img.preview} alt="" className={styles.previewThumb} />}
              {img.uploading && (
                <div className={styles.uploadingOverlay}>
                  <span className={`shimmer ${styles.uploadingBar}`} />
                </div>
              )}
              {img.failed && (
                <div className={styles.uploadFailedOverlay}>
                  <button
                    type="button"
                    className={styles.retryImgBtn}
                    onClick={() => retryImage(idx)}
                    aria-label={t('market.retryUpload', { defaultValue: '재시도' })}
                  >
                    <RotateCw size={14} strokeWidth={2.4} />
                  </button>
                </div>
              )}
              <button className={styles.removeImg} onClick={() => removeImage(idx)} aria-label={t('market.removeImage', { defaultValue: '삭제' })}>
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
        {hasFailedImage && (
          <p className={styles.uploadFailedHint}>
            {t('market.uploadFailedHint', { defaultValue: '업로드 실패한 사진이 있어요. 재시도하거나 삭제해주세요' })}
          </p>
        )}

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
          <Lightbulb size={13} strokeWidth={2.2} />
          {t('market.categoryHint', { defaultValue: '카테고리를 지정하면 더 빨리 팔려요' })}
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
        {price === '' && <p className={styles.freeHint}>{t('market.freeHint', { defaultValue: '비워두면 나눔으로 등록됩니다' })}</p>}

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

        {/* 016 §4-6 #41: 서류·명의 상태 — 선택 표시(오토바이 매물 해당 시). 미기재 허용. */}
        <p className={styles.label}>{t('market.paperStatusLabel', { defaultValue: '등록증 명의 상태 (오토바이 매물)' })}</p>
        <select
          className={styles.catSelect}
          value={paperStatus}
          onChange={(e) => setPaperStatus(e.target.value as PaperStatus | '')}
        >
          <option value="">{t('market.paperStatusUnset', { defaultValue: '선택 안 함' })}</option>
          <option value="MATCH">{t('market.paperStatusMatch', { defaultValue: '등록증 보유 (명의 일치)' })}</option>
          <option value="MISMATCH">{t('market.paperStatusMismatch', { defaultValue: '등록증 보유 (명의 불일치)' })}</option>
          <option value="NONE">{t('market.paperStatusNone', { defaultValue: '등록증 미보유' })}</option>
        </select>
        <input
          className={styles.titleInput}
          placeholder={t('market.plateProvincePlaceholder', { defaultValue: '번호판 등록 지역 (선택)' })}
          value={plateProvince}
          onChange={(e) => setPlateProvince(e.target.value)}
          maxLength={80}
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
