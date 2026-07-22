import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchShopItems, purchaseShopItem, slotLabel } from '@/api/shop';
import type { ShopItem } from '@/api/shop';
import type { ItemRarity } from '@/api/gacha';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { ItemName } from '@/components/ui/items/ItemName';
import { MythicCardOverlay } from '@/components/ui/items/MythicCardOverlay';
import { ItemSparkle } from '@/components/ui/items/ItemSparkle';
import { toast } from 'sonner';
import s from './ItemDetail.module.css';

const HERO_GRAD: Record<ItemRarity, string> = {
  C: s.heroGradC, R: s.heroGradR, E: s.heroGradE, L: s.heroGradL, M: s.heroGradM,
};

const RARITY_LABEL: Record<ItemRarity, string> = {
  C: 'COMMON', R: 'RARE', E: 'EPIC', L: 'LEGENDARY', M: 'MYTHIC',
};

export default function ItemDetail() {
  const { itemCode } = useParams<{ itemCode: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [item, setItem] = useState<ShopItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [buying, setBuying] = useState(false);
  const purchaseIntentRef = useRef<string | null>(null);

  useEffect(() => {
    purchaseIntentRef.current = null;
    if (!itemCode) return;
    fetchShopItems({ limit: 500 }).then((all) => {
      const found = all.find((i) => i.item_code === itemCode);
      if (found) setItem(found);
      else setNotFound(true);
    }).catch(() => setNotFound(true));
  }, [itemCode]);

  async function handleBuy() {
    if (!item || item.is_owned || buying) return;
    setBuying(true);
    try {
      const currency = item.price_gold ? 'GOLD' : 'XP';
      const intentKey = purchaseIntentRef.current ?? crypto.randomUUID();
      purchaseIntentRef.current = intentKey;
      await purchaseShopItem(item.item_code, currency, intentKey);
      toast.success(t('itemDetail.purchase_success'));
      purchaseIntentRef.current = null;
      setItem({ ...item, is_owned: true });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const m = msg.match(/insufficient (?:GP|GC|GOLD|XP) balance: have (\d+), need (\d+)/i);
      if (m) {
        toast.error(t('itemDetail.error_insufficient_balance', { have: m[1], need: m[2] }));
      } else {
        toast.error(t('common.errorUnexpected'));
      }
    } finally {
      setBuying(false);
    }
  }

  if (notFound) {
    return (
      <div className={s.page} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('itemDetail.not_found')}</span>
        <button onClick={() => navigate(-1)} style={{ color: 'var(--brand-500)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>{t('itemDetail.go_back')}</button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className={s.page} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('common.loading')}</span>
      </div>
    );
  }

  const r = item.rarity;
  const priceVal = item.price_gold ? `${item.price_gold.toLocaleString()} ${t('currency.gold')}` : `${item.price_xp} ${t('currency.xp')}`;

  return (
    <div className={s.page}>
      {/* Hero */}
      <div className={`${s.hero} ${HERO_GRAD[r]}`}>
        <div className={s.heroRays} />
        {r === 'M' && <MythicCardOverlay variant="subtle" />}
        {r === 'L' && (
          <>
            <ItemSparkle style={{ top: '20%', left: '18%' }} delay={0} color="#FFB800" size={7} />
            <ItemSparkle style={{ top: '28%', right: '15%' }} delay={0.4} color="#00F0FF" size={5} />
            <ItemSparkle style={{ bottom: '25%', left: '22%' }} delay={0.8} color="#B65EFF" size={6} />
            <ItemSparkle style={{ bottom: '22%', right: '18%' }} delay={1.2} color="#FFB800" size={8} />
          </>
        )}
        <div className={s.heroItem}>
          <ItemSvgRenderer itemCode={item.item_code} slot={item.item_slot} size={140} rarity={r} />
        </div>
      </div>

      {/* Back button */}
      <button className={s.backBtn} onClick={() => navigate(-1)}>‹</button>

      {/* Detail sheet */}
      <div className={s.sheet}>
        <div className={s.rarityChipRow}>
          <span className="rarity-chip" data-r={r}>{RARITY_LABEL[r]}</span>
          {item.is_limited && item.limited_label && (
            <span style={{ fontSize: 10, color: 'var(--brand-700)', background: 'rgba(255,90,31,.10)', border: '1px solid rgba(255,90,31,.28)', borderRadius: 99, padding: '2px 8px' }}>
              {item.limited_label}
            </span>
          )}
        </div>

        <div className={s.itemName}><ItemName code={item.item_code} fallback={item.item_name} /></div>
        <div className={s.itemSlot}>{t(`shop.slots.${item.item_slot}`, { defaultValue: slotLabel(item.item_slot) })} {t('itemDetail.slot_suffix')}</div>

        <div className={s.priceRow}>
          <div className={s.priceStack}>
            <div className={s.priceMain}>
              {item.is_owned ? (
                <span style={{ fontSize: 14, color: 'var(--text-3)' }}>{t('itemDetail.owned')}</span>
              ) : priceVal}
            </div>
          </div>
        </div>

        <div className={s.ctaRow}>
          {item.is_owned ? (
            <button
              className={s.btnBuy}
              onClick={() => navigate(`/garage?slot=${item.item_slot}`)}
            >
              {t('itemDetail.equip_in_garage')}
            </button>
          ) : (
            <button
              className={s.btnBuy}
              onClick={handleBuy}
              disabled={buying}
            >
              {buying ? t('itemDetail.buying') : t('shop.buy')}
            </button>
          )}
          <button className={s.btnWishlist} aria-label="wishlist">♡</button>
        </div>
      </div>
    </div>
  );
}
