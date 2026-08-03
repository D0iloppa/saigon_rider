import { useState, useCallback, useEffect, useRef } from 'react';
import styles from './AppImage.module.css';

const ERROR_IMG = '/img-error.png';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | string[];
  variant?: 'rect' | 'circle';
  /** above-the-fold 히어로 이미지용 lazy 옵트아웃. 기본은 lazy(디코딩 async). */
  priority?: boolean;
}

function toChain(src: string | string[] | undefined): string[] {
  if (Array.isArray(src)) return src.filter(Boolean);
  return src ? [src] : [];
}

// src 변경 시 key로 강제 리마운트 → 내부 상태 자동 초기화
export function AppImage({ src, variant = 'rect', className = '', priority = false, ...rest }: Props) {
  const srcKey = Array.isArray(src) ? src.join('|') : (src ?? '');
  return (
    <AppImageInner
      key={srcKey}
      chain={toChain(src)}
      variant={variant}
      className={className}
      priority={priority}
      {...rest}
    />
  );
}

interface InnerProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  chain: string[];
  variant: 'rect' | 'circle';
  priority: boolean;
}

function AppImageInner({ chain, variant, className, priority, onLoad, onError, loading, decoding, ...imgProps }: InnerProps) {
  const [loaded, setLoaded] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string>(chain[0] ?? ERROR_IMG);
  const chainIndex = useRef(0);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(retryTimer.current);
  }, []);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setLoaded(true);
      onLoad?.(e);
    },
    [onLoad],
  );

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const idx = chainIndex.current;
      const isLast = idx >= chain.length - 1;

      if (!isLast) {
        chainIndex.current = idx + 1;
        retryCount.current = 0;
        setCurrentUrl(chain[chainIndex.current]);
      } else if (retryCount.current < MAX_RETRIES) {
        const attempt = retryCount.current + 1;
        retryCount.current = attempt;
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const base = chain[idx] ?? '';
        retryTimer.current = setTimeout(() => {
          const sep = base.includes('?') ? '&' : '?';
          setCurrentUrl(`${base}${sep}_r=${attempt}`);
        }, delay);
      } else {
        setCurrentUrl(ERROR_IMG);
        setLoaded(true);
      }

      onError?.(e);
    },
    [chain, onError],
  );

  return (
    <span className={`${styles.wrapper} ${className}`} data-variant={variant}>
      {!loaded && <span className={styles.skeleton} />}
      <img
        {...imgProps}
        src={currentUrl}
        className={`${styles.img} ${loaded ? styles.visible : ''}`}
        loading={loading ?? (priority ? 'eager' : 'lazy')}
        decoding={decoding ?? 'async'}
        onLoad={handleLoad}
        onError={handleError}
      />
    </span>
  );
}
