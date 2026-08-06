import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/store/useUserStore';
import { saveSession } from '@/lib/session';
import { apiRestoreAccount } from '@/api/auth';
import styles from './AccountRestore.module.css';
import { formatVnDate } from '@/lib/vnTime';

interface RestoreState {
  deletedAt: string | null;
  restorableUntil: string | null;
  restoreToken: string | null;
}

/**
 * 탈퇴 처리 중 계정 복구 안내 — OAuth 본인확인 성공 후 409(account_deleted)를 받은
 * OAuthLogin 이 restoreToken 과 함께 라우팅한다. 복구되는 것/안 되는 것/기한을 명시하고,
 * 사용자가 명시적으로 [복구하기]를 눌러야만 실제 복구(POST /auth/account/restore)한다.
 */
export default function AccountRestore() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = (location.state ?? null) as RestoreState | null;
  if (!state?.restoreToken) return <Navigate to="/auth/oauth" replace />;
  const restoreToken = state.restoreToken;

  const untilLabel = state.restorableUntil
    ? formatVnDate(state.restorableUntil, i18n.language, { dateStyle: 'long' })
    : null;

  const handleRestore = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRestoreAccount(restoreToken);
      saveSession({ userId: result.user.id, sessionToken: result.session_token });
      loginFromBackend(result.user);
      navigate('/home', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      // 401 restore_token_expired / restore_token_invalid — 토큰 만료·재사용은 로그인부터 다시
      setError(msg.includes('restore_token') ? t('accountRestore.errorTokenExpired') : t('accountRestore.errorGeneric'));
      setLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      <StatusBar variant="dark" />
      <div className={styles.body}>
        <div className={styles.icon}>
          <RotateCcw size={28} />
        </div>
        <h1 className={styles.title}>{t('accountRestore.title')}</h1>
        <p className={styles.desc}>{t('accountRestore.desc')}</p>
        <ul className={styles.points}>
          <li>{t('accountRestore.pointRestored')}</li>
          <li>{t('accountRestore.pointNotRestored')}</li>
          {untilLabel && <li>{t('accountRestore.pointDeadline', { date: untilLabel })}</li>}
          <li>{t('accountRestore.pointPurge')}</li>
        </ul>
        {error && <p className={styles.errorText}>{error}</p>}
        <Button onClick={handleRestore} disabled={loading} className={styles.restoreBtn}>
          {loading ? t('accountRestore.restoring') : t('accountRestore.restoreBtn')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate('/auth/oauth', { replace: true })}
          disabled={loading}
          className={styles.cancelBtn}
        >
          {t('accountRestore.cancelBtn')}
        </Button>
      </div>
    </div>
  );
}
