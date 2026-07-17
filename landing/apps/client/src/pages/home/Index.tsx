import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CloudRain,
  Droplets,
  Fuel,
  Gift,
  Handshake,
  Menu,
  Sparkles,
  Star,
  UtensilsCrossed,
  Users,
  Wrench,
  X,
} from "lucide-react";
import "./home-launch.css";
import { LOCALES, LOCALE_LABEL, content, localePath, resolveLocale } from "./content";

const SPLASH_HREF = "https://app.saigon-rider.com/splash";
const BUSINESS_HREF = "https://business.saigon-rider.com";
const PRIVACY_HREF = "https://app.saigon-rider.com/app_privacy/";
const SUPPORT_MAIL = "mailto:partner@saigon-rider.com";

const serviceMedia = [
  { id: "market", images: [{ src: "/screens/market-list.png" }, { src: "/screens/market-detail.png" }] },
  { id: "map", images: [{ src: "/screens/map-business.png" }, { src: "/screens/map-business-carousel.png" }] },
  { id: "community", images: [{ src: "/screens/community-feed.png" }] },
  { id: "rider-info", images: [], icons: [Droplets, Fuel, Wrench] },
  { id: "reward", images: [{ src: "/screens/profile-mileage.png" }, { src: "/screens/coupon-box.png" }] },
  { id: "business", images: [{ src: "/screens/map-business-carousel.png" }], ctaHref: BUSINESS_HREF },
];

const momentIcons = [CloudRain, UtensilsCrossed, Gift];
const safetyIcons = [BadgeCheck, Handshake, Star, Users];

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
    <div className={className} aria-label="언어 선택 · Language">
      {LOCALES.map((locale) => (
        <a key={locale} href={localePath(locale)} aria-current={locale === current ? "page" : undefined}>
          {LOCALE_LABEL[locale]}
        </a>
      ))}
    </div>
  );
}

function ServiceShots({ images }: { images: { src: string; alt: string }[] }) {
  if (images.length === 0) return null;
  return (
    <div className={images.length > 1 ? "sr-shot-group" : "sr-shot-single"}>
      {images.map((image) => (
        <div className="sr-shot" key={image.src}>
          <img src={image.src} alt={image.alt} loading="lazy" />
        </div>
      ))}
    </div>
  );
}

function SaigonRiderHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const locale = resolveLocale(location.pathname);
  const t = content[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const services = serviceMedia.map((media, index) => ({ ...media, ...t.services[index] }));

  return (
    <div className="sr-root">
      {/* @section: launch-header */}
      <header className="sr-header">
        <a className="sr-brand" href="#top" aria-label="SAIGON RIDER"><SaigonMark />SAIGON RIDER</a>
        <nav className="sr-nav" aria-label="Main">
          <a href="#services">{t.nav.services}</a>
          <a href="#safety">{t.nav.safety}</a>
          <a href={BUSINESS_HREF}>{t.nav.business}</a>
        </nav>
        <LanguageSwitcher current={locale} className="sr-lang-switch" />
        <a className="sr-header__cta" href={SPLASH_HREF}>{t.nav.start}</a>
        <button className="sr-menu" type="button" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
      {menuOpen && (
        <nav className="sr-mobile-nav" aria-label="Mobile">
          <a href="#services" onClick={() => setMenuOpen(false)}>{t.nav.services}</a>
          <a href="#safety" onClick={() => setMenuOpen(false)}>{t.nav.safety}</a>
          <a href={BUSINESS_HREF}>{t.nav.business}</a>
          <LanguageSwitcher current={locale} className="sr-lang-switch sr-lang-switch--mobile" />
          <a href={SPLASH_HREF}>{t.nav.start}</a>
        </nav>
      )}

      <main>
        {/* @section: hero */}
        <section id="top" className="sr-hero">
          <div className="sr-hero__photo" aria-hidden="true" />
          <div className="sr-hero__heat" aria-hidden="true" />
          <div className="sr-hero__inner">
            <div className="sr-hero__copy">
              <span className="sr-kicker">{t.hero.kicker}</span>
              <h1><BreakText text={t.hero.heading} /></h1>
              <p className="sr-hero__lead">{t.hero.lead}</p>
              <div className="sr-hero__actions">
                <a className="sr-button" href={SPLASH_HREF}>{t.hero.ctaPrimary} <ArrowRight size={17} /></a>
                <a className="sr-button sr-button--ghost" href="#services">{t.hero.ctaSecondary}</a>
              </div>
            </div>
            <div className="sr-shot sr-shot--hero">
              <img src="/screens/map-listing-bubble.png" alt="Saigon Rider neighborhood map" />
            </div>
          </div>
        </section>

        {/* @section: services */}
        <section id="services" className="sr-services sr-shell">
          <div className="sr-section-head">
            <span className="sr-kicker">{t.servicesHead.kicker}</span>
            <h2><BreakText text={t.servicesHead.heading} /></h2>
          </div>
          <div className="sr-service-list">
            {services.map((service) => (
              <article className="sr-service-item" key={service.id}>
                <div className="sr-service-item__media">
                  {service.images.length > 0 ? (
                    <ServiceShots images={service.images.map((image) => ({ ...image, alt: service.title }))} />
                  ) : (
                    <div className="sr-service-icons">
                      {service.icons?.map((Icon, index) => (
                        <div className="sr-service-icons__item" key={service.iconLabels?.[index]}>
                          <Icon size={26} />
                          <span>{service.iconLabels?.[index]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="sr-service-item__copy">
                  <span className="sr-kicker">{service.eyebrow}</span>
                  <h3>{service.title}</h3>
                  <p>{service.body}</p>
                  {service.bullets.length > 0 && (
                    <ul>
                      {service.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                    </ul>
                  )}
                  <a className="sr-service-item__cta" href={service.ctaHref ?? SPLASH_HREF}>{service.cta} <ArrowRight size={15} /></a>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* @section: moments */}
        <section className="sr-moments sr-shell">
          <div className="sr-section-head">
            <span className="sr-kicker">{t.momentsHead.kicker}</span>
            <h2>{t.momentsHead.heading}</h2>
          </div>
          <div className="sr-moments__grid">
            {t.moments.map((moment, index) => {
              const Icon = momentIcons[index];
              return (
                <article className="sr-moment-card" key={moment.title}>
                  <Icon size={28} />
                  <h3>{moment.title}</h3>
                  <p>{moment.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* @section: safety */}
        <section id="safety" className="sr-safety sr-shell">
          <div className="sr-section-head">
            <span className="sr-kicker">{t.safetyHead.kicker}</span>
            <h2><BreakText text={t.safetyHead.heading} /></h2>
          </div>
          <div className="sr-safety__grid">
            {t.safety.map((item, index) => {
              const Icon = safetyIcons[index];
              return (
                <article className="sr-safety-card" key={item.title}>
                  <Icon size={24} />
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* @section: stats */}
        <section className="sr-stats sr-shell">
          <div className="sr-section-head">
            <span className="sr-kicker">{t.statsHead.kicker}</span>
            <h2>{t.statsHead.heading}</h2>
          </div>
          <div className="sr-stats__grid">
            {t.stats.map((stat) => (
              <div className="sr-stat" key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* @section: cta-band */}
        <section className="sr-cta-band">
          <div className="sr-cta-band__inner sr-shell">
            <div className="sr-cta-band__copy">
              <Sparkles size={22} />
              <h2><BreakText text={t.ctaBand.heading} /></h2>
              <a className="sr-button sr-button--final" href={SPLASH_HREF}>{t.ctaBand.cta} <ArrowRight size={18} /></a>
            </div>
            <div className="sr-shot sr-shot--cta">
              <img src="/screens/home.png" alt="Saigon Rider home screen" />
            </div>
          </div>
        </section>

        {/* @section: business-banner */}
        <section className="sr-biz-banner sr-shell">
          <p>{t.bizBanner.copy}</p>
          <a className="sr-button sr-button--ghost" href={BUSINESS_HREF}>{t.bizBanner.cta} <ArrowRight size={15} /></a>
        </section>
      </main>

      {/* @section: footer */}
      <footer className="sr-footer sr-shell">
        <div className="sr-footer__brand">
          <span><SaigonMark />SAIGON RIDER</span>
          <p>{t.footer.tagline}</p>
        </div>
        <nav className="sr-footer__links" aria-label="Footer">
          <a href="#services">{t.footer.nav.services}</a>
          <a href={BUSINESS_HREF}>{t.footer.nav.business}</a>
          <a href={PRIVACY_HREF}>{t.footer.nav.privacy}</a>
          <a href={SUPPORT_MAIL}>{t.footer.nav.contact}</a>
        </nav>
        <small>{t.footer.bottomLine}</small>
      </footer>
    </div>
  );
}

export default SaigonRiderHome;
export const ProductPage = SaigonRiderHome;
export const SecurityPage = SaigonRiderHome;
export const SolutionsPage = SaigonRiderHome;
export const HowItWorksPage = SaigonRiderHome;
export const PricingPage = SaigonRiderHome;
export const ResourcesPage = SaigonRiderHome;
export const ContactPage = SaigonRiderHome;
