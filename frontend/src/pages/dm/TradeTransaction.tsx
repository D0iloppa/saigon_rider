import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, CreditCard, ImagePlus, ReceiptText } from 'lucide-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import {
  cancelAppointment,
  cancelMarketplacePaymentReport,
  confirmMarketplaceItemInspection,
  confirmMarketplacePayment,
  createTransactionCancelRequest,
  fetchMarketplacePaymentQr,
  fetchMarketplaceTransaction,
  registerMarketplacePaymentQr,
  reportMarketplacePayment,
  respondTransactionCancelRequest,
} from '@/api/dm';
import { fetchFaqs, type FaqItem } from '@/api/notices';
import type { AppointmentCancelReason, MarketplaceTransaction } from '@/api/types';
import { useUserStore } from '@/store/useUserStore';
import { formatPriceVnd } from '../market/marketFormat';
import { toast } from '@/components/ui/Toast';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useCancelReasonStore } from '@/store/useCancelReasonStore';
import styles from './TradeTransaction.module.css';

const CANCEL_REASON_KEY: Record<AppointmentCancelReason, string> = {
  SCHEDULE_CHANGED: 'dm.cancelReasonScheduleChanged',
  TRADED_ELSEWHERE: 'dm.cancelReasonTradedElsewhere',
  UNREACHABLE: 'dm.cancelReasonUnreachable',
};

export default function TradeTransaction() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { conversationId, appointmentId } = useParams<{ conversationId: string; appointmentId: string }>();
  const user = useUserStore((state) => state.user);
  const fileRef = useRef<HTMLInputElement>(null);
  const issuesSectionRef = useRef<HTMLElement>(null);
  const [transaction, setTransaction] = useState<MarketplaceTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [qrObject, setQrObject] = useState<{ messageId: string; url: string } | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [openFaqId, setOpenFaqId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // F-X-01 FR-2: "문제가 있나요?" 접힘 행 — DM 카드의 취소 불가 안내(state) 또는 24h/+3h 넛지 푸시
  // 딥링크(?openIssues=1)로 이 화면에 넘어오면 펼친 채로 연다.
  const openIssuesRequested = Boolean((location.state as { openIssues?: boolean } | null)?.openIssues)
    || searchParams.get('openIssues') === '1';
  const [issuesOpen, setIssuesOpen] = useState(openIssuesRequested);

  useEffect(() => {
    if (openIssuesRequested) issuesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openIssuesRequested, loading]);

  const load = async () => {
    if (!appointmentId) return;
    setLoading(true);
    setLoadError(false);
    try {
      setTransaction(await fetchMarketplaceTransaction(appointmentId));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!appointmentId) return;
    let active = true;
    fetchMarketplaceTransaction(appointmentId)
      .then((value) => { if (active) setTransaction(value); })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointmentId]);

  useEffect(() => {
    let active = true;
    fetchFaqs(i18n.language)
      .then((items) => { if (active) setFaqs(items.filter((f) => f.category === 'MARKET').slice(0, 3)); })
      .catch(() => {});
    return () => { active = false; };
  }, [i18n.language]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const messageId = transaction?.qrMessageId;
    if (!messageId || !conversationId) return;
    let active = true;
    let objectUrl: string | null = null;
    fetchMarketplacePaymentQr(conversationId, messageId)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setQrObject({ messageId, url: objectUrl });
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversationId, transaction?.qrMessageId]);

  const updatePayment = async (kind: 'report' | 'confirm') => {
    if (!appointmentId || busy) return;
    setBusy(true);
    try {
      const next = kind === 'report'
        ? await reportMarketplacePayment(appointmentId)
        : await confirmMarketplacePayment(appointmentId);
      setTransaction(next);
      toast.success(kind === 'report' ? t('dm.tradePaymentReported') : t('dm.tradePaymentConfirmed'));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('item_inspection_required')) toast.error(t('dm.tradeInspectionRequired'));
      else if (message.includes('payment_report_too_early')) toast.error(t('dm.tradeReportTooEarly'));
      else if (message.includes('payment_report_window_expired')) toast.error(t('dm.tradeReportExpired'));
      else toast.error(t('common.errorUnexpected'));
    } finally {
      setBusy(false);
    }
  };

  const confirmInspection = async () => {
    if (!appointmentId || busy) return;
    setBusy(true);
    try {
      setTransaction(await confirmMarketplaceItemInspection(appointmentId));
      toast.success(t('dm.tradeInspectionSaved'));
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setBusy(false);
    }
  };

  const replaceQr = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !conversationId || !appointmentId || !user || busy) return;
    setBusy(true);
    try {
      await registerMarketplacePaymentQr(conversationId, appointmentId, user.id, file);
      await load();
      toast.success(t('dm.tradeQrSaved'));
    } catch {
      toast.error(t('dm.tradeQrSaveError'));
    } finally {
      setBusy(false);
    }
  };

  const cancelTrade = async (reason?: AppointmentCancelReason) => {
    if (!appointmentId || busy) return;
    setBusy(true);
    try {
      await cancelAppointment(appointmentId, reason);
      toast.success(t('dm.tradeCancelled'));
      navigate(conversationId ? `/dm/${conversationId}` : '/dm', { replace: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes('payment is reported')) {
        toast.error(t('dm.tradeCancelBlocked'));
        load();
      } else {
        toast.error(t('dm.tradeCancelError'));
      }
    } finally {
      setBusy(false);
    }
  };

  // F-X-01 FR-2 ①: 구매자가 스스로 오신고를 철회한다 — ACCEPTED(AWAITING_PAYMENT)로 복귀.
  const cancelPaymentReport = async () => {
    if (!appointmentId || busy) return;
    setBusy(true);
    try {
      setTransaction(await cancelMarketplacePaymentReport(appointmentId));
      toast.success(t('dm.tradeReportCancelDone'));
    } catch {
      toast.error(t('dm.tradeReportCancelError'));
    } finally {
      setBusy(false);
    }
  };

  // F-X-01 FR-2 ②: 양측 합의 취소 요청을 보낸다.
  const requestCancelTrade = async (reason: AppointmentCancelReason) => {
    if (!appointmentId || busy) return;
    setBusy(true);
    try {
      await createTransactionCancelRequest(appointmentId, reason);
      toast.success(t('dm.tradeCancelRequestSent'));
      await load();
    } catch {
      toast.error(t('dm.tradeCancelRequestError'));
    } finally {
      setBusy(false);
    }
  };

  // F-X-01 FR-2 ②: 상대의 취소 요청에 동의·거절한다.
  const respondCancelTrade = async (requestId: string, action: 'AGREE' | 'REJECT') => {
    if (busy) return;
    setBusy(true);
    try {
      await respondTransactionCancelRequest(requestId, action);
      if (action === 'AGREE') {
        toast.success(t('dm.tradeCancelled'));
        navigate(conversationId ? `/dm/${conversationId}` : '/dm', { replace: true });
      } else {
        toast.success(t('dm.tradeCancelRequestRejected'));
        await load();
      }
    } catch {
      toast.error(t('dm.tradeCancelRequestRespondError'));
    } finally {
      setBusy(false);
    }
  };

  const qrUrl = qrObject && transaction?.qrMessageId === qrObject.messageId ? qrObject.url : null;
  const reported = transaction?.paymentStatus === 'PAYMENT_REPORTED'
    || transaction?.paymentStatus === 'PAYMENT_CONFIRMED';
  const confirmed = transaction?.paymentStatus === 'PAYMENT_CONFIRMED';
  const inspected = !!transaction?.buyerInspectedAt;
  const reportWindow = transaction ? getPaymentReportWindow(transaction.whenAt, now) : 'open';
  const stepDoneFlags = transaction
    ? [true, inspected, !!qrUrl, reported, confirmed, transaction.appointmentStatus === 'COMPLETED']
    : [];
  const currentStepIndex = transaction && transaction.appointmentStatus !== 'CANCELLED'
    ? stepDoneFlags.findIndex((done) => !done)
    : -1;
  const canCancel = transaction?.appointmentStatus === 'ACCEPTED' && !reported;
  // F-X-01 FR-2: 교착 출구는 PAYMENT_REPORTED(신고 후)에만 연다 — 그 전엔 위 [거래 취소]가 정상 출구.
  const showIssuesSection = transaction?.appointmentStatus === 'ACCEPTED' && transaction.paymentStatus === 'PAYMENT_REPORTED';
  const activeCancelRequest = transaction?.activeCancelRequest ?? null;
  const isCancelRequestRequester = !!activeCancelRequest && activeCancelRequest.requesterId === user?.id;

  return (
    <div className={styles.page}>
      <TopBar
        title={t('dm.tradeTitle')}
        onBack={() => navigate(conversationId ? `/dm/${conversationId}` : '/dm', { replace: true })}
      />
      <main className={styles.body}>
        {loading ? (
          <p className={styles.center}>{t('common.loading')}</p>
        ) : loadError || !transaction ? (
          <StateBlock icon={AlertCircle} title={t('dm.tradeLoadError')} actionLabel={t('common.retry')} onAction={load} />
        ) : (
          <>
            <section className={styles.summary} aria-labelledby="trade-summary-title">
              <p className={styles.eyebrow}>{t('dm.tradeInProgress')}</p>
              <h2 id="trade-summary-title">{transaction.listingTitle}</h2>
              <strong>{formatPriceVnd(transaction.amountVnd, t)}</strong>
              <p>{t('dm.tradeAmountSnapshot')}</p>
            </section>

            <section className={styles.method} aria-labelledby="payment-method-title">
              <div className={styles.sectionTitle}>
                <CreditCard size={18} />
                <h2 id="payment-method-title">{t('dm.tradePaymentMethod')}</h2>
              </div>
              <div className={styles.methodOption} data-selected>
                <span className={styles.radio} aria-hidden="true" />
                <div>
                  <strong>{t('dm.tradeZaloPayQr')}</strong>
                  <p>{t('dm.tradeManualPaymentNotice')}</p>
                </div>
              </div>
            </section>

            <section className={styles.qrSection} aria-labelledby="payment-qr-title">
              <div className={styles.sectionTitle}>
                <ReceiptText size={18} />
                <h2 id="payment-qr-title">{t('dm.tradePaymentGuide')}</h2>
              </div>
              {qrUrl ? (
                <AppImage className={styles.qrImage} src={qrUrl} alt={t('dm.tradeQrAlt')} priority />
              ) : (
                <div className={styles.qrEmpty}>{t('dm.tradeQrWaiting')}</div>
              )}
              {transaction.viewerRole === 'buyer' && qrUrl && (
                <p className={styles.safetyNote}>{t('dm.tradeSafetyNotice')}</p>
              )}
              {transaction.viewerRole === 'buyer' && conversationId && (
                <Button
                  variant="ghost"
                  onClick={() => navigate(`/dm/${conversationId}`, { state: { openReport: true } })}
                >
                  {t('dm.tradeSafetyReportLink')}
                </Button>
              )}
              {transaction.viewerRole === 'seller' && transaction.appointmentStatus === 'ACCEPTED' && (
                <>
                  <input
                    ref={fileRef}
                    className={styles.hiddenInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={replaceQr}
                  />
                  <Button
                    variant={transaction.qrMessageId ? 'secondary' : 'primary'}
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus size={17} />
                    {transaction.qrMessageId ? t('dm.tradeQrReplace') : t('dm.tradeQrRegister')}
                  </Button>
                  {!transaction.qrMessageId && (
                    <p className={styles.safetyNote}>{t('dm.tradeQrRegisterOptionalNote')}</p>
                  )}
                </>
              )}
            </section>

            <section className={styles.timelineSection} aria-labelledby="trade-timeline-title">
              <h2 id="trade-timeline-title">{t('dm.tradeProcedure')}</h2>
              <ol className={styles.timeline}>
                <TradeStep done current={currentStepIndex === 0} title={t('dm.tradeStepAgreement')} detail={t('dm.tradeStepAgreementDetail')} />
                <TradeStep done={inspected} current={currentStepIndex === 1} title={t('dm.tradeStepInspection')} detail={t('dm.tradeStepInspectionDetail')} />
                <TradeStep done={!!qrUrl} current={currentStepIndex === 2} title={t('dm.tradeStepQr')} detail={t('dm.tradeStepQrDetail')} />
                <TradeStep done={reported} current={currentStepIndex === 3} title={t('dm.tradeStepReported')} detail={t('dm.tradeStepReportedDetail')} />
                <TradeStep done={confirmed} current={currentStepIndex === 4} title={t('dm.tradeStepConfirmed')} detail={t('dm.tradeStepConfirmedDetail')} />
                <TradeStep
                  done={transaction.appointmentStatus === 'COMPLETED'}
                  current={currentStepIndex === 5}
                  title={t('dm.tradeStepHandoff')}
                  detail={t('dm.tradeStepHandoffDetail')}
                />
              </ol>
            </section>

            {transaction.viewerRole === 'buyer' && transaction.appointmentStatus === 'ACCEPTED' && !reported && !inspected && (
              <Button fullWidth disabled={busy} onClick={confirmInspection}>
                {t('dm.tradeConfirmInspection')}
              </Button>
            )}
            {transaction.viewerRole === 'buyer' && transaction.appointmentStatus === 'ACCEPTED' && !reported && inspected && (
              <>
              <Button
                fullWidth
                disabled={busy || !qrUrl || reportWindow !== 'open'}
                onClick={() => useConfirmStore.getState().open(
                  t('dm.tradeReportPaymentConfirm'),
                  () => {
                    useConfirmStore.getState().close();
                    updatePayment('report');
                  },
                  { confirmLabel: t('dm.tradeReportPaymentConfirmCta') },
                )}
              >
                {t('dm.tradeReportPayment')}
              </Button>
              {reportWindow !== 'open' && (
                <p className={styles.safetyNote}>
                  {reportWindow === 'early' ? t('dm.tradeReportTooEarly') : t('dm.tradeReportExpired')}
                </p>
              )}
              </>
            )}
            {transaction.viewerRole === 'seller' && transaction.appointmentStatus === 'ACCEPTED' && reported && !confirmed && (
              <Button
                fullWidth
                disabled={busy}
                onClick={() => useConfirmStore.getState().open(
                  t('dm.tradeConfirmReceiptConfirm'),
                  () => {
                    useConfirmStore.getState().close();
                    updatePayment('confirm');
                  },
                  { confirmLabel: t('dm.tradeConfirmReceiptConfirmCta') },
                )}
              >
                {t('dm.tradeConfirmReceipt')}
              </Button>
            )}
            {canCancel && (
              <Button
                fullWidth
                variant="danger"
                disabled={busy}
                onClick={() => useCancelReasonStore.getState().open(
                  t('dm.cancelReasonTitle'),
                  (reason) => useConfirmStore.getState().open(
                    t('dm.tradeCancelConfirm'),
                    () => {
                      useConfirmStore.getState().close();
                      cancelTrade(reason);
                    },
                    { confirmLabel: t('dm.tradeCancelConfirmCta') },
                  ),
                )}
              >
                {t('dm.tradeCancel')}
              </Button>
            )}
            {showIssuesSection && (
              <section ref={issuesSectionRef} className={styles.issuesSection}>
                <button
                  type="button"
                  className={styles.issuesToggle}
                  aria-expanded={issuesOpen}
                  onClick={() => setIssuesOpen((open) => !open)}
                >
                  <span>{t('dm.tradeIssuesToggle')}</span>
                  <ChevronDown size={16} className={issuesOpen ? styles.faqChevronOpen : styles.faqChevron} />
                </button>
                {issuesOpen && (
                  <div className={styles.issuesBody}>
                    {activeCancelRequest ? (
                      isCancelRequestRequester ? (
                        <p className={styles.safetyNote}>{t('dm.tradeCancelRequestPendingSelf')}</p>
                      ) : (
                        <>
                          <p className={styles.safetyNote}>
                            {t('dm.tradeCancelRequestReasonLabel', { reason: t(CANCEL_REASON_KEY[activeCancelRequest.reason]) })}
                          </p>
                          <Button
                            fullWidth
                            disabled={busy}
                            onClick={() => useConfirmStore.getState().open(
                              t('dm.tradeCancelRequestAgreeConfirm'),
                              () => {
                                useConfirmStore.getState().close();
                                respondCancelTrade(activeCancelRequest.id, 'AGREE');
                              },
                              { confirmLabel: t('dm.tradeCancelRequestAgree') },
                            )}
                          >
                            {t('dm.tradeCancelRequestAgree')}
                          </Button>
                          <Button
                            fullWidth
                            variant="ghost"
                            disabled={busy}
                            onClick={() => respondCancelTrade(activeCancelRequest.id, 'REJECT')}
                          >
                            {t('dm.tradeCancelRequestReject')}
                          </Button>
                        </>
                      )
                    ) : (
                      <>
                        {transaction.viewerRole === 'buyer' && (
                          <Button
                            fullWidth
                            variant="ghost"
                            disabled={busy}
                            onClick={() => useConfirmStore.getState().open(
                              t('dm.tradeReportCancelConfirm'),
                              () => {
                                useConfirmStore.getState().close();
                                cancelPaymentReport();
                              },
                              { confirmLabel: t('dm.tradeReportCancel') },
                            )}
                          >
                            {t('dm.tradeReportCancel')}
                          </Button>
                        )}
                        <Button
                          fullWidth
                          variant="danger"
                          disabled={busy}
                          onClick={() => useCancelReasonStore.getState().open(
                            t('dm.cancelReasonTitle'),
                            (reason) => useConfirmStore.getState().open(
                              t('dm.tradeCancelRequestConfirm'),
                              () => {
                                useConfirmStore.getState().close();
                                requestCancelTrade(reason);
                              },
                              { confirmLabel: t('dm.tradeCancelRequestCta') },
                            ),
                          )}
                        >
                          {t('dm.tradeCancelRequest')}
                        </Button>
                        <Button
                          fullWidth
                          variant="ghost"
                          onClick={() => navigate('/settings/support', {
                            state: {
                              inquiryDraft: {
                                title: t('dm.tradeSupportDraftTitle', { listing: transaction.listingTitle }),
                                body: t('dm.tradeSupportDraftBody', { id: transaction.appointmentId }),
                              },
                            },
                          })}
                        >
                          {t('dm.tradeIssuesSupport')}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}
            <p className={styles.boundaryNote}>{t('dm.tradeBoundaryNotice')}</p>

            {faqs.length > 0 && (
              <section className={styles.faqSection} aria-labelledby="trade-faq-title">
                <div className={styles.sectionTitle}>
                  <h2 id="trade-faq-title">{t('dm.tradeFaqTitle')}</h2>
                </div>
                {faqs.map((f) => {
                  const open = openFaqId === f.id;
                  return (
                    <div key={f.id} className={styles.faqItem}>
                      <button
                        type="button"
                        className={styles.faqQuestion}
                        aria-expanded={open}
                        onClick={() => setOpenFaqId(open ? null : f.id)}
                      >
                        <span>{f.question}</span>
                        <ChevronDown size={16} className={open ? styles.faqChevronOpen : styles.faqChevron} />
                      </button>
                      {open && <div className={styles.faqAnswer}>{f.answer}</div>}
                    </div>
                  );
                })}
                <Button variant="ghost" onClick={() => navigate('/faq')}>
                  {t('dm.tradeFaqSeeAll')}
                </Button>
              </section>
            )}

            <Button
              variant="ghost"
              fullWidth
              onClick={() => navigate('/settings/support', {
                state: {
                  inquiryDraft: {
                    title: t('dm.tradeSupportDraftTitle', { listing: transaction.listingTitle }),
                    body: t('dm.tradeSupportDraftBody', { id: transaction.appointmentId }),
                  },
                },
              })}
            >
              {t('dm.tradeSupportCta')}
            </Button>
          </>
        )}
      </main>
    </div>
  );
}

function getPaymentReportWindow(whenAt: string, now: number): 'early' | 'open' | 'expired' {
  const appointmentAt = new Date(whenAt).getTime();
  if (now < appointmentAt - 30 * 60_000) return 'early';
  if (now > appointmentAt + 60 * 60_000) return 'expired';
  return 'open';
}

function TradeStep({
  done,
  current,
  title,
  detail,
}: {
  done: boolean;
  current?: boolean;
  title: string;
  detail: string;
}) {
  const { t } = useTranslation();
  return (
    <li className={styles.step} data-done={done || undefined} data-current={(!done && current) || undefined}>
      <span className={styles.stepMark} aria-hidden="true">{done ? <Check size={14} /> : null}</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
        {!done && (
          <span className={styles.stepStatus}>
            {current ? t('dm.tradeStepCurrent') : t('dm.tradeStepPending')}
          </span>
        )}
      </div>
    </li>
  );
}
