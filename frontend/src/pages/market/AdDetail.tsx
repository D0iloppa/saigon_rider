import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Share2, Phone, MapPin, Clock, BadgeCheck, Info } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppImage } from '@/components/ui/AppImage';
import { fetchAd, localizedName, type MarketAd } from '@/api/market';
import { fetchDistricts, type District } from '@/api/master';
import { native } from '@/lib/native';
import styles from './AdDetail.module.css';

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

  const handleShare = () => {
    if (!ad) return;
    native.share({ title: ad.title, text: ad.body ?? ad.partnerName, url: window.location.href });
  };

  const operationYears =
    ad?.establishedYear ? new Date().getFullYear() - ad.establishedYear : null;

  const avatarLetter = ad?.partnerName?.replace(/^\[DEV\]\s*/, '').charAt(0) ?? '';

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <StatusBar variant="dark" />
        <div className={styles.topbarRow}>
          <button className={styles.backBtn} type="button" onClick={() => navigate(-1)} aria-label={t('common.back', { defaultValue: '뒤로' })}>
            <ArrowLeft size={24} strokeWidth={2} />
          </button>
          <button className={styles.backBtn} type="button" onClick={handleShare} aria-label={t('common.share', { defaultValue: '공유' })}>
            <Share2 size={24} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {loading || !ad ? (
          <div className={`shimmer ${styles.heroSkeleton}`} />
        ) : (
          <>
            {/* Hero */}
            {ad.imageUrl ? (
              <div className={styles.heroWrap}>
                <AppImage src={ad.imageUrl} alt={ad.title} className={styles.heroImg} />
                <div className={styles.heroGradient} />
                <div className={styles.heroBadge}>
                  <span className={styles.heroBadgeDot} />
                  <span className={styles.heroBadgeText}>{t('market.adPartnerLabel', { defaultValue: '제휴 광고' })}</span>
                </div>
              </div>
            ) : (
              <div className={styles.heroSkeleton} />
            )}

            <div className={styles.content}>
              {/* Category + region */}
              {(ad.category || districtName) && (
                <div className={styles.metaRow}>
                  {ad.category && <span className={styles.categoryBadge}>{ad.category}</span>}
                  {districtName && <span className={styles.regionText}>{districtName}</span>}
                </div>
              )}

              <h1 className={styles.title}>{ad.title}</h1>

              {/* Advertiser row */}
              <div className={styles.advertiserRow}>
                <div className={styles.advertiserAvatar}>{avatarLetter}</div>
                <span className={styles.advertiserName}>
                  {ad.partnerName.replace(/^\[DEV\]\s*/, '')}
                </span>
                <BadgeCheck size={17} className={styles.verifiedIcon} />
              </div>

              {/* Trust stats */}
              {(ad.rating != null || ad.serviceCount != null || operationYears != null) && (
                <div className={styles.trustCard}>
                  {ad.rating != null && (
                    <>
                      <div className={styles.trustItem}>
                        <span className={styles.trustValue}>{ad.rating.toFixed(1)}</span>
                        <span className={styles.trustLabel}>{t('market.adRating', { defaultValue: '평점' })}</span>
                      </div>
                      {(ad.serviceCount != null || operationYears != null) && (
                        <div className={styles.trustDivider} />
                      )}
                    </>
                  )}
                  {ad.serviceCount != null && (
                    <>
                      <div className={styles.trustItem}>
                        <span className={styles.trustValue}>{ad.serviceCount >= 1000 ? `${Math.floor(ad.serviceCount / 100) / 10}k+` : `${ad.serviceCount}+`}</span>
                        <span className={styles.trustLabel}>{t('market.adServiceCount', { defaultValue: '서비스 완료' })}</span>
                      </div>
                      {operationYears != null && <div className={styles.trustDivider} />}
                    </>
                  )}
                  {operationYears != null && (
                    <div className={styles.trustItem}>
                      <span className={styles.trustValue}>{operationYears}{t('market.adYearUnit', { defaultValue: '년' })}</span>
                      <span className={styles.trustLabel}>{t('market.adOperationYears', { defaultValue: '운영' })}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {ad.body && <p className={styles.desc}>{ad.body}</p>}

              {/* Info card */}
              {(ad.phone || ad.address || ad.businessHours) && (
                <div className={styles.infoCard}>
                  {ad.phone && (
                    <div className={styles.infoRow}>
                      <div className={styles.infoIconWrap}>
                        <Phone size={18} strokeWidth={2} />
                      </div>
                      <div className={styles.infoBody}>
                        <div className={styles.infoLabel}>{t('market.adPhone', { defaultValue: '전화 문의' })}</div>
                        <div className={styles.infoValue}>{ad.phone}</div>
                      </div>
                    </div>
                  )}
                  {ad.address && (
                    <div className={styles.infoRow}>
                      <div className={styles.infoIconWrap}>
                        <MapPin size={18} strokeWidth={2} />
                      </div>
                      <div className={styles.infoBody}>
                        <div className={styles.infoLabel}>{t('market.adAddress', { defaultValue: '위치' })}</div>
                        <div className={styles.infoValue}>{ad.address}</div>
                      </div>
                    </div>
                  )}
                  {ad.businessHours && (
                    <div className={styles.infoRow}>
                      <div className={styles.infoIconWrap}>
                        <Clock size={18} strokeWidth={2} />
                      </div>
                      <div className={styles.infoRowRight}>
                        <div className={styles.infoBody}>
                          <div className={styles.infoLabel}>{t('market.adBusinessHours', { defaultValue: '영업시간' })}</div>
                          <div className={styles.infoValue}>{ad.businessHours}</div>
                        </div>
                        {ad.isOpen != null && (
                          <span className={ad.isOpen ? styles.openBadge : styles.closedBadge}>
                            {ad.isOpen
                              ? t('market.adOpen', { defaultValue: '영업 중' })
                              : t('market.adClosed', { defaultValue: '영업 종료' })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notice */}
              <div className={styles.notice}>
                <Info size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                <span className={styles.noticeText}>{t('market.adNotice', { defaultValue: '가맹점 제휴 광고입니다.' })}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sticky CTA */}
      {ad?.phone && !loading && (
        <div className={styles.ctaBar}>
          <button className={styles.ctaBtn} type="button" onClick={handleCall}>
            <Phone size={20} strokeWidth={2.2} />
            {t('market.adInquiry', { defaultValue: '전화 문의하기' })}
          </button>
        </div>
      )}
    </div>
  );
}
