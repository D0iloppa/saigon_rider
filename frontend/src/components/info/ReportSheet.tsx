import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import styles from './ReportSheet.module.css';

export interface ReportFields {
  name: string;
  phone?: string;
  note?: string;
}

interface Props {
  open: boolean;
  title: string;
  desc: string;
  namePlaceholder: string;
  phonePlaceholder: string;
  notePlaceholder: string;
  submitLabel: string;
  submittingLabel: string;
  /** 제출(GPS·API·토스트는 호출부). true 반환 시 시트 초기화+닫힘. */
  onSubmit: (fields: ReportFields) => Promise<boolean>;
  onClose: () => void;
}

/** 신규 장소(주유소·정비소) 제보 바텀시트. 이름·전화·메모 공통. */
export default function ReportSheet({
  open, title, desc, namePlaceholder, phonePlaceholder, notePlaceholder, submitLabel, submittingLabel, onSubmit, onClose,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 하단에 고정된 이 시트를 그대로 덮는다 —
  // 시트 자신의 padding-bottom 을 키보드 높이만큼 늘려 여백을 확보한다.
  // (ai-docs/context/keyboard-ux.md 케이스 2)
  const isIosNative = native.platform === 'ios';

  if (!open) return null;

  async function handleSubmit() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit({ name: name.trim(), phone: phone.trim() || undefined, note: note.trim() || undefined });
      if (ok) {
        setName('');
        setPhone('');
        setNote('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={() => !submitting && onClose()}
    >
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        style={
          isIosNative && kb.visible
            ? {
                maxHeight: 'calc(100% - var(--status-bar-height, 0px) - 12px)',
                paddingBottom: `calc(${kb.height}px + 20px)`,
              }
            : undefined
        }
      >
        <div className={styles.title}>{title}</div>
        <div className={styles.desc}>{desc}</div>
        <input className={styles.field} placeholder={namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
        <input className={styles.field} placeholder={phonePlaceholder} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={styles.field} placeholder={notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose} disabled={submitting}>
            {t('common.cancel', '취소')}
          </button>
          <button className={styles.submit} onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {submitting ? submittingLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
