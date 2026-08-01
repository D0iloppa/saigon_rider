import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import styles from './ImageViewer.module.css';

// AppImage 와 동일한 폴백 자산 (src/components/ui/AppImage.tsx ERROR_IMG)
const ERROR_IMG = '/img-error.png';

// ─── ImageViewer (다중 이미지 + 확대/축소/스와이프) ─────────────────────────
// FeedList.tsx 에서 승격 (2026-07-27) — 커뮤니티 피드 상세뿐 아니라 업체 상세(BizPublic)
// 등 여러 화면이 공용으로 재사용한다. FeedList.tsx 는 하위호환을 위해 re-export 한다.
interface ViewerTouchState {
  type: 'none' | 'single' | 'pinch';
  startX: number;
  startY: number;
  startTX: number;
  startTY: number;
  startDist: number;
  startScale: number;
  lastTap: number;
}

export function ImageViewer({ srcs, initialIndex = 0, onClose }: { srcs: string[]; initialIndex?: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [visible, setVisible] = useState(false);

  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const swipeDx = useRef(0);
  const touch = useRef<ViewerTouchState>({
    type: 'none',
    startX: 0, startY: 0, startTX: 0, startTY: 0,
    startDist: 0, startScale: 1, lastTap: 0,
  });

  scaleRef.current = scale;
  txRef.current = tx;
  tyRef.current = ty;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function resetZoom() { setScale(1); setTx(0); setTy(0); }
  function close() { setVisible(false); setTimeout(onClose, 200); }
  function clampScale(s: number) { return Math.min(Math.max(s, 1), 5); }

  function goTo(i: number) {
    setIdx(i);
    resetZoom();
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = clampScale(scaleRef.current - e.deltaY * 0.002);
    setScale(next);
    if (next <= 1) { setTx(0); setTy(0); }
  }

  function dist(t: React.TouchList | TouchList) {
    return Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
  }

  function handleTouchStart(e: React.TouchEvent) {
    swipeDx.current = 0;
    if (e.touches.length === 2) {
      touch.current = { ...touch.current, type: 'pinch', startDist: dist(e.touches), startScale: scaleRef.current, startX: 0, startY: 0, startTX: 0, startTY: 0 };
    } else {
      const now = Date.now();
      const isDoubleTap = now - touch.current.lastTap < 280;
      touch.current = { ...touch.current, type: 'single', startX: e.touches[0].clientX, startY: e.touches[0].clientY, startTX: txRef.current, startTY: tyRef.current, lastTap: isDoubleTap ? 0 : now };
      if (isDoubleTap) {
        const next = scaleRef.current > 1 ? 1 : 2.5;
        setScale(next);
        if (next <= 1) { setTx(0); setTy(0); }
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const t = touch.current;
    if (t.type === 'pinch' && e.touches.length === 2) {
      const next = clampScale(t.startScale * (dist(e.touches) / t.startDist));
      setScale(next);
      if (next <= 1) { setTx(0); setTy(0); }
    } else if (t.type === 'single' && e.touches.length === 1) {
      const dxVal = e.touches[0].clientX - t.startX;
      const dy = e.touches[0].clientY - t.startY;
      swipeDx.current = dxVal;
      if (scaleRef.current <= 1) {
        if (dy > 80) { close(); return; }
        setTy(dy * 0.3);
      } else {
        setTx(t.startTX + dxVal);
        setTy(t.startTY + dy);
      }
    }
  }

  function handleTouchEnd() {
    if (scaleRef.current <= 1) {
      setTy(0);
      if (srcs.length > 1) {
        if (swipeDx.current < -60 && idx < srcs.length - 1) { goTo(idx + 1); return; }
        if (swipeDx.current > 60 && idx > 0) { goTo(idx - 1); return; }
      }
    }
    touch.current.type = 'none';
  }

  const imgStyle: React.CSSProperties = {
    transform: `scale(${scale}) translate(${tx / scale}px, ${ty / scale}px)`,
    cursor: scale > 1 ? 'grab' : 'zoom-in',
    transition: touch.current.type !== 'none' ? 'none' : 'transform 0.2s ease',
  };

  return createPortal(
    <div className={`${styles.lightbox} ${visible ? styles.lightboxVisible : ''}`} onClick={close}>
      <button className={styles.lightboxClose} onClick={close} aria-label={t('common.close')}>
        <X size={20} strokeWidth={2.2} />
      </button>
      {srcs.length > 1 && (
        <div className={`${styles.lightboxCounter} num`}>{idx + 1} / {srcs.length}</div>
      )}
      <div
        className={styles.lightboxImgWrap}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={srcs[idx]}
          alt=""
          style={imgStyle}
          className={styles.lightboxImg}
          draggable={false}
          onError={(e) => {
            const el = e.currentTarget;
            if (el.src.endsWith(ERROR_IMG)) return;
            el.src = ERROR_IMG;
          }}
        />
      </div>
      {srcs.length > 1 && (
        <div className={styles.lightboxDots}>
          {srcs.map((_, i) => (
            <span key={i} className={`${styles.lightboxDot} ${i === idx ? styles.lightboxDotActive : ''}`} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
