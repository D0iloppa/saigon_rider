import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TopBar } from '@/components/layout/TopBar';
import { SettingsRow } from '@/components/ui/SettingsRow';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import styles from './Settings.module.css';

export default function AccountSettings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);
  const openDialog = useDialogStore((s) => s.open);

  if (!user) return null;

  const handleDelete = () => {
    openDialog({
      message: { mode: 'code', value: 'settings.deleteConfirm' },
      onConfirm: () => { logout(); navigate('/splash'); },
    });
  };

  return (
    <>
      <TopBar title={t('settings.accountManagement')} />
      <div className={styles.body}>
        <div className={styles.sectionCard}>
          <SettingsRow
            label={t('settings.phone')}
            value={user.phone}
            right={<button className={styles.copyBtn}>{t('common.change')}</button>}
          />
          <SettingsRow
            label={t('settings.joinedDate')}
            value="2025.11.03"
          />
          <SettingsRow
            label={t('settings.accountId')}
            value="A-979D3W…"
            right={
              <button
                className={styles.copyBtn}
                onClick={() => {
                  navigator.clipboard?.writeText('A-979D3WXWXB6VAV');
                  toast(t('common.copied'));
                }}
              >
                {t('common.copy')}
              </button>
            }
          />
        </div>

        <div className={styles.sectionCard} style={{ marginTop: 16 }}>
          <SettingsRow
            icon="💾"
            label={t('settings.downloadData')}
            arrow
          />
        </div>

        <div className={styles.danger}>
          <div className={styles.dangerHead}>
            <span>⚠</span>
            {t('settings.deleteAccount')}
          </div>
          <p className={styles.dangerText}>{t('settings.deleteWarning')}</p>
          <button className={styles.dangerBtn} onClick={handleDelete}>
            {t('settings.deleteAccount')}
          </button>
        </div>
      </div>
    </>
  );
}
