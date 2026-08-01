import { Compass, LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './MapControls.module.css';

interface MapControlsProps {
  onRecenter: () => void;
  onResetNorth: () => void;
}

/** 지도 우측 플로팅 컨트롤 (나침반·내 위치). nav·quest 공용. */
export default function MapControls({ onRecenter, onResetNorth }: MapControlsProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.wrap}>
      <button className={styles.btn} onClick={onResetNorth} aria-label={t('rideNav.resetNorth', '북쪽 맞춤')}>
        <span className={styles.compass}><Compass size={22} strokeWidth={2} aria-hidden="true" /></span>
      </button>
      <button className={styles.btn} onClick={onRecenter} aria-label={t('rideNav.myLocation', '내 위치')}>
        <span className={styles.locate}><LocateFixed size={22} strokeWidth={2.2} aria-hidden="true" /></span>
      </button>
    </div>
  );
}
