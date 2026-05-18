import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { useUserStore } from '@/store/useUserStore';
import { apiUploadAvatar, apiSaveProfileSetup } from '@/api/profile';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import type { RiderStyle } from '@/api/types';
import styles from './ProfileEdit.module.css';

const RIDER_STYLES: { code: RiderStyle; icon: string; titleKey: string; subKey: string }[] = [
  { code: 'commuter', icon: '🏢', titleKey: 'profileSetup.styleCommuterTitle', subKey: 'profileSetup.styleCommuterSub' },
  { code: 'cafe_hunter', icon: '☕', titleKey: 'profileSetup.styleCafeHunterTitle', subKey: 'profileSetup.styleCafeHunterSub' },
  { code: 'night_rider', icon: '🌙', titleKey: 'profileSetup.styleNightRiderTitle', subKey: 'profileSetup.styleNightRiderSub' },
];

export default function ProfileEdit() {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const updateAvatar = useUserStore((s) => s.updateAvatar);
  const setProfile = useUserStore((s) => s.setProfile);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [nickInput, setNickInput] = useState(user?.nickname ?? '');
  const [selectedStyle, setSelectedStyle] = useState<RiderStyle>(user?.riderStyle ?? 'night_rider');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const nickChanged = nickInput.trim() !== (user.nickname ?? '');
  const styleChanged = selectedStyle !== user.riderStyle;
  const hasChanges = nickChanged || styleChanged;

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const result = await apiUploadAvatar(user!.id, file);
      updateAvatar(result.user.avatar_url ?? '');
      toast.success(t('profileEdit.avatarSuccess'));
    } catch (err: any) {
      toast.error(err.message ?? t('profile.avatarError'));
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    const trimmed = nickInput.trim();
    if (!trimmed || !hasChanges) return;
    setSaving(true);
    try {
      await apiSaveProfileSetup(user!.id, trimmed, selectedStyle);
      setProfile(trimmed, selectedStyle);
      toast.success(t('profileEdit.saved'));
    } catch (err: any) {
      toast.error(err.message ?? t('profile.nicknameError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TopBar title={t('profileEdit.title')} />
      <div className={styles.body}>
        <div className={styles.avatarWrap}>
          <AppImage
            src={user.avatarUrl}
            alt=""
            className={`${styles.avatar} ${avatarUploading ? styles.avatarLoading : ''}`}
            variant="circle"
          />
          <button
            className={styles.cameraBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            aria-label={t('profile.editAvatar')}
          >
            {avatarUploading ? '⏳' : '📷'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
        </div>

        <div className={styles.field}>
          <div className={styles.label}>{t('profileEdit.nicknameLabel')}</div>
          <input
            className={styles.nickInput}
            value={nickInput}
            onChange={(e) => setNickInput(e.target.value)}
            maxLength={30}
            placeholder={t('profile.nicknamePlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div className={styles.field}>
          <div className={styles.label}>{t('profileEdit.riderStyleLabel')}</div>
          <div className={styles.styleList}>
            {RIDER_STYLES.map((s) => (
              <button
                key={s.code}
                className={`${styles.styleCard} ${selectedStyle === s.code ? styles.styleCardActive : ''}`}
                onClick={() => setSelectedStyle(s.code)}
                type="button"
              >
                <span className={styles.styleIcon}>{s.icon}</span>
                <span className={styles.styleTitle}>{t(s.titleKey)}</span>
                <span className={styles.styleSub}>{t(s.subKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving || !hasChanges || !nickInput.trim()}
        >
          {saving ? t('profile.saving') : t('profileEdit.saveBtn')}
        </button>
      </div>
    </>
  );
}
