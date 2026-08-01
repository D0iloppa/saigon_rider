import { useTranslation } from 'react-i18next';
import { getTrustTier } from '@/lib/trustTier';
import styles from './TrustTierChip.module.css';

/** 신뢰 티어 칩 — 판매자/프로필의 신뢰 신호. 온도값 자체는 노출하지 않는다. */
export function TrustTierChip({ temp }: { temp: number }) {
  const { t } = useTranslation();
  const tier = getTrustTier(temp);
  return (
    <span className={styles.chip} data-tier={tier} title={t('trust.label', { defaultValue: '이웃 신뢰 등급' })}>
      <span className={styles.dot} />
      {t(`trust.${tier}`)}
    </span>
  );
}
