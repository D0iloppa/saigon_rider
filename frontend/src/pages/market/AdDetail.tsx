import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MapPin, Phone } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { fetchAd, localizedName, type MarketAd } from '@/api/market';
import { fetchDistricts, type District } from '@/api/master';
import { native } from '@/lib/native';
import styles from './AdDetail.module.css';

/**
 * 제휴 광고 상세 (SGR-302) — 앱 내 노출.
 * 연락처·주소·문의하기 CTA 포함.
 */
export default function AdDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
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
  }, [id, i18n.language]);

  const handleCall = () => {
    if (!ad?.phone) return;
    native.openUrl(`tel:${ad.phone}`);
  };

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

            {/* 연락처 / 주소 */}
            {(ad.phone || ad.address) && (
              <div className={styles.contactBox}>
                {ad.phone && (
                  <div className={styles.contactRow}>
                    <Phone size={15} className={styles.contactIcon} />
                    <span className={styles.contactText}>{ad.phone}</span>
                  </div>
                )}
                {ad.address && (
                  <div className={styles.contactRow}>
                    <MapPin size={15} className={styles.contactIcon} />
                    <span className={styles.contactText}>{ad.address}</span>
                  </div>
                )}
              </div>
            )}

            <p className={styles.notice}>{t('market.adNotice', { defaultValue: '가맹점 제휴 광고입니다.' })}</p>
          </div>

          {/* 문의하기 CTA */}
          {ad.phone && (
            <div className={styles.ctaBar}>
              <Button variant="primary" onClick={handleCall}>
                📞 {t('market.adInquiry', { defaultValue: '전화 문의하기' })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
