import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchMessages, sendMessage, markRead } from '@/api/dm';
import { useUserStore } from '@/store/useUserStore';
import { loadSession } from '@/lib/session';
import { formatRelativeTime } from '@/lib/format';
import type { DmConversation, DmMessage } from '@/api/types';
import styles from './DmDetail.module.css';

export default function DmDetail() {
  const { t } = useTranslation();
  const { conversationId } = useParams<{ conversationId: string }>();
  const locationState = useLocation().state as { conv?: DmConversation } | null;
  const user = useUserStore((s) => s.user);
  const session = loadSession();

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const otherName = locationState?.conv?.otherUserNickname ?? 'Chat';

  useEffect(() => {
    if (!conversationId) return;
    fetchMessages(conversationId).then((res) => {
      setMessages(res.items);
      markRead(conversationId);
    });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(async () => {
      const last = messages[messages.length - 1];
      const res = await fetchMessages(conversationId, 1, last?.createdAt);
      if (res.items.length > 0) {
        setMessages((prev) => [...prev, ...res.items]);
        markRead(conversationId);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [conversationId, messages]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !conversationId || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      const msg = await sendMessage(conversationId, text);
      setMessages((prev) => [...prev, msg]);
    } finally {
      setSending(false);
    }
  };

  const myId = session?.userId ?? user?.id;

  return (
    <div className={styles.page}>
      <TopBar title={otherName} />

      <div className={styles.messages} ref={listRef}>
        {messages.map((m) => {
          const isMine = m.senderId === myId;
          return (
            <div
              key={m.id}
              className={`${styles.bubble} ${isMine ? styles.mine : styles.theirs}`}
            >
              {m.content && <div className={styles.text}>{m.content}</div>}
              {m.imageUrl && <img src={m.imageUrl} alt="" className={styles.msgImg} />}
              <div className={styles.meta}>
                {formatRelativeTime(m.createdAt)}
                {isMine && m.readAt && <span className={styles.read}> ✓</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.inputBar}>
        <input
          className={styles.input}
          placeholder={t('dm.inputPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          ↗
        </button>
      </div>
    </div>
  );
}
