/**
 * Noto Emoji 로컬 경로 매핑
 *
 * public/emoji/ 에 다운로드된 파일을 사용.
 * 로컬에 없는 코드는 CDN 폴백.
 * 국기(flag)는 Noto 애니메이션 이모지 자체에 없어 CDN 에도 없다(404) — 이 함수로 렌더하지 말고
 * `flag-icons`(`fi fi-xx`) 를 쓴다 (Splash/LangSettings/PhoneVerify 관례).
 */

const BASE = '/emoji';
const CDN  = 'https://fonts.gstatic.com/s/e/notoemoji/latest';

/** 코드 → 로컬 경로 (없으면 CDN URL) */
export function emojiUrl(code: string): string {
  const LOCAL_GIF = new Set([
    '1f30d', '1f3af', '1f680', '1f4f7', '2705',
    '1f514', '2699',  '1f48e', '1fa99', '1f3c6',
    '1f3cd', '2615',  '1f31f',
    '2b50',  '26a1',
  ]);
  const LOCAL_PNG = new Set([
    '1f4cd', '1f9ed',
  ]);

  if (LOCAL_GIF.has(code)) return `${BASE}/${code}.gif`;
  if (LOCAL_PNG.has(code)) return `${BASE}/${code}.png`;
  // 로컬에 없는 나머지 코드는 CDN 폴백 (국기 코드는 넘기지 말 것 — 위 주석 참고)
  return `${CDN}/${code}/512.gif`;
}
