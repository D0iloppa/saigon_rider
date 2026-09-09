import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, CreditCard } from "lucide-react";
import "../home/home-launch.css";
import "./apply-page.css";
import { LOCALES, LOCALE_LABEL, DEFAULT_LOCALE, content, formatCopy, type Locale } from "./content";
import {
  fetchAdContract,
  acceptAdContract,
  AdContractNotFoundError,
  AdContractVersionChangedError,
  type AdContractInfo,
  type RailOffer,
} from "@/lib/adContractApi";

const TOSS_SDK_SRC = "https://js.tosspayments.com/v2/standard";

function detectLocale(): Locale {
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  if (nav.startsWith("ko")) return "ko";
  if (nav.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + "₫";
}

function formatKrw(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount);
}

function formatDate(iso: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : locale === "ko" ? "ko-KR" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type PageState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "loaded"; contract: AdContractInfo };

// Loads the Toss v2 SDK script once and caches the window.TossPayments factory
// (confirmed via docs.tosspayments.com/sdk/v2/js — script src js.tosspayments.com/v2/standard,
// window.TossPayments(clientKey) init, .payment({customerKey}) instance, .requestPayment({...})).
let tossSdkPromise: Promise<void> | null = null;
function loadTossSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).TossPayments) return Promise.resolve();
  if (tossSdkPromise) return tossSdkPromise;
  tossSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TOSS_SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Toss SDK"));
    document.head.appendChild(script);
  });
  return tossSdkPromise;
}

async function startTossCheckout(checkout: NonNullable<RailOffer["checkout"]>) {
  if (checkout.stub) {
    // dev stub (design §5-1): no real payment window — jump straight to successUrl to
    // exercise the redirect contract end-to-end.
    const paymentKey = `stub_${crypto.randomUUID()}`;
    const url = new URL(checkout.success_url);
    url.searchParams.set("paymentKey", paymentKey);
    url.searchParams.set("orderId", checkout.order_id);
    url.searchParams.set("amount", String(checkout.amount.value));
    window.location.href = url.toString();
    return;
  }
  await loadTossSdk();
  const tossPayments = (window as any).TossPayments(checkout.client_key);
  const payment = tossPayments.payment({ customerKey: "ANONYMOUS" });
  await payment.requestPayment({
    method: "CARD",
    amount: checkout.amount,
    orderId: checkout.order_id,
    orderName: checkout.order_name,
    successUrl: checkout.success_url,
    failUrl: checkout.fail_url,
    customerName: checkout.customer_name,
    card: { useInternationalCardOnly: true },
  });
}

function LanguageSwitcher({ current, onChange }: { current: Locale; onChange: (locale: Locale) => void }) {
  return (
    <div className="sr-lang-switch sa-lang-switch" aria-label="Language">
      {LOCALES.map((locale) => (
        <a
          key={locale}
          href="#"
          aria-current={locale === current ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            onChange(locale);
          }}
        >
          {LOCALE_LABEL[locale]}
        </a>
      ))}
    </div>
  );
}

function RailsPanel({ contract, locale, t }: { contract: AdContractInfo; locale: Locale; t: (typeof content)[Locale] }) {
  const bankRail = contract.rails.find((r) => r.rail === "bank_transfer");
  const cardRail = contract.rails.find((r) => r.rail === "toss_card");
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState(false);

  const bothUnavailable = (!bankRail || !bankRail.wired) && (!cardRail || !cardRail.wired);

  if (bothUnavailable) {
    return <p className="sa-rails-empty">{t.rails.bothUnavailable}</p>;
  }

  async function handleCardClick() {
    if (!cardRail?.checkout || cardBusy) return;
    setCardBusy(true);
    setCardError(false);
    try {
      await startTossCheckout(cardRail.checkout);
    } catch {
      setCardError(true);
      setCardBusy(false);
    }
  }

  return (
    <div className="sa-rails">
      {bankRail && (
        <div className="sa-rail-card">
          <h3>{t.rails.bankHeading}</h3>
          {bankRail.wired && bankRail.instructions ? (
            <div className="sa-bank-fields">
              <div className="sa-bank-row">
                <span>{t.rails.bankName}</span>
                <span>{bankRail.instructions.name}</span>
              </div>
              <div className="sa-bank-row">
                <span>{t.rails.bankAccount}</span>
                <span>{bankRail.instructions.account_no}</span>
              </div>
              <div className="sa-bank-row">
                <span>{t.rails.bankHolder}</span>
                <span>{bankRail.instructions.holder}</span>
              </div>
              <div className="sa-bank-row">
                <span>{t.rails.bankCode}</span>
                <span>{bankRail.instructions.payment_code}</span>
              </div>
              {bankRail.instructions.due_at && (
                <p className="sa-bank-due">{formatCopy(t.rails.bankDue, { date: formatDate(bankRail.instructions.due_at, locale) })}</p>
              )}
            </div>
          ) : (
            <p className="sa-rail-preparing">{t.rails.bankPreparing}</p>
          )}
        </div>
      )}

      {cardRail?.wired && cardRail.checkout && (
        <div className="sa-rail-card">
          <h3>{t.rails.cardHeading}</h3>
          <p className="sa-krw-notice">{formatCopy(t.rails.krwNotice, { krw: formatKrw(cardRail.checkout.amount.value) })}</p>
          <button type="button" className="sr-button sa-card-button" disabled={cardBusy} onClick={handleCardClick}>
            <CreditCard size={17} /> {cardBusy ? t.rails.cardOpening : t.rails.cardButton}
          </button>
          {cardError && <p className="sa-error">{t.error}</p>}
        </div>
      )}
    </div>
  );
}

function ApplyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [agreed, setAgreed] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [months, setMonths] = useState<1 | 3 | 6>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [contractChanged, setContractChanged] = useState(false);

  const t = content[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    setState({ kind: "loading" });
    let cancelled = false;
    fetchAdContract(token, locale)
      .then((contract) => {
        if (cancelled) return;
        setState({ kind: "loaded", contract });
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err instanceof AdContractNotFoundError ? { kind: "invalid" } : { kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [token, locale]);

  const periodOptions = useMemo(() => {
    if (state.kind !== "loaded") return [];
    const opts = state.contract.tier_price_options;
    return [
      { months: 1 as const, price: opts.month_1_vnd as number | null },
      { months: 3 as const, price: opts.month_3_vnd },
      { months: 6 as const, price: opts.month_6_vnd },
    ];
  }, [state]);

  async function handleSubmit() {
    if (
      state.kind !== "loaded"
      || state.contract.contract_locale !== locale
      || !agreed
      || !signerName.trim()
      || submitting
    ) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const contract = await acceptAdContract(token, months, signerName.trim(), locale, {
        version: state.contract.contract_text_version,
        sha256: state.contract.contract_text_sha256,
        amountVnd: state.contract.tier_price_options[`month_${months}_vnd`],
        amountKrw: state.contract.tier_price_options[`month_${months}_krw`],
      });
      setState({ kind: "loaded", contract });
    } catch (error) {
      if (error instanceof AdContractVersionChangedError) {
        setAgreed(false);
        setContractChanged(true);
        try {
          setState({ kind: "loaded", contract: await fetchAdContract(token, locale) });
        } catch {
          setSubmitError(true);
        }
      } else {
        setSubmitError(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sr-root sa-page">
      <div className="sa-shell">
        <div className="sa-header">
          <span className="sa-brand"><span className="sr-mark"><span /></span>{t.brand}</span>
          <LanguageSwitcher current={locale} onChange={(nextLocale) => {
            setAgreed(false);
            setContractChanged(false);
            setState({ kind: "loading" });
            setLocale(nextLocale);
          }} />
        </div>

        <div className="sa-card">
          {state.kind === "loading" && (
            <div className="sa-state">
              <div className="sa-spinner" />
              <p>{t.loading}</p>
            </div>
          )}

          {state.kind === "invalid" && (
            <div className="sa-state">
              <h2>{t.invalid.title}</h2>
              <p>{t.invalid.body}</p>
            </div>
          )}

          {state.kind === "error" && (
            <div className="sa-state">
              <h2>{t.invalid.title}</h2>
              <p>{t.error}</p>
            </div>
          )}

          {state.kind === "loaded" && state.contract.status === "draft" && (
            <div className="sa-form">
              <span className="sr-kicker">{t.form.kicker}</span>
              <h1>{formatCopy(t.form.heading, { tier: state.contract.tier_name })}</h1>

              <div className="sa-summary">
                <div className="sa-summary__row">
                  <span>{t.form.partnerLabel}</span>
                  <span>{state.contract.partner_name}</span>
                </div>
              </div>

              <div className="sa-periods">
                <h3>{t.form.periodHeading}</h3>
                <div className="sa-period-options">
                  {periodOptions.map((opt) => (
                    <button
                      key={opt.months}
                      type="button"
                      className={`sa-period-option${months === opt.months ? " sa-period-option--active" : ""}`}
                      disabled={opt.price === null}
                      onClick={() => setMonths(opt.months)}
                    >
                      <span className="sa-period-option__months">{opt.months}m</span>
                      <span className="sa-period-option__price">
                        {opt.price === null ? t.form.periodUnavailable : formatVnd(opt.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="sa-contract">
                <h3>{t.form.contractHeading}</h3>
                <p>{state.contract.contract_text}</p>
              </div>

              <div className="sa-agree">
                <input
                  id="sa-agree-checkbox"
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <label htmlFor="sa-agree-checkbox">{t.form.agreeLabel}</label>
              </div>

              <div className="sa-field">
                <label htmlFor="sa-signer-name">{t.form.nameLabel}</label>
                <input
                  id="sa-signer-name"
                  type="text"
                  value={signerName}
                  placeholder={t.form.namePlaceholder}
                  onChange={(event) => setSignerName(event.target.value)}
                />
              </div>

              <button
                type="button"
                className="sr-button sa-submit"
                disabled={!agreed || !signerName.trim() || submitting || state.contract.contract_locale !== locale}
                onClick={handleSubmit}
              >
                {submitting ? t.form.submitting : t.form.submit} <ArrowRight size={17} />
              </button>

              {submitError && <p className="sa-error">{t.error}</p>}
              {contractChanged && <p className="sa-error">{t.form.contractChanged}</p>}
            </div>
          )}

          {state.kind === "loaded" && (state.contract.status === "cancelled" || state.contract.status === "refunded") && (
            <div className="sa-state">
              <h2>{t.closed.title}</h2>
              <p>{t.closed.body}</p>
            </div>
          )}

          {state.kind === "loaded" &&
            !["draft", "cancelled", "refunded"].includes(state.contract.status) && (
              <div className="sa-status">
                <span className="sr-kicker">{t.status.labels[state.contract.status as keyof typeof t.status.labels]}</span>
                <h1>{formatCopy(t.status.heading, { tier: state.contract.tier_name })}</h1>

                <div className="sa-summary">
                  <div className="sa-summary__row">
                    <span>{t.status.partnerLabel}</span>
                    <span>{state.contract.partner_name}</span>
                  </div>
                  <div className="sa-summary__row">
                    <span>{t.status.amountLabel}</span>
                    <span className="sa-summary__price">{formatVnd(state.contract.amount_vnd)}</span>
                  </div>
                </div>

                <div className="sa-contract">
                  <h3>{t.form.contractHeading}</h3>
                  <p>{state.contract.contract_text}</p>
                </div>

                {state.contract.period_start && state.contract.period_end && (
                  <p className="sa-period-label">
                    {formatCopy(t.status.periodLabel, {
                      start: formatDate(state.contract.period_start, locale),
                      end: formatDate(state.contract.period_end, locale),
                    })}
                  </p>
                )}

                <RailsPanel contract={state.contract} locale={locale} t={t} />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default ApplyPage;
