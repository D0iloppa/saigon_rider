import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Toggle } from '@/components/ui/Toggle';
import { SettingsRow } from '@/components/ui/SettingsRow';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import { useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import styles from './Settings.module.css';

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);
  const openDialog = useDialogStore((s) => s.open);
  const [dark, setDark] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    openDialog({
      message: { mode: 'code', value: 'settings.logoutConfirm' },
      onConfirm: () => { logout(); navigate('/splash'); },
    });
  };

  const langLabel =
    user.language === 'ko' ? '한국어' :
    user.language === 'vi' ? 'Tiếng Việt' :
    'English';

  return (
    <>
      <TopBar title={t('settings.title')} />
      <div className={styles.body}>
        <div
          className={styles.profileCard}
          onClick={() => navigate('/profile')}
        >
          <AppImage src={user.avatarUrl} alt="" variant="circle" className={styles.profileAvatar} />
          <div className={styles.profileInfo}>
            <div className={styles.profileNick}>{user.nickname}</div>
            <div className={styles.profileSub}>{t('settings.viewProfile')}</div>
          </div>
          <span className={styles.arrow}>›</span>
        </div>

        <Section title={t('settings.sectionNotif')}>
          <SettingsRow
            icon="🔔"
            label={t('settings.notiSettings')}
            arrow
            onClick={() => navigate('/settings/notifications')}
          />
        </Section>

        <Section title={t('settings.sectionApp')}>
          <SettingsRow
            icon="🌐"
            label={t('settings.language')}
            value={langLabel}
            arrow
            onClick={() => navigate('/settings/language')}
          />
          <SettingsRow
            icon="🌙"
            label={t('settings.darkMode')}
            right={<Toggle checked={dark} onChange={setDark} />}
          />
          <SettingsRow
            icon="📍"
            label={t('settings.locationPermission')}
            value={t('settings.locationAllowed')}
          />
        </Section>

        <Section title={t('settings.sectionAccount')}>
          <SettingsRow
            icon="✏️"
            label={t('settings.editProfile')}
            arrow
            onClick={() => navigate('/settings/profile')}
          />
          <SettingsRow
            icon="👤"
            label={t('settings.accountManagement')}
            arrow
            onClick={() => navigate('/settings/account')}
          />
          <SettingsRow icon="🔒" label={t('settings.privacy')} arrow />
          <SettingsRow icon="📄" label={t('settings.terms')} arrow />
        </Section>

        <Section title={t('settings.sectionOther')}>
          <SettingsRow icon="ⓘ" label={t('settings.appInfo')} value="v1.0.0" />
          <SettingsRow icon="💬" label={t('settings.support')} arrow />
        </Section>

        <button className={styles.logout} onClick={handleLogout}>
          {t('settings.logout')}
        </button>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.sectionCard}>{children}</div>
    </div>
  );
}
