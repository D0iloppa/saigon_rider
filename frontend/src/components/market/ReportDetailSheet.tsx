import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { api } from '@/api/client';
import styles from './ReportDetailSheet.module.css';

const MAX_REPORT_IMAGES = 5;

interface ImageItem {
  localId: string;
  preview: string;
  contentId: string | null;
  uploading: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 제출(코멘트·사진 둘 다 선택) — 실제 신고 전송·시트 닫기는 부모 책임. */
  onSubmit: (note: string, imageContentIds: string[]) => void;
  submitting?: boolean;
}

/**
 * 신고 사유 선택 다음 단계 — 코멘트 + 사진(여러 장, B안) 첨부. 둘 다 선택 입력이라
 * 아무것도 안 넣고 제출해도 접수된다(마찰 최소화, 016 A4). 업로드는 MarketCreate.tsx 와
 * 동일한 선업로드 패턴(realFetchForm('/contents/upload', ...)) 재사용.
 */
export default function ReportDetailSheet({ open, onClose, onSubmit, submitting = false }: Props) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);

  useEffect(() => {
    if (!open) {
      setNote('');
      setImages([]);
    }
  }, [open]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';
    const toAdd = files.slice(0, MAX_REPORT_IMAGES - images.length);
    const newItems: ImageItem[] = toAdd.map((f) => ({
      localId: crypto.randomUUID(),
      preview: URL.createObjectURL(f),
      contentId: null,
      uploading: true,
    }));
    setImages((prev) => [...prev, ...newItems]);

    for (let i = 0; i < toAdd.length; i++) {
      const item = newItems[i];
      const file = toAdd[i];
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('owner_type', 'user');
        const res = await api.realFetchForm<{ id: string; imgproxy_url: string }>('/contents/upload', form);
        setImages((prev) => prev.map((img) => (
          img.localId === item.localId
            ? { ...img, contentId: res.id, preview: res.imgproxy_url, uploading: false }
            : img
        )));
      } catch (err: any) {
        URL.revokeObjectURL(item.preview);
        setImages((prev) => prev.filter((img) => img.localId !== item.localId));
        toast.error(err.message ?? t('market.uploadError', { defaultValue: '이미지 업로드 실패' }));
      }
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const uploading = images.some((i) => i.uploading);
  const imageContentIds = images.filter((i) => i.contentId).map((i) => i.contentId!);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <h2 className={styles.title}>
          {t('market.reportDetailTitle', { defaultValue: '자세한 내용을 알려주세요 (선택)' })}
        </h2>
        <textarea
          className={styles.noteInput}
          placeholder={t('market.reportNotePlaceholder', {
            defaultValue: '신고 사유에 대해 자세히 설명해주시면 검토에 도움이 돼요',
          })}
          value={note}
          maxLength={1000}
          rows={4}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className={styles.photoRow}>
          <label className={styles.addPhoto}>
            <span className={styles.addPhotoText}>
              {t('market.reportAddPhoto', { defaultValue: '사진 추가' })}
            </span>
            <span className={styles.addPhotoCount}>{images.length}/{MAX_REPORT_IMAGES}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageSelect}
              disabled={images.length >= MAX_REPORT_IMAGES}
            />
          </label>
          {images.map((img, idx) => (
            <div key={img.localId} className={styles.previewItem}>
              <AppImage src={img.preview} alt="" className={styles.previewThumb} />
              {img.uploading && <div className={styles.uploadingOverlay} />}
              <button
                type="button"
                className={styles.removeImg}
                onClick={() => removeImage(idx)}
                aria-label={t('market.removeImage', { defaultValue: '삭제' })}
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
        <div className={styles.submit}>
          <Button onClick={() => onSubmit(note.trim(), imageContentIds)} disabled={submitting || uploading}>
            {t('market.reportSubmit', { defaultValue: '신고하기' })}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
