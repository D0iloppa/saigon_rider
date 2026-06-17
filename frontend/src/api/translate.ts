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
