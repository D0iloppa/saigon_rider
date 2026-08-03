import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronRight, MapPin } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, extractDetail } from '@/api/client';
import { AppImage } from '@/components/ui/AppImage';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import {
  applyBusinessProfile,
  updateBusinessProfile,
  fetchBizCategories,
  bizCategoryLabel,
  type BusinessProfile,
  type BizCategory,
} from '@/api/biz';
import BizLocationPicker from '@/pages/biz/BizLocationPicker';
import styles from './BizApply.module.css';

interface LocationState {
  reapplyProfile?: BusinessProfile;
}

export default function BizApply() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUserStore((s) => s.user);
  const reapplyProfile = (location.state as LocationState | null)?.reapplyProfile;

  const [categories, setCategories] = useState<BizCategory[]>([]);
  useEffect(() => {
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const [name, setName] = useState(reapplyProfile?.name ?? '');
  const [category, setCategory] = useState(reapplyProfile?.category ?? '');
  const [phone, setPhone] = useState(reapplyProfile?.phone ?? '');
  const [intro, setIntro] = useState(reapplyProfile?.intro ?? '');
  const [address, setAddress] = useState(reapplyProfile?.address ?? '');
  // 상세 주소 (선택) — 제출 시 지역명 뒤에 이어붙인다. 재신청 프리필 address 는 이미 합쳐진 문자열이라 그대로 둔다.
  const [addressDetail, setAddressDetail] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    reapplyProfile?.latitude != null && reapplyProfile?.longitude != null
      ? { lat: reapplyProfile.latitude, lng: reapplyProfile.longitude }
      : null,
  );
  const [locOpen, setLocOpen] = useState(false);
  // 재신청 시 기존 사진 유지 — 새 사진을 올리지 않으면 기존 content id 를 그대로 재전송한다
  const [photoContentId, setPhotoContentId] = useState<string | null>(reapplyProfile?.photoContentId ?? null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(reapplyProfile?.photoUrl ?? null);
  // 로컬 blob(<img>) vs 저장된 원격 URL(<AppImage>) 렌더 분기 — FeedEdit 패턴
  const [photoIsLocal, setPhotoIsLocal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 설명 textarea 아래 여백이 거의 없어
  // 스크롤해도 키보드에 가려진다 — 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다.
  const isIosNative = native.platform === 'ios';

  const canSubmit =
    !submitting && !uploadingPhoto && name.trim().length > 0 && category !== '' && phone.trim().length > 0 && !!coords && !!address;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoIsLocal(true);
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      if (user) form.append('owner_id', user.id);
      const res = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      setPhotoContentId(res.id);
    } catch (err: any) {
      toast.error(err.message ?? t('biz.uploadError', { defaultValue: '사진 업로드 실패' }));
      // 업로드 실패 → 재신청 프리필 사진(있으면)으로 원복 (photoContentId 는 성공 시에만 덮으므로 그대로)
      setPhotoPreview(reapplyProfile?.photoUrl ?? null);
      setPhotoIsLocal(false);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting || !canSubmit || !coords) return;
    setSubmitting(true);
    try {
      const input = {
        name: name.trim(),
        category,
        address: [address, addressDetail.trim()].filter(Boolean).join(', '),
        latitude: coords.lat,
        longitude: coords.lng,
        phone: phone.trim(),
        intro: intro.trim() || null,
        photoContentId,
      };
      if (reapplyProfile) {
        await updateBusinessProfile(reapplyProfile.id, input);
      } else {
        await applyBusinessProfile(input);
      }
      navigate('/biz/status', { replace: true });
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.applyError', { defaultValue: '신청에 실패했습니다' })));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.applyTitle', { defaultValue: '파트너 신청' })} />
      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
        {/* Photo */}
        <label className={styles.photoBox}>
          {photoPreview ? (
            photoIsLocal ? (
              <img src={photoPreview} alt="" className={styles.photoPreview} />
            ) : (
              <AppImage src={photoPreview} alt="" className={styles.photoPreview} />
            )
          ) : (
            <span className={styles.photoPlaceholder}>
              <Camera size={16} strokeWidth={2} aria-hidden />
              {t('biz.photoOptional', { defaultValue: '대표·간판 사진 (권장)' })}
            </span>
          )}
          {uploadingPhoto && (
            <div className={styles.photoOverlay}>{t('biz.uploading', { defaultValue: '업로드 중…' })}</div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handlePhotoSelect}
          />
        </label>

        {/* Name */}
        <p className={styles.label}>{t('biz.name', { defaultValue: '상호명' })}</p>
        <input
          className={styles.input}
          placeholder={t('biz.namePlaceholder', { defaultValue: '가게 이름을 입력하세요' })}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />

        {/* Category */}
        <p className={styles.label}>{t('biz.category', { defaultValue: '업종' })}</p>
        <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="" disabled>
            {t('biz.categoryPlaceholder', { defaultValue: '업종 선택' })}
          </option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {bizCategoryLabel(c, i18n.language)}
            </option>
          ))}
        </select>

        {/* Location */}
        <p className={styles.label}>{t('biz.location', { defaultValue: '위치' })}</p>
        <button type="button" className={styles.select} onClick={() => setLocOpen(true)}>
          <span className={coords ? styles.locValue : styles.placeholder}>
            <MapPin size={16} className={styles.locPin} />
            {coords ? address : t('biz.locationPlaceholder', { defaultValue: '위치를 선택하세요' })}
          </span>
          <ChevronRight size={18} className={styles.chev} />
        </button>

        {/* Address detail (optional) */}
        <p className={styles.label}>{t('biz.addressDetail', { defaultValue: '상세 주소 (선택)' })}</p>
        <input
          className={styles.input}
          placeholder={t('biz.addressDetailPlaceholder', { defaultValue: '도로명·번지 등 상세 주소를 입력하세요' })}
          value={addressDetail}
          onChange={(e) => setAddressDetail(e.target.value)}
          maxLength={160}
        />

        {/* Phone */}
        <p className={styles.label}>{t('biz.phone', { defaultValue: '연락처' })}</p>
        <input
          className={styles.input}
          placeholder={t('biz.phonePlaceholder', { defaultValue: '연락 가능한 번호를 입력하세요' })}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          maxLength={30}
        />

        {/* Intro (optional) */}
        <p className={styles.label}>{t('biz.introLabel', { defaultValue: '소개 (선택)' })}</p>
        <textarea
          className={styles.textarea}
          placeholder={t('biz.introPlaceholder', { defaultValue: '업체를 소개해주세요' })}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={4}
          maxLength={500}
        />
      </div>

      <div className={styles.footer}>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? t('biz.submitting', { defaultValue: '제출 중' }) : t('biz.submit', { defaultValue: '제출' })}
        </Button>
      </div>

      <BizLocationPicker
        open={locOpen}
        onClose={() => setLocOpen(false)}
        value={coords}
        onConfirm={({ districtName, lat, lng }) => {
          setAddress(districtName);
          setCoords({ lat, lng });
        }}
      />
    </div>
  );
}
