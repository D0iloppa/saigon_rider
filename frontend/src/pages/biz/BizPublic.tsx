import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, MapPin } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { fetchBusinessPublicProfile, type BusinessPublicProfile } from '@/api/biz';
import styles from './BizPublic.module.css';

/** 공개 비즈니스 프로필 — AD 카드 탭 진입면(BP-6). 가게 정보 + 게시중 광고 목록. */
export default function BizPublic() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<BusinessPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchBusinessPublicProfile(id)
      .then(setProfile)
      .catch(() => {
        toast.error(t('biz.publicNotFound', { defaultValue: '가게 정보를 찾을 수 없어요' }));
        navigate(-1);
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCall = () => {
    if (!profile?.phone) return;
    native.openUrl(`tel:${profile.phone}`);
  };

  if (loading || !profile) {
    return (
      <div className={styles.page}>
        <TopBar />
        <div className={styles.body}>
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TopBar title={profile.name} />
      <div className={styles.body}>
        <div className={styles.heroWrap}>
          <AppImage src={profile.photoUrl ?? undefined} alt={profile.name} className={styles.heroImg} />
        </div>

        <h1 className={styles.name}>{profile.name}</h1>
        {profile.category && (
          <span className={styles.categoryBadge}>
            {t(`biz.category_${profile.category}`, { defaultValue: profile.category })}
          </span>
        )}

        {(profile.phone || profile.address) && (
          <div className={styles.infoCard}>
            {profile.phone && (
              <div className={styles.infoRow}>
                <div className={styles.infoIconWrap}>
                  <Phone size={18} strokeWidth={2} />
                </div>
                <div className={styles.infoValue}>{profile.phone}</div>
              </div>
            )}
            {profile.address && (
              <div className={styles.infoRow}>
                <div className={styles.infoIconWrap}>
                  <MapPin size={18} strokeWidth={2} />
                </div>
                <div className={styles.infoValue}>{profile.address}</div>
              </div>
            )}
          </div>
        )}

        <h3 className={styles.sectionTitle}>{t('biz.publicAdsTitle', { defaultValue: '게시중인 광고' })}</h3>
        {profile.ads.length === 0 ? (
          <div className={styles.adsEmpty}>
            <p>{t('biz.publicAdsEmpty', { defaultValue: '아직 게시중인 광고가 없어요' })}</p>
          </div>
        ) : (
          <div className={styles.adList}>
            {profile.ads.map((ad) => (
              <button key={ad.id} className={styles.adRow} onClick={() => navigate(`/market/ad/${ad.id}`)}>
                <AppImage src={ad.imageUrl ?? undefined} alt="" className={styles.adThumb} />
                <span className={styles.adRowTitle}>{ad.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {profile.phone && (
        <div className={styles.ctaBar}>
          <button className={styles.ctaBtn} type="button" onClick={handleCall}>
            <Phone size={20} strokeWidth={2.2} />
            {t('biz.publicCallCta', { defaultValue: '전화 문의하기' })}
          </button>
        </div>
      )}
    </div>
  );
}
