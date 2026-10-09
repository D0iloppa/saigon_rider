import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationKO from '../locales/ko/translation.json';
import translationEN from '../locales/en/translation.json';
import translationVI from '../locales/vi/translation.json';
import { syncPreferredLang } from './langSync';

const STORAGE_KEY = 'sr-lang';
const SUPPORTED = ['vi', 'en', 'ko'] as const;
type SupportedLang = (typeof SUPPORTED)[number];

// 저장된 언어가 없으면 기기 언어(vi/ko/en)를 따르고, 그 외는 en — iOS 네이티브 권한 문구 현지화와
// 일치시켜 권한 프롬프트와 UI 언어가 같도록 한다 (App Review G4 2026-10-09).
function detectDeviceLang(): SupportedLang {
  // eslint-disable-next-line no-restricted-globals -- 로케일 조회일 뿐 네이티브 기능이 아님
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const candidates = [...(nav?.languages ?? []), nav?.language ?? ''];
  for (const tag of candidates) {
    const primary = tag.toLowerCase().split('-')[0] as SupportedLang;
    if (SUPPORTED.includes(primary)) return primary;
  }
  return 'en';
}

function getSavedLang(): SupportedLang {
  const saved = localStorage.getItem(STORAGE_KEY);
  return SUPPORTED.includes(saved as SupportedLang)
    ? (saved as SupportedLang)
    : detectDeviceLang();
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

/** 언어 변경 + localStorage 영속화 (+ 로그인 상태면 서버 동기화 — 알림 문안 언어) */
export function changeLang(lang: SupportedLang): void {
  localStorage.setItem(STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
  syncPreferredLang(lang);
}

export default i18n;
