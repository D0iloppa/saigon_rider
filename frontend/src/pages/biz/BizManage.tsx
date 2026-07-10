import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { extractDetail } from '@/api/client';
import { fetchBusinessProfiles, updateBusinessProfile, type BusinessProfile } from '@/api/biz';
import styles from './BizManage.module.css';

export default function BizManage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<BusinessProfile[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

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
        photoContentId: null,
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

        {/* BP-4: 광고 목록·등록은 후속 패키지 — 지금은 준비 중 안내만 */}
        <h3 className={styles.sectionTitle}>{t('biz.adsTitle', { defaultValue: '내 광고' })}</h3>
        <div className={styles.adsEmpty}>
          <p>{t('biz.adsComingSoon', { defaultValue: '광고 등록 기능은 곧 제공될 예정이에요' })}</p>
        </div>
      </div>
    </div>
  );
}
