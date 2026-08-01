import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import sys from '@/styles/system.module.css';
import { fetchTickets, createTicket, type SupportTicket } from '@/api/support';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import styles from './CustomerSupport.module.css';

type View = 'list' | 'new';

const STATUS_CLASS: Record<string, string> = {
  OPEN: styles.badgeOpen,
  IN_PROGRESS: styles.badgeInProgress,
  RESOLVED: styles.badgeResolved,
};

export default function CustomerSupport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('list');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 본문 textarea 아래 제출 버튼뿐이면
  // 스크롤로도 못 뺀다 — 키보드 높이만큼 하단 padding 을 더한다.
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    fetchTickets().then(setTickets).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const ticket = await createTicket(title.trim(), body.trim());
      setTickets((prev) => [ticket, ...prev]);
      setTitle('');
      setBody('');
      setView('list');
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = (s: string) => t(`support.status_${s.toLowerCase()}`, s);

  return (
    <>
      <TopBar
        title={t('support.title')}
        onBack={view === 'new' ? () => setView('list') : undefined}
      />

      {view === 'list' && (
        <div className={styles.body}>
          <button className={styles.newBtn} onClick={() => setView('new')}>
            {t('support.newTicket')}
          </button>

          {tickets.length === 0 ? (
            <div className={sys.card} style={{ margin: 0 }}>
              <StateBlock icon={MessageCircle} title={t('support.empty')} />
            </div>
          ) : (
            tickets.map((tk) => (
              <div key={tk.id} className={styles.card} onClick={() => navigate(`/settings/support/${tk.id}`)}>
                {tk.has_unread_reply && <div className={styles.unreadDot} />}
                <div className={styles.cardTitle}>{tk.title}</div>
                <div className={styles.cardMeta}>
                  <span className={`${styles.badge} ${STATUS_CLASS[tk.status] ?? ''}`}>
                    {statusLabel(tk.status)}
                  </span>
                  <span>{new Date(tk.created_at).toLocaleDateString()}</span>
                  {tk.reply_count > 0 && <span>{t('support.reply_count', { count: tk.reply_count })}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {view === 'new' && (
        <div className={styles.form} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
          <div className={styles.formCard}>
            <div>
              <p className={styles.label}>{t('support.fieldTitle')}</p>
              <input
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('support.titlePlaceholder')}
                maxLength={200}
              />
            </div>
            <div>
              <p className={styles.label}>{t('support.fieldBody')}</p>
              <textarea
                className={styles.textarea}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('support.bodyPlaceholder')}
              />
            </div>
          </div>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !body.trim()}
          >
            {submitting ? t('support.submitting') : t('support.submit')}
          </button>
        </div>
      )}
    </>
  );
}
