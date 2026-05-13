import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationKO from '../locales/ko/translation.json';
import translationEN from '../locales/en/translation.json';
import translationVI from '../locales/vi/translation.json';

const STORAGE_KEY = 'sr-lang';
const SUPPORTED = ['vi', 'en', 'ko'] as const;
type SupportedLang = (typeof SUPPORTED)[number];

function getSavedLang(): SupportedLang {
  const saved = localStorage.getItem(STORAGE_KEY);
  return SUPPORTED.includes(saved as SupportedLang)
    ? (saved as SupportedLang)
    : 'vi';
}

const resources = {
  ko: { translation: translationKO },
  en: { translation: translationEN },
  vi: { translation: translationVI },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLang(),
    fallbackLng: ['en', 'ko'],
    interpolation: {
      escapeValue: false,
    },
  });

/** 언어 변경 + localStorage 영속화 */
export function changeLang(lang: SupportedLang): void {
  localStorage.setItem(STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

export default i18n;
