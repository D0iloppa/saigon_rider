import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Toggle } from '@/components/ui/Toggle';
import { SettingsRow } from '@/components/ui/SettingsRow';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useState, useEffect, useCallback } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { fetchCurrentVersion, type AppVersionCurrent } from '@/api/appVersion';
import { native, type LocationPermissionState } from '@/lib/native';
import styles from './Settings.module.css';

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);
  const openDialog = useDialogStore((s) => s.open);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [appVersion, setAppVersion] = useState<string>('');
  const [versionData, setVersionData] = useState<AppVersionCurrent | null>(null);
  const [locPerm, setLocPerm] = useState<LocationPermissionState | null>(null);

  useEffect(() => {
    fetchCurrentVersion()
      .then((v) => {
        setVersionData(v);
        if (v.primary) setAppVersion(`v${v.primary.version}`);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    native.checkLocationPermission().then(setLocPerm).catch(() => setLocPerm(null));
  }, []);

  const handleLocationTap = useCallback(async () => {
    if (locPerm === 'granted') return; // 이미 허용 — 별도 동작 없음
    if (locPerm === 'denied') {
      // 재요청이 막힘(시스템이 더 이상 권한 팝업을 띄우지 않음) → OS 앱 설정으로 유도.
      await native.openAppSettings();
      return;
    }
    // prompt/불명 → 권한 재요청 팝업.
    const next = await native.requestLocationPermission();
    setLocPerm(next);
  }, [locPerm]);

  const showVersionInfo = useCallback(() => {
    if (!versionData) return;
    const { primary, ios, android } = versionData;
    const lines: string[] = [];
    if (primary) {
      lines.push(`App  : v${primary.version}`);
      if (primary.releaseNote) lines.push(`Note : ${primary.releaseNote}`);
    }
    if (ios) lines.push(`iOS  : v${ios.version} (build ${ios.buildNumber ?? '-'})`);
    if (android) lines.push(`AOS  : v${android.version} (build ${android.buildNumber ?? '-'})`);
    if (primary?.releasedAt) {
      lines.push(`Date : ${new Date(primary.releasedAt).toLocaleDateString()}`);
    }
    openDialog({
      title: { mode: 'code', value: 'settings.appInfo' },
      pre: lines.join('\n'),
    });
  }, [versionData, openDialog]);

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
            right={<Toggle checked={theme === 'dark'} onChange={(v) => setTheme(v ? 'dark' : 'light')} />}
          />
          <SettingsRow
            icon="📍"
            label={t('settings.locationPermission')}
            value={
              locPerm === 'granted' ? t('settings.locationAllowed') :
              locPerm === 'denied' ? t('settings.locationDenied') :
              locPerm === 'prompt' ? t('settings.locationPrompt') :
              '…'
            }
            arrow
            onClick={handleLocationTap}
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
          <SettingsRow icon="🔒" label={t('settings.privacy')} arrow onClick={() => navigate('/settings/privacy')} />
          <SettingsRow icon="📄" label={t('settings.terms')} arrow onClick={() => navigate('/settings/terms')} />
        </Section>

        <Section title={t('settings.sectionOther')}>
          <SettingsRow icon="ⓘ" label={t('settings.appInfo')} value={appVersion || '...'} arrow onClick={showVersionInfo} />
          <SettingsRow icon="💬" label={t('settings.support')} arrow onClick={() => navigate('/settings/support')} />
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
