import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { repairApi } from '@/api/info';
import type { RepairShop } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import styles from './InfoRepairList.module.css';

const DEFAULT_COORDS = { lat: 10.776, lng: 106.700 };
const MOTO_OPTIONS = ['Honda SH 350i', 'Honda Wave', 'Honda Exciter', 'Yamaha NVX', 'Yamaha Sirius', 'Suzuki Raider'];
const SERVICE_CODES = ['OIL_CHANGE', 'TIRE', 'CHAIN', 'ENGINE', 'BRAKE', 'BATTERY', 'GENERAL_CHECK', 'WASH'];

export default function InfoRepairList() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const serviceOptions = SERVICE_CODES.map((code) => ({
    code,
    label: t(`info.repair.service_${code}`, code),
  }));

  const [shops, setShops] = useState<RepairShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [moto, setMoto] = useState('Honda SH 350i');
  const [service, setService] = useState('OIL_CHANGE');
  const [showMotoSelect, setShowMotoSelect] = useState(false);
  const [showServiceSelect, setShowServiceSelect] = useState(false);

  useEffect(() => {
    const { lat, lng } = DEFAULT_COORDS;
    repairApi.getNearby(lat, lng, 5, service, moto)
      .then((r) => setShops(r.shops))
      .finally(() => setLoading(false));
  }, [moto, service]);

  const minPrice = shops.reduce<number | null>((min, s) => {
    if (s.avg_price === null) return min;
    if (min === null || s.avg_price < min) return s.avg_price;
    return min;
  }, null);

  function getShopBadge(shop: RepairShop): { label: string; cls: string } | null {
    if (shop.avg_rating !== null && shop.avg_rating >= 4.5) {
      return { label: t('info.repair.rank1'), cls: styles.badgeTop };
    }
    if (minPrice !== null && shop.avg_price !== null && shop.avg_price === minPrice) {
      return { label: t('info.repair.cheapBadge'), cls: styles.badgeCheap };
    }
    if (shop.avg_rating !== null && shop.avg_rating < 3.5) {
      return { label: t('info.repair.warningBadge'), cls: styles.badgeWarn };
    }
    return null;
  }

  const filterBtn = (
    <div className={styles.iconBtn}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6h18M3 12h18M3 18h18"/>
      </svg>
    </div>
  );

  const currentServiceLabel = serviceOptions.find((o) => o.code === service)?.label ?? service;

  return (
    <div className={styles.page}>
      <TopBar
        title={t('info.repair.title')}
        onBack={() => navigate(-1)}
        rightContent={filterBtn}
      />

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>{t('info.repair.filterVehicle')}</span>
          <div className={styles.filterChipOrange} onClick={() => setShowMotoSelect((v) => !v)}>
            {moto} ▾
          </div>
        </div>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>{t('info.repair.filterService')}</span>
          <div className={styles.filterChipBlue} onClick={() => setShowServiceSelect((v) => !v)}>
            {currentServiceLabel} ▾
          </div>
        </div>
      </div>

      {/* Dropdowns */}
      {showMotoSelect && (
        <div className={styles.dropdown}>
          {MOTO_OPTIONS.map((m) => (
            <button key={m} className={`${styles.dropdownItem} ${m === moto ? styles.dropdownItemActive : ''}`}
              onClick={() => { setMoto(m); setShowMotoSelect(false); }}>
              {m}
            </button>
          ))}
        </div>
      )}
      {showServiceSelect && (
        <div className={styles.dropdown}>
          {serviceOptions.map((s) => (
            <button key={s.code} className={`${styles.dropdownItem} ${s.code === service ? styles.dropdownItemActive : ''}`}
              onClick={() => { setService(s.code); setShowServiceSelect(false); }}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.scroll}>
        {loading ? (
          <div className={styles.skeletonWrap}>
            {[0, 1, 2].map((i) => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : (
          <div className={styles.card}>
            {shops.map((shop) => {
              const badge = getShopBadge(shop);
              const isCheap = badge?.cls === styles.badgeCheap;
              return (
                <div key={shop.shop_id} className={`${styles.repairCard} ${isCheap ? styles.repairCardCheap : ''}`}>
                  {/* Badge + name */}
                  <div className={styles.repairTopRow}>
                    {badge && <span className={`${styles.repairBadge} ${badge.cls}`}>{badge.label}</span>}
                    <span className={styles.repairName}>{shop.name}</span>
                  </div>

                  {/* Rating + price */}
                  <div className={styles.ratingRow}>
                    <div className={styles.ratingLeft}>
                      <span className={`${styles.mono} ${styles.ratingVal} ${shop.avg_rating !== null && shop.avg_rating < 3.5 ? styles.ratingDanger : ''}`}>
                        ⭐ {shop.avg_rating?.toFixed(1) ?? '-'}
                      </span>
                      <span className={styles.reviewCount}>({shop.review_count} {t('info.repair.reviewCount')})</span>
                    </div>
                    <span className={`${styles.mono} ${styles.avgPrice} ${isCheap ? styles.avgPriceCheap : ''} ${shop.avg_rating !== null && shop.avg_rating < 3.5 ? styles.avgPriceDanger : ''}`}>
                      {shop.avg_price !== null ? `${shop.avg_price.toLocaleString()} ₫` : '-'}
                    </span>
                  </div>

                  {/* Keywords */}
                  {shop.keywords && shop.keywords.length > 0 && (
                    <div className={styles.chips}>
                      {shop.keywords.map((kw) => (
                        <span
                          key={kw.keyword}
                          className={`${styles.chip} ${kw.sentiment === 'positive' ? styles.chipPos : styles.chipNeg}`}
                        >
                          {kw.keyword}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Distance + detail */}
                  <div className={styles.distanceRow}>
                    <span className={styles.distanceText}>
                      🚶 <span className={styles.mono}>{shop.distance_km.toFixed(1)}km</span>
                    </span>
                    <button
                      className={styles.detailBtn}
                      onClick={() => navigate(`/info/repair/${shop.shop_id}`)}
                    >
                      {t('info.repair.detailBtn')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className={styles.gpCta}>
          <span>💡</span>
          <span>{t('info.repair.reviewCta')}</span>
        </div>
      </div>
    </div>
  );
}
