// Toss checkout failure redirect (design §8 P2-7, T-5). Toss appends
// code/message/orderId on failure (orderId absent when the user cancelled —
// PAY_PROCESS_CANCELED). We only display the code; no BFF call needed here.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "../home/home-launch.css";
import "./apply-page.css";
import { LOCALES, LOCALE_LABEL, DEFAULT_LOCALE, content, formatCopy, type Locale } from "./content";

function detectLocale(): Locale {
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  if (nav.startsWith("ko")) return "ko";
  if (nav.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

function PayFailPage() {
  const [searchParams] = useSearchParams();
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const t = content[locale];

  const token = searchParams.get("token") ?? "";
  const code = searchParams.get("code") ?? "-";

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
            <h2>{t.payFail.title}</h2>
            <p>{formatCopy(t.payFail.body, { code })}</p>
            <Link className="sr-button sa-submit" to={`/apply?token=${encodeURIComponent(token)}`}>
              {t.payFail.retry}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PayFailPage;
