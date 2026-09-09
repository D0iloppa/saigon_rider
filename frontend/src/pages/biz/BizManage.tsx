import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Camera, ChevronDown, ChevronRight, CircleHelp, FileText, Megaphone, MessageSquare, Newspaper, Package, Receipt, ShieldCheck, Store } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import { api, extractDetail } from '@/api/client';
import { bizCategoryLabel, fetchBizCategories, fetchBusinessAds, fetchBusinessProfiles, fetchContractLink, updateBusinessProfile, type BizCategory, type BusinessAd, type BusinessProfile } from '@/api/biz';
import sys from '@/styles/system.module.css';
import BizDashboard from './BizDashboard';
import { bizContractAction, bizContractErrorKey, runBizContractAction } from './bizContractCta';
import styles from './BizManage.module.css';

type ManageTab = 'operations' | 'performance';
type DashboardFocus = 'reviews' | 'support';

function adPriority(ad: BusinessAd): number {
  if (ad.reviewStatus === 'REJECTED') return 0;
  if (bizContractAction(ad) === 'contract') return 1;
  if (ad.reviewStatus === 'PENDING') return 2;
  return 3;
}

export default function BizManage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUserStore((s) => s.user);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const preselectProfileId = (location.state as { profileId?: string } | null)?.profileId;
  const initialProfileIdRef = useRef(preselectProfileId);
  const profileRequestRef = useRef(0);
  const [profiles, setProfiles] = useState<BusinessProfile[] | null>(null);
  const [profilesError, setProfilesError] = useState(false);
  const [categories, setCategories] = useState<BizCategory[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<ManageTab>('operations');
  const [dashboardFocus, setDashboardFocus] = useState<DashboardFocus>();
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [intro, setIntro] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [ads, setAds] = useState<{ profileId: string; list: BusinessAd[] } | null>(null);
  const [adsErrorFor, setAdsErrorFor] = useState<string | null>(null);
  const [adsReloadKey, setAdsReloadKey] = useState(0);
  const [contractLoadingId, setContractLoadingId] = useState<string | null>(null);
  const kb = useKeyboard();
  const isIosNative = native.platform === 'ios';

  const loadProfiles = useCallback(() => {
    const requestId = ++profileRequestRef.current;
    fetchBusinessProfiles().then((list) => {
      if (requestId !== profileRequestRef.current) return;
      const approved = list.filter((profile) => profile.status === 'APPROVED');
      if (!approved.length) return navigate('/biz/status', { replace: true });
      const selectedIdx = initialProfileIdRef.current ? approved.findIndex((profile) => profile.id === initialProfileIdRef.current) : -1;
      setActiveIdx(selectedIdx >= 0 ? selectedIdx : 0);
      setProfiles(approved);
    }).catch(() => {
      if (requestId === profileRequestRef.current) { setProfiles([]); setProfilesError(true); }
    });
  }, [navigate]);

  useEffect(() => loadProfiles(), [loadProfiles]);
  useEffect(() => { fetchBizCategories().then(setCategories).catch(() => setCategories([])); }, []);
  const active = profiles?.[activeIdx];
  useEffect(() => {
    if (!active?.id) return;
    let cancelled = false;
    fetchBusinessAds(active.id).then((list) => {
      if (!cancelled) setAds({ profileId: active.id, list });
    }).catch(() => { if (!cancelled) setAdsErrorFor(active.id); });
    return () => { cancelled = true; };
  }, [active?.id, adsReloadKey]);

  const categoryLabel = (code: string | null) => {
    const category = code ? categories.find((item) => item.code === code) : undefined;
    return category ? bizCategoryLabel(category, i18n.language) : code ?? '';
  };
  const profileState = (profile: BusinessProfile) => ({ profileId: profile.id, profileName: profile.name, profilePhotoUrl: profile.photoUrl });
  const selectProfile = (idx: number) => {
    const selected = profiles?.[idx];
    if (!selected) return;
    setActiveIdx(idx); setEditing(false); setStoreSheetOpen(false);
    navigate(location.pathname, { replace: true, state: { ...(location.state as object | null), profileId: selected.id } });
  };
  const startEdit = () => {
    if (!active) return;
    setName(active.name); setPhone(active.phone ?? ''); setIntro(active.intro ?? ''); setEditing(true);
  };
  const saveEdit = async () => {
    if (!active || !name.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      const updated = await updateBusinessProfile(active.id, { name: name.trim(), category: active.category, address: active.address ?? '', latitude: active.latitude ?? 0, longitude: active.longitude ?? 0, phone: phone.trim(), intro: intro.trim() || null, photoContentId: active.photoContentId });
      setProfiles((prev) => prev?.map((profile) => profile.id === active.id ? updated : profile) ?? prev);
      setEditing(false); toast.success(t('biz.lounge.profileSaved'));
    } catch (err: unknown) { toast.error(extractDetail(err, t('biz.editError'))); }
    finally { setSaving(false); }
  };
  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !user || !active) return;
    setPhotoUploading(true);
    try {
      const form = new FormData(); form.append('file', file); form.append('owner_type', 'user'); form.append('owner_id', user.id);
      const uploaded = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      const updated = await updateBusinessProfile(active.id, { name: active.name, category: active.category, address: active.address ?? '', latitude: active.latitude ?? 0, longitude: active.longitude ?? 0, phone: active.phone ?? '', intro: active.intro, photoContentId: uploaded.id });
      setProfiles((prev) => prev?.map((profile) => profile.id === active.id ? updated : profile) ?? prev);
    } catch (err: unknown) { toast.error(extractDetail(err, t('biz.photoUploadError'))); }
    finally { setPhotoUploading(false); }
  };
  const handleContractLink = async (adId: string) => {
    setContractLoadingId(adId);
    try { const { url } = await fetchContractLink(adId); await native.openExternalUrl(url); }
    catch (err: unknown) { toast.error(t(bizContractErrorKey(err))); }
    finally { setContractLoadingId(null); }
  };
  const focusDashboard = (focus: DashboardFocus) => { setDashboardFocus(focus); setActiveTab('performance'); };

  if (profiles === null || profilesError || !active) {
    return <div className={styles.page}><TopBar title={t('biz.manageTitle')} /><div className={styles.loadBody}>
      {profilesError ? <div className={sys.card}><StateBlock icon={AlertCircle} tone="error" title={t('biz.lounge.profileLoadErrorTitle')} desc={t('biz.lounge.profileLoadErrorDesc')} actionLabel={t('common.retry')} onAction={() => { setProfilesError(false); setProfiles(null); loadProfiles(); }} /></div>
        : <div className={sys.card} aria-busy="true" aria-label={t('common.loading')}><SkeletonRows count={3} /></div>}
    </div></div>;
  }

  const adList = ads?.profileId === active.id ? [...ads.list].sort((a, b) => adPriority(a) - adPriority(b)) : null;
  const adsFailed = adsErrorFor === active.id;
  const needsVerification = active.verificationStatus === 'pending' || active.verificationStatus === 'rejected';
  const actionAd = !needsVerification && adList
    ? adList.find((ad) => ad.reviewStatus === 'REJECTED') ?? adList.find((ad) => bizContractAction(ad) === 'contract')
    : undefined;
  const hasPriorityAction = needsVerification || !!actionAd;
  const reviewLabel = (ad: BusinessAd) => {
    if (ad.reviewStatus === 'PENDING') return t('biz.lounge.adReviewPending');
    if (ad.reviewStatus === 'REJECTED') return t('biz.lounge.adReviewRejected');
    // 서버는 APPROVED 광고만 STOPPED로 전이한다. 중단은 노출축에 따로 표시한다.
    return t('biz.lounge.adReviewApproved');
  };
  const contractLabel = (ad: BusinessAd) => ad.subscriptionStatus === 'pending_payment' ? t('biz.lounge.contractPending') : ad.subscriptionStatus === 'active' ? t('biz.lounge.contractActive') : ad.subscriptionStatus === 'expired' ? t('biz.lounge.contractExpired') : t('biz.lounge.contractUnknown');
  const exposureLabel = (ad: BusinessAd) => ad.reviewStatus === 'STOPPED' ? t('biz.adStatusStopped') : t('biz.lounge.exposureUnknown');

  return <div className={styles.page}>
    <TopBar title={t('biz.manageTitle')} />
    <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
      <section className={styles.identity}>
        {active.photoUrl ? <AppImage src={active.photoUrl} alt="" className={styles.identityPhoto} priority /> : <div className={styles.identityPhotoFallback}><Store size={24} /></div>}
        <div className={styles.identityCopy}>
          <button type="button" className={styles.storeSelector} onClick={() => profiles.length > 1 && setStoreSheetOpen(true)} aria-label={profiles.length > 1 ? t('biz.lounge.selectStoreLabel') : undefined} disabled={profiles.length < 2}>
            <span>{active.name}</span>{active.verificationStatus === 'verified' && <ShieldCheck size={17} className={styles.verifiedIcon} aria-label={t('biz.verifStatusVerified')} />}{profiles.length > 1 && <ChevronDown size={17} />}
          </button>
          <div className={styles.identityMeta}>{[categoryLabel(active.category), active.address].filter(Boolean).join(' · ') || t('biz.lounge.storeMetaEmpty')}</div>
          <div className={styles.identityActions}><button type="button" onClick={() => navigate(`/biz/${active.id}`, { state: profileState(active) })}>{t('biz.viewProfileCta')}</button><button type="button" onClick={startEdit}>{t('biz.editCta')}</button></div>
        </div>
      </section>
      <nav className={styles.tabs} role="tablist" aria-label={t('biz.lounge.tabsLabel')}>
        <button type="button" role="tab" aria-selected={activeTab === 'operations'} className={activeTab === 'operations' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('operations')}>{t('biz.lounge.operationsTab')}</button>
        <button type="button" role="tab" aria-selected={activeTab === 'performance'} className={activeTab === 'performance' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('performance')}>{t('biz.lounge.performanceTab')}</button>
      </nav>
      {activeTab === 'performance' ? <BizDashboard key={active.id} profileId={active.id} focus={dashboardFocus} onFocusHandled={() => setDashboardFocus(undefined)} /> : <>
        {hasPriorityAction && <section className={styles.actionCard}><ShieldCheck size={22} /><div><h2>{needsVerification ? active.verificationStatus === 'rejected' ? t('biz.lounge.verificationRejectedTitle') : t('biz.lounge.verificationRequiredTitle') : actionAd?.reviewStatus === 'REJECTED' ? t('biz.lounge.adRejectedActionTitle') : t('biz.lounge.contractActionTitle')}</h2><p>{needsVerification ? active.verificationStatus === 'rejected' ? active.verificationRejectReason || t('biz.lounge.verificationRejectedDesc') : t('biz.lounge.verificationRequiredDesc') : actionAd?.reviewStatus === 'REJECTED' ? actionAd.rejectReason || t('biz.lounge.adRejectedActionDesc') : t('biz.lounge.contractActionDesc')}</p></div><Button loading={!!actionAd && bizContractAction(actionAd) === 'contract' && contractLoadingId === actionAd.id} onClick={() => needsVerification ? navigate('/biz/verification', { state: profileState(active) }) : actionAd && runBizContractAction(actionAd, { openContract: handleContractLink, openDetail: (adId) => navigate(`/biz/ads/${adId}`, { state: profileState(active) }) })}>{needsVerification ? active.verificationStatus === 'rejected' ? t('biz.lounge.verificationResubmit') : t('biz.lounge.verificationSubmit') : actionAd?.reviewStatus === 'REJECTED' ? t('biz.lounge.adDetail') : t('biz.lounge.contractGuide')}</Button></section>}
        <div className={sys.sectionHead}><h2 className={sys.sectionLabel}>{t('biz.lounge.adsSection')}</h2></div>
        <div className={sys.card}>{adsFailed ? <StateBlock icon={AlertCircle} tone="error" title={t('biz.lounge.adsLoadErrorTitle')} desc={t('biz.lounge.adsLoadErrorDesc')} actionLabel={t('common.retry')} onAction={() => { setAdsErrorFor(null); setAdsReloadKey((key) => key + 1); }} /> : adList === null ? <div aria-busy="true" aria-label={t('common.loading')}><SkeletonRows count={2} /></div> : !adList.length ? <div className={styles.adEmpty}><StateBlock icon={Megaphone} title={t('biz.lounge.adsEmptyTitle')} desc={t('biz.lounge.adsEmptyDesc')} />{!hasPriorityAction && <Button onClick={() => navigate('/biz/ads/new', { state: profileState(active) })}>{t('biz.adCreateCta')}</Button>}</div> : adList.map((ad) => <article className={styles.adRow} key={ad.id}>
          <div className={styles.adTop}>{ad.imageUrl ? <AppImage src={ad.imageUrl} alt="" className={styles.adThumb} /> : <div className={styles.adThumbFallback}><Megaphone size={20} /></div>}<div className={styles.adTitleWrap}><h3>{ad.title}</h3>{ad.endsAt && <p className="num">{t('biz.lounge.adUntil', { date: new Intl.DateTimeFormat(i18n.language).format(new Date(ad.endsAt)) })}</p>}</div></div>
          <dl className={styles.adStatuses}><div><dt>{t('biz.lounge.reviewStatus')}</dt><dd>{reviewLabel(ad)}</dd></div><div><dt>{t('biz.lounge.contractStatus')}</dt><dd>{contractLabel(ad)}</dd></div><div><dt>{t('biz.lounge.exposureStatus')}</dt><dd>{exposureLabel(ad)}</dd></div></dl>
          {ad.reviewStatus === 'REJECTED' && ad.rejectReason && <p className={styles.rejectReason}>{ad.rejectReason}</p>}
          <div className={styles.adActions}><button type="button" className={`${sys.actionChip} ${sys.actionNeutral} ${styles.adAction}`} onClick={() => navigate(`/biz/ads/${ad.id}`, { state: profileState(active) })}>{t('biz.lounge.adDetail')}</button>{bizContractAction(ad) === 'contract' && <button type="button" className={`${sys.actionChip} ${sys.actionNeutral} ${styles.adAction}`} onClick={() => handleContractLink(ad.id)} disabled={contractLoadingId === ad.id}>{contractLoadingId === ad.id ? t('biz.contractLinkLoading') : t('biz.lounge.contractGuide')}</button>}</div>
        </article>)}</div>{!(adList?.length === 0 && !hasPriorityAction && !adsFailed) && <button type="button" className={styles.adCreateSecondary} onClick={() => navigate('/biz/ads/new', { state: profileState(active) })}>{t('biz.adCreateCta')}</button>}
        <div className={sys.sectionHead}><h2 className={sys.sectionLabel}>{t('biz.lounge.operationsSection')}</h2></div>
        <div className={sys.card}>{[
          { icon: Newspaper, title: t('biz.lounge.newsManage'), desc: t('biz.lounge.newsManageDesc'), onClick: () => navigate('/biz/news', { state: profileState(active) }) },
          { icon: Receipt, title: t('biz.priceSectionTitle'), desc: t('biz.lounge.priceManageDesc'), onClick: () => navigate('/biz/prices', { state: profileState(active) }) },
          { icon: Package, title: t('biz.listingSectionTitle'), desc: t('biz.lounge.listingManageDesc'), onClick: () => navigate('/biz/listings/new', { state: profileState(active) }) },
          { icon: MessageSquare, title: t('biz.lounge.reviewsManage'), desc: t('biz.lounge.reviewsManageDesc'), onClick: () => focusDashboard('reviews') },
        ].map(({ icon: Icon, title, desc, onClick }) => <button type="button" className={styles.managerRow} onClick={onClick} key={title}><Icon size={20} /><span><strong>{title}</strong><small>{desc}</small></span><ChevronRight size={17} /></button>)}</div>
        {(active.verificationStatus === 'verified' || active.verificationStatus === 'docs_submitted') && <><div className={sys.sectionHead}><h2 className={sys.sectionLabel}>{t('biz.verifTitle')}</h2></div><button type="button" className={styles.quietRow} onClick={() => navigate('/biz/verification', { state: profileState(active) })}><ShieldCheck size={19} /><span><strong>{active.verificationStatus === 'verified' ? t('biz.verifStatusVerified') : t('biz.verifStatusSubmitted')}</strong><small>{active.verificationStatus === 'verified' ? t('biz.lounge.verificationCompleteDesc') : t('biz.lounge.verificationReviewingDesc')}</small></span><ChevronRight size={17} /></button></>}
        <div className={styles.guideGroup}><button type="button" className={styles.guideRow} onClick={() => setGuideOpen((open) => !open)} aria-expanded={guideOpen}><FileText size={19} /><strong>{t('biz.lounge.guideTitle')}</strong><ChevronDown size={17} className={guideOpen ? styles.chevronOpen : undefined} /></button>{guideOpen && <ul className={styles.guideBody}><li>{t('biz.lounge.guideProfile')}</li><li>{t('biz.lounge.guideStatuses')}</li><li>{t('biz.lounge.guideReviews')}</li></ul>}<button type="button" className={styles.guideRow} onClick={() => focusDashboard('support')}><CircleHelp size={19} /><span><strong>{t('biz.lounge.adsHelp')}</strong><small>{t('biz.lounge.adsHelpDesc')}</small></span><ChevronRight size={17} /></button></div>
      </>}
    </div>
    <BottomSheet open={storeSheetOpen} onClose={() => setStoreSheetOpen(false)} height="fit" closeLabel={t('common.close')} header={<h2 className={styles.sheetTitle}>{t('biz.lounge.selectStoreTitle')}</h2>}><div className={styles.storeList}>{profiles.map((profile, idx) => <button type="button" key={profile.id} className={styles.storeOption} onClick={() => selectProfile(idx)} aria-current={idx === activeIdx}>{profile.photoUrl ? <AppImage src={profile.photoUrl} alt="" className={styles.storeOptionPhoto} /> : <div className={styles.storeOptionPhotoFallback}><Store size={20} /></div>}<span><strong>{profile.name}</strong><small>{[categoryLabel(profile.category), profile.address].filter(Boolean).join(' · ')}</small></span>{idx === activeIdx && <span className={styles.selectedLabel}>{t('biz.lounge.selectedStore')}</span>}</button>)}</div></BottomSheet>
    <BottomSheet open={editing} onClose={() => setEditing(false)} height="fit" closeLabel={t('common.close')} header={<h2 className={styles.sheetTitle}>{t('biz.editCta')}</h2>}><div className={styles.editForm}><div className={styles.editPhotoRow}>{active.photoUrl ? <AppImage src={active.photoUrl} alt="" className={styles.editPhoto} /> : <div className={styles.editPhotoFallback}><Store size={22} /></div>}<button type="button" className={styles.photoButton} onClick={() => photoInputRef.current?.click()} disabled={photoUploading}><Camera size={17} />{photoUploading ? t('biz.uploading') : t('biz.editPhoto')}</button><input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handlePhotoChange} /></div><label className={styles.fieldLabel} htmlFor="biz-lounge-name">{t('biz.name')}</label><input id="biz-lounge-name" className={styles.input} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /><label className={styles.fieldLabel} htmlFor="biz-lounge-phone">{t('biz.phone')}</label><input id="biz-lounge-phone" className={styles.input} value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={30} required /><label className={styles.fieldLabel} htmlFor="biz-lounge-intro">{t('biz.introLabel')}</label><textarea id="biz-lounge-intro" className={styles.textarea} value={intro} onChange={(event) => setIntro(event.target.value)} rows={4} maxLength={500} /><Button onClick={saveEdit} loading={saving} disabled={!name.trim() || !phone.trim()}>{t('common.confirm')}</Button></div></BottomSheet>
  </div>;
}
