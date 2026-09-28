import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { fetchListings, fetchCategories, localizedName, type ListingCard, type MarketCategory } from '@/api/market';
import { addTradeSetItems, removeTradeSetItem, type TradeSet } from '@/api/dm';
import { formatPriceVnd } from '@/pages/market/marketFormat';
import { tradeSetErrorMessage } from './tradeSetErrors';
import styles from './TradeSetPicker.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  sellerId: string;
  sellerNickname: string;
  tradeSet: TradeSet | null;
  /** 세트가 아직 없을 때(첫 [+ 물품추가]) 미리 체크해 둘 방 컨텍스트 매물 — 이미 얘기 중인 물품이라 자동 포함. */
  contextListingId?: string | null;
  onSaved: (ts: TradeSet) => void;
}

/** F-DM-02 FR-5(물품 선택)·FR-6(물품 편집, d5: 재진입으로 fold) — 전체화면 피커.
 * 판매자의 ON_SALE 매물 그리드에서 체크 → [담기]로 세트에 반영. */
export function TradeSetPicker({ open, onClose, conversationId, sellerId, sellerNickname, tradeSet, contextListingId, onSaved }: Props) {
  const { t } = useTranslation();
  const [listings, setListings] = useState<ListingCard[]>([]);
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeItemIds = useMemo(
    () => new Set((tradeSet?.items ?? []).filter((it) => it.status === 'INQUIRY' || it.status === 'RESERVED').map((it) => it.listingId)),
    [tradeSet],
  );

  useEffect(() => {
    if (!open) return;
    setChecked(activeItemIds.size > 0 ? new Set(activeItemIds) : new Set(contextListingId ? [contextListingId] : []));
    setCategoryFilter(null);
    setLoading(true);
    Promise.all([
      fetchListings({ sellerId, hideSold: true, size: 100 }),
      fetchCategories(),
    ])
      .then(([page, cats]) => {
        setListings(page.items);
        setCategories(cats);
      })
      .catch(() => toast.error(t('common.errorUnexpected')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sellerId]);

  const categoryCodesPresent = useMemo(() => {
    const codes = new Set<string>();
    for (const l of listings) if (l.categoryCode) codes.add(l.categoryCode);
    return codes;
  }, [listings]);

  const categoryNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) if (categoryCodesPresent.has(c.code)) map.set(c.code, localizedName(c));
    return map;
  }, [categories, categoryCodesPresent]);

  const visibleListings = categoryFilter
    ? listings.filter((l) => l.categoryCode === categoryFilter)
    : listings;

  const toggle = (listing: ListingCard) => {
    // 타인에게 예약중(이 세트에 포함되지 않은 RESERVED)이면 선택 불가
    if (listing.status === 'RESERVED' && !activeItemIds.has(listing.id) && !checked.has(listing.id)) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(listing.id)) next.delete(listing.id);
      else next.add(listing.id);
      return next;
    });
  };

  const totalVnd = listings.filter((l) => checked.has(l.id)).reduce((sum, l) => sum + l.priceVnd, 0);

  const handleSubmit = async () => {
    if (saving) return;
    const toAdd = [...checked].filter((id) => !activeItemIds.has(id));
    const toRemove = [...activeItemIds].filter((id) => !checked.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      let latest: TradeSet | null = tradeSet;
      if (toAdd.length > 0) latest = await addTradeSetItems(conversationId, toAdd);
      for (const id of toRemove) latest = await removeTradeSetItem(conversationId, id);
      if (latest) onSaved(latest);
      onClose();
    } catch (err) {
      toast.error(tradeSetErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      height="full"
      header={
        <div className={styles.header}>
          <h2 className={styles.title}>
            {t('dm.tradeSetPickerTitle', { nickname: sellerNickname, defaultValue: '{{nickname}}님의 판매 물품' })}
          </h2>
          {categoryCodesPresent.size > 0 && (
            <div className={styles.categoryRow}>
              <button
                type="button"
                className={categoryFilter === null ? styles.categoryChipActive : styles.categoryChip}
                onClick={() => setCategoryFilter(null)}
              >
                {t('dm.tradeSetPickerCategoryAll', { defaultValue: '전체' })}
              </button>
              {[...categoryNameByCode.entries()].map(([code, name]) => (
                <button
                  key={code}
                  type="button"
                  className={categoryFilter === code ? styles.categoryChipActive : styles.categoryChip}
                  onClick={() => setCategoryFilter(code)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      }
      footer={
        <div className={styles.footer}>
          <span className={styles.footerSummary}>
            {t('dm.tradeSetPickerSummary', {
              count: checked.size,
              total: formatPriceVnd(totalVnd, t),
              defaultValue: '{{count}}개 · 총 {{total}}',
            })}
          </span>
          <button type="button" className={styles.submitBtn} disabled={saving} onClick={handleSubmit}>
            {t('dm.tradeSetPickerSubmit', { defaultValue: '담기' })}
          </button>
        </div>
      }
    >
      {loading ? (
        <p className={styles.loadingText}>{t('common.loading')}</p>
      ) : visibleListings.length === 0 ? (
        <p className={styles.emptyText}>{t('dm.tradeSetPickerEmpty', { defaultValue: '판매중인 물품이 없어요' })}</p>
      ) : (
        <div className={styles.grid}>
          {visibleListings.map((l) => {
            const isChecked = checked.has(l.id);
            const reservedByOther = l.status === 'RESERVED' && !activeItemIds.has(l.id) && !isChecked;
            return (
              <button
                key={l.id}
                type="button"
                className={styles.cell}
                disabled={reservedByOther}
                onClick={() => toggle(l)}
              >
                <div className={styles.cellThumbWrap}>
                  <AppImage src={l.thumbnailUrl ?? undefined} alt="" className={styles.cellThumb} />
                  <span className={isChecked ? styles.checkCircleOn : styles.checkCircle}>
                    {isChecked && <Check size={13} strokeWidth={3} />}
                  </span>
                  {reservedByOther && (
                    <span className={styles.reservedBadge}>
                      {t('dm.tradeSetPickerReservedOther', { defaultValue: '다른 분에게 예약됨' })}
                    </span>
                  )}
                </div>
                <span className={styles.cellTitle}>{l.title}</span>
                <span className={styles.cellPrice}>{formatPriceVnd(l.priceVnd, t)}</span>
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

export default TradeSetPicker;
