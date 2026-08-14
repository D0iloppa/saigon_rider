import { useTranslation } from 'react-i18next';
import { MapPinOff, Crosshair, Timer, SatelliteDish, Globe2 } from 'lucide-react';
import { useServiceAvailability } from '@/hooks/useServiceAvailability';
import { useLocationStore } from '@/store/useLocationStore';
import { native } from '@/lib/native';
import type { LocationGateReason } from '@/lib/serviceLocation';
import styles from './ServiceGateNotice.module.css';

const ICONS: Record<LocationGateReason, typeof MapPinOff> = {
  outside_area: MapPinOff,
  scope_all: Globe2,
  permission: Crosshair,
  timeout: Timer,
  unavailable: SatelliteDish,
  inaccurate: Crosshair,
};

/**
 * 실행형 기능(경로안내 등)을 지금 쓸 수 없는 이유를 **화면 안에서** 한 줄로 알린다.
 *
 * 대표 지시 2026-08-13 11:38 *"화면 안에서 처리해 / 질 떨어지게 만들지 말고"* +
 * 11:44 *"화면 데이터 로딩될 때 백으로 측정해서 버튼을 제어해야지"*.
 * 화면을 전체화면 안내로 갈아치우지 않고, 목록·상세는 그대로 보이되 **막힌 버튼 옆에
 * 이유만** 붙인다. 판정은 `useServiceAvailability()`(스토어 결과 읽기 전용)라 새로 측위하지 않는다.
 *
 * 쓸 수 있는 상태이거나 아직 확인 중이면 아무것도 렌더하지 않는다.
 */
export default function ServiceGateNotice() {
  const { t } = useTranslation();
  const { available, reason, checking } = useServiceAvailability();
  const setMode = useLocationStore((s) => s.setMode);

  if (available || checking || !reason) return null;

  const Icon = ICONS[reason];
  const showSettings = reason === 'permission' && native.isNative;

  /**
   * 액션은 사유별로 다르다 — 종전에는 어느 사유든 `setMode('gps')` 를 "다시 시도"로 걸어서,
   * '전체 지역'을 **직접 고른** 사용자가 그 버튼을 누르면 표시 범위가 조용히 3km 로 좁아지고
   * 홈·마켓·지도 목록이 함께 축소됐다(코드리뷰 지적 2026-08-13). 지금은:
   *   - `scope_all`(사용자 선택) → 라벨을 '내 위치로 전환'으로 바꿔 **무슨 일이 일어나는지 밝힌다**
   *   - `permission`            → OS 설정 앱으로
   *   - 그 외(측위 실패·권역 밖) → 재측위 시도
   */
  const action = showSettings
    ? { label: t('locationGate.openSettings', '위치 설정 열기'), run: () => { void native.openAppSettings(); } }
    : reason === 'scope_all'
      ? { label: t('locationGate.switchToGps', '내 위치로 전환'), run: () => { void setMode('gps'); } }
      : { label: t('locationGate.retry', '다시 시도'), run: () => { void setMode('gps'); } };

  return (
    <div className={styles.notice} role="status">
      <Icon size={15} strokeWidth={2.2} className={styles.icon} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.title}>{t(`locationGate.${reason}.title`)}</div>
        <div className={styles.desc}>{t('locationGate.routeUnavailable', '경로 안내는 이용할 수 없어요.')}</div>
      </div>
      <button className={styles.action} onClick={action.run}>{action.label}</button>
    </div>
  );
}
