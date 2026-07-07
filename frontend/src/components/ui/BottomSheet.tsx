import { ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import styles from './BottomSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  height?: 'auto' | 'half' | 'full' | 'fit';
  sheetStyle?: React.CSSProperties;
}

export function BottomSheet({ open, onClose, children, height = 'auto', sheetStyle }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragY = useRef({ startY: 0, currentY: 0, dragging: false });
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이(웹뷰 리사이즈 없음) → visualViewport 가 안 줄어들어
  // 아래 top/height 보정만으론 시트가 키보드에 덮인다. backdrop 하단에 키보드 높이만큼
  // padding 을 둬 align-items:flex-end 인 시트를 그만큼 위로 밀어 올린다.
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  // iOS에서 키보드 등장 시 visualViewport가 스크롤되면 position:fixed backdrop이
  // layout viewport 기준으로 고정되어 화면 상단이 네이티브 배경색으로 번쩍이는 문제 방지.
  useLayoutEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    let rafId: number | null = null;

    const apply = () => {
      const backdrop = backdropRef.current;
      const sheet = sheetRef.current;
      if (!backdrop || !sheet) return;

      if (!vv) {
        backdrop.style.top = '';
        backdrop.style.left = '';
        backdrop.style.width = '';
        backdrop.style.height = '';
        backdrop.style.paddingBottom = '';
        sheet.style.maxHeight = '';
        return;
      }

      // position:fixed backdrop 은 레이아웃 뷰포트 기준이라 iOS 키보드 팬(offsetTop)만큼
      // top 으로 되돌려야 보이는 영역에 맞는다. 단 애니메이션 중 offsetTop 오버슛으로 튀는 것을
      // 막기 위해 유효범위 [0, innerHeight - height] 로 clamp 한다. (DmDetail 과 동일 원리)
      const clampedTop = Math.max(0, Math.min(vv.offsetTop, window.innerHeight - vv.height));
      backdrop.style.top = `${clampedTop}px`;
      backdrop.style.left = '0px';
      backdrop.style.width = `${vv.width}px`;
      backdrop.style.height = `${vv.height}px`;
      // iOS 네이티브는 키보드가 순수 오버레이라 vv.height 가 줄지 않음 — backdrop 하단에
      // 키보드 높이만큼 padding 을 둬 align-items:flex-end 시트를 그만큼 위로 밀어 올린다.
      backdrop.style.paddingBottom = isIosNative && kb.visible ? `${kb.height}px` : '';
      sheet.style.maxHeight = `${Math.max(vv.height - 60, 240)}px`;
    };

    // 키보드 등장/퇴장 애니메이션 중 resize/scroll이 짧은 간격으로 여러 번 발생 —
    // 매번 즉시 반영하면 값이 튀는 중간 프레임이 그대로 스타일에 박혀 검은 여백이
    // 잠깐 노출될 수 있어 requestAnimationFrame으로 프레임당 한 번만 반영한다.
    const update = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('resize', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    // 일부 WebView는 입력 포커스를 빠르게 여러 번 전환하면 visualViewport 이벤트를
    // 누락/coalescing 하는 경우가 있어 focusin/focusout에서도 재동기화한다(반복 토글 버그 대응).
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      const backdrop = backdropRef.current;
      const sheet = sheetRef.current;
      if (backdrop) {
        backdrop.style.top = '';
        backdrop.style.left = '';
        backdrop.style.width = '';
        backdrop.style.height = '';
        backdrop.style.paddingBottom = '';
      }
      if (sheet) {
        sheet.style.maxHeight = '';
      }
    };
  }, [open, isIosNative, kb.height, kb.visible]);

  const handleTouchStart = (e: React.TouchEvent) => {
    dragY.current = { startY: e.touches[0].clientY, currentY: 0, dragging: true };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragY.current.dragging || !sheetRef.current) return;
    const dy = e.touches[0].clientY - dragY.current.startY;
    dragY.current.currentY = dy;
    if (dy > 0) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!sheetRef.current) return;
    const dy = dragY.current.currentY;
    dragY.current.dragging = false;
    if (dy > 120) {
      onClose();
    } else {
      sheetRef.current.style.transform = '';
    }
  };

  if (!open) return null;

  const portalTarget = document.getElementById('app-frame') ?? document.body;

  return createPortal(
    <div ref={backdropRef} className={styles.backdrop} onClick={onClose}>
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${styles[height]}`}
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={styles.grabber}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        {(height === 'full' || height === 'fit') && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        )}
        <div className={styles.scrollBody}>{children}</div>
      </div>
    </div>,
    portalTarget,
  );
}
