import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import "../home/home-launch.css";
import "./apply-page.css";
import { LOCALES, LOCALE_LABEL, DEFAULT_LOCALE, content, formatCopy, type Locale } from "./content";
import {
  fetchAdContract,
  acceptAdContract,
  AdContractNotFoundError,
  type AdContractInfo,
  type AdContractAcceptResult,
} from "@/lib/adContractApi";

function detectLocale(): Locale {
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  if (nav.startsWith("ko")) return "ko";
  if (nav.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + "₫";
}

type PageState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "already" }
  | { kind: "form"; contract: AdContractInfo }
  | { kind: "success"; result: AdContractAcceptResult };

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

function ApplyPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [agreed, setAgreed] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const t = content[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    let cancelled = false;
    fetchAdContract(token)
      .then((contract) => {
        if (cancelled) return;
        setState(contract.already_accepted ? { kind: "already" } : { kind: "form", contract });
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err instanceof AdContractNotFoundError ? { kind: "invalid" } : { kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const tierName = state.kind === "form" ? state.contract.tier_name : "";

  const contractText = useMemo(
    () => formatCopy(t.form.contractText, { tier: tierName }),
    [t, tierName]
  );

  async function handleSubmit() {
    if (state.kind !== "form" || !agreed || !signerName.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const result = await acceptAdContract(token, signerName.trim());
      setState({ kind: "success", result });
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sr-root sa-page">
      <div className="sa-shell">
        <div className="sa-header">
          <span className="sa-brand"><span className="sr-mark"><span /></span>{t.brand}</span>
          <LanguageSwitcher current={locale} onChange={setLocale} />
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

          {state.kind === "already" && (
            <div className="sa-state">
              <h2>{t.alreadyAccepted.title}</h2>
              <p>{t.alreadyAccepted.body}</p>
            </div>
          )}

          {state.kind === "form" && (
            <div className="sa-form">
              <span className="sr-kicker">{t.form.kicker}</span>
              <h1>{formatCopy(t.form.heading, { tier: state.contract.tier_name })}</h1>

              <div className="sa-summary">
                <div className="sa-summary__row">
                  <span>{t.form.priceLabel}</span>
                  <span className="sa-summary__price">{formatVnd(state.contract.monthly_price_vnd)}</span>
                </div>
                <div className="sa-summary__row">
                  <span>{t.form.partnerLabel}</span>
                  <span>{state.contract.partner_name}</span>
                </div>
              </div>

              <div className="sa-contract">
                <h3>{t.form.contractHeading}</h3>
                <p>{contractText}</p>
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
                disabled={!agreed || !signerName.trim() || submitting}
                onClick={handleSubmit}
              >
                {submitting ? t.form.submitting : t.form.submit} <ArrowRight size={17} />
              </button>

              {submitError && <p className="sa-error">{t.error}</p>}
            </div>
          )}

          {state.kind === "success" && (
            <div className="sa-success">
              <span className="sr-kicker">{t.success.title}</span>
              <h1>{t.success.title}</h1>
              <p>{t.success.body}</p>
              <div className="sa-summary">
                <h3 style={{ margin: "0 0 8px", color: "rgba(255,249,242,.72)", fontSize: 12, fontWeight: 900, letterSpacing: ".06em" }}>
                  {t.success.bankInfoLabel}
                </h3>
                <p className="sa-bank">{state.result.bank_transfer_info}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ApplyPage;
