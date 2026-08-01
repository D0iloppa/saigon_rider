import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MailOpen } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
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
  const navigate = useNavigate();
  const refreshUnread = useDmStore((s) => s.refreshUnread);
  const [conversations, setConversations] = useState<DmConversation[]>([]);

  useEffect(() => {
    fetchConversations().then((convs) => {
      setConversations(convs);
      refreshUnread();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.page}>
      <TopBar title={t('dm.title')} />

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
                  src={c.otherUserAvatarUrl ?? undefined}
                  alt=""
                  className={styles.avatar}
                  variant="circle"
                />
                <div className={styles.info}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{c.otherUserNickname ?? 'Unknown'}</span>
                    <span className={styles.time}>{formatRelativeTime(c.lastMessageAt)}</span>
                  </div>
                  <div className={styles.preview}>
                    {previewText(c)}
                  </div>
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
