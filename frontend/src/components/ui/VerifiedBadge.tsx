import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './VerifiedBadge.module.css';

interface Props {
  /** 휴대폰 인증 여부 — false면 아무것도 렌더링하지 않음 */
  verified: boolean;
  /** 마스킹된 번호 (예: "+84 90*******"). 있으면 탭해서 토글 노출 */
  phoneMasked?: string | null;
  className?: string;
}

/** 인증 판매자 배지 — 휴대폰 OTP 인증 완료 표시. phoneMasked 가 있으면 탭해서 마스킹 번호를 토글 노출한다. */
export function VerifiedBadge({ verified, phoneMasked, className = '' }: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  if (!verified) return null;

  const label = `✓ ${t('market.verified', { defaultValue: '인증' })}`;
  const tooltip = t('market.phoneVerified', { defaultValue: '전화 인증 완료' });

  if (!phoneMasked) {
    return (
      <span className={`${styles.badge} ${className}`} title={tooltip}>
        {label}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.badge} ${styles.badgeInteractive} ${className}`}
        title={tooltip}
        aria-expanded={revealed}
        aria-label={revealed
          ? t('market.hidePhone', { defaultValue: '전화번호 숨기기' })
          : t('market.showPhone', { defaultValue: '전화번호 보기' })}
        onClick={() => setRevealed((v) => !v)}
      >
        {label}
      </button>
      {revealed && <span className={styles.phone}>{phoneMasked}</span>}
    </>
  );
}
