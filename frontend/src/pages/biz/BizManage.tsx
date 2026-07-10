import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { extractDetail } from '@/api/client';
import {
  fetchBusinessProfiles,
  updateBusinessProfile,
  fetchBusinessAds,
  type BusinessProfile,
  type BusinessAd,
  type BusinessAdStatus,
} from '@/api/biz';
import styles from './BizManage.module.css';

const AD_CHIP_CLASS: Record<BusinessAdStatus, string> = {
  PENDING: 'adChipPending',
  APPROVED: 'adChipApproved',
  REJECTED: 'adChipRejected',
  STOPPED: 'adChipStopped',
};

export default function BizManage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<BusinessProfile[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  // 프로필별 광고 목록 — profileId 를 함께 들고 스위처 전환 시 이전 프로필 목록 표시를 방지
  const [ads, setAds] = useState<{ profileId: string; list: BusinessAd[] } | null>(null);

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

  if (profiles === null) {
    return (
      <div className={styles.page}>
        <TopBar title={t('biz.manageTitle', { defaultValue: '비즈니스 프로필' })} />
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

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.manageTitle', { defaultValue: '비즈니스 프로필' })} />
      <div className={styles.body}>
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

        <div className={styles.profileCard}>
          <AppImage src={active.photoUrl ?? undefined} alt="" className={styles.profilePhoto} />
          {!editing ? (
            <>
              <div className={styles.profileName}>{active.name}</div>
              <div className={styles.profileMeta}>
                {active.category && <span>{t(`biz.category_${active.category}`, { defaultValue: active.category })}</span>}
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

        {/* BP-4: 광고 목록 (상태 칩) + 등록 CTA */}
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
              <button key={ad.id} className={styles.adRow} onClick={() => navigate(`/biz/ads/${ad.id}`)}>
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
            ))}
          </div>
        )}
        <Button
          className={styles.adCreateBtn}
          onClick={() => navigate('/biz/ads/new', { state: { profileId: active.id } })}
        >
          {t('biz.adCreateCta', { defaultValue: '광고 등록' })}
        </Button>
      </div>
    </div>
  );
}
