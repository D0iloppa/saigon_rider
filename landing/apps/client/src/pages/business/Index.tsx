import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowRight, BadgeCheck, Layers, MapPin, Megaphone, Menu, X } from "lucide-react";
import "../home/home-launch.css";
import "./business-launch.css";
import { LOCALES, LOCALE_LABEL, content, localePath, resolveLocale } from "./content";

const CONTACT_MAIL = "mailto:partner@saigon-rider.com";
const APP_HREF = "https://saigon-rider.com";
const PRIVACY_HREF = "https://app.saigon-rider.com/app_privacy/";

// 실후기 확보 전 placeholder — 시범운영 후기 확보 시 true로 전환
const SHOW_TESTIMONIALS = false;

const benefitIcons = [MapPin, BadgeCheck, Layers, Megaphone];

function SaigonMark() {
  return (
    <span className="sr-mark" aria-hidden="true">
      <span />
    </span>
  );
}

function BreakText({ text }: { text: string }) {
  const parts = text.split("<br />");
  return (
    <>
      {parts.flatMap((part, index) => (index === 0 ? [part] : [<br key={index} />, part]))}
    </>
  );
}

function LanguageSwitcher({ current, className }: { current: string; className?: string }) {
  return (
    <div className={className} aria-label="Language">
      {LOCALES.map((locale) => (
        <a key={locale} href={localePath(locale)} aria-current={locale === current ? "page" : undefined}>
          {LOCALE_LABEL[locale]}
        </a>
      ))}
    </div>
  );
}

function SaigonRiderBusiness() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const locale = resolveLocale(location.pathname);
  const t = content[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div className="sr-root sb-root">
      {/* @section: header */}
      <header className="sr-header">
        <a className="sr-brand" href="#top" aria-label="SAIGON RIDER BUSINESS"><SaigonMark />SAIGON RIDER<span className="sb-brand-tag">Business</span></a>
        <nav className="sr-nav" aria-label="Main">
          <a href="#how">{t.nav.how}</a>
          <a href={APP_HREF}>{t.nav.app}</a>
        </nav>
        <LanguageSwitcher current={locale} className="sr-lang-switch" />
        <a className="sr-header__cta" href={CONTACT_MAIL}>{t.nav.start}</a>
        <button className="sr-menu" type="button" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
      {menuOpen && (
        <nav className="sr-mobile-nav" aria-label="Mobile">
          <a href="#how" onClick={() => setMenuOpen(false)}>{t.nav.how}</a>
          <a href={APP_HREF}>{t.nav.app}</a>
          <LanguageSwitcher current={locale} className="sr-lang-switch sr-lang-switch--mobile" />
          <a href={CONTACT_MAIL}>{t.nav.start}</a>
        </nav>
      )}

      <main>
        {/* @section: hero */}
        <section id="top" className="sb-hero">
          <div className="sb-hero__inner sr-shell">
            <div className="sb-hero__copy">
              <span className="sr-kicker">{t.hero.kicker}</span>
              <h1><BreakText text={t.hero.heading} /></h1>
              <p className="sb-hero__lead">{t.hero.lead}</p>
              <div className="sr-hero__actions">
                <a className="sr-button" href={CONTACT_MAIL}>{t.hero.ctaPrimary} <ArrowRight size={17} /></a>
                <a className="sr-button sr-button--ghost" href="#how">{t.hero.ctaSecondary}</a>
              </div>
            </div>
            <div className="sr-shot sr-shot--hero">
              <img src="/screens/map-business.png" alt="Saigon Rider business pin on the neighborhood map" />
            </div>
          </div>
        </section>

        {/* @section: how-it-works */}
        <section id="how" className="sb-how sr-shell">
          <div className="sr-section-head">
            <span className="sr-kicker">{t.howHead.kicker}</span>
            <h2>{t.howHead.heading}</h2>
          </div>
          <ol className="sb-how__list">
            {t.how.map((step) => (
              <li key={step.step}>
                <span>{step.step}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* @section: benefits */}
        <section className="sb-benefits sr-shell">
          <div className="sr-section-head">
            <span className="sr-kicker">{t.benefitsHead.kicker}</span>
            <h2>{t.benefitsHead.heading}</h2>
          </div>
          <div className="sr-safety__grid">
            {t.benefits.map((benefit, index) => {
              const Icon = benefitIcons[index];
              return (
                <article className="sr-safety-card" key={benefit.title}>
                  <Icon size={24} />
                  <h3>{benefit.title}</h3>
                  <p>{benefit.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* @section: showcase */}
        <section className="sb-showcase">
          <div className="sb-showcase__inner sr-shell">
            <div className="sr-shot sb-showcase__shot">
              <img src="/screens/map-business-carousel.png" alt="Saigon Rider business card carousel on the map" />
            </div>
            <div className="sb-showcase__copy">
              <h2><BreakText text={t.showcase.heading} /></h2>
              <p>{t.showcase.body}</p>
              <a className="sr-button" href={CONTACT_MAIL}>{t.showcase.cta} <ArrowRight size={17} /></a>
            </div>
          </div>
        </section>

        {/* @section: testimonials */}
        {SHOW_TESTIMONIALS && (
          <section className="sb-testimonials sr-shell">
            <div className="sr-section-head">
              <span className="sr-kicker">{t.testimonialsHead.kicker}</span>
              <h2>{t.testimonialsHead.heading}</h2>
            </div>
            <div className="sb-testimonials__grid">
              {t.testimonials.map((item) => (
                <article className="sb-testimonial-card" key={item.label}>
                  <p>“{item.quote}”</p>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* @section: faq */}
        <section className="sb-faq sr-shell">
          <div className="sr-section-head">
            <span className="sr-kicker">{t.faqHead.kicker}</span>
            <h2>{t.faqHead.heading}</h2>
          </div>
          <div className="sb-faq__list">
            {t.faq.map((item) => (
              <details className="sb-faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* @section: cta-band */}
        <section className="sr-cta-band sb-cta-band">
          <div className="sb-cta-band__inner sr-shell">
            <h2><BreakText text={t.ctaBand.heading} /></h2>
            <a className="sr-button sr-button--final" href={CONTACT_MAIL}>{t.ctaBand.cta} <ArrowRight size={18} /></a>
          </div>
        </section>
      </main>

      {/* @section: footer */}
      <footer className="sr-footer sr-shell">
        <div className="sr-footer__brand">
          <span><SaigonMark />SAIGON RIDER Business</span>
          <p>{t.footer.tagline}</p>
        </div>
        <nav className="sr-footer__links" aria-label="Footer">
          <a href="#how">{t.footer.nav.how}</a>
          <a href={APP_HREF}>{t.footer.nav.app}</a>
          <a href={PRIVACY_HREF}>{t.footer.nav.privacy}</a>
          <a href={CONTACT_MAIL}>{t.footer.nav.contact}</a>
        </nav>
        <small>{t.footer.bottomLine}</small>
      </footer>
    </div>
  );
}

export default SaigonRiderBusiness;
