import { toast as sonnerToast } from 'sonner';
import type { CSSProperties } from 'react';

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

export const toast = {
  success: (message: string) =>
    sonnerToast.success(message, { style: accent('var(--success)', 'rgba(22,163,74,.14)') }),
  error: (message: string) =>
    sonnerToast.error(message, { style: accent('var(--danger)', 'rgba(239,59,59,.14)') }),
  info: (message: string) =>
    sonnerToast.info(message, { style: accent('var(--brand-500)', 'rgba(255,90,31,.16)') }),
  warning: (message: string) =>
    sonnerToast.warning(message, { style: accent('var(--warn)', 'rgba(245,158,11,.14)') }),
};
