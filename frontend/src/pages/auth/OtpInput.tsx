import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/store/useUserStore';
import styles from './AuthForm.module.css';

export default function OtpInput() {
  const navigate = useNavigate();
  const location = useLocation();
  const phone = (location.state as any)?.phone || '+84 901 234 567';
  const login = useUserStore((s) => s.login);

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
      <TopBar showBack />
      <div className={styles.body}>
        <h1 className={styles.title}>인증 코드 입력</h1>
        <p className={styles.sub}>{phone} 로 보낸 6자리 코드를 입력하세요</p>

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
            ⚠ 코드가 올바르지 않거나 만료됐어요
          </p>
        ) : (
          <p className={styles.timer}>
            {seconds > 0 ? (
              <>
                {timerText} 후 재전송 가능
              </>
            ) : (
              <button className={styles.resend} onClick={() => setSeconds(180)}>
                코드 재전송
              </button>
            )}
          </p>
        )}

        <div className={styles.spacer} />

        <Button onClick={handleVerify} disabled={digits.join('').length < 6}>
          확인
        </Button>
        <p className={styles.legal}>
          테스트 환경: 000000 외 6자리 입력 시 성공
        </p>
      </div>
    </>
  );
}
