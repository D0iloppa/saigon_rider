import { useTranslation } from 'react-i18next';
import styles from './OfficialBadge.module.css';

interface Props {
  /** 공식 계정 여부 — false면 아무것도 렌더링하지 않음 */
  official?: boolean;
  className?: string;
}

/** 공식 계정 배지 — 닉네임 옆에 붙는 브랜드 컬러 알약 + 체크 씰. */
export function OfficialBadge({ official, className = '' }: Props) {
  const { t } = useTranslation();
  if (!official) return null;

  return (
    <span className={`${styles.badge} ${className}`}>
      <svg className={styles.check} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.5 12.6l3.7 3.7 7.3-8" />
      </svg>
      {t('common.official')}
    </span>
  );
}
