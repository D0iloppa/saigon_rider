import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { buildCategoryTree, localizedName, type CategoryNode, type MarketCategory } from '@/api/market';
import styles from './CategoryPickerSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  categories: MarketCategory[];
  selectedId: number | null;
  onSelect: (category: MarketCategory | null) => void;
  /** "전체"(선택 해제) 행 노출 — 검색 필터용 */
  allowClear?: boolean;
}

/**
 * 카테고리 트리 드릴다운 시트 (SGR-298) — 등록·검색 공용.
 * 대분류 → (자식 있으면) 중분류 드릴다운. 잎(또는 대분류 자체) 선택 시 닫힘.
 */
export default function CategoryPickerSheet({ open, onClose, categories, selectedId, onSelect, allowClear }: Props) {
  const { t } = useTranslation();
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const [drill, setDrill] = useState<CategoryNode | null>(null);

  const close = () => {
    setDrill(null);
    onClose();
  };

  const pick = (c: MarketCategory | null) => {
    onSelect(c);
    close();
  };

  return (
    <BottomSheet open={open} onClose={close} height="half">
      <div className={styles.sheet}>
        <div className={styles.header}>
          {drill ? (
            <button className={styles.back} onClick={() => setDrill(null)} aria-label={t('common.back', { defaultValue: '뒤로' })}>
              <ChevronLeft size={22} strokeWidth={2.2} />
            </button>
          ) : (
            <span className={styles.backSpacer} />
          )}
          <h2 className={styles.title}>
            {drill ? localizedName(drill) : t('market.pickCategory', { defaultValue: '카테고리 선택' })}
          </h2>
          <span className={styles.backSpacer} />
        </div>

        <div className={styles.list}>
          {!drill ? (
            <>
              {allowClear && (
                <button className={styles.row} onClick={() => pick(null)}>
                  <span className={styles.rowName}>{t('market.catAll', { defaultValue: '전체' })}</span>
                  {selectedId == null && <Check size={18} className={styles.check} />}
                </button>
              )}
              {tree.map((top) => (
                <button
                  key={top.id}
                  className={styles.row}
                  onClick={() => (top.children.length ? setDrill(top) : pick(top))}
                >
                  <span className={styles.rowName}>
                    {top.icon && <span className={styles.icon}>{top.icon}</span>}
                    {localizedName(top)}
                  </span>
                  {top.children.length ? (
                    <ChevronRight size={18} className={styles.chev} />
                  ) : (
                    selectedId === top.id && <Check size={18} className={styles.check} />
                  )}
                </button>
              ))}
            </>
          ) : (
            <>
              <button className={styles.row} onClick={() => pick(drill)}>
                <span className={styles.rowName}>
                  {t('market.catAllOf', { defaultValue: '{{name}} 전체', name: localizedName(drill) })}
                </span>
                {selectedId === drill.id && <Check size={18} className={styles.check} />}
              </button>
              {drill.children.map((child) => (
                <button key={child.id} className={styles.row} onClick={() => pick(child)}>
                  <span className={styles.rowName}>{localizedName(child)}</span>
                  {selectedId === child.id && <Check size={18} className={styles.check} />}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
