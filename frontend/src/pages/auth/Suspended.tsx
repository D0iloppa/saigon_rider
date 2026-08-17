import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ban, CirclePause } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/store/useUserStore';
import type { AccountRestrictionCode } from '@/api/client';
import styles from './Suspended.module.css';
import { formatVnDateTime } from '@/lib/vnTime';

interface RestrictionInfo {
  code: AccountRestrictionCode;
  until: string | null;
}

/** 정지/밴 계정 안내 — client.ts 의 전역 핸들러가 리다이렉트 직전 sessionStorage 에 저장한 정보를 읽는다. */
export default function Suspended() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const logout = useUserStore((s) => s.logout);
  const [info, setInfo] = useState<RestrictionInfo | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('account_restricted');
    if (!raw) return;
    try {
      setInfo(JSON.parse(raw));
    } catch {
      setInfo(null);
    }
  }, []);

  const isBanned = info?.code === 'account_banned';
  const untilLabel = info?.until
    ? formatVnDateTime(info.until, i18n.language, { dateStyle: 'long', timeStyle: 'short' })
    : null;

  const handleLogout = () => {
    sessionStorage.removeItem('account_restricted');
    logout();
    navigate('/splash');
  };

  return (
    <div className={styles.root}>
      <StatusBar variant="dark" />
      <div className={styles.body}>
        <div className={`${styles.icon} ${isBanned ? styles.iconBanned : styles.iconSuspended}`}>
          {isBanned ? <Ban size={28} /> : <CirclePause size={28} />}
        </div>
        <h1 className={styles.title}>
          {isBanned ? t('suspended.bannedTitle') : t('suspended.suspendedTitle')}
        </h1>
        <p className={styles.desc}>
          {isBanned
            ? t('suspended.bannedDesc')
            : untilLabel
              ? t('suspended.suspendedDesc', { date: untilLabel })
              : t('suspended.suspendedDescNoDate')}
        </p>
        <p className={styles.contactHint}>{t('suspended.contactHint')}</p>
        <Button variant="primary" onClick={() => navigate('/settings/support')} className={styles.supportBtn}>
          {t('settings.support')}
        </Button>
        <Button variant="secondary" onClick={handleLogout} className={styles.logoutBtn}>
          {t('settings.logout')}
        </Button>
      </div>
    </div>
  );
}
