import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Megaphone, Plus } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { toast } from '@/components/ui/Toast';
import { fetchBusinessAds, fetchContractLink, type BusinessAd } from '@/api/biz';
import { native } from '@/lib/native';
import sys from '@/styles/system.module.css';
import { bizContractAction, bizContractErrorKey } from './bizContractCta';
import styles from './BizAdsManage.module.css';

interface LocationState {
  profileId?: string;
  profileName?: string;
  profilePhotoUrl?: string | null;
}

function adPriority(ad: BusinessAd): number {
  if (ad.reviewStatus === 'REJECTED') return 0;
  if (bizContractAction(ad) === 'contract') return 1;
  if (ad.reviewStatus === 'PENDING') return 2;
  return 3;
}

export default function BizAdsManage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const profileId = state?.profileId ?? null;
  const [ads, setAds] = useState<BusinessAd[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [contractLoadingId, setContractLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) {
      navigate('/biz/manage', { replace: true });
      return;
    }
    let cancelled = false;
    fetchBusinessAds(profileId)
      .then((list) => {
        if (!cancelled) setAds([...list].sort((a, b) => adPriority(a) - adPriority(b)));
      })
      .catch(() => {
        if (!cancelled) { setAds([]); setLoadError(true); }
      });
    return () => { cancelled = true; };
  }, [profileId, navigate, reloadKey]);

  if (!profileId) return null;

  const profileState = { profileId, profileName: state?.profileName, profilePhotoUrl: state?.profilePhotoUrl };
  const handleContractLink = async (adId: string) => {
    setContractLoadingId(adId);
    try {
      const { url } = await fetchContractLink(adId);
      await native.openExternalUrl(url);
    } catch (err: unknown) {
      toast.error(t(bizContractErrorKey(err)));
    } finally {
      setContractLoadingId(null);
    }
  };
  const reviewLabel = (ad: BusinessAd) => {
    if (ad.reviewStatus === 'PENDING') return t('biz.lounge.adReviewPending');
    if (ad.reviewStatus === 'REJECTED') return t('biz.lounge.adReviewRejected');
    return t('biz.lounge.adReviewApproved');
  };
  const contractLabel = (ad: BusinessAd) => ad.subscriptionStatus === 'pending_payment'
    ? t('biz.lounge.contractPending')
    : ad.subscriptionStatus === 'active'
      ? t('biz.lounge.contractActive')
      : ad.subscriptionStatus === 'expired'
        ? t('biz.lounge.contractExpired')
        : t('biz.lounge.contractUnknown');
  const exposureLabel = (ad: BusinessAd) => ad.reviewStatus === 'STOPPED'
    ? t('biz.adStatusStopped')
    : t('biz.lounge.exposureUnknown');

  return <div className={styles.page}>
    <TopBar title={t('biz.lounge.adsManageTitle')} onBack={() => navigate('/biz/manage', { replace: true, state: profileState })} />
    <div className={styles.body}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{t('biz.lounge.adsSection')}</span>
          <h1>{t('biz.lounge.adsManageTitle')}</h1>
          <p>{t('biz.lounge.adsManageDesc')}</p>
          {ads !== null && !loadError && <span className={`${styles.count} num`}>{t('biz.lounge.adsDisplayedCount', { count: ads.length })}</span>}
        </div>
        <Button fullWidth={false} onClick={() => navigate('/biz/ads/new', { state: profileState })}><Plus size={17} />{t('biz.adCreateCta')}</Button>
      </section>
      {loadError ? <div className={sys.card}><StateBlock icon={AlertCircle} tone="error" title={t('biz.lounge.adsLoadErrorTitle')} desc={t('biz.lounge.adsLoadErrorDesc')} actionLabel={t('common.retry')} onAction={() => { setLoadError(false); setAds(null); setReloadKey((key) => key + 1); }} /></div>
        : ads === null ? <div className={sys.card} aria-busy="true" aria-label={t('common.loading')}><SkeletonRows count={3} /></div>
          : ads.length === 0 ? <div className={`${sys.card} ${styles.empty}`}><StateBlock icon={Megaphone} title={t('biz.lounge.adsEmptyTitle')} desc={t('biz.lounge.adsEmptyDesc')} /></div>
            : <div className={styles.list}>{ads.map((ad) => <article className={styles.adRow} key={ad.id}>
              <div className={styles.adTop}>{ad.imageUrl ? <AppImage src={ad.imageUrl} alt="" className={styles.adThumb} /> : <div className={styles.adThumbFallback}><Megaphone size={20} /></div>}<div className={styles.adTitleWrap}><h2>{ad.title}</h2>{ad.endsAt && <p className="num">{t('biz.lounge.adUntil', { date: new Intl.DateTimeFormat(i18n.language).format(new Date(ad.endsAt)) })}</p>}</div></div>
              <dl className={styles.adStatuses}><div><dt>{t('biz.lounge.reviewStatus')}</dt><dd>{reviewLabel(ad)}</dd></div><div><dt>{t('biz.lounge.contractStatus')}</dt><dd>{contractLabel(ad)}</dd></div><div><dt>{t('biz.lounge.exposureStatus')}</dt><dd>{exposureLabel(ad)}</dd></div></dl>
              {ad.reviewStatus === 'REJECTED' && ad.rejectReason && <p className={styles.rejectReason}>{ad.rejectReason}</p>}
              <div className={styles.adActions}><button type="button" className={`${sys.actionChip} ${sys.actionNeutral}`} onClick={() => navigate(`/biz/ads/${ad.id}`, { state: profileState })}>{t('biz.lounge.adDetail')}</button>{bizContractAction(ad) === 'contract' && <button type="button" className={`${sys.actionChip} ${sys.actionNeutral}`} onClick={() => handleContractLink(ad.id)} disabled={contractLoadingId === ad.id}>{contractLoadingId === ad.id ? t('biz.contractLinkLoading') : t('biz.lounge.contractGuide')}</button>}</div>
            </article>)}</div>}
    </div>
  </div>;
}
