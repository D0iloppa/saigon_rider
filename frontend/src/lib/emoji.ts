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

/**
 * 로컬 애니메이션 이모지는 GIF 대신 애니메이션 WebP 로 보관한다 (베트남 회선 대응).
 * 원본 Noto GIF 는 전부 512x512 인데 실제 표시 크기는 최대 96px(Splash) / 그 외 56px 이하라
 * 픽셀량이 과했다 — 합계 9.85MB → 2.7MB (-72%).
 * 애니메이션 WebP 지원: Android WebView(Chromium, minSdk 24) / iOS 15.2+ 모두 OK → <picture> 폴백 불필요.
 *
 * 새 이모지 추가 시 변환 레시피 (프레임 타이밍·disposal 보존을 위해 gifsicle 로 리사이즈 후 gif2webp):
 *   gifsicle -O3 --resize-fit <px>x<px> --resize-method lanczos3 in.gif -o r.gif
 *   gif2webp -lossy -q 80 -m 6 -mt r.gif -o out.webp
 *   (<px>: Splash 용 1f3cd 는 288, 나머지는 192)
 */

/** 코드 → 로컬 경로 (없으면 CDN URL) */
export function emojiUrl(code: string): string {
  const LOCAL_WEBP = new Set([
    '1f30d', '1f3af', '1f680', '1f4f7', '2705',
    '1f514', '2699',  '1f48e', '1fa99', '1f3c6',
    '1f3cd', '2615',  '1f31f',
    '2b50',  '26a1',
  ]);
  const LOCAL_PNG = new Set([
    '1f4cd', '1f9ed',
  ]);

  if (LOCAL_WEBP.has(code)) return `${BASE}/${code}.webp`;
  if (LOCAL_PNG.has(code)) return `${BASE}/${code}.png`;
  // 로컬에 없는 나머지 코드는 CDN 폴백 (국기 코드는 넘기지 말 것 — 위 주석 참고)
  return `${CDN}/${code}/512.gif`;
}
