import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MailOpen, UsersRound } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { WalkieTalkieEntryButton } from '@/components/dm/WalkieTalkieEntryButton';
import { fetchConversations } from '@/api/dm';
import { formatRelativeTime } from '@/lib/format';
import type { DmConversation } from '@/api/types';
import { AppImage } from '@/components/ui/AppImage';
import { useDmStore } from '@/store/useDmStore';
import { formatPriceVnd } from '../market/marketFormat';
import styles from './DmList.module.css';

export default function DmList() {
  const { t } = useTranslation();

  // 가격제안/약속 메시지는 서버 content(한국어 하드코딩) 대신 메타 기반으로 뷰어 로케일 미리보기 조립 (DM-5)
  const previewText = (c: DmConversation): string => {
    if (c.lastMessageType === 'price_offer' && c.lastMessageMeta?.amount != null) {
      return t('dm.offerSummary', {
        amount: formatPriceVnd(c.lastMessageMeta.amount, t),
        defaultValue: '가격 제안: {{amount}}',
      });
    }
    if (c.lastMessageType === 'appointment' && c.lastMessageMeta?.when) {
      const d = new Date(c.lastMessageMeta.when); // UTC → 뷰어 로컬 타임존 (DM-1)
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const when = `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      return t('dm.apptSummary', {
        when,
        place: c.lastMessageMeta.place ?? '',
        defaultValue: '약속 제안: {{when}} {{place}}',
      }).trim();
    }
    return c.lastMessagePreview ?? '';
  };
  // 서버는 enum 만 내리고 라벨은 뷰어 로케일로 매핑 (DmDetail 의 약속 상태 라벨과 동일 키 재사용)
  const tradeStatusLabel = (status: string): string =>
    status === 'ACCEPTED'
      ? t('dm.apptAccepted', { defaultValue: '확정' })
      : t('dm.apptProposed', { defaultValue: '제안됨' });

  const navigate = useNavigate();
  const refreshUnread = useDmStore((s) => s.refreshUnread);
  const [conversations, setConversations] = useState<DmConversation[]>([]);

  useEffect(() => {
    fetchConversations().then((convs) => {
      setConversations(convs);
      refreshUnread();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // group/open 은 photo_url(있으면), 없으면 title 만 — 대표 멤버 아바타 스택은 이 서브태스크 범위 밖(§3.5 최소선)
  const rowAvatar = (c: DmConversation) =>
    c.conversationType === 'direct' ? (c.otherUserAvatarUrl ?? undefined) : (c.photoUrl ?? undefined);
  const rowName = (c: DmConversation) =>
    c.conversationType === 'direct' ? (c.otherUserNickname ?? 'Unknown') : (c.title ?? t('dm.group', { defaultValue: '그룹톡방' }));

  return (
    <div className={styles.page}>
      <TopBar
        title={t('dm.title')}
        rightContent={
          <>
            <WalkieTalkieEntryButton />
            <button
              className={styles.headerAddBtn}
              type="button"
              onClick={() => navigate('/dm/group/new')}
              aria-label={t('dm.createGroup', { defaultValue: '그룹 만들기' })}
            >
              <UsersRound size={20} strokeWidth={2} />
            </button>
          </>
        }
      />

      <div className={styles.body}>
        {conversations.length === 0 ? (
          <StateBlock icon={MailOpen} title={t('dm.empty')} />
        ) : (
          <div className={styles.list}>
            {conversations.map((c) => (
              <button
                key={c.id}
                className={styles.row}
                onClick={() => navigate(`/dm/${c.id}`, { state: { conv: c } })}
              >
                <AppImage
                  src={rowAvatar(c)}
                  alt=""
                  className={styles.avatar}
                  variant="circle"
                />
                <div className={styles.info}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>
                      {rowName(c)}
                      {c.conversationType !== 'direct' && (
                        <span className={styles.memberCount}> ({c.memberCount})</span>
                      )}
                    </span>
                    <span className={styles.time}>{formatRelativeTime(c.lastMessageAt)}</span>
                  </div>
                  <div className={styles.preview}>
                    {previewText(c)}
                  </div>
                  {c.activeTrades.length > 0 && (
                    <div className={styles.tradeRow}>
                      {c.activeTrades.length === 1 ? (
                        <>
                          <span className={styles.tradeBadge} data-status={c.activeTrades[0].status}>
                            {tradeStatusLabel(c.activeTrades[0].status)}
                          </span>
                          <span className={styles.tradeTitle}>{c.activeTrades[0].listingTitle ?? ''}</span>
                        </>
                      ) : (
                        <span className={styles.tradeTitle}>
                          {t('dm.tradeCount', {
                            count: c.activeTrades.length,
                            defaultValue: '거래 {{count}}건 진행중',
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {c.unreadCount > 0 && (
                  <span className={styles.badge}>{c.unreadCount}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
