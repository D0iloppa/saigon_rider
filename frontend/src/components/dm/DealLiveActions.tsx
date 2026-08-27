import { LocationShareWidget } from './LocationShareWidget';

interface Props {
  appointmentId: string | null;
}

/**
 * 거래 DM 슬롯 컨테이너 (P6, §7).
 *
 * 워키토키(`WalkieTalkieFloatingButton`)는 대화 전역 플로팅으로 이미 떠 있어 이 컨테이너에
 * 넣지 않는다 — 여기는 약속과 연동되는 위치공유 위젯 슬롯만 잡는다. 두 위젯은 서로를 모른다
 * (§7 "코드·테이블·API를 공유하지 않는다").
 */
export function DealLiveActions({ appointmentId }: Props) {
  if (!appointmentId) return null;
  return <LocationShareWidget appointmentId={appointmentId} />;
}
