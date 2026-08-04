import { useTranslation } from 'react-i18next';
import { MapPin, X } from 'lucide-react';
import styles from './AreaPill.module.css';

/**
 * 지역 필터 pill ("지역명 + ✕") — 동네지도(NeighborhoodMapCanvas)와 마켓 지도가 공유하는
 * 단일 컴포넌트. 원래 동네지도 인라인 마크업이었던 것을 추출했다(대표 지적 2026-08-04:
 * 마켓 지도에 지역 chip 부재). 시각(모양·크기)은 동네지도 당시 값이 정본 — 스타일을
 * 바꾸면 두 화면이 함께 바뀐다. 배치(position)는 각 호출부 책임(동네지도=시트 floatingTopLeft
 * 슬롯, 마켓=지도 좌하단 고정)이라 여기서는 배치 스타일을 갖지 않는다.
 */
export function AreaPill({ name, onClear }: { name: string; onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={styles.areaPill}
      onClick={onClear}
      aria-label={t('map.clearRegion')}
    >
      <span className={styles.areaPillIcon}>
        <MapPin size={13} fill="currentColor" />
      </span>
      <span>{name}</span>
      <span className={styles.areaPillClose}><X size={15} strokeWidth={2.4} /></span>
    </button>
  );
}
