import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchShopItems, fetchDailyFeatured, slotLabel } from '@/api/shop';
import type { ShopItem, DailyFeaturedItem, ShopItemFilter } from '@/api/shop';
import { fetchWallet } from '@/api/wallet';
import { useUserStore } from '@/store/useUserStore';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { ItemName } from '@/components/ui/items/ItemName';
import { emojiUrl } from '@/lib/emoji';
import styles from './ShopCatalog.module.css';

// 2단계 드릴다운 필터: Level1 그룹(라이더·바이크·이펙트) → Level2 파츠 슬롯.
// 슬롯명은 v7 item_slot_enum 과 일치. 그룹 라벨은 equipPreview.tab_* i18n 재사용.
type GroupKey = 'rider' | 'bike' | 'effect';
const GROUP_ORDER: GroupKey[] = ['rider', 'bike', 'effect'];
const GROUPS: Record<GroupKey, { i18nKey: string; slots: string[] }> = {
  rider:  { i18nKey: 'equipPreview.tab_rider',  slots: ['HELMET', 'JACKET', 'GLOVES', 'EYEWEAR', 'BOOTS'] },
  bike:   { i18nKey: 'equipPreview.tab_bike',   slots: ['BODY', 'ENGINE', 'SEAT', 'STICKER', 'HANDLE', 'MIRROR', 'LIGHT', 'TAIL', 'NUMBER'] },
  effect: { i18nKey: 'equipPreview.tab_effect', slots: ['NAME', 'RANK', 'FRAME', 'TITLE', 'BACKDROP', 'TRAIL', 'START', 'HORN', 'BANNER', 'EMOTE', 'PET'] },
};

// 페이지 크기(페이징 단위). 슬롯/그룹 뷰는 대개 1페이지, 최상위 '전체'(~100)만 더보기 발생.
const PAGE_SIZE = 50;

function useCountdown(targetIso: string) {
  const [remaining, setRemaining] = useState('');
  const rafRef = useRef<number>(0);

  useEffect(() => {
    function tick() {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) { setRemaining('00:00:00'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      rafRef.current = window.setTimeout(tick, 1000);
    }
    tick();
    return () => clearTimeout(rafRef.current);
  }, [targetIso]);

  return remaining;
}

function FeaturedCard({ item }: { item: DailyFeaturedItem }) {
  const timer = useCountdown(item.featured_until);
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div
      className={styles.featuredCard}
      onClick={() => navigate(`/shop/item/${item.item_code}`)}
      style={{ cursor: 'pointer' }}
    >
      <div className={styles.featuredGlow} />

      <div className={styles.featuredThumb}>
        <ItemSvgRenderer itemCode={item.item_code} slot={item.item_slot} size={64} rarity={item.rarity} className={styles.itemThumbImg} />
      </div>

      <div className={styles.featuredInfo}>
        <div className={styles.featuredBadge}>
          <span className={styles.featuredBadgeText}>
            TODAY · {item.discount_percent}% OFF
          </span>
        </div>
        <div className={styles.featuredTimer}>⏰ {timer}</div>
        <div className={styles.featuredName}><ItemName code={item.item_code} fallback={item.item_name} /></div>
        <span className="rarity-chip" data-r={item.rarity}>LEGENDARY</span>
        <div className={styles.featuredPrices}>
          {item.original_price_gold && (
            <span className={styles.originalPrice}>
              {t('currency.gold')} {item.original_price_gold.toLocaleString()}
            </span>
          )}
          <span className={styles.discountPrice}>
            {t('currency.gold')} {item.price_gold?.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ShopCatalog() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const [featured, setFeatured] = useState<DailyFeaturedItem | null>(null);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [group, setGroup] = useState<GroupKey | null>(null);
  const [slot, setSlot] = useState<string>('all'); // 'all' = 선택 그룹 전체
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [wallet, setWallet] = useState<{ gold: number; xp: number }>({ gold: 0, xp: 0 });

  useEffect(() => {
    fetchWallet().then((w) => setWallet({ gold: w.gold_balance, xp: w.xp_balance })).catch(() => {});
  }, []);

  useEffect(() => {
    fetchDailyFeatured().then(setFeatured).catch(() => {});
  }, []);

  // 현재 드릴다운 선택(그룹/슬롯)을 서버 필터로 변환. 페이징을 위해 offset/limit 동반.
  const buildFilter = useCallback((off: number): ShopItemFilter => {
    const f: ShopItemFilter = { limit: PAGE_SIZE, offset: off };
    if (group !== null) {
      if (slot === 'all') f.group = group;
      else f.slot = slot;
    }
    return f;
  }, [group, slot]);

  // 필터 변경 시 1페이지 재조회 (서버 측 필터). setState 는 async 콜백에서만 → effect 동기 setState 경고 회피.
  useEffect(() => {
    let cancelled = false;
    fetchShopItems(buildFilter(0)).then((res) => {
      if (cancelled) return;
      setItems(res);
      setOffset(res.length);
      setHasMore(res.length === PAGE_SIZE);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [buildFilter]);

  function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchShopItems(buildFilter(offset))
      .then((res) => {
        setItems((prev) => [...prev, ...res]);
        setOffset((prev) => prev + res.length);
        setHasMore(res.length === PAGE_SIZE);
      })
      .finally(() => setLoadingMore(false));
  }

  return (
    <div className={styles.page}>
      {/* Hero Header */}
      <div className={styles.header}>
        <div className={styles.headerBg} />
        <div className={styles.headerTitle}>{t('shop.title')}</div>
        <div className={styles.headerUser}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} className={styles.headerAvatar} alt="" />
          ) : (
            <div className={styles.headerAvatar} />
          )}
          <span className={styles.headerNickname}>{user?.nickname ?? '---'}</span>
        </div>
        <div className={styles.headerBalance}>
          <div className={styles.balanceRow}>
            <img
              src={emojiUrl('1fa99')}
              className={styles.balanceIcon} alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className={styles.balanceGp}>
              {t('currency.gold')} {wallet.gold.toLocaleString()}
            </span>
          </div>
          <div className={styles.balanceRow}>
            <img
              src={emojiUrl('1f48e')}
              className={styles.balanceIcon} alt=""
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className={styles.balanceGc}>XP {wallet.xp.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {/* Featured */}
        {featured && <FeaturedCard item={featured} />}

        {/* Category chips — 2단계 드릴다운 (1 row) */}
        <div className={styles.chips}>
          {group === null ? (
            <>
              <button className={`${styles.chip} ${styles.chipActive}`}>
                {t('shop.filter_all')}
              </button>
              {GROUP_ORDER.map((g) => (
                <button
                  key={g}
                  className={`${styles.chip} ${styles.chipInactive}`}
                  onClick={() => { setGroup(g); setSlot('all'); }}
                >
                  {t(GROUPS[g].i18nKey)}
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                className={`${styles.chip} ${styles.chipInactive}`}
                onClick={() => { setGroup(null); setSlot('all'); }}
              >
                ‹ {t(GROUPS[group].i18nKey)}
              </button>
              <button
                className={`${styles.chip} ${slot === 'all' ? styles.chipActive : styles.chipInactive}`}
                onClick={() => setSlot('all')}
              >
                {t('shop.filter_all')}
              </button>
              {GROUPS[group].slots.map((sl) => (
                <button
                  key={sl}
                  className={`${styles.chip} ${slot === sl ? styles.chipActive : styles.chipInactive}`}
                  onClick={() => setSlot(sl)}
                >
                  {slotLabel(sl)}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Item Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '32px 0' }}>
            {t('common.loading')}
          </div>
        ) : (
          <div className={styles.itemGrid}>
            {items.map((item) => (
              <div
                key={item.item_code}
                className={`rarity-card ${styles.itemCard}`}
                data-r={item.rarity}
                style={{ position: 'relative', cursor: 'pointer' }}
                onClick={() => navigate(`/shop/item/${item.item_code}`)}
              >
                {item.is_owned && (
                  <div className={styles.ownedOverlay}>
                    <span className={styles.ownedLabel}>✓ OWNED</span>
                  </div>
                )}

                <div className={`rarity-chip ${styles.itemRarityBadge}`} data-r={item.rarity}>
                  {item.rarity}
                </div>

                {item.limited_label && (
                  <span className={styles.itemLimitedBadge}>{item.limited_label}</span>
                )}

                <div className={styles.itemThumb}>
                  <ItemSvgRenderer itemCode={item.item_code} slot={item.item_slot} size={64} rarity={item.rarity} className={styles.itemThumbImg} />
                </div>
                <div className={styles.itemName}><ItemName code={item.item_code} fallback={item.item_name} /></div>
                <div className={styles.itemSlot}>{slotLabel(item.item_slot)}</div>

                <div className={styles.itemFooter}>
                  {item.price_gold ? (
                    <span className={styles.priceGp}>
                      {item.price_gold.toLocaleString()} {t('currency.gold')}
                    </span>
                  ) : (
                    <span className={styles.priceGc}>
                      {item.price_xp} XP
                    </span>
                  )}
                  {!item.is_owned && (
                    <button
                      className={styles.addBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/shop/item/${item.item_code}`);
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 더보기 (페이징) */}
        {!loading && hasMore && (
          <button className={styles.loadMoreBtn} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('common.loading') : t('shop.load_more')}
          </button>
        )}

        {/* Gacha Banner */}
        <div
          className={styles.gachaBanner}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/gacha')}
        >
          <div className={styles.gachaBannerBg} />
          <div className={styles.gachaBannerBorder} />
          <img
            src={emojiUrl('1f48e')}
            className={styles.gachaBannerIcon} alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div className={styles.gachaBannerText}>
            <div className={styles.gachaBannerTitle}>{t('shop.gacha_banner_title')}</div>
            <div className={styles.gachaBannerSub}>{t('shop.gacha_banner_sub')}</div>
          </div>
          <div className={styles.gachaBannerArrow}>↗</div>
        </div>
      </div>
    </div>
  );
}
