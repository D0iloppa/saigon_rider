import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
import { native, type WalkieTalkieCapability } from '@/lib/native';
import type { DmConversation } from '@/api/types';
import { useUserStore } from '@/store/useUserStore';
import { useWalkieTalkieBubbleStore } from '@/store/useWalkieTalkieBubbleStore';
import { joinWalkieChannel } from '@/lib/walkieTalkieJoin';
import { WalkieChannelPickerSheet } from './WalkieChannelPickerSheet';
import styles from './WalkieTalkieEntryButton.module.css';

/**
 * 워키토키 진입 아이콘(대표 지시 2026-08-27) — 홈/DM목록 헤더에서 재사용.
 *
 * 비토글: 이미 활성 대화가 있으면 캡슐을 끄지 않고 어텐션 핑(짧은 흔들림)만 준다.
 * 활성 대화가 없으면 최근 대화 목록에서 골라 그 대화로 참여한다.
 */
export function WalkieTalkieEntryButton() {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const activeConversationId = useWalkieTalkieBubbleStore((s) => s.activeConversationId);
  const ping = useWalkieTalkieBubbleStore((s) => s.ping);
  const open = useWalkieTalkieBubbleStore((s) => s.open);

  const [capability, setCapability] = useState<WalkieTalkieCapability | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    native.walkieTalkie.getCapability().then(setCapability).catch(() => setCapability(null));
  }, []);

  if (!capability?.available || !capability.floatingButton) return null;

  const handleClick = () => {
    if (activeConversationId) {
      open();
      ping();
      return;
    }
    setSheetOpen(true);
  };

  const handleSelect = (c: DmConversation) => {
    const isGroup = c.conversationType !== 'direct';
    joinWalkieChannel(c.id, { name: isGroup ? (c.title ?? '') : (c.otherUserNickname ?? ''), isGroup }, user?.nickname);
  };

  return (
    <>
      <button
        type="button"
        className={styles.entryBtn}
        onClick={handleClick}
        aria-label={t('walkieTalkie.entryButtonLabel', { defaultValue: '워키토키' })}
      >
        <Mic size={20} strokeWidth={2} />
      </button>

      <WalkieChannelPickerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={handleSelect}
        title={t('walkieTalkie.recentChannelsTitle', { defaultValue: '최근 대화 선택' })}
      />
    </>
  );
}
