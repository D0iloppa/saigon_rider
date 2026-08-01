export type TextMode = 'text' | 'code' | 'html';

/**
 * 다이얼로그 텍스트 입력 타입
 *
 * - string           → { mode:'text', value:string } 으로 자동 변환 (default)
 * - { mode:'text' }  → 명시적 text 모드 (그대로 출력)
 * - { mode:'code' }  → i18n 키로 처리 (t(value))
 * - { mode:'html' }  → dangerouslySetInnerHTML
 */
export type TextProp = string | { mode: TextMode; value: string };

/** string → { mode:'text', value } 정규화. 모든 resolve 함수의 진입점 */
export function normalizeTextProp(prop: TextProp): { mode: TextMode; value: string } {
  return typeof prop === 'string' ? { mode: 'text', value: prop } : prop;
}

/** 버튼 라벨 등 string 결과가 필요한 경우 (html 미지원) */
export function resolveText(prop: TextProp, t: (key: string) => string): string {
  const { mode, value } = normalizeTextProp(prop);
  if (mode === 'code') return t(value);
  return value;
}
