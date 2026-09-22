import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Flag, AlertCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { AppImage } from '@/components/ui/AppImage';
import { BottomSheet } from '@/components/ui/BottomSheet';
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
  const location = useLocation();
  // 거래 상세(TradeTransaction)에서 "고객센터에 문의하기" 딥링크로 넘어올 때 실은 초안.
  // 한 번 소비하면 곧바로 history state 를 비워 뒤로가기 재진입 시 재프리필되지 않게 한다.
  const inquiryDraft = (location.state as { inquiryDraft?: { title: string; body: string } } | null)
    ?.inquiryDraft;
  // 탭 상태는 URL 쿼리에 올린다 — 로컬 useState 면 매물 상세로 갔다 뒤로가기 했을 때
  // 컴포넌트가 재마운트되며 '문의' 탭으로 초기화된다(2026-08-18 실기기 지적).
  // 쿼리에 있으면 브라우저 히스토리가 탭까지 복원한다(마켓 `?view=map` 선례와 동일 방식).
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'report' ? 'report' : 'inquiry';
  const setTab = (next: Tab) => {
    // replace: 탭 전환은 히스토리에 쌓지 않는다(뒤로가기가 탭 토글을 되짚게 되면 성가시다)
    setSearchParams(next === 'report' ? { tab: 'report' } : {}, { replace: true });
  };
  const [view, setView] = useState<View>(inquiryDraft ? 'new' : 'list');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  // R-1(260819 W3) — 신고 상세(코멘트·첨부사진·처리 결과) 열람용.
  const [detailReport, setDetailReport] = useState<Report | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState(false);
  // F-CS-01 FR-3 제안 ① — 딥링크 진입의 거래 컨텍스트는 상단 고정 행으로 고정한다(제목 입력칸이 아니다).
  // useState 초기값으로 한 번만 캡처 — 소비 후 history state 를 비우는 아래 effect 가 location.state
  // 를 지워도(줄 76-80) 이 배너는 폼이 유지되는 동안 사라지지 않는다.
  const [draftContext] = useState(inquiryDraft?.title ?? null);
  const [body, setBody] = useState(inquiryDraft?.body ?? '');
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  const openConfirm = useConfirmStore((s) => s.open);
  // iOS 네이티브는 키보드가 순수 오버레이라 본문 textarea 아래 제출 버튼뿐이면
  // 스크롤로도 못 뺀다 — 키보드 높이만큼 하단 padding 을 더한다.
  const isIosNative = native.platform === 'ios';

  const loadTickets = () => {
    setTicketsLoading(true);
    setTicketsError(false);
    fetchTickets()
      .then(setTickets)
      .catch(() => setTicketsError(true))
      .finally(() => setTicketsLoading(false));
  };

  const loadReports = () => {
    setReportsLoading(true);
    setReportsError(false);
    fetchReports()
      .then(setReports)
      .catch(() => setReportsError(true))
      .finally(() => setReportsLoading(false));
  };

  useEffect(() => {
    loadTickets();
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inquiryDraft) return;
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            // FR-2 제안① — 취소 버튼이 이 시트 안으로 옮겨왔으니, 취소 후에도 시트를 닫지 않고
            // 갱신된 상태(취소함 배지 · 취소 버튼 소멸)를 그 자리에서 보여준다.
            setDetailReport((prev) => (prev && prev.id === updated.id ? updated : prev));
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
  // W7-2(260820, 실기기 지적) — 매핑 없는 사유가 들어와도 영문 enum 을 그대로 보여주지 않는다.
  // 매핑은 support.reportReason_* 로 전 target_type 사유 값을 실측해 빠짐없이 채웠고(W7 보고 참조),
  // 그래도 미지의 값이 오면 "기타"(reportReason_OTHER)로 폴백한다.
  const reportReasonLabel = (reason: string) => t(`support.reportReason_${reason}`, t('support.reportReason_OTHER'));
  const reportTargetLabel = (r: Report) =>
    r.target_title ?? t(`support.reportTargetFallback_${r.target_type}`, r.target_type);
  // W7-1(260820, 실기기 지적) — 대상 종류(매물/유저/채팅/게시물/댓글/후기/업체) 칩. 부모 맥락
  // (예: "○○업체의 후기") 노출은 이번 범위 밖 — 백엔드 응답 확장 필요해 대표 확정으로 제외.
  const reportTargetTypeLabel = (r: Report) => t(`support.reportTargetType_${r.target_type}`, r.target_type);

  // F-CS-01 FR-3 제안 ③ — 제목 필수 해제. 딥링크 컨텍스트가 있으면 그걸 그대로 티켓 제목으로
  // 쓰고, 없으면 본문 첫 줄을 제목으로 삼는다(목록 카드 제목은 이 값으로 뜬다).
  const handleSubmit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const trimmedBody = body.trim();
      const derivedTitle = draftContext ?? trimmedBody.split('\n')[0].slice(0, 200);
      const ticket = await createTicket(derivedTitle, trimmedBody);
      setTickets((prev) => [ticket, ...prev]);
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

          {ticketsLoading ? (
            <SkeletonRows count={3} />
          ) : ticketsError ? (
            <div className={sys.card} style={{ margin: 0 }}>
              <StateBlock
                icon={AlertCircle}
                tone="error"
                title={t('support.loadError')}
                actionLabel={t('common.retry')}
                onAction={loadTickets}
              />
            </div>
          ) : tickets.length === 0 ? (
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
          ) : reportsError ? (
            <div className={sys.card} style={{ margin: 0 }}>
              <StateBlock
                icon={AlertCircle}
                tone="error"
                title={t('support.reportLoadError')}
                actionLabel={t('common.retry')}
                onAction={loadReports}
              />
            </div>
          ) : reports.length === 0 ? (
            <div className={sys.card} style={{ margin: 0 }}>
              <StateBlock icon={Flag} title={t('support.reportEmpty')} />
            </div>
          ) : (
            reports.map((r) => {
              return (
                // FR-2 제안① — [신고 취소]를 목록 카드에서 뺐다. 이제 카드는 이동만 하는 조회 축이고,
                // 취소는 상세 시트(FR-4) 하단의 단독 위험 톤 행으로만 있다.
                <button
                  key={r.id}
                  type="button"
                  className={styles.reportCard}
                  onClick={() => setDetailReport(r)}
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
                    {r.parent_context && (
                      <div className={styles.cardMeta}>{r.parent_context}</div>
                    )}
                    <div className={styles.cardMeta}>
                      <span className={`${styles.badge} ${REPORT_STATUS_CLASS[r.status] ?? ''}`}>
                        {reportStatusLabel(r.status)}
                      </span>
                      <span className={`${styles.badge} ${styles.badgeType}`}>
                        {reportTargetTypeLabel(r)}
                      </span>
                      <span>{reportReasonLabel(r.reason)}</span>
                      <span>{formatVnDate(r.created_at)}</span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {view === 'new' && (
        <div className={styles.form} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
          {/* FR-3 제안① — 딥링크 거래 컨텍스트는 편집 가능한 제목칸이 아니라 고정 행으로 보여준다. */}
          {draftContext && <div className={styles.contextRow}>{draftContext}</div>}
          <div className={styles.formCard}>
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
            disabled={submitting || !body.trim()}
          >
            {submitting ? t('support.submitting') : t('support.submit')}
          </button>
        </div>
      )}

      {/* R-1(260819 W3) — 신고 상세: 내가 남긴 코멘트·첨부사진·처리 결과 되보기 */}
      <BottomSheet open={!!detailReport} onClose={() => setDetailReport(null)} height="fit">
        {detailReport && (
          <div className={styles.detailBody}>
            <div className={styles.detailSection}>
              {/* W7-1(260820, 실기기 지적) — 상태 칩이 한 줄을 통째로 차지하던 것을 대상종류
                  칩과 나란히 배치한다. */}
              <div className={styles.detailBadgeRow}>
                <span className={`${styles.badge} ${REPORT_STATUS_CLASS[detailReport.status] ?? ''}`}>
                  {reportStatusLabel(detailReport.status)}
                </span>
                <span className={`${styles.badge} ${styles.badgeType}`}>
                  {reportTargetTypeLabel(detailReport)}
                </span>
              </div>
              <div className={styles.cardTitle}>{reportTargetLabel(detailReport)}</div>
            </div>

            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{t('support.reportDetailReasonLabel')}</span>
              <span className={styles.detailValue}>{reportReasonLabel(detailReport.reason)}</span>
            </div>

            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{t('support.reportDetailCreatedLabel')}</span>
              <span className={styles.detailValue}>{formatVnDate(detailReport.created_at)}</span>
            </div>

            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{t('support.reportNoteLabel')}</span>
              <span className={styles.detailValue}>
                {detailReport.note || t('support.reportNoteEmpty')}
              </span>
            </div>

            {detailReport.images.length > 0 && (
              <div className={styles.detailSection}>
                <span className={styles.detailLabel}>{t('support.reportImagesLabel')}</span>
                <div className={styles.detailImages}>
                  {detailReport.images.map((url) => (
                    <AppImage key={url} src={url} alt="" className={styles.detailImage} />
                  ))}
                </div>
              </div>
            )}

            <div className={styles.detailSection}>
              <span className={styles.detailLabel}>{t('support.reportResultLabel')}</span>
              <span className={styles.detailValue}>
                {/* F2-4: 종결(RESOLVED/REJECTED)인데 공개 요약이 비어있으면 알림이 보낸 것과
                    같은 고정 폴백 문구를 보여준다(admin_api/reports.py _REPORT_RESULT_NOTI 미러) —
                    안 그러면 "처리 완료" 배지 아래 "아직 결과 없음" 이 뜨는 모순이 생긴다. */}
                {detailReport.resolution_summary
                  || (detailReport.status === 'RESOLVED'
                    ? t('support.reportResultFallbackResolved')
                    : detailReport.status === 'REJECTED'
                      ? t('support.reportResultFallbackRejected')
                      : t('support.reportResultEmpty'))}
              </span>
            </div>

            {detailReport.status === 'CANCELLED' && (
              <p className={styles.detailNotice}>{t('support.reportCancelledNotice')}</p>
            )}

            {/* FR-4 — LISTING 만 실제 id 를 받으므로 이동 버튼은 LISTING 한정, 그 외 타입은
                누를 수 없는 것을 버튼 모양으로 두지 않고 `표시` 행으로 대체한다(B0-4 무게 규약).
                USER/POST/BIZ 이동까지 확장하려면 ReportOut 에 reported_user_id/post_id/biz_id
                노출이 필요하다 — 백엔드 변경이라 이번 범위에서 스킵. */}
            {detailReport.target_type === 'LISTING' && detailReport.listing_id ? (
              <button
                type="button"
                className={styles.detailGoBtn}
                onClick={() => {
                  setDetailReport(null);
                  goToReportTarget(detailReport);
                }}
              >
                {t('support.reportGoToTargetBtn')}
              </button>
            ) : (
              <p className={styles.detailNotice}>{t('support.reportTargetUnavailable')}</p>
            )}

            {/* FR-2 제안①/FR-4 — 목록 카드에 있던 [신고 취소]가 여기 단독 위험 톤 행으로 옮겨왔다.
                can_cancel=false 면 버튼 자체를 렌더하지 않는다(비활성 노출 아님). */}
            {detailReport.can_cancel && (
              <button
                type="button"
                className={styles.detailCancelBtn}
                onClick={() => handleCancelReport(detailReport)}
              >
                {t('support.reportCancelBtn')}
              </button>
            )}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
