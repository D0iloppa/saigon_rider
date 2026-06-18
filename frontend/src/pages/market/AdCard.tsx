import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import type { MarketAd } from '@/api/market';
import styles from './AdCard.module.css';

/** 피드 중간 삽입 제휴 광고 카드 (SGR-302). 클릭 → 앱 내 광고 상세(외부 라우팅 X). */
export default function AdCard({ ad, onClick }: { ad: MarketAd; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button className={styles.card} type="button" onClick={onClick}>
      <span className={styles.thumb}>
        <AppImage src={ad.imageUrl ?? undefined} alt={ad.title} className={styles.thumbImg} />
      </span>
      <div className={styles.body}>
        <span className={styles.label}>{t('market.adLabel', { defaultValue: '광고' })}</span>
        <p className={styles.title}>{ad.title}</p>
        {ad.body && <p className={styles.desc}>{ad.body}</p>}
        <p className={styles.partner}>{ad.partnerName}</p>
      </div>
    </button>
  );
}
