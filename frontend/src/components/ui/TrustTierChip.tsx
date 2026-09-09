import { useTranslation } from 'react-i18next';
import { getTrustTier, type TrustTierKey } from '@/lib/trustTier';
import styles from './TrustTierChip.module.css';

/**
 * 신뢰 티어 칩 — 판매자/프로필의 신뢰 신호. 온도값 자체는 노출하지 않는다.
 *
 * `temp`(내부 스칼라) 또는 이미 서버가 변환해 내려준 `tier` 중 하나를 받는다.
 * 공개 타 사용자 프로필처럼 원값을 응답에 아예 싣지 않는 화면(WP-4, 2026-09-09)은
 * `tier` 를 쓴다 — 원값이 네트워크에 오르지 않는다.
 */
type TrustTierChipProps = { temp: number } | { tier: TrustTierKey };
export function TrustTierChip(props: TrustTierChipProps) {
  const { t } = useTranslation();
  const tier = 'tier' in props ? props.tier : getTrustTier(props.temp);
  return (
    <span className={styles.chip} data-tier={tier} title={t('trust.label', { defaultValue: '이웃 신뢰 등급' })}>
      <span className={styles.dot} />
      {t(`trust.${tier}`)}
    </span>
  );
}
