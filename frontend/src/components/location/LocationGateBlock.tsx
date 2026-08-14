import { useTranslation } from 'react-i18next';
import { MapPinOff, Crosshair, Timer, SatelliteDish, Settings, Globe2 } from 'lucide-react';
import StateBlock from '@/components/ui/StateBlock';
import { native } from '@/lib/native';
import type { LocationGateReason } from '@/lib/serviceLocation';

interface Props {
  reason: LocationGateReason;
  /** 재시도 — 호출부의 게이트 재실행. */
  onRetry: () => void;
  /**
   * 권역 밖일 때 Google 지도 핸드오프를 노출할지 (정책안 D-1, **대표 승인 대기**).
   *
   * 기본값 false = 노출하지 않는다 — "우리 서비스 범위가 아니다"가 메시지인데 대안 앱을
   * 주면 그 메시지가 무너진다. 측위 실패(권한·타임아웃·불가)는 원인이 우리 쪽이므로
   * 호출부가 이 값을 true 로 주면 노출된다. 승인이 나면 기본값만 바꾼다.
   */
  onOpenAlternative?: () => void;
  alternativeLabel?: React.ReactNode;
}

const ICONS: Record<LocationGateReason, typeof MapPinOff> = {
  outside_area: MapPinOff,
  scope_all: Globe2,
  permission: Crosshair,
  timeout: Timer,
  unavailable: SatelliteDish,
  inaccurate: Crosshair,
};

/**
 * 실행형·기록형 화면의 **위치 게이트 차단면** — `requireServiceLocation()` 이 `ok:false` 일 때
 * 사유별 안내를 한 문법으로 보여준다(정책안 §3-B: 화면마다 문구를 따로 쓰면 다시 갈린다).
 *
 * `permission` 사유에만 OS 설정 앱 딥링크를 붙인다 — 권한 거부는 앱 안에서 되돌릴 수 없어
 * 문구만 있으면 사용자가 탈출할 수 없다(정책안 D-3). 웹에는 커스텀 Gps 플러그인 구현이
 * 없으므로 네이티브에서만 노출한다.
 */
export default function LocationGateBlock({
  reason, onRetry, onOpenAlternative, alternativeLabel,
}: Props) {
  const { t } = useTranslation();
  const showSettings = reason === 'permission' && native.isNative;

  const secondary = showSettings
    ? { label: t('locationGate.openSettings', '위치 설정 열기'), action: () => { void native.openAppSettings(); } }
    : onOpenAlternative && alternativeLabel
      ? { label: alternativeLabel, action: onOpenAlternative }
      : null;

  return (
    <StateBlock
      icon={ICONS[reason]}
      tone={reason === 'outside_area' ? 'neutral' : 'error'}
      title={t(`locationGate.${reason}.title`)}
      desc={t(`locationGate.${reason}.desc`)}
      // 모든 사유에 재시도를 준다 — outside_area 에서 액션을 전부 빼면 이 블록이 위치 버튼을
      // 대체하는 화면(InfoFloodReport)에서 버튼이 하나도 없는 막다른 길이 된다(코드리뷰 지적
      // 2026-08-13). 권역 밖도 사용자가 이동한 뒤 다시 누를 수 있다.
      actionLabel={t('locationGate.retry', '다시 시도')}
      onAction={onRetry}
      secondaryLabel={secondary ? (
        showSettings
          ? <><Settings size={14} strokeWidth={2.4} aria-hidden="true" />{secondary.label}</>
          : secondary.label
      ) : undefined}
      onSecondary={secondary ? secondary.action : undefined}
    />
  );
}
