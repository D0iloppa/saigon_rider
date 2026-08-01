import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, TriangleAlert } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { SettingsRow } from '@/components/ui/SettingsRow';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import { apiDeleteAccount, apiExportMyData } from '@/api/auth';
import { clearSession } from '@/lib/session';
import { native } from '@/lib/native';
import styles from './Settings.module.css';

function formatAccountId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 12).toUpperCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${dd}`;
}

export default function AccountSettings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);
  const openDialog = useDialogStore((s) => s.open);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!user) return null;

  const accountId = formatAccountId(user.id);
  const displayId = `${accountId.slice(0, 6)}…`;

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await apiExportMyData(user.id);
      const json = JSON.stringify(data, null, 2);
      await native.saveTextFile('saigon_rider_data.json', json, 'application/json');
      toast(t('common.downloadStarted'));
    } catch {
      toast.error(t('common.errorUnexpected'));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = () => {
    openDialog({
      message: { mode: 'code', value: 'settings.deleteConfirm' },
      onConfirm: async () => {
        if (deleting) return;
        setDeleting(true);
        try {
          await apiDeleteAccount(user.id);
          clearSession();
          logout();
          navigate('/splash');
        } catch {
          toast.error(t('common.errorUnexpected'));
          setDeleting(false);
        }
      },
    });
  };

  return (
    <>
      <TopBar title={t('settings.accountManagement')} />
      <div className={styles.body}>
        <div className={styles.sectionCard}>
          {/* 전화번호는 표시만 — 변경/인증 플로우는 만들지 않기로 결정 (OAuth 전환, 2026-07-06) */}
          <SettingsRow
            label={t('settings.phone')}
            value={user.phone ?? undefined}
          />
          <SettingsRow
            label={t('settings.joinedDate')}
            value={formatDate(user.createdAt)}
          />
          <SettingsRow
            label={t('settings.accountId')}
            value={displayId}
            right={
              <button
                className={styles.copyBtn}
                onClick={() => {
                  native.copyToClipboard(accountId);
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
            icon={<Download size={18} />}
            label={t('settings.downloadData')}
            arrow
            onClick={handleExport}
          />
        </div>

        <div className={styles.danger}>
          <div className={styles.dangerHead}>
            <TriangleAlert size={16} />
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
