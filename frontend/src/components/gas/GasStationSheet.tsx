import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gasApi, type GasStationDetail } from '@/api/info';
import { getBrand } from './gas-tokens';
import styles from './GasStationSheet.module.css';

interface Props {
  stationId: number;
  onClose: () => void;
}

export default function GasStationSheet({ stationId, onClose }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<GasStationDetail | null>(null);
  const [loading, setLoading] = useState(true);

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

        {data.phone && (
          <a className={styles.phoneRow} href={`tel:${data.phone}`}>
            <span>☎</span>
            <span>{data.phone}</span>
          </a>
        )}
        {data.opening_hours && (
          <div className={styles.metaRow}>🕒 {data.opening_hours}</div>
        )}
        {data.street_name && (
          <div className={styles.metaRow}>📍 {data.street_name}</div>
        )}

        {data.reference_price && (data.reference_price.RON95_III || data.reference_price.E5_RON92_II) && (
          <div className={styles.metaRow}>
            ⛽ {data.reference_price.RON95_III ? `RON95-III ${data.reference_price.RON95_III.toLocaleString()}₫` : ''}
            {data.reference_price.RON95_III && data.reference_price.E5_RON92_II ? '  ·  ' : ''}
            {data.reference_price.E5_RON92_II ? `E5 ${data.reference_price.E5_RON92_II.toLocaleString()}₫` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
