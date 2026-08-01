import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirmStore } from '@/store/useConfirmStore';
import { normalizeTextProp, resolveText } from './dialogTypes';
import styles from './ConfirmDialog.module.css';

function renderTextProp(prop: import('./dialogTypes').TextProp, t: (key: string) => string): React.ReactNode {
  const { mode, value } = normalizeTextProp(prop);
  if (mode === 'code') return t(value);
  if (mode === 'html') return <span dangerouslySetInnerHTML={{ __html: value }} />;
  return value; // 'text'
}

export function ConfirmDialog() {
  const { t } = useTranslation();
  const { isOpen, message, confirmLabel, cancelLabel, onConfirm, close } = useConfirmStore();

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const handleConfirm = () => { onConfirm(); close(); };

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <p className={styles.message}>{renderTextProp(message, t)}</p>
        <div className={styles.actions}>
          <button className={styles.cancel} onClick={close}>
            {resolveText(cancelLabel, t)}
          </button>
          <button className={styles.confirm} onClick={handleConfirm}>
            {resolveText(confirmLabel, t)}
          </button>
        </div>
      </div>
    </div>
  );
}
