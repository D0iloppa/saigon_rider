import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { useKeyboard } from '@/hooks/useKeyboard';
import { native } from '@/lib/native';
import { extractDetail } from '@/api/client';
import { fetchBizCategories, bizCategoryLabel, createPlaceSuggestion, type BizCategory } from '@/api/biz';
import styles from './PlaceSuggestSheet.module.css';

interface Props {
  /** 제출 좌표 — 호스트 소유(위치 수정 확정 시 갱신되어 내려온다). null 이면 제출 비활성 */
  coords: { lat: number; lng: number } | null;
  /** 위치 필드 표시용 동네명 — 커버리지 밖이면 null(좌표만 표시) */
  wardName: string | null;
  /** true 면 마운트를 유지한 채 숨긴다(폼 상태 보존) — 호스트의 위치 선택 모드 동안 사용 */
  hidden?: boolean;
  /** 위치 [수정] — 호스트가 핀 재배치 모드(동네지도) 또는 위치 픽커(프로필)를 연다 */
  onPickLocation: () => void;
  onClose: () => void;
  /** 제출 성공 직후 — 호스트 목록 갱신 등 */
  onSubmitted?: () => void;
}

/**
 * 장소 제안 시트 — 동네지도(+ 메뉴)·동네 프로필 공용. 폼 상태·카테고리 fetch·제출을 내장하고,
 * 위치는 호스트가 coords/wardName 으로 소유하며 [수정] 동작만 위임받는다.
 * 키보드 보정: ai-docs/context/keyboard-ux.md 케이스 2 (오버레이 바텀시트형).
 */
export default function PlaceSuggestSheet({ coords, wardName, hidden, onPickLocation, onClose, onSubmitted }: Props) {
  const { t, i18n } = useTranslation();
  const [categories, setCategories] = useState<BizCategory[]>([]);
  const [placeName, setPlaceName] = useState('');
  const [placeCategory, setPlaceCategory] = useState('');
  const [placeAddress, setPlaceAddress] = useState('');
  const [placeNote, setPlaceNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  async function handleSubmit() {
    if (!placeName.trim() || !coords || submitting) return;
    setSubmitting(true);
    try {
      await createPlaceSuggestion({
        name: placeName.trim(),
        category: placeCategory || null,
        address: placeAddress.trim() || null,
        lat: coords.lat,
        lng: coords.lng,
        note: placeNote.trim() || null,
      });
      toast.success(t('map.neighborhoodProfile.placeForm.success'));
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast.error(extractDetail(err, t('map.neighborhoodProfile.placeForm.error')));
    } finally {
      setSubmitting(false);
    }
  }

  const coordsText = coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : null;

  return (
    <div
      className={styles.sheetBackdrop}
      style={hidden ? { display: 'none' } : undefined}
      onClick={() => !submitting && onClose()}
    >
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        style={
          isIosNative && kb.visible
            ? {
                maxHeight: 'calc(100% - var(--status-bar-height, 0px) - 12px)',
                paddingBottom: `calc(${kb.height}px + 20px)`,
              }
            : undefined
        }
      >
        <div className={styles.sheetTitle}>{t('map.neighborhoodProfile.placeForm.title')}</div>
        <label className={styles.sheetLabel}>{t('map.neighborhoodProfile.placeForm.nameLabel')}</label>
        <input
          className={styles.field}
          placeholder={t('map.neighborhoodProfile.placeForm.namePlaceholder')}
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value)}
        />
        <label className={styles.sheetLabel}>{t('map.neighborhoodProfile.placeForm.categoryLabel')}</label>
        <select className={styles.field} value={placeCategory} onChange={(e) => setPlaceCategory(e.target.value)}>
          <option value="">{t('map.neighborhoodProfile.placeForm.categoryPlaceholder')}</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>{bizCategoryLabel(c, i18n.language)}</option>
          ))}
        </select>
        <label className={styles.sheetLabel}>{t('map.neighborhoodProfile.placeForm.addressLabel')}</label>
        <input
          className={styles.field}
          placeholder={t('map.neighborhoodProfile.placeForm.addressPlaceholder')}
          value={placeAddress}
          onChange={(e) => setPlaceAddress(e.target.value)}
        />
        <label className={styles.sheetLabel}>{t('map.neighborhoodProfile.placeForm.locationLabel')}</label>
        <div className={styles.locationRow}>
          <span className={styles.locationText}>
            <MapPin size={14} />
            <span>{coordsText ? (wardName ? `${wardName} · ${coordsText}` : coordsText) : '—'}</span>
          </span>
          <button type="button" className={styles.locationEdit} onClick={onPickLocation} disabled={submitting}>
            {t('map.neighborhoodProfile.placeForm.locationEdit')}
          </button>
        </div>
        <label className={styles.sheetLabel}>{t('map.neighborhoodProfile.placeForm.noteLabel')}</label>
        <input
          className={styles.field}
          placeholder={t('map.neighborhoodProfile.placeForm.notePlaceholder')}
          value={placeNote}
          onChange={(e) => setPlaceNote(e.target.value)}
        />
        <div className={styles.sheetActions}>
          <button className={styles.sheetCancel} onClick={onClose} disabled={submitting}>
            {t('map.neighborhoodProfile.placeForm.cancel')}
          </button>
          <button
            className={styles.sheetSubmit}
            onClick={handleSubmit}
            disabled={!placeName.trim() || !coords || submitting}
          >
            {submitting ? t('map.neighborhoodProfile.placeForm.submitting') : t('map.neighborhoodProfile.placeForm.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
