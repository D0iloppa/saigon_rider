import styles from './MapControls.module.css';

interface MapControlsProps {
  onRecenter: () => void;
  onResetNorth: () => void;
}

/** 지도 우측 플로팅 컨트롤 (나침반·내 위치). nav·quest 공용. */
export default function MapControls({ onRecenter, onResetNorth }: MapControlsProps) {
  return (
    <div className={styles.wrap}>
      <button className={styles.btn} onClick={onResetNorth} aria-label="북향">
        <span className={styles.compass}>🧭</span>
      </button>
      <button className={styles.btn} onClick={onRecenter} aria-label="내 위치">
        <span className={styles.locate}>◎</span>
      </button>
    </div>
  );
}
