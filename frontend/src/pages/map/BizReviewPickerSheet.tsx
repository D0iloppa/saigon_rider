import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import type { BizMapItem } from '@/api/biz';
import styles from './BizReviewPickerSheet.module.css';

interface Props {
  items: BizMapItem[];
  catLabel: (category: string | null) => string;
  onPick: (biz: BizMapItem) => void;
  onClose: () => void;
}

/**
 * + 메뉴 "후기쓰기" 업체 선택 스텝 — 지도에 포커스된 업체가 없을 때 현재 뷰포트의
 * 업체 목록에서 고른다. 선택하면 작성 시트(BizReviewSheet)로 이어진다.
 */
export default function BizReviewPickerSheet({ items, catLabel, onPick, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <div className={styles.pickerBackdrop} onClick={onClose} role="presentation">
      <div className={styles.pickerSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.pickerTitle}>{t('map.addMenu.pickBizTitle')}</div>
        <div className={styles.pickerList}>
          {items.map((b) => (
            <button key={b.id} type="button" className={styles.pickerRow} onClick={() => onPick(b)}>
              <AppImage src={b.photoUrl ?? undefined} alt="" className={styles.pickerThumb} />
              <span className={styles.pickerBody}>
                <span className={styles.pickerName}>{b.name}</span>
                <span className={styles.pickerMeta}>
                  {b.category && (
                    <span className={styles.pickerCat}><BizCatIcon category={b.category} size={12} />{catLabel(b.category)}</span>
                  )}
                  {b.address && <span className={styles.pickerAddr}>{b.address}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
