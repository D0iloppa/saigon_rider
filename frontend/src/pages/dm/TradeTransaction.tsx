import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, CreditCard, ImagePlus, ReceiptText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import {
  cancelAppointment,
  confirmMarketplacePayment,
  fetchMarketplacePaymentQr,
  fetchMarketplaceTransaction,
  registerMarketplacePaymentQr,
  reportMarketplacePayment,
} from '@/api/dm';
import { fetchFaqs, type FaqItem } from '@/api/notices';
import type { MarketplaceTransaction } from '@/api/types';
import { useUserStore } from '@/store/useUserStore';
import { formatPriceVnd } from '../market/marketFormat';
import { toast } from '@/components/ui/Toast';
import { useConfirmStore } from '@/store/useConfirmStore';
import styles from './TradeTransaction.module.css';

export default function TradeTransaction() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { conversationId, appointmentId } = useParams<{ conversationId: string; appointmentId: string }>();
  const user = useUserStore((state) => state.user);
  const fileRef = useRef<HTMLInputElement>(null);
  const [transaction, setTransaction] = useState<MarketplaceTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [qrObject, setQrObject] = useState<{ messageId: string; url: string } | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [openFaqId, setOpenFaqId] = useState<number | null>(null);

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

  const cancelTrade = async () => {
    if (!appointmentId || busy) return;
    setBusy(true);
    try {
      await cancelAppointment(appointmentId);
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

  const qrUrl = qrObject && transaction?.qrMessageId === qrObject.messageId ? qrObject.url : null;
  const reported = transaction?.paymentStatus === 'PAYMENT_REPORTED'
    || transaction?.paymentStatus === 'PAYMENT_CONFIRMED';
  const confirmed = transaction?.paymentStatus === 'PAYMENT_CONFIRMED';
  const stepDoneFlags = transaction
    ? [true, !!qrUrl, reported, confirmed, transaction.appointmentStatus === 'COMPLETED']
    : [];
  const currentStepIndex = transaction && transaction.appointmentStatus !== 'CANCELLED'
    ? stepDoneFlags.findIndex((done) => !done)
    : -1;
  const canCancel = transaction?.appointmentStatus === 'ACCEPTED' && !reported;

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
                <TradeStep done={!!qrUrl} current={currentStepIndex === 1} title={t('dm.tradeStepQr')} detail={t('dm.tradeStepQrDetail')} />
                <TradeStep done={reported} current={currentStepIndex === 2} title={t('dm.tradeStepReported')} detail={t('dm.tradeStepReportedDetail')} />
                <TradeStep done={confirmed} current={currentStepIndex === 3} title={t('dm.tradeStepConfirmed')} detail={t('dm.tradeStepConfirmedDetail')} />
                <TradeStep
                  done={transaction.appointmentStatus === 'COMPLETED'}
                  current={currentStepIndex === 4}
                  title={t('dm.tradeStepHandoff')}
                  detail={t('dm.tradeStepHandoffDetail')}
                />
              </ol>
            </section>

            {transaction.viewerRole === 'buyer' && transaction.appointmentStatus === 'ACCEPTED' && !reported && (
              <Button
                fullWidth
                disabled={busy || !qrUrl}
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
                onClick={() => useConfirmStore.getState().open(
                  t('dm.tradeCancelConfirm'),
                  () => {
                    useConfirmStore.getState().close();
                    cancelTrade();
                  },
                  { confirmLabel: t('dm.tradeCancelConfirmCta') },
                )}
              >
                {t('dm.tradeCancel')}
              </Button>
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
