import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppImage } from './AppImage';
import styles from './ImageCarousel.module.css';

interface Props {
  urls: string[];
  onImageClick?: (index: number) => void;
}

export function ImageCarousel({ urls, onImageClick }: Props) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const startIdx = useRef(0);
  const dragging = useRef(false);
  const dx = useRef(0);
  const lockedAxis = useRef<'x' | 'y' | null>(null);

  const count = urls.length;
  if (count === 0) return null;
  if (count === 1) {
    return (
      <button className={styles.single} onClick={() => onImageClick?.(0)} aria-label={t('common.viewPhoto')}>
        <AppImage src={urls[0]} alt="" className={styles.img} />
      </button>
    );
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startIdx.current = current;
    dragging.current = false;
    dx.current = 0;
    lockedAxis.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    dx.current = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (!lockedAxis.current && (Math.abs(dx.current) > 8 || Math.abs(dy) > 8)) {
      lockedAxis.current = Math.abs(dx.current) > Math.abs(dy) ? 'x' : 'y';
    }

    if (lockedAxis.current === 'y') return;

    if (Math.abs(dx.current) > 8) {
      dragging.current = true;
    }
    if (dragging.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (dragging.current && trackRef.current) {
      const offset = -startIdx.current * 100 + (dx.current / trackRef.current.parentElement!.clientWidth) * 100;
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = `translateX(${offset}%)`;
    }
  };

  const handleTouchEnd = () => {
    if (!dragging.current) return;
    const threshold = 50;
    let next = startIdx.current;
    if (dx.current < -threshold && next < count - 1) next++;
    else if (dx.current > threshold && next > 0) next--;
    setCurrent(next);
    if (trackRef.current) {
      trackRef.current.style.transition = 'transform .3s ease';
      trackRef.current.style.transform = `translateX(${-next * 100}%)`;
    }
    dragging.current = false;
  };

  const handleClick = (idx: number) => {
    if (!dragging.current) onImageClick?.(idx);
  };

  return (
    <div className={styles.wrap}>
      <div
        className={styles.track}
        ref={trackRef}
        style={{ transform: `translateX(${-current * 100}%)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {urls.map((url, i) => (
          <button key={i} className={styles.slide} onClick={() => handleClick(i)} aria-label={t('common.viewPhoto')}>
            <AppImage src={url} alt="" className={styles.img} />
          </button>
        ))}
      </div>
      <div className={styles.dots}>
        {urls.map((_, i) => (
          <span key={i} className={`${styles.dot} ${i === current ? styles.dotActive : ''}`} />
        ))}
      </div>
      <span className={styles.counter}>{current + 1}/{count}</span>
    </div>
  );
}
