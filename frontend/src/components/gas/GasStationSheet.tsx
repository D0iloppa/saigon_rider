import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gasApi, type GasStationDetail } from '@/api/info';
import { getBrand, formatPriceFull } from './gas-tokens';
import styles from './GasStationSheet.module.css';

type FuelKey = 'RON95_III' | 'E5_RON92_II';

interface Props {
  stationId: number;
  onClose: () => void;
}

export default function GasStationSheet({ stationId, onClose }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<GasStationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mainFuel, setMainFuel] = useState<FuelKey>('RON95_III');

  useEffect(() => {
    setLoading(true);
    gasApi.getStation(stationId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [stationId]);

  if (loading) {
    return (
      <div className={styles.backdrop} onClick={onClose}>
        <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
          <div className={styles.skeleton}>{t('common.loading')}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={styles.backdrop} onClick={onClose}>
        <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
          <div className={styles.skeleton}>{t('info.gas.sheetNotFound')}</div>
        </div>
      </div>
    );
  }

  const brand = getBrand(data.brand_normalized);
  const subFuel: FuelKey = mainFuel === 'RON95_III' ? 'E5_RON92_II' : 'RON95_III';
  const mainPrice = data.reference_price[mainFuel];
  const subPrice = data.reference_price[subFuel];
  const fuelLabel = (k: FuelKey) => (k === 'RON95_III' ? 'RON 95-III' : 'E5 RON 92-II');

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.brandBadge} style={{ background: brand.primary, color: brand.textColor }}>
            {brand.displayName}
          </div>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="close">✕</button>
        </header>

        <h2 className={styles.stationName}>{data.name || data.brand || '—'}</h2>
        {data.is_24h && <span className={styles.badge24h}>{t('info.gas.badge24h')}</span>}

        <section className={styles.priceMain}>
          <div className={styles.priceLabel}>{fuelLabel(mainFuel)}</div>
          <div className={styles.priceValue}>{formatPriceFull(mainPrice ?? null)}</div>
        </section>

        {subPrice != null && (
          <button type="button" className={styles.priceSub} onClick={() => setMainFuel(subFuel)}>
            <span>{fuelLabel(subFuel)}: {formatPriceFull(subPrice)}</span>
            <span className={styles.swapIcon}>⇄</span>
          </button>
        )}

        <div className={styles.meta}>
          <span>{t('info.gas.referenceSource', { src: data.reference_price.source })}</span>
          {data.reference_price.updated_at && (
            <>
              <span>·</span>
              <span>{t('info.gas.updatedAt', { time: data.reference_price.updated_at })}</span>
            </>
          )}
        </div>

        <p className={styles.disclaimer}>ⓘ {t('info.gas.disclaimer')}</p>
      </div>
    </div>
  );
}
