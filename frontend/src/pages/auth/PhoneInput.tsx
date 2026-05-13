import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { StatusBar } from '@/components/layout/StatusBar';
import { Button } from '@/components/ui/Button';
import { COUNTRY_CODES, DEFAULT_COUNTRY, type CountryCode } from '@/data/countryCodes';
import { apiRegister, apiLogin } from '@/api/auth';
import { saveSession, loadSession } from '@/lib/session';
import { useUserStore } from '@/store/useUserStore';
import styles from './AuthForm.module.css';
import pickerStyles from './CountryPicker.module.css';

export default function PhoneInput() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);

  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  const isValid = /^[0-9]{6,12}$/.test(phone.replace(/\s/g, ''));
  const fullPhone = `${country.dial}${phone.replace(/\s/g, '')}`;

  // 피커 외부 클릭 시 닫기
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const filtered = search.trim()
    ? COUNTRY_CODES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.dial.includes(search) ||
          c.iso.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRY_CODES;

  const handleSubmit = async () => {
    if (!isValid || loading) return;
    setError(null);
    setLoading(true);

    try {
      // 1) 기존 세션(쿠키)에 이 번호의 passcode가 있으면 로그인 시도
      const existing = loadSession();
      if (existing && existing.phone === fullPhone) {
        const result = await apiLogin(fullPhone, existing.passcode);
        loginFromBackend(result.user);
        navigate('/home', { replace: true });
        return;
      }

      // 2) 신규 가입 (또는 passcode 재발급)
      const result = await apiRegister(fullPhone);
      saveSession({ phone: fullPhone, passcode: result.passcode, userId: result.user.id });
      loginFromBackend(result.user);

      if (result.is_new || !result.user.nickname) {
        navigate('/auth/profile-setup');
      } else {
        navigate('/home', { replace: true });
      }
    } catch (err: any) {
      setError(err.message ?? t('phoneInput.errorNetwork'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}>
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

          {/* 국가코드 피커 버튼 */}
          <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              className={styles.flagGroup}
              onClick={() => { setPickerOpen((v) => !v); setSearch(''); }}
              type="button"
              aria-label="Select country code"
            >
              <span className={`fi fi-${country.iso.toLowerCase()} ${styles.flagEmoji}`} />
              <span className={styles.code}>{country.dial}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: -6 }}>▾</span>
            </button>

            {pickerOpen && (
              <div className={pickerStyles.dropdown}>
                <input
                  className={pickerStyles.search}
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <ul className={pickerStyles.list}>
                  {filtered.map((c) => (
                    <li key={`${c.iso}-${c.dial}`}>
                      <button
                        className={`${pickerStyles.item} ${c.iso === country.iso ? pickerStyles.active : ''}`}
                        onClick={() => { setCountry(c); setPickerOpen(false); }}
                        type="button"
                      >
                        <span className={`fi fi-${c.iso.toLowerCase()} ${pickerStyles.itemFlag}`} />
                        <span className={pickerStyles.itemName}>{c.name}</span>
                        <span className={pickerStyles.itemDial}>{c.dial}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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

        <Button onClick={handleSubmit} disabled={!isValid || loading}>
          {loading ? '...' : t('phoneInput.getAuthCodeBtn')}
        </Button>
        <p className={styles.legal}>
          {t('phoneInput.legalPrefix')}
          <a>{t('phoneInput.terms')}</a>
          {t('phoneInput.legalMid')}
          <a>{t('phoneInput.privacy')}</a>
          {t('phoneInput.legalSuffix')}
        </p>
      </div>
      <div className={styles.bottomMesh} />
    </div>
  );
}
