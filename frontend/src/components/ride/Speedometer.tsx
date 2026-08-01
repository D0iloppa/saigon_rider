import styles from './Speedometer.module.css';

interface SpeedometerProps {
  /** m/s (기기 GPS). null/undefined 면 '--'. */
  speedMs?: number | null;
  /** 제한속도(km/h). 있으면 원형 표지 표시. */
  speedLimit?: number | null;
}

/** 우측 속도계 (현재 속도 + 선택적 제한속도). nav·quest 공용. */
export default function Speedometer({ speedMs, speedLimit }: SpeedometerProps) {
  const kmh = typeof speedMs === 'number' && speedMs >= 0 ? Math.round(speedMs * 3.6) : null;
  return (
    <div className={styles.wrap}>
      <div className={styles.val}>{kmh ?? '--'}</div>
      <div className={styles.unit}>km/h</div>
      {typeof speedLimit === 'number' && (
        <div className={styles.limit}>{speedLimit}</div>
      )}
    </div>
  );
}
