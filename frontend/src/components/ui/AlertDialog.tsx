import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextProp } from './dialogTypes';
import { normalizeTextProp, resolveText } from './dialogTypes';
import styles from './AlertDialog.module.css';

interface AlertDialogProps {
  open: boolean;
  /** string → text 모드, { mode:'code', value:'i18n.key' } → i18n, { mode:'html' } → HTML 렌더 */
  title?: TextProp;
  message?: TextProp;
  pre?: string;
  onClose: () => void;
  /** 제공 시 취소+확인 버튼 모드로 전환 */
  onConfirm?: () => void;
  /** default: i18n 'common.confirm' */
  confirmLabel?: TextProp;
  /** default: i18n 'common.cancel' */
  cancelLabel?: TextProp;
}

function renderTextProp(prop: TextProp, t: (key: string) => string): React.ReactNode {
  const { mode, value } = normalizeTextProp(prop);
  if (mode === 'code') return t(value);
  if (mode === 'html') return <span dangerouslySetInnerHTML={{ __html: value }} />;
  return value; // 'text'
}

export function AlertDialog({
  open, title, message, pre, onClose, onConfirm,
  confirmLabel = { mode: 'code', value: 'common.confirm' },
  cancelLabel  = { mode: 'code', value: 'common.cancel' },
}: AlertDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {title   && <div className={styles.title}>{renderTextProp(title, t)}</div>}
        {message && <div className={styles.body}>{renderTextProp(message, t)}</div>}
        {pre     && <pre className={styles.pre}>{pre}</pre>}
        <div className={styles.actions}>
          {onConfirm && (
            <button className={styles.cancel} onClick={onClose}>
              {resolveText(cancelLabel, t)}
            </button>
          )}
          <button className={styles.ok} onClick={onConfirm ?? onClose}>
            {resolveText(confirmLabel, t)}
          </button>
        </div>
      </div>
    </div>
  );
}
