import i18n from '@/lib/i18n';
import { api } from './client';

export interface TranslateResult {
  translated: string;
  targetLang: string;
  sourceLang: string | null;
  cached: boolean;
}

/**
 * 실시간 번역 — BFF /translate (원문 해시 캐시). 키 미발급 시 stub(원문 반환).
 * targetLang 미지정 시 현재 UI 언어(ko/en/vi).
 */
export async function translateText(
  text: string,
  targetLang?: string,
  sourceLang?: string,
): Promise<TranslateResult> {
  const target = targetLang ?? (i18n.language as string);
  const r = await api.realFetch<any>('/translate', {
    method: 'POST',
    body: JSON.stringify({ text, target_lang: target, source_lang: sourceLang ?? null }),
  });
  return {
    translated: r.translated,
    targetLang: r.target_lang,
    sourceLang: r.source_lang ?? null,
    cached: r.cached ?? false,
  };
}

export interface TranslateBundle {
  kr: string;
  en: string;
  vi: string;
  sourceLang: string;
}

/** 원문 → 3개 언어 번들({kr,en,vi}). 채팅 등 on-demand 번역용. */
export async function translateAll(text: string): Promise<TranslateBundle> {
  const r = await api.realFetch<any>('/translate/all', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  return { kr: r.kr, en: r.en, vi: r.vi, sourceLang: r.source_lang };
}

/** 번들에서 현재 UI 언어 번역문 선택 (ko→kr). */
export function pickLang(b: TranslateBundle, lang = i18n.language as string): string {
  return lang === 'ko' ? b.kr : lang === 'vi' ? b.vi : b.en;
}
