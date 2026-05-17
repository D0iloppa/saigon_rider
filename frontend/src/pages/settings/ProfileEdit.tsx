import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { useUserStore } from '@/store/useUserStore';
import { apiUploadAvatar, apiUpdateNickname } from '@/api/profile';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import styles from './ProfileEdit.module.css';

export default function ProfileEdit() {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const updateAvatar = useUserStore((s) => s.updateAvatar);
  const updateNickname = useUserStore((s) => s.updateNickname);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [nickInput, setNickInput] = useState(user?.nickname ?? '');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const nickChanged = nickInput.trim() !== (user.nickname ?? '');

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
    if (!trimmed || !nickChanged) return;
    setSaving(true);
    try {
      await apiUpdateNickname(user!.id, trimmed);
      updateNickname(trimmed);
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

        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving || !nickChanged || !nickInput.trim()}
        >
          {saving ? t('profile.saving') : t('profileEdit.saveBtn')}
        </button>
      </div>
    </>
  );
}
