import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import type { MarketAd } from '@/api/market';
import styles from './AdCard.module.css';

/** 피드 중간 삽입 제휴 광고 카드. 이미지 있으면 히어로 레이아웃, 없으면 인라인. */
export default function AdCard({ ad, onClick }: { ad: MarketAd; onClick: () => void }) {
  const { t } = useTranslation();
  const hasImage = !!ad.imageUrl;

  return (
    <button className={styles.card} type="button" onClick={onClick}>
      {hasImage && (
        <div className={styles.heroWrap}>
          <AppImage src={ad.imageUrl ?? undefined} alt={ad.title} className={styles.heroImg} />
        </div>
      )}

      {!hasImage ? (
        <div className={styles.inlineWrap}>
          <span className={styles.thumb}>
            <AppImage src={undefined} alt={ad.title} className={styles.thumbImg} />
          </span>
          <div className={styles.bodyInline}>
            <div className={styles.labelRow}>
              <span className={styles.label}>{t('market.adLabel', { defaultValue: '광고' })}</span>
              <span className={styles.partnerTag}>{ad.partnerName}</span>
            </div>
            <p className={styles.title}>{ad.title}</p>
            {ad.body && <p className={styles.desc}>{ad.body}</p>}
          </div>
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.labelRow}>
            <span className={styles.label}>{t('market.adLabel', { defaultValue: '광고' })}</span>
            <span className={styles.partnerTag}>{ad.partnerName}</span>
          </div>
          <p className={styles.title}>{ad.title}</p>
          {ad.body && <p className={styles.desc}>{ad.body}</p>}
          <div className={styles.footer}>
            <span className={styles.partner}>{ad.address ?? ''}</span>
            <span className={styles.cta}>{t('market.adCta', { defaultValue: '자세히 보기' })}</span>
          </div>
        </div>
      )}
    </button>
  );
}
