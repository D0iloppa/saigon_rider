import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { StatusBar } from '@/components/layout/StatusBar';
import { Button } from '@/components/ui/Button';
import styles from './AuthForm.module.css';

export default function PhoneInput() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isValid = /^[0-9]{8,11}$/.test(phone.replace(/\s/g, ''));

  const handleSubmit = () => {
    if (!isValid) {
      setError(t('phoneInput.errorInvalidPhone'));
      return;
    }
    setError(null);
    navigate('/auth/otp', { state: { phone: `+84 ${phone}` } });
  };

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <StatusBar />
      <div className={styles.body}>
        <h1 className={styles.title}>
          {t('phoneInput.titleLine1')}
          <br />
          {t('phoneInput.titleLine2')}
        </h1>
        <p className={styles.sub}>{t('phoneInput.subtitle')}</p>

        <div className={`${styles.input} ${error ? styles.inputError : ''}`}>
          <div className={styles.inputShine} />
          <div className={styles.flagGroup}>
            <img
              className={styles.flagImg}
              src="https://fonts.gstatic.com/s/e/notoemoji/latest/1f1fb-1f1f3/512.gif"
              alt="VN"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
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
          {t('phoneInput.getAuthCodeBtn')}
        </Button>
        <p className={styles.legal}>
          {t('phoneInput.legalPrefix')}<a>{t('phoneInput.terms')}</a>{t('phoneInput.legalMid')}<a>{t('phoneInput.privacy')}</a>{t('phoneInput.legalSuffix')}
        </p>
      </div>
      <div className={styles.bottomMesh} />
    </div>
  );
}
