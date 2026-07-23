import { toast as sonnerToast } from 'sonner';
import { createElement, useId, useLayoutEffect, type CSSProperties } from 'react';

/* Dialog 와 톤 정렬(surface + 부드러운 그림자)하되, 토스트는 backdrop 이 없어
 * 라이브 UI 위에 바로 떠므로 가장자리 정의용 1px 보더는 유지한다. */
const BASE: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  color: 'var(--text)',
  borderRadius: '16px',
  fontFamily: 'inherit',
  fontSize: '13.5px',
  fontWeight: 600,
  lineHeight: '1.45',
  padding: '13px 15px',
  gap: '10px',
};

/** 좌측 inset 액센트 바 + 동일 색의 미세 글로우. Dialog 식 깊은 그림자 위에 상태색만 얹는다. */
const accent = (color: string, glow: string): CSSProperties => ({
  ...BASE,
  boxShadow: `inset 3px 0 0 ${color}, 0 10px 32px rgba(0,0,0,.18), 0 6px 18px ${glow}`,
});

export interface NeutralToastOptions {
  /** 앵커 가장자리 — 미지정 시 하단(탭바 위). 검색바 등 상단 UI와 겹칠 때만 'top'. */
  position?: 'top' | 'bottom';
  /** 앵커 가장자리로부터의 추가 오프셋(px) — safe-area(--bottom-safe/--status-bar-height)에 더해진다. 기본 0. */
  safeMargin?: number;
  /** 기준 DOM 요소 또는 CSS 선택자. 찾지 못하면 기존 화면 가장자리 배치로 표시한다. */
  anchor?: HTMLElement | string | null;
  /** anchor 기준 표시 방향. 기본 'bottom'. */
  anchorPlacement?: 'top' | 'bottom';
}

const NEUTRAL_CONTENT_STYLE: CSSProperties = {
  display: 'block',
  width: 'fit-content',
  maxWidth: 'calc(100vw - 32px)',
  margin: '0 auto',
  background: 'rgba(40, 44, 52, 0.92)',
  color: '#fff',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: 600,
  padding: '7px 14px',
  textAlign: 'center',
};

function NeutralToastContent({ message, opts }: { message: string; opts?: NeutralToastOptions }) {
  const contentId = useId();

  useLayoutEffect(() => {
    const content = document.getElementById(contentId);
    if (!content) return;

    let frame = 0;
    const updatePosition = () => {
      frame = 0;
      content.style.transform = '';

      let anchor: HTMLElement | null = null;
      if (typeof opts?.anchor === 'string') {
        try {
          const match = document.querySelector(opts.anchor);
          anchor = match instanceof HTMLElement ? match : null;
        } catch {
          anchor = null;
        }
      } else if (opts?.anchor?.isConnected) {
        anchor = opts.anchor;
      }

      const contentRect = content.getBoundingClientRect();
      const toastElement = content.closest<HTMLElement>('[data-sonner-toast]');
      let sonnerOffsetX = 0;
      let sonnerOffsetY = 0;
      if (toastElement) {
        try {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(toastElement).transform);
          sonnerOffsetX = matrix.m41;
          sonnerOffsetY = matrix.m42;
        } catch {
          // 변환 행렬을 읽을 수 없는 환경에서는 현재 viewport 좌표를 그대로 사용한다.
        }
      }
      const viewportMargin = 16;
      const anchorRect = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
      const desiredCenterX = anchorRect
        ? Math.min(
            window.innerWidth - viewportMargin - contentRect.width / 2,
            Math.max(
              viewportMargin + contentRect.width / 2,
              anchorRect.left + anchorRect.width / 2,
            ),
          )
        : window.innerWidth / 2;
      const translateX =
        desiredCenterX - (contentRect.left - sonnerOffsetX + contentRect.width / 2);

      if (!anchorRect) {
        content.style.transform = `translate3d(${translateX}px, 0, 0)`;
        return;
      }

      const gap = 8 + (opts?.safeMargin ?? 0);
      const unclampedTop =
        opts?.anchorPlacement === 'top'
          ? anchorRect.top - gap - contentRect.height
          : anchorRect.bottom + gap;
      const desiredTop = Math.min(
        window.innerHeight - viewportMargin - contentRect.height,
        Math.max(viewportMargin, unclampedTop),
      );

      content.style.transform = `translate3d(${translateX}px, ${desiredTop - (contentRect.top - sonnerOffsetY)}px, 0)`;
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updatePosition);
    };

    updatePosition();
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);
    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [contentId, opts?.anchor, opts?.anchorPlacement, opts?.safeMargin]);

  return createElement('span', { id: contentId, style: NEUTRAL_CONTENT_STYLE }, message);
}

export const toast = {
  success: (message: string) =>
    sonnerToast.success(message, { style: accent('var(--success)', 'rgba(22,163,74,.14)') }),
  error: (message: string) =>
    sonnerToast.error(message, { style: accent('var(--danger)', 'rgba(239,59,59,.14)') }),
  info: (message: string) =>
    sonnerToast.info(message, { style: accent('var(--brand-500)', 'rgba(255,90,31,.16)') }),
  warning: (message: string) =>
    sonnerToast.warning(message, { style: accent('var(--warn)', 'rgba(245,158,11,.14)') }),
  /** 동네지도(SaigonMapV5)·커뮤니티(FeedList) 공용 다크 필 토스트 — 에러가 아닌 안내(예: 서비스 지역 밖)용.
   * 기본 하단(탭바 위, safe-area 반영) 고정 배치 — position/safeMargin으로 화면별 겹침만 미세조정한다. */
  neutral: (message: string, opts?: NeutralToastOptions) => {
    const edge = opts?.position === 'top' ? 'top' : 'bottom';
    const safeMargin = opts?.safeMargin ?? 0;
    // sonner 의 <li data-sonner-toast> 는 position:absolute 라 가운데 정렬(x-position=center)일 때
    // left/right 를 아예 지정하지 않는다(모바일 미디어쿼리에서는 left:0;right:0 이 강제됨). 여기에
    // width:fit-content/margin/alignSelf 를 직접 걸면 CSS over-constrained 케이스에 빠져 좌우로
    // 불안정하게 치우친다. 그래서 li 자체는 컨테이너 폭 그대로 채우고(투명), 실제 다크 필은 그 안의
    // 일반 block 자식(span)에 width:fit-content + margin:auto 로 가운데 정렬한다(비-absolute 레이아웃
    // 이라 항상 결정적으로 중앙에 옴). 텍스트 색도 이 span 에서 흰색으로 고정한다.
    return sonnerToast(
      createElement(NeutralToastContent, { message, opts }),
      {
        duration: 2400,
        position: edge === 'top' ? 'top-center' : 'bottom-center',
        // 기본 스타일을 걷어내고(li 는 투명 풀와이드 레인) 위 span 만 필로 보인다.
        unstyled: true,
        style: {
          ...(safeMargin ? { [edge]: `${safeMargin}px` } : null),
        },
      },
    );
  },
};
