import { toast as sonnerToast } from 'sonner';
import type { CSSProperties } from 'react';

const BASE: CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E8E3DA',
  color: '#0B0D14',
  borderRadius: '12px',
  fontSize: '13px',
  fontWeight: '500',
  lineHeight: '1.4',
  boxShadow: '0 4px 16px rgba(11,13,20,.10), 0 1px 4px rgba(11,13,20,.06)',
  padding: '10px 13px',
  gap: '8px',
};

export const toast = {
  success: (message: string) =>
    sonnerToast.success(message, { style: { ...BASE, borderLeft: '3px solid #16A34A' } }),
  error: (message: string) =>
    sonnerToast.error(message, { style: { ...BASE, borderLeft: '3px solid #EF3B3B' } }),
  info: (message: string) =>
    sonnerToast.info(message, { style: { ...BASE, borderLeft: '3px solid #FF5A1F' } }),
  warning: (message: string) =>
    sonnerToast.warning(message, { style: { ...BASE, borderLeft: '3px solid #F59E0B' } }),
};
