import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Flag } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { AppImage } from '@/components/ui/AppImage';
import sys from '@/styles/system.module.css';
import { fetchTickets, createTicket, fetchReports, cancelReport, type SupportTicket, type Report } from '@/api/support';
import { noItemImage } from '@/pages/market/noItemImage';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useConfirmStore } from '@/store/useConfirmStore';
import { toast } from '@/components/ui/Toast';
import styles from './CustomerSupport.module.css';
import { formatVnDate } from '@/lib/vnTime';

type Tab = 'inquiry' | 'report';
type View = 'list' | 'new';

const STATUS_CLASS: Record<string, string> = {
  OPEN: styles.badgeOpen,
  IN_PROGRESS: styles.badgeInProgress,
  RESOLVED: styles.badgeResolved,
};

const REPORT_STATUS_CLASS: Record<string, string> = {
  REVIEWING: styles.badgeOpen,
  RESOLVED: styles.badgeResolved,
  REJECTED: styles.badgeRejected,
  CANCELLED: styles.badgeCancelled,
};

export default function CustomerSupport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('inquiry');
  const [view, setView] = useState<View>('list');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  const openConfirm = useConfirmStore((s) => s.open);
  // iOS 네이티브는 키보드가 순수 오버레이라 본문 textarea 아래 제출 버튼뿐이면
  // 스크롤로도 못 뺀다 — 키보드 높이만큼 하단 padding 을 더한다.
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    fetchTickets().then(setTickets).catch(() => {});
    fetchReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setReportsLoading(false));
  }, []);

  const goToReportTarget = (r: Report) => {
    if (r.target_type === 'LISTING' && r.listing_id) {
      navigate(`/market/${r.listing_id}`);
    }
  };

  // R-3(260817 §12-B) — 되돌릴 수 없는 동작(취소 후 재신고 불가)이라 ConfirmDialog 를 거친다.
  const handleCancelReport = (r: Report) => {
    openConfirm(
      t('support.reportCancelConfirmMsg'),
      () => {
        cancelReport(r.id)
          .then((updated) => {
            setReports((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            toast.success(t('support.reportCancelSuccess'));
          })
          .catch(() => toast.error(t('support.reportCancelError')));
      },
      {
        confirmLabel: t('support.reportCancelConfirmBtn'),
        cancelLabel: t('support.reportCancelKeepBtn'),
      },
    );
  };

  const reportStatusLabel = (s: string) => t(`support.reportStatus_${s.toLowerCase()}`, s);
  const reportReasonLabel = (reason: string) => t(`support.reportReason_${reason}`, reason);
  const reportTargetLabel = (r: Report) =>
    r.target_title ?? t(`support.reportTargetFallback_${r.target_type}`, r.target_type);

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
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'inquiry' ? styles.tabActive : ''}`}
            onClick={() => setTab('inquiry')}
          >
            {t('support.tabInquiry')}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'report' ? styles.tabActive : ''}`}
            onClick={() => setTab('report')}
          >
            {t('support.tabReport')}
          </button>
        </div>
      )}

      {view === 'list' && tab === 'inquiry' && (
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
              <button key={tk.id} type="button" className={styles.card} onClick={() => navigate(`/settings/support/${tk.id}`)}>
                {tk.has_unread_reply && (
                  <>
                    <div className={styles.unreadDot} />
                    <span className={styles.srOnly}>{t('support.unreadReply', { defaultValue: '읽지 않은 답변 있음' })}</span>
                  </>
                )}
                <div className={styles.cardTitle}>{tk.title}</div>
                <div className={styles.cardMeta}>
                  <span className={`${styles.badge} ${STATUS_CLASS[tk.status] ?? ''}`}>
                    {statusLabel(tk.status)}
                  </span>
                  <span>{formatVnDate(tk.created_at)}</span>
                  {tk.reply_count > 0 && <span>{t('support.reply_count', { count: tk.reply_count })}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {view === 'list' && tab === 'report' && (
        <div className={styles.body}>
          {reportsLoading ? (
            <SkeletonRows count={3} />
          ) : reports.length === 0 ? (
            <div className={sys.card} style={{ margin: 0 }}>
              <StateBlock icon={Flag} title={t('support.reportEmpty')} />
            </div>
          ) : (
            reports.map((r) => {
              const clickable = r.target_type === 'LISTING' && !!r.listing_id;
              return (
                <div key={r.id} className={styles.reportCard}>
                  <button
                    type="button"
                    className={styles.reportCardMain}
                    onClick={() => goToReportTarget(r)}
                    disabled={!clickable}
                  >
                    {r.target_type === 'LISTING' && (
                      <AppImage
                        src={r.target_thumbnail_url ?? noItemImage()}
                        alt={reportTargetLabel(r)}
                        className={styles.reportThumb}
                      />
                    )}
                    <div className={styles.reportBody}>
                      <div className={styles.cardTitle}>{reportTargetLabel(r)}</div>
                      <div className={styles.cardMeta}>
                        <span className={`${styles.badge} ${REPORT_STATUS_CLASS[r.status] ?? ''}`}>
                          {reportStatusLabel(r.status)}
                        </span>
                        <span>{reportReasonLabel(r.reason)}</span>
                        <span>{formatVnDate(r.created_at)}</span>
                      </div>
                    </div>
                  </button>
                  {r.can_cancel && (
                    <button
                      type="button"
                      className={styles.reportCancelBtn}
                      onClick={() => handleCancelReport(r)}
                    >
                      {t('support.reportCancelBtn')}
                    </button>
                  )}
                </div>
              );
            })
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
