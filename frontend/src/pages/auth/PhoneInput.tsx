import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import styles from './AuthForm.module.css';

export default function PhoneInput() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isValid = /^[0-9]{8,11}$/.test(phone.replace(/\s/g, ''));

  const handleSubmit = () => {
    if (!isValid) {
      setError('올바른 휴대폰 번호 형식이 아니에요');
      return;
    }
    setError(null);
    navigate('/auth/otp', { state: { phone: `+84 ${phone}` } });
  };

  return (
    <>
      <TopBar showBack />
      <div className={styles.body}>
        <h1 className={styles.title}>
          휴대폰 번호로
          <br />
          로그인
        </h1>
        <p className={styles.sub}>+84 베트남 번호로 인증 코드를 보내드려요</p>

        <div className={`${styles.input} ${error ? styles.inputError : ''}`}>
          <div className={styles.flagGroup}>
            <span className={styles.flag}>🇻🇳</span>
            <span className={styles.code}>+84</span>
          </div>
          <input
            type="tel"
            placeholder="901 234 567"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setError(null);
            }}
            inputMode="numeric"
            autoFocus
          />
        </div>
        {error && <p className={styles.error}>⚠ {error}</p>}

        <div className={styles.spacer} />

        <Button onClick={handleSubmit} disabled={!isValid}>
          인증 코드 받기
        </Button>
        <p className={styles.legal}>
          계속을 누르면 이용약관과 개인정보처리방침에 동의합니다.
        </p>
      </div>
    </>
  );
}
