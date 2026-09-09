import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CreditCard, ImagePlus, ReceiptText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import {
  confirmMarketplacePayment,
  fetchMarketplacePaymentQr,
  fetchMarketplaceTransaction,
  registerMarketplacePaymentQr,
  reportMarketplacePayment,
} from '@/api/dm';
import type { MarketplaceTransaction } from '@/api/types';
import { useUserStore } from '@/store/useUserStore';
import { formatPriceVnd } from '../market/marketFormat';
import { toast } from '@/components/ui/Toast';
import styles from './TradeTransaction.module.css';

export default function TradeTransaction() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId, appointmentId } = useParams<{ conversationId: string; appointmentId: string }>();
  const user = useUserStore((state) => state.user);
  const fileRef = useRef<HTMLInputElement>(null);
  const [transaction, setTransaction] = useState<MarketplaceTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [qrObject, setQrObject] = useState<{ messageId: string; url: string } | null>(null);

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

  const qrUrl = qrObject && transaction?.qrMessageId === qrObject.messageId ? qrObject.url : null;
  const reported = transaction?.paymentStatus === 'PAYMENT_REPORTED'
    || transaction?.paymentStatus === 'PAYMENT_CONFIRMED';
  const confirmed = transaction?.paymentStatus === 'PAYMENT_CONFIRMED';

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
              {transaction.viewerRole === 'seller' && transaction.appointmentStatus === 'ACCEPTED' && (
                <>
                  <input
                    ref={fileRef}
                    className={styles.hiddenInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={replaceQr}
                  />
                  <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                    <ImagePlus size={17} />
                    {transaction.qrMessageId ? t('dm.tradeQrReplace') : t('dm.tradeQrRegister')}
                  </Button>
                </>
              )}
            </section>

            <section className={styles.timelineSection} aria-labelledby="trade-timeline-title">
              <h2 id="trade-timeline-title">{t('dm.tradeProcedure')}</h2>
              <ol className={styles.timeline}>
                <TradeStep done title={t('dm.tradeStepAgreement')} detail={t('dm.tradeStepAgreementDetail')} />
                <TradeStep done={!!qrUrl} title={t('dm.tradeStepQr')} detail={t('dm.tradeStepQrDetail')} />
                <TradeStep done={reported} title={t('dm.tradeStepReported')} detail={t('dm.tradeStepReportedDetail')} />
                <TradeStep done={confirmed} title={t('dm.tradeStepConfirmed')} detail={t('dm.tradeStepConfirmedDetail')} />
                <TradeStep
                  done={transaction.appointmentStatus === 'COMPLETED'}
                  title={t('dm.tradeStepHandoff')}
                  detail={t('dm.tradeStepHandoffDetail')}
                />
              </ol>
            </section>

            {transaction.viewerRole === 'buyer' && transaction.appointmentStatus === 'ACCEPTED' && !reported && (
              <Button fullWidth disabled={busy || !qrUrl} onClick={() => updatePayment('report')}>
                {t('dm.tradeReportPayment')}
              </Button>
            )}
            {transaction.viewerRole === 'seller' && transaction.appointmentStatus === 'ACCEPTED' && reported && !confirmed && (
              <Button fullWidth disabled={busy} onClick={() => updatePayment('confirm')}>
                {t('dm.tradeConfirmReceipt')}
              </Button>
            )}
            <p className={styles.boundaryNote}>{t('dm.tradeBoundaryNotice')}</p>
          </>
        )}
      </main>
    </div>
  );
}

function TradeStep({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <li className={styles.step} data-done={done || undefined}>
      <span className={styles.stepMark} aria-hidden="true">{done ? <Check size={14} /> : null}</span>
      <div><strong>{title}</strong><p>{detail}</p></div>
    </li>
  );
}
