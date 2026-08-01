import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Fuel, MapPin, Phone, X } from 'lucide-react';
import { gasApi, type GasStationDetail } from '@/api/info';
import { BottomSheet } from '@/components/ui/BottomSheet';
import StateBlock from '@/components/ui/StateBlock';
import { native } from '@/lib/native';
import { getBrand } from './gas-tokens';
import sys from '@/styles/system.module.css';
import styles from './GasStationSheet.module.css';

interface Props {
  stationId: number;
  onClose: () => void;
}

/** 주유소 상세 바텀시트 — 목록(InfoGasList)과 같은 표면 문법으로 이어진다. */
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

  const brand = data ? getBrand(data.brand_normalized) : null;
  const ref = data?.reference_price;

  return (
    <BottomSheet open onClose={onClose}>
      <div className={styles.body}>
        {loading ? (
          <>
            {[0, 1].map((i) => (
              <div key={i} className={sys.skelRow}>
                <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
                <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
              </div>
            ))}
          </>
        ) : !data || !brand ? (
          <StateBlock icon={Fuel} title={t('info.gas.sheetNotFound')} />
        ) : (
          <>
            <header className={styles.titleRow}>
              <div className={styles.titleCol}>
                <span
                  className={styles.brandBadge}
                  style={{ background: brand.primary, color: brand.textColor }}
                >
                  {brand.displayName}
                </span>
                <h2 className={styles.name}>{data.name || data.brand || '—'}</h2>
              </div>
              <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>
                <X size={16} strokeWidth={2.2} />
              </button>
            </header>

            {data.is_24h && (
              <span className={`${sys.miniBadge} ${styles.badge24h}`}>{t('info.gas.badge24h')}</span>
            )}

            <div className={styles.metaList}>
              {data.opening_hours && (
                <div className={styles.metaRow}>
                  <Clock size={14} className={styles.metaIcon} />
                  <span className="num">{data.opening_hours}</span>
                </div>
              )}
              {data.street_name && (
                <div className={styles.metaRow}>
                  <MapPin size={14} className={styles.metaIcon} />
                  <span>{data.street_name}</span>
                </div>
              )}
            </div>

            {ref && (ref.RON95_III || ref.E5_RON92_II) && (
              <div className={styles.priceCard}>
                {ref.RON95_III && (
                  <div className={styles.priceItem}>
                    <span className={styles.priceFuel}>RON 95-III</span>
                    <span className={`${styles.priceVal} num`}>{ref.RON95_III.toLocaleString()}₫</span>
                  </div>
                )}
                {ref.E5_RON92_II && (
                  <div className={styles.priceItem}>
                    <span className={styles.priceFuel}>E5 RON 92</span>
                    <span className={`${styles.priceVal} num`}>{ref.E5_RON92_II.toLocaleString()}₫</span>
                  </div>
                )}
              </div>
            )}

            {data.phone && (
              <button
                type="button"
                className={styles.callBtn}
                onClick={() => native.openUrl(`tel:${data.phone}`)}
              >
                <Phone size={15} strokeWidth={2.2} />
                <span className="num">{data.phone}</span>
              </button>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
