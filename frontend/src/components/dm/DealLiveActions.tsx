import type { DmMessage } from '@/api/types';
import { LocationShareWidget } from './LocationShareWidget';

interface Props {
  conversationId: string;
  /** 있으면 그 약속의 정밀도 창 정책, 없으면 약속과 독립된 세션 TTL 공유(대표 지시 2026-08-29). */
  appointmentId?: string | null;
  nickname?: string;
  onInviteSent?: (message: DmMessage) => void;
}

/**
 * 거래 DM 슬롯 컨테이너 (P6, §7).
 *
 * 워키토키(`WalkieTalkieFloatingButton`)는 대화 전역 플로팅으로 이미 떠 있어 이 컨테이너에
 * 넣지 않는다 — 여기는 위치공유 위젯 슬롯만 잡는다. 두 위젯은 서로를 모른다
 * (§7 "코드·테이블·API를 공유하지 않는다").
 */
export function DealLiveActions({ conversationId, appointmentId, nickname, onInviteSent }: Props) {
  return (
    <LocationShareWidget
      conversationId={conversationId}
      appointmentId={appointmentId ?? undefined}
      nickname={nickname}
      onInviteSent={onInviteSent}
    />
  );
}
