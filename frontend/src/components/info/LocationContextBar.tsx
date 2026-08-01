import { useMemo, type ReactNode } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listWardRegions } from '@/components/maps/v2/wardRegions';
import { useUserStore } from '@/store/useUserStore';
import { useLocationStore, useSelectedRegion } from '@/store/useLocationStore';
import sys from '@/styles/system.module.css';
import styles from './LocationContextBar.module.css';

/**
 * 정보 화면 공통 컨텍스트바 — 전체 ↔ 선택 지역 피커 하나로 통합 (useLocationStore 단일 소스).
 * 동네지도와 동일한 동(ward) 목록·명칭을 쓴다. `trailing` 으로 지도 토글 등 우측 컨트롤을 붙인다.
 */
export default function LocationContextBar({ trailing }: { trailing?: ReactNode }) {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const region = useSelectedRegion(user?.id);
  const selectRegion = useLocationStore((s) => s.selectRegion);
  const selectAll = useLocationStore((s) => s.selectAll);
  const regions = useMemo(() => listWardRegions(), []);

  const handleChange = (name: string) => {
    if (!user) return;
    if (!name) {
      selectAll(user.id);
      return;
    }
    const next = regions.find((r) => r.name === name);
    if (next) selectRegion(next, user.id);
  };

  return (
    <div className={sys.contextBar}>
      <MapPin size={15} className={sys.contextIcon} />
      {/* 피커 = 칩 문법(sys.chipBtn) — 지역 선택 중엔 활성 칩. trailing 지도 토글 칩과 같은 위계 */}
      <label className={`${sys.chipBtn} ${region ? sys.chipBtnActive : ''} ${styles.selectWrap}`}>
        <span className={styles.srOnly}>{t('info.selectRegion')}</span>
        <select
          className={styles.selectNative}
          value={region?.name ?? ''}
          onChange={(event) => handleChange(event.target.value)}
        >
          <option value="">{t('info.allRegions')}</option>
          {regions.map((r) => (
            <option key={r.name} value={r.name}>{r.name}</option>
          ))}
        </select>
        <span className={styles.selectFace} aria-hidden>
          {region?.name ?? t('info.allRegions')}
          <ChevronDown size={14} className={styles.selectChevron} />
        </span>
      </label>
      <span className={sys.contextSpacer} />
      {trailing}
    </div>
  );
}
