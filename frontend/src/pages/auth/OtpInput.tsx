import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { StatusBar } from '@/components/layout/StatusBar';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/store/useUserStore';
import styles from './AuthForm.module.css';

export default function OtpInput() {
  const navigate = useNavigate();
  const location = useLocation();
  const phone = (location.state as any)?.phone || '+84 901 234 567';
  const login = useUserStore((s) => s.login);
  const { t } = useTranslation();

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState(false);
  const [seconds, setSeconds] = useState(180);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const handleChange = (i: number, v: string) => {
    const v2 = v.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[i] = v2;
    setDigits(next);
    setError(false);
    if (v2 && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  };

  const handleVerify = () => {
    const code = digits.join('');
    if (code.length < 6) {
      setError(true);
      return;
    }
    // 더미: 000000은 실패, 그 외는 성공
    if (code === '000000') {
      setError(true);
      return;
    }
    login(phone);
    navigate('/auth/profile-setup');
  };

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timerText = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <>
      <StatusBar />
      <div className={styles.body}>
        <h1 className={styles.title}>{t('otpInput.title')}</h1>
        <p className={styles.sub}>{t('otpInput.subtitle', { phone })}</p>

        <div className={styles.otpRow}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputsRef.current[i] = el)}
              className={`${styles.otpCell} ${d ? styles.otpCellActive : ''} ${error ? styles.otpCellError : ''}`}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              inputMode="numeric"
              maxLength={1}
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error ? (
          <p className={styles.error}>
            {t('otpInput.errorInvalidCode')}
          </p>
        ) : (
          <p className={styles.timer}>
            {seconds > 0 ? (
              <>
                {timerText}{t('otpInput.resendAvailableAfter')}
              </>
            ) : (
              <button className={styles.resend} onClick={() => setSeconds(180)}>
                {t('otpInput.resendBtn')}
              </button>
            )}
          </p>
        )}

        <div className={styles.spacer} />

        <Button onClick={handleVerify} disabled={digits.join('').length < 6}>
          {t('otpInput.verifyBtn')}
        </Button>
        <p className={styles.legal}>
          {t('otpInput.testModeNote')}
        </p>
      </div>
    </>
  );
}
