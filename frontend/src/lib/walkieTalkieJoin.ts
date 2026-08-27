import { sendMessage } from '@/api/dm';
import type { DmMessage } from '@/api/types';
import { useWalkieTalkieBubbleStore, type WalkieTalkieConversationMeta } from '@/store/useWalkieTalkieBubbleStore';

/**
 * 워키토키 채널 참여 공용 로직 (DmDetail.tsx `handleWalkieJoin`에서 추출, 2026-08-27).
 * 대상 대화를 앱 전역 버블 스토어에 활성화하고, 상대방이 채널 존재를 모를 수 있으므로
 * 초대카드(walkie_invite) 메시지를 함께 전송한다.
 *
 * 초대카드 전송 실패는 참여 자체를 막지 않는다 — 조용히 null 반환.
 */
export async function joinWalkieChannel(
  conversationId: string,
  meta: WalkieTalkieConversationMeta,
  nickname: string | undefined,
): Promise<DmMessage | null> {
  useWalkieTalkieBubbleStore.getState().setActiveConversation(conversationId, meta);
  try {
    return await sendMessage(conversationId, '', {
      messageType: 'walkie_invite',
      meta: { invitedByName: nickname ?? '' },
    });
  } catch {
    return null;
  }
}
