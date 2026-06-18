import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppImage } from '@/components/ui/AppImage';
import { fetchAd, localizedName, type MarketAd } from '@/api/market';
import { fetchDistricts, type District } from '@/api/master';
import styles from './AdDetail.module.css';

/**
 * 제휴 광고 상세 (SGR-302) — 앱 내 노출. 외부 라우팅 없음.
 * 가맹점 제휴 컨텐츠(이미지·카피·지역)를 앱 안에서 보여준다.
 */
export default function AdDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [ad, setAd] = useState<MarketAd | null>(null);
  const [districtName, setDistrictName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchAd(id)
      .then(async (a) => {
        setAd(a);
        if (a.districtId != null) {
          const ds = await fetchDistricts().catch(() => [] as District[]);
          const d = ds.find((x) => x.id === a.districtId);
          if (d) setDistrictName(localizedName(d));
        }
      })
      .catch(() => setAd(null))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <StatusBar variant="dark" />
        <button className={styles.backBtn} type="button" onClick={() => navigate(-1)} aria-label={t('common.back', { defaultValue: '뒤로' })}>
          <ArrowLeft size={24} strokeWidth={2} />
        </button>
      </div>

      {loading || !ad ? (
        <div className={styles.body}>
          <div className={`shimmer ${styles.heroSkeleton}`} />
        </div>
      ) : (
        <div className={styles.body}>
          {ad.imageUrl && (
            <div className={styles.hero}>
              <AppImage src={ad.imageUrl} alt={ad.title} className={styles.heroImg} />
            </div>
          )}
          <div className={styles.content}>
            <span className={styles.label}>{t('market.adPartnerLabel', { defaultValue: '제휴 광고' })}</span>
            <h1 className={styles.title}>{ad.title}</h1>
            <p className={styles.partner}>
              {ad.partnerName}
              {districtName ? ` · ${districtName}` : ''}
            </p>
            {ad.body && <p className={styles.desc}>{ad.body}</p>}
            <p className={styles.notice}>{t('market.adNotice', { defaultValue: '가맹점 제휴 광고입니다.' })}</p>
          </div>
        </div>
      )}
    </div>
  );
}
