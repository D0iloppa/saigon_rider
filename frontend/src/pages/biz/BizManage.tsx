import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronDown, ChevronRight, Megaphone, Receipt, ShieldCheck, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import { api, extractDetail } from '@/api/client';
import {
  fetchBusinessProfiles,
  updateBusinessProfile,
  fetchBusinessAds,
  fetchBizCategories,
  bizCategoryLabel,
  fetchBizPublicNews,
  deleteBizNews,
  fetchContractLink,
  type BusinessProfile,
  type BusinessAd,
  type BusinessAdStatus,
  type BizCategory,
  type BizVerificationStatus,
  type BizNewsItem,
} from '@/api/biz';
import BizDashboard from './BizDashboard';
import styles from './BizManage.module.css';

const MANAGE_TABS = ['home', 'dashboard'] as const;
type ManageTab = typeof MANAGE_TABS[number];

const AD_CHIP_CLASS: Record<BusinessAdStatus, string> = {
  PENDING: 'adChipPending',
  APPROVED: 'adChipApproved',
  REJECTED: 'adChipRejected',
  STOPPED: 'adChipStopped',
};

const VERIF_CHIP_CLASS: Record<BizVerificationStatus, string> = {
  pending: 'verifChipPending',
  docs_submitted: 'verifChipSubmitted',
  verified: 'verifChipVerified',
  rejected: 'verifChipRejected',
};

export default function BizManage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const [profiles, setProfiles] = useState<BusinessProfile[] | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [categories, setCategories] = useState<BizCategory[]>([]);
  useEffect(() => {
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
  }, []);
  const categoryLabel = (code: string | null) => {
    if (!code) return '';
    const cat = categories.find((c) => c.code === code);
    return cat ? bizCategoryLabel(cat, i18n.language) : code;
  };
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<ManageTab>('home');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [intro, setIntro] = useState('');
  const [saving, setSaving] = useState(false);
  // 프로필별 광고 목록 — profileId 를 함께 들고 스위처 전환 시 이전 프로필 목록 표시를 방지
  const [ads, setAds] = useState<{ profileId: string; list: BusinessAd[] } | null>(null);
  // 프로필별 소식 목록 (SGR-326 — 가게소식 작성)
  const [news, setNews] = useState<{ profileId: string; list: BizNewsItem[] } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  // 웹 계약(결제) 링크 발급 로딩 — pending_payment 광고별 버튼 상태
  const [contractLoadingId, setContractLoadingId] = useState<string | null>(null);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 editForm 의 name/phone input 이 키보드에 가려진다 —
  // 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다. (ai-docs/context/keyboard-ux.md 케이스 1)
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    let cancelled = false;
    fetchBusinessProfiles()
      .then((list) => {
        if (cancelled) return;
        const approved = list.filter((p) => p.status === 'APPROVED');
        if (approved.length === 0) {
          navigate('/biz/status', { replace: true });
          return;
        }
        setProfiles(approved);
      })
      .catch(() => {
        if (!cancelled) navigate('/biz/status', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // BP-4: 활성 프로필의 광고 목록
  const activeId = profiles?.[activeIdx]?.id;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetchBusinessAds(activeId)
      .then((list) => {
        if (!cancelled) setAds({ profileId: activeId, list });
      })
      .catch(() => {
        if (!cancelled) setAds({ profileId: activeId, list: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // 가게소식: 활성 프로필의 내 소식 목록 (공개 GET 재사용 — 이 화면은 이미 APPROVED 프로필만 다룸)
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetchBizPublicNews(activeId, { limit: 20, offset: 0 })
      .then((list) => {
        if (!cancelled) setNews({ profileId: activeId, list });
      })
      .catch(() => {
        if (!cancelled) setNews({ profileId: activeId, list: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  if (profiles === null) {
    return (
      <div className={styles.page}>
        <TopBar title={t('biz.manageTitle', { defaultValue: '파트너 라운지' })} />
        <div className={styles.body}>
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        </div>
      </div>
    );
  }

  const active = profiles[activeIdx];
  const adList = ads && ads.profileId === active.id ? ads.list : null;

  const startEdit = () => {
    setName(active.name);
    setPhone(active.phone ?? '');
    setIntro(active.intro ?? '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      const updated = await updateBusinessProfile(active.id, {
        name: name.trim(),
        category: active.category,
        address: active.address ?? '',
        latitude: active.latitude ?? 0,
        longitude: active.longitude ?? 0,
        phone: phone.trim(),
        intro: intro.trim() || null,
        photoContentId: active.photoContentId, // 기존 사진 유지 (이 폼은 사진을 다루지 않음)
      });
      setProfiles((prev) => (prev ? prev.map((p, i) => (i === activeIdx ? updated : p)) : prev));
      setEditing(false);
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.editError', { defaultValue: '수정에 실패했습니다' })));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setPhotoUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      form.append('owner_id', user.id);
      const uploaded = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      const updated = await updateBusinessProfile(active.id, {
        name: active.name,
        category: active.category,
        address: active.address ?? '',
        latitude: active.latitude ?? 0,
        longitude: active.longitude ?? 0,
        phone: active.phone ?? '',
        intro: active.intro,
        photoContentId: uploaded.id,
      });
      setProfiles((prev) => (prev ? prev.map((p, i) => (i === activeIdx ? updated : p)) : prev));
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.photoUploadError', { defaultValue: '사진 업로드에 실패했습니다' })));
    } finally {
      setPhotoUploading(false);
    }
  };

  const newsList = news && news.profileId === active.id ? news.list : null;

  // 웹 계약(결제) 링크 — pending_payment 광고에 대해 발급 후 외부 브라우저로 연다 (IAP 리스크 회피)
  const handleContractLink = async (adId: string) => {
    setContractLoadingId(adId);
    try {
      const { url } = await fetchContractLink(adId);
      await native.openExternalUrl(url);
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.contractLinkError', { defaultValue: '계약 링크를 불러오지 못했습니다' })));
    } finally {
      setContractLoadingId(null);
    }
  };

  const handleDeleteNews = async (newsId: string) => {
    try {
      await deleteBizNews(newsId);
      setNews((prev) => (prev ? { ...prev, list: prev.list.filter((n) => n.id !== newsId) } : prev));
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.newsDeleteError', { defaultValue: '소식 삭제에 실패했습니다' })));
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.manageTitle', { defaultValue: '파트너 라운지' })} />
      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
        {profiles.length > 1 && (
          <div className={styles.switcher}>
            {profiles.map((p, idx) => (
              <button
                key={p.id}
                className={idx === activeIdx ? styles.switchBtnActive : styles.switchBtn}
                onClick={() => { setActiveIdx(idx); setEditing(false); }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <nav className={styles.tabs} aria-label={t('biz.manageTabsLabel', { defaultValue: '관리 메뉴' })}>
          {MANAGE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab(tab)}
            >
              {t(`biz.manageTabs.${tab}`, { defaultValue: { home: '홈', dashboard: '대시보드' }[tab] })}
            </button>
          ))}
        </nav>

        {activeTab === 'dashboard' ? (
          <BizDashboard profileId={active.id} newsCount={newsList ? newsList.length : null} />
        ) : (
        <>
        <h3 className={styles.sectionTitle}>{t('biz.profileSectionTitle', { defaultValue: '비즈니스 프로필' })}</h3>
        <div className={styles.profileCard}>
          <div className={styles.photoWrap}>
            <AppImage
              src={active.photoUrl ?? undefined}
              alt=""
              className={`${styles.profilePhoto} ${photoUploading ? styles.photoLoading : ''}`}
            />
            <button
              type="button"
              className={styles.photoCameraBtn}
              onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              aria-label={t('biz.editPhoto', { defaultValue: '사진 변경' })}
            >
              <Camera size={16} />
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
          </div>
          {!editing ? (
            <>
              <div className={styles.profileName}>{active.name}</div>
              <div className={styles.profileMeta}>
                {active.category && <span>{categoryLabel(active.category)}</span>}
                {active.address && <span> · {active.address}</span>}
              </div>
              <div className={styles.profileMeta}>{active.phone}</div>
              <Button size="sm" fullWidth={false} onClick={startEdit} className={styles.editBtn}>
                {t('biz.editCta', { defaultValue: '정보 수정' })}
              </Button>
            </>
          ) : (
            <div className={styles.editForm}>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              <input className={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} />
              <textarea
                className={styles.textarea}
                placeholder={t('biz.introPlaceholder', { defaultValue: '업체를 소개해주세요' })}
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                rows={4}
                maxLength={500}
              />
              <div className={styles.editActions}>
                <Button size="sm" fullWidth={false} onClick={saveEdit} disabled={saving}>
                  {saving ? t('biz.saving', { defaultValue: '저장 중' }) : t('common.confirm', { defaultValue: '확인' })}
                </Button>
                <Button size="sm" fullWidth={false} variant="secondary" onClick={() => setEditing(false)}>
                  {t('common.cancel', { defaultValue: '취소' })}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 사업자 검증 상태 + 제출 진입점 — verified 전에는 유료 게시 게이트 안내 */}
        <button
          className={styles.verifyRow}
          onClick={() => navigate('/biz/verification', { state: { profileId: active.id } })}
        >
          <ShieldCheck size={18} strokeWidth={2} aria-hidden className={styles.verifyIcon} />
          <span className={styles.verifyText}>
            <span className={styles.verifyTitle}>{t('biz.verifTitle', { defaultValue: '사업자 검증' })}</span>
            {active.verificationStatus !== 'verified' && (
              <span className={styles.verifyDesc}>
                {active.verificationStatus === 'docs_submitted'
                  ? t('biz.verifReviewingDesc', { defaultValue: '제출한 서류를 검토하고 있어요. 통상 24시간 이내 결과를 알려드려요.' })
                  : t('biz.verifGateNotice', {
                      defaultValue: '유료 게시하려면 사업자등록증 검증이 필요해요. 광고 등록은 지금 가능하지만, 검증 완료 전에는 노출되지 않아요.',
                    })}
              </span>
            )}
            {active.verificationStatus === 'rejected' && active.verificationRejectReason && (
              <span className={styles.verifyReject}>{active.verificationRejectReason}</span>
            )}
          </span>
          <span className={`${styles.verifChip} ${styles[VERIF_CHIP_CLASS[active.verificationStatus]]}`}>
            {active.verificationStatus === 'verified'
              ? t('biz.verifStatusVerified', { defaultValue: '검증 완료' })
              : active.verificationStatus === 'docs_submitted'
                ? t('biz.verifStatusSubmitted', { defaultValue: '검토 중' })
                : active.verificationStatus === 'rejected'
                  ? t('biz.verifStatusRejected', { defaultValue: '반려' })
                  : t('biz.verifStatusPending', { defaultValue: '검증 전' })}
          </span>
          <ChevronRight size={16} strokeWidth={2} aria-hidden className={styles.verifyChev} />
        </button>

        {/* 파트너 가이드 배너 (아코디언) — BizIntro 는 '신청하기' CTA 중심이라 이미 승인된 파트너에게 부적절해
            인라인 확장으로 대체. 사업자 검증·소식 작성 팁·광고 안내는 기존 문구를 재사용한다. */}
        <button type="button" className={styles.guideBanner} onClick={() => setGuideOpen((v) => !v)}>
          <div className={styles.guideBannerHead}>
            <Megaphone size={20} strokeWidth={2} aria-hidden className={styles.guideBannerIcon} />
            <div className={styles.guideBannerText}>
              <span className={styles.guideBannerSub}>{t('biz.guideBannerSub', { defaultValue: '든든한 파트너 활동을 위해' })}</span>
              <span className={styles.guideBannerTitle}>{t('biz.guideBannerTitle', { defaultValue: '파트너 가이드 확인하기' })}</span>
            </div>
          </div>
          <ChevronDown size={18} aria-hidden className={guideOpen ? styles.guideChevOpen : styles.guideChev} />
        </button>
        {guideOpen && (
          <div className={styles.guideBody}>
            <div className={styles.guideItem}>
              <strong>{t('biz.verifTitle', { defaultValue: '사업자 검증' })}</strong>
              <span>
                {t('biz.verifGateNotice', {
                  defaultValue: '유료 게시하려면 사업자등록증 검증이 필요해요. 광고 등록은 지금 가능하지만, 검증 완료 전에는 노출되지 않아요.',
                })}
              </span>
            </div>
            <div className={styles.guideItem}>
              <strong>{t('biz.guideNewsTipTitle', { defaultValue: '소식 작성 팁' })}</strong>
              <span>{t('biz.guideNewsTipDesc', { defaultValue: '제목과 사진을 함께 올리면 이웃 라이더 눈에 더 잘 띄어요' })}</span>
            </div>
            <div className={styles.guideItem}>
              <strong>{t('biz.guideAdsTitle', { defaultValue: '광고 안내' })}</strong>
              <span>{t('biz.guideAdsDesc', { defaultValue: '광고를 등록하면 심사 후 게시돼요' })}</span>
            </div>
          </div>
        )}

        {/* SGR-326: 가게소식 — 작성은 별도 화면, 카드 탭 시 상세(고객 미리보기)로 이동 */}
        <h3 className={styles.sectionTitle}>{t('biz.newsManageTitle', { defaultValue: '내 소식' })}</h3>
        {newsList === null ? (
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        ) : newsList.length === 0 ? (
          <div className={styles.adsEmpty}>
            <p>{t('biz.newsManageEmpty', { defaultValue: '아직 작성한 소식이 없어요' })}</p>
          </div>
        ) : (
          <div className={styles.adList}>
            {newsList.map((n) => (
              <div
                key={n.id}
                className={styles.newsRow}
                onClick={() => navigate(`/biz/news/${n.id}`, {
                  state: { news: n, profileId: active.id, profileName: active.name, profilePhotoUrl: active.photoUrl },
                })}
              >
                {n.photos[0] && <AppImage src={n.photos[0]} alt="" className={styles.adThumb} />}
                <div className={styles.newsRowBody}>
                  <span className={styles.newsRowTitle}>{n.title}</span>
                  {n.body && <span className={styles.newsRowText}>{n.body}</span>}
                </div>
                <button
                  type="button"
                  className={styles.newsRowDelete}
                  onClick={(e) => { e.stopPropagation(); handleDeleteNews(n.id); }}
                  aria-label={t('biz.newsDeleteCta', { defaultValue: '소식 삭제' })}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}
        <Button className={styles.adCreateBtn} onClick={() => navigate('/biz/news/new', { state: { profileId: active.id } })}>
          {t('biz.newsCreateCta', { defaultValue: '소식 작성' })}
        </Button>

        {/* 가격표 등록 — 소식과 성격이 가까운 무료 컨텐츠라 소식 다음·유료 광고 앞에 배치 (별도 화면) */}
        <button
          className={styles.verifyRow}
          onClick={() => navigate('/biz/prices', { state: { profileId: active.id } })}
        >
          <Receipt size={18} strokeWidth={2} aria-hidden className={styles.verifyIcon} />
          <span className={styles.verifyText}>
            <span className={styles.verifyTitle}>{t('biz.priceSectionTitle', { defaultValue: '가격표' })}</span>
            <span className={styles.verifyDesc}>
              {t('biz.priceSectionDesc', { defaultValue: '서비스별 가격을 등록해 이웃 라이더에게 보여주세요' })}
            </span>
          </span>
          <ChevronRight size={16} strokeWidth={2} aria-hidden className={styles.verifyChev} />
        </button>

        {/* BP-4: 광고 — 2026-08-10 개발/운영 공통 오픈 (승인 게이트가 이미 있어 미승인 광고는 노출 안 됨) */}
        <h3 className={styles.sectionTitle}>{t('biz.adsTitle', { defaultValue: '내 광고' })}</h3>
        {adList === null ? (
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        ) : adList.length === 0 ? (
          <div className={styles.adsEmpty}>
            <p>{t('biz.adsEmpty', { defaultValue: '아직 등록한 광고가 없어요' })}</p>
          </div>
        ) : (
          <div className={styles.adList}>
            {adList.map((ad) => (
              <div key={ad.id} className={styles.adRow}>
                <button
                  type="button"
                  className={styles.adRowMain}
                  onClick={() => navigate(`/biz/ads/${ad.id}`)}
                >
                  <AppImage src={ad.imageUrl ?? undefined} alt="" className={styles.adThumb} />
                  <span className={styles.adRowTitle}>{ad.title}</span>
                  <span className={`${styles.adChip} ${styles[AD_CHIP_CLASS[ad.reviewStatus]]}`}>
                    {ad.reviewStatus === 'PENDING'
                      ? t('biz.adStatusPending', { defaultValue: '심사중' })
                      : ad.reviewStatus === 'APPROVED'
                        ? t('biz.adStatusApproved', { defaultValue: '게시중' })
                        : ad.reviewStatus === 'REJECTED'
                          ? t('biz.adStatusRejected', { defaultValue: '반려' })
                          : t('biz.adStatusStopped', { defaultValue: '게시 중단' })}
                  </span>
                </button>
                {ad.subscriptionStatus === 'pending_payment' && (
                  <Button
                    size="sm"
                    fullWidth={false}
                    className={styles.adContractBtn}
                    onClick={() => handleContractLink(ad.id)}
                    disabled={contractLoadingId === ad.id}
                  >
                    {contractLoadingId === ad.id
                      ? t('biz.contractLinkLoading', { defaultValue: '연결 중…' })
                      : t('biz.contractLinkCta', { defaultValue: '웹에서 계약하기' })}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <Button
          className={styles.adCreateBtn}
          onClick={() => navigate('/biz/ads/new', { state: { profileId: active.id } })}
        >
          {t('biz.adCreateCta', { defaultValue: '광고 등록' })}
        </Button>
        </>
        )}
      </div>
    </div>
  );
}
