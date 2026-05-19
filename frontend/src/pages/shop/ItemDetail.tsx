import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchShopItems, purchaseShopItem, slotLabel } from '@/api/shop';
import type { ShopItem } from '@/api/shop';
import type { ItemRarity } from '@/api/gacha';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
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

const COLLECTION_MOCK: Record<string, { name: string; total: number; owned: number }> = {
  LEGEND_OF_SAIGON: { name: 'Legend of Saigon', total: 6, owned: 2 },
  SAIGON_GHOST:     { name: 'Saigon Ghost',     total: 5, owned: 1 },
  TET_FESTIVAL:     { name: 'Tết Festival',      total: 8, owned: 3 },
  NEON_SAIGON:      { name: 'Neon Saigon',       total: 7, owned: 4 },
  STREET_CLASSIC:   { name: 'Street Classic',    total: 4, owned: 4 },
};

export default function ItemDetail() {
  const { itemCode } = useParams<{ itemCode: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [item, setItem] = useState<ShopItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (!itemCode) return;
    fetchShopItems().then((all) => {
      const found = all.find((i) => i.item_code === itemCode);
      if (found) setItem(found);
      else setNotFound(true);
    }).catch(() => setNotFound(true));
  }, [itemCode]);

  async function handleBuy() {
    if (!item || item.is_owned || buying) return;
    setBuying(true);
    try {
      const currency = item.price_xp ? 'XP' : 'GOLD';
      await purchaseShopItem(item.item_code, currency);
      toast.success('구매 완료!');
      setItem({ ...item, is_owned: true });
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setBuying(false);
    }
  }

  if (notFound) {
    return (
      <div className={s.page} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>아이템을 찾을 수 없습니다</span>
        <button onClick={() => navigate(-1)} style={{ color: 'var(--brand-500)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>← 돌아가기</button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className={s.page} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>{t('common.loading')}</span>
      </div>
    );
  }

  const r = item.rarity;
  const col = item.collection_code ? COLLECTION_MOCK[item.collection_code] : null;
  const colPct = col ? Math.round((col.owned / col.total) * 100) : 0;
  const priceVal = item.price_xp ? `${item.price_xp} XP` : `${item.price_gold?.toLocaleString()} GOLD`;

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
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', background: 'rgba(255,90,31,.12)', border: '1px solid rgba(255,90,31,.25)', borderRadius: 99, padding: '2px 8px' }}>
              {item.limited_label}
            </span>
          )}
        </div>

        <div className={s.itemName}>{item.item_name}</div>
        <div className={s.itemSlot}>{slotLabel(item.item_slot)} 슬롯</div>

        {col && (
          <div className={s.collectionRow}>
            <div className={s.collectionLabel}>COLLECTION · {col.name.toUpperCase()}</div>
            <div className={s.collectionBar}>
              <div className={s.collectionFill} style={{ width: `${colPct}%` }} />
            </div>
            <div className={s.collectionMeta}>{col.owned} / {col.total} 보유 · {colPct}%</div>
          </div>
        )}

        <div className={s.priceRow}>
          <div className={s.priceStack}>
            <div className={s.priceMain}>
              {item.is_owned ? (
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,.5)' }}>보유 중</span>
              ) : priceVal}
            </div>
          </div>
        </div>

        <div className={s.ctaRow}>
          <button
            className={`${s.btnBuy} ${item.is_owned ? s.btnBuyDisabled : ''}`}
            onClick={handleBuy}
            disabled={item.is_owned || buying}
          >
            {item.is_owned ? '보유 중' : buying ? '구매 중…' : t('shop.buy')}
          </button>
          <button className={s.btnWishlist} aria-label="wishlist">♡</button>
        </div>
      </div>
    </div>
  );
}
