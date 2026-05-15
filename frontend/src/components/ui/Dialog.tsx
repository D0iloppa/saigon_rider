import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogStore } from '@/store/useDialogStore';
import { normalizeTextProp, resolveText } from './dialogTypes';
import type { TextProp } from './dialogTypes';
import styles from './Dialog.module.css';

const DEFAULT_CONFIRM: TextProp = { mode: 'code', value: 'common.confirm' };
const DEFAULT_CANCEL:  TextProp = { mode: 'code', value: 'common.cancel'  };

function renderTextProp(prop: TextProp, t: (key: string) => string): React.ReactNode {
  const { mode, value } = normalizeTextProp(prop);
  if (mode === 'code') return t(value);
  if (mode === 'html') return <span dangerouslySetInnerHTML={{ __html: value }} />;
  return value;
}

export function Dialog() {
  const { t } = useTranslation();
  const { isOpen, options, close } = useDialogStore();
  const { title, message, pre, onConfirm, confirmLabel, cancelLabel } = options;

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    close();
    if (onConfirm) onConfirm();
  };

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {title   && <div className={styles.title}>{renderTextProp(title, t)}</div>}
        {message && <div className={styles.body}>{renderTextProp(message, t)}</div>}
        {pre     && <pre className={styles.pre}>{pre}</pre>}
        <div className={styles.actions}>
          {onConfirm && (
            <button className={styles.cancel} onClick={close}>
              {resolveText(cancelLabel ?? DEFAULT_CANCEL, t)}
            </button>
          )}
          <button className={styles.ok} onClick={handleConfirm}>
            {resolveText(confirmLabel ?? DEFAULT_CONFIRM, t)}
          </button>
        </div>
      </div>
    </div>
  );
}
