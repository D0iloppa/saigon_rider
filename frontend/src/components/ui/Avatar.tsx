import { AppImage } from './AppImage';
import styles from './Avatar.module.css';

const TONE_COUNT = 5;

function toneOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % TONE_COUNT;
}

/**
 * 원형 아바타 — 사진이 없으면 이름 첫 글자 + 시드 해시 배경으로 대체한다.
 * (AppImage 는 src 가 없으면 /img-error.png 로 폴백하므로 직접 넘기면 깨진 이미지가 된다)
 */
export function Avatar({
  src,
  name,
  seed,
  size = 40,
  className = '',
}: {
  src?: string | null;
  name: string;
  seed?: string;
  size?: number;
  className?: string;
}) {
  const initial = (Array.from(name.trim())[0] ?? '?').toUpperCase();
  return (
    <span className={`${styles.root} ${className}`} style={{ width: size, height: size }}>
      {src ? (
        <AppImage src={src} alt="" variant="circle" className={styles.img} />
      ) : (
        <span className={styles.initial} data-tone={toneOf(seed ?? name)} style={{ fontSize: Math.round(size * 0.42) }}>
          {initial}
        </span>
      )}
    </span>
  );
}
