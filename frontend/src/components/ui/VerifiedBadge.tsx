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

/** 공식 인증 씰 — 스칼럽 스타버스트 원형(브랜드 오렌지 fill) + 흰색 체크마크. 인라인 SVG, 외부 아이콘 의존 없음. */
const VerifiedSeal = () => (
  <svg className={styles.seal} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      className={styles.sealBody}
      d="M12 3.6Q14.9 1.18 16.2 4.73Q19.92 4.08 19.27 7.8Q22.82 9.1 20.4 12Q22.82 14.9 19.27 16.2Q19.92 19.92 16.2 19.27Q14.9 22.82 12 20.4Q9.1 22.82 7.8 19.27Q4.08 19.92 4.73 16.2Q1.18 14.9 3.6 12Q1.18 9.1 4.73 7.8Q4.08 4.08 7.8 4.73Q9.1 1.18 12 3.6Z"
    />
    <path className={styles.sealCheck} d="M8.2 12.3l2.6 2.6 5-5.6" />
  </svg>
);

/** 인증 판매자 배지 — 휴대폰 OTP 인증 완료 표시. phoneMasked 가 있으면 탭해서 마스킹 번호를 토글 노출한다. */
export function VerifiedBadge({ verified, phoneMasked, className = '' }: Props) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  if (!verified) return null;

  const label = t('market.verified', { defaultValue: '인증' });
  const tooltip = t('market.phoneVerified', { defaultValue: '전화 인증 완료' });

  if (!phoneMasked) {
    return (
      <span className={`${styles.badge} ${className}`} title={tooltip}>
        <VerifiedSeal />
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
        <VerifiedSeal />
        {label}
      </button>
      {revealed && <span className={styles.phone}>{phoneMasked}</span>}
    </>
  );
}
