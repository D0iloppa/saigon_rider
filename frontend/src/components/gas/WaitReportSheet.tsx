import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './WaitReportSheet.module.css';

export interface WaitStationOption {
  station_id: number;
  name: string;
  distance_km: number;
}

/** 혼잡도 3단계 → 대기시간(분) 매핑. 기존 wait-report(wait_minutes) 인프라 재사용. */
const LEVELS = [
  { key: 'free', minutes: 0, cls: 'levelFree', emoji: '🟢', labelKey: 'info.gas.waitFree' },
  { key: 'normal', minutes: 5, cls: 'levelNormal', emoji: '🟡', labelKey: 'info.gas.waitNormal' },
  { key: 'busy', minutes: 15, cls: 'levelBusy', emoji: '🔴', labelKey: 'info.gas.waitBusy' },
] as const;

interface Props {
  open: boolean;
  stations: WaitStationOption[];
  /** 제출(API·토스트는 호출부). true 반환 시 닫힘. */
  onSubmit: (stationId: number, waitMinutes: number) => Promise<boolean>;
  onClose: () => void;
}

/** 주유소 대기상태(혼잡도) 실시간 제보 바텀시트. */
export default function WaitReportSheet({ open, stations, onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const [stationId, setStationId] = useState<number | null>(stations[0]?.station_id ?? null);
  const [levelIdx, setLevelIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // open=false 시 언마운트가 아니라 숨김(state 보존)이므로, 열릴 때마다 선택을 초기화.
  // stations 가 바뀌면(구역 변경) 첫 주유소로 재설정 → 목록에 없는 station 제보 방지.
  useEffect(() => {
    if (open) {
      setStationId(stations[0]?.station_id ?? null);
      setLevelIdx(null);
    }
  }, [open, stations]);

  if (!open) return null;

  async function handleSubmit() {
    if (stationId === null || levelIdx === null || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit(stationId, LEVELS[levelIdx].minutes);
      if (ok) {
        setLevelIdx(null);
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.backdrop} onClick={() => !submitting && onClose()}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>⛽ {t('info.gas.waitReportTitle')}</div>
        <div className={styles.desc}>{t('info.gas.waitReportDesc')}</div>

        <div className={styles.sectionLabel}>{t('info.gas.waitStationLabel')}</div>
        <div className={styles.stationList}>
          {stations.map((s) => (
            <button
              key={s.station_id}
              className={`${styles.stationRow} ${stationId === s.station_id ? styles.stationRowActive : ''}`}
              onClick={() => setStationId(s.station_id)}
            >
              <span>{s.name}</span>
              <span className={styles.stationDist}>{s.distance_km.toFixed(1)}km</span>
            </button>
          ))}
        </div>

        <div className={styles.sectionLabel}>{t('info.gas.waitCongestionLabel')}</div>
        <div className={styles.levelRow}>
          {LEVELS.map((lv, i) => (
            <button
              key={lv.key}
              className={`${styles.levelBtn} ${styles[lv.cls]} ${levelIdx === i ? styles.levelBtnActive : ''}`}
              onClick={() => setLevelIdx(i)}
            >
              <span className={styles.levelEmoji}>{lv.emoji}</span>
              <span>{t(lv.labelKey)}</span>
            </button>
          ))}
        </div>

        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose} disabled={submitting}>
            {t('common.cancel', '취소')}
          </button>
          <button
            className={styles.submit}
            onClick={handleSubmit}
            disabled={stationId === null || levelIdx === null || submitting}
          >
            {submitting ? t('info.gas.waitSubmitting') : t('info.gas.waitSubmit')}
          </button>
        </div>
      </div>
    </div>
  );
}
