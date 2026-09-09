// Toss checkout success redirect (design §5-5 D-4, §8 P2-7). Toss appends
// paymentKey/orderId/amount to this URL — we forward them verbatim to the BFF,
// which re-validates the amount against the accepted charge snapshot. The SPA
// never trusts or computes the amount itself.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "../home/home-launch.css";
import "./apply-page.css";
import { LOCALES, LOCALE_LABEL, DEFAULT_LOCALE, content, type Locale } from "./content";
import { confirmCheckout } from "@/lib/adContractApi";

function detectLocale(): Locale {
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  if (nav.startsWith("ko")) return "ko";
  if (nav.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

type ReturnState = "processing" | "success" | "error";

function PayReturnPage() {
  const [searchParams] = useSearchParams();
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const [state, setState] = useState<ReturnState>("processing");
  const [attempt, setAttempt] = useState(0);
  const t = content[locale];

  const token = searchParams.get("token") ?? "";
  const paymentKey = searchParams.get("paymentKey") ?? "";
  const orderId = searchParams.get("orderId") ?? "";
  const amountRaw = searchParams.get("amount") ?? "";

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const amount = Number(amountRaw);
    if (!token || !paymentKey || !orderId || !Number.isFinite(amount)) {
      setState("error");
      return;
    }
    let cancelled = false;
    confirmCheckout(token, { paymentKey, orderId, amount })
      .then(() => {
        if (!cancelled) setState("success");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, paymentKey, orderId, amountRaw, attempt]);

  return (
    <div className="sr-root sa-page">
      <div className="sa-shell">
        <div className="sa-header">
          <span className="sa-brand"><span className="sr-mark"><span /></span>{t.brand}</span>
          <div className="sr-lang-switch sa-lang-switch" aria-label="Language">
            {LOCALES.map((l) => (
              <a
                key={l}
                href="#"
                aria-current={l === locale ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  setLocale(l);
                }}
              >
                {LOCALE_LABEL[l]}
              </a>
            ))}
          </div>
        </div>

        <div className="sa-card">
          <div className="sa-state">
            {state === "processing" && (
              <>
                <div className="sa-spinner" />
                <p>{t.payReturn.processing}</p>
              </>
            )}
            {state === "success" && (
              <>
                <h2>{t.payReturn.success}</h2>
                <Link className="sr-button sa-submit" to={`/apply?token=${encodeURIComponent(token)}`}>
                  {t.payReturn.backToContract}
                </Link>
              </>
            )}
            {state === "error" && (
              <>
                <h2>{t.payReturn.error}</h2>
                <button
                  type="button"
                  className="sr-button sa-submit"
                  onClick={() => {
                    setState("processing");
                    setAttempt((value) => value + 1);
                  }}
                >
                  {t.payReturn.retry}
                </button>
                <Link className="sr-button sa-submit" to={`/apply?token=${encodeURIComponent(token)}`}>
                  {t.payReturn.backToContract}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PayReturnPage;
