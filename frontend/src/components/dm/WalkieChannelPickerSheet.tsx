import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Users } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AppImage } from '@/components/ui/AppImage';
import { fetchConversations } from '@/api/dm';
import { formatRelativeTime } from '@/lib/format';
import type { DmConversation } from '@/api/types';
import styles from './WalkieChannelPickerSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (conversation: DmConversation) => void;
  title?: string;
}

// direct=1:1 상대명, group/open=방제목 — DmList.tsx 의 분기 패턴 재사용.
const rowName = (c: DmConversation) =>
  c.conversationType === 'direct' ? (c.otherUserNickname ?? '') : (c.title ?? '');

/**
 * 워키토키 채널 선택 바텀시트(대표 지시 2026-08-27) — 롱프레스 "채널 변경" /
 * 진입버튼 "최근 대화 선택" 두 곳에서 공용으로 쓰는 목록 UI.
 * 섹션 라벨 + 타임스탬프 + direct/group 아이콘 구분 + 검색(클라이언트 필터)을 제공한다.
 */
export function WalkieChannelPickerSheet({ open, onClose, onSelect, title }: Props) {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    fetchConversations().then(setConversations).catch(() => setConversations([]));
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => rowName(c).toLowerCase().includes(q));
  }, [conversations, query]);

  const handleSelect = (c: DmConversation) => {
    onSelect(c);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <h2 className={styles.sheetTitle}>
          {title ?? t('walkieTalkie.changeChannelTitle', { defaultValue: '채널 변경' })}
        </h2>

        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('walkieTalkie.searchChannelPlaceholder', { defaultValue: '채널 검색' })}
          />
        </div>

        {!query && conversations.length > 0 && (
          <p className={styles.sectionLabel}>
            {t('walkieTalkie.recentChannelsLabel', { defaultValue: '최근 연결했던 채널' })}
          </p>
        )}

        {filtered.length === 0 ? (
          <p className={styles.empty}>
            {query
              ? t('walkieTalkie.searchNoResults', { defaultValue: '검색 결과가 없어요' })
              : t('walkieTalkie.noConversations', { defaultValue: '대화가 없어요' })}
          </p>
        ) : (
          <div className={styles.list}>
            {filtered.map((c) => {
              const isDirect = c.conversationType === 'direct';
              return (
                <button key={c.id} type="button" className={styles.item} onClick={() => handleSelect(c)}>
                  {isDirect ? (
                    <AppImage src={c.otherUserAvatarUrl ?? undefined} alt="" className={styles.avatar} variant="circle" />
                  ) : c.photoUrl ? (
                    <AppImage src={c.photoUrl} alt="" className={styles.avatar} variant="circle" />
                  ) : (
                    <span className={styles.groupIcon}>
                      <Users size={18} strokeWidth={2} />
                    </span>
                  )}
                  <span className={styles.itemInfo}>
                    <span className={styles.itemName}>{rowName(c) || t('dm.group', { defaultValue: '그룹톡방' })}</span>
                  </span>
                  <span className={styles.itemTime}>{formatRelativeTime(c.lastMessageAt)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
