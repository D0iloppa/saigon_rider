import { useLocationStore } from '@/store/useLocationStore';
import { GATE_ACCURACY_LIMIT_M, type LocationGateReason } from '@/lib/serviceLocation';

export interface ServiceAvailability {
  /** 실행형·기록형 기능(경로안내·퀘스트 수행 등)을 지금 쓸 수 있는가. */
  available: boolean;
  /** 못 쓰는 사유. available 이면 null. 문구는 i18n `locationGate.<reason>.*`. */
  reason: LocationGateReason | null;
  /** 아직 측위가 진행 중 — 버튼을 "확인 중"으로 두고 실패로 단정하지 않는다. */
  checking: boolean;
}

/**
 * **진입점 버튼 제어용 판정** — 대표 지시 2026-08-13 11:44.
 *
 * *"사용자가 버튼을 누른 후 가능한지 측정을 해야 하니? / 화면 데이터 로딩될 때 백으로 측정해서
 * 버튼을 제어해야지"*
 *
 * 측위는 이미 화면 로딩 시 `useLocationStore.ensureLocation()` 이 **세션당 1회** 하고 있다.
 * 이 훅은 그 결과를 읽기만 한다 — **여기서 새로 측정하지 않는다**(측위 주체는 스토어 하나,
 * service-rules 원칙 4). 그래서 버튼은 사용자가 누르기 전에 이미 제 상태를 알고 있다.
 *
 * **판정은 실제 게이트(`requireServiceLocation`)와 같은 기준이어야 한다** — 더 느슨하면
 * "버튼은 열려 있는데 탭하면 막히는" 상태가 되어 이 훅의 목적 자체가 무너진다
 * (코드리뷰 지적 2026-08-13). 그래서 세 가지를 모두 본다:
 *   ① 실측 좌표인가(`coordsSource === 'device'`) — 폴백·실패는 불가
 *   ② 잠금 사유가 없는가(`gateReason`) — 주행 중 권역 이탈도 여기로 들어온다
 *   ③ 정확도가 게이트 허용치 안인가(`GATE_ACCURACY_LIMIT_M`)
 */
export function useServiceAvailability(): ServiceAvailability {
  const coordsSource = useLocationStore((s) => s.coordsSource);
  const gateReason = useLocationStore((s) => s.gateReason);
  const accuracyM = useLocationStore((s) => s.coordsAccuracyM);
  const resolving = useLocationStore((s) => s.resolving);

  const tooCoarse = accuracyM != null && accuracyM > GATE_ACCURACY_LIMIT_M;
  if (coordsSource === 'device' && !gateReason && !tooCoarse) {
    return { available: true, reason: null, checking: false };
  }
  if (gateReason) return { available: false, reason: gateReason, checking: false };
  if (tooCoarse) return { available: false, reason: 'inaccurate', checking: false };
  if (resolving) return { available: false, reason: null, checking: true };
  // 아직 측위를 시도조차 안 한 상태(사유 없음)는 '확인 중'으로 취급한다 — 사유 없이
  // 막아두면 사용자에게 이유를 설명할 수 없다. 이 상태가 오래 남으면 화면이
  // ensureLocation() 을 부르지 않고 있다는 뜻이다(그 자체가 결함).
  return { available: false, reason: null, checking: true };
}
