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
  // iOS 네이티브는 키보드가 순수 오버레이(웹뷰 리사이즈/팬 없음) — 키보드 회피는
  // 브리지 키보드 높이(useKeyboard) 단일 소스로만 하고 visualViewport 는 쓰지 않는다.
  // (최신 WKWebView 는 오버레이 키보드도 vv.height 를 줄여 보고하므로 섞으면 이중 보정)
  const isIosNative = native.platform === 'ios';
  // 키보드 표시 중 시트 높이를 키우기 위한 명시 높이 — 문자열('60vh')과 숫자(px) 모두 지원.
  const rawHeight = sheetStyle?.height;
  const sheetStyleHeight =
    typeof rawHeight === 'string' ? rawHeight : typeof rawHeight === 'number' ? `${rawHeight}px` : undefined;

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

      // iOS 네이티브: 키보드가 순수 오버레이(웹뷰 리사이즈/팬 없음)라 레이아웃 뷰포트는
      // 불변이지만, 최신 WKWebView 는 visualViewport 를 키보드만큼 줄여서 보고한다 —
      // vv 를 지오메트리에 쓰면 키보드 보정과 이중이 된다. 브리지 높이(kb)만 단일 소스.
      // 시트는 띄우지 않고 바닥에 붙인 채 내부 하단에 키보드 높이만큼 흰 여백을 둔다 —
      // 키보드가 시트의 흰 하단부를 덮으므로 시트와 키보드 사이로 딤 배경이 드러나지 않는다.
      // 콘텐츠 영역이 줄지 않게 명시 높이(sheetStyle.height)는 키보드만큼 키운다.
      if (isIosNative) {
        backdrop.style.top = '';
        backdrop.style.left = '';
        backdrop.style.width = '';
        backdrop.style.height = '';
        backdrop.style.paddingBottom = '';
        if (kb.visible) {
          sheet.style.paddingBottom = `${kb.height + 20}px`; // 20px = CSS 기본 하단 패딩 유지분
          if (sheetStyleHeight) sheet.style.height = `calc(${sheetStyleHeight} + ${kb.height}px)`;
        } else {
          sheet.style.paddingBottom = '';
          if (sheetStyleHeight) sheet.style.height = sheetStyleHeight;
        }
        sheet.style.maxHeight = ''; // CSS 기본 max-height(calc(100% - 60px)) 사용
        return;
      }

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
      backdrop.style.paddingBottom = '';
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
        sheet.style.paddingBottom = '';
      }
    };
  }, [open, isIosNative, kb.height, kb.visible, sheetStyleHeight]);

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
