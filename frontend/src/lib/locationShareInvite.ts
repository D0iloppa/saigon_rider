import { sendMessage } from '@/api/dm';
import type { DmMessage } from '@/api/types';

/**
 * 위치공유 시작 시 상대방에게 초대카드(location_share_invite)를 보낸다 — 워키토키
 * 초대카드(`walkieTalkieJoin.ts`)와 같은 이유: 상대는 위치공유가 시작된 걸 모를 수 있다.
 * 전송 실패는 공유 시작 자체를 막지 않는다 — 조용히 null 반환.
 */
export async function sendLocationShareInvite(
  conversationId: string,
  nickname: string | undefined,
  /** 실시간 위치공유 채널(2026-08-29) id — 초대카드 "참여하기"가 이 채널에 참가한다. */
  channelId?: string,
): Promise<DmMessage | null> {
  try {
    return await sendMessage(conversationId, '', {
      messageType: 'location_share_invite',
      meta: { invitedByName: nickname ?? '', ...(channelId ? { channelId } : {}) },
    });
  } catch {
    return null;
  }
}
