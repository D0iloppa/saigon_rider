import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/store/useUserStore';
import { apiRequestOtp, apiVerifyOtp } from '@/api/auth';
import { fetchAppConfig } from '@/api/appVersion';
import styles from './AuthForm.module.css';

type Step = 'phone' | 'otp';

// 백엔드 에러 계약(고정 detail 문자열) → 사용자 메시지 i18n 키 매핑
const ERROR_MAP: [string, string][] = [
  ['Invalid phone number', 'phoneVerify.errInvalidPhone'],
  ['Please wait before requesting another code', 'phoneVerify.errResendCooldown'],
  ['Too many OTP requests', 'phoneVerify.errTooManyRequests'],
  ['No OTP requested for this phone', 'phoneVerify.errNoOtpRequested'],
  ['OTP expired', 'phoneVerify.errExpired'],
  ['Too many attempts', 'phoneVerify.errTooManyAttempts'],
  ['Invalid code', 'phoneVerify.errInvalidCode'],
  ['Phone number already linked to another account', 'phoneVerify.errPhoneTaken'],
  ['SMS send failed', 'phoneVerify.errSmsSendFailed'],
];

function mapOtpError(err: unknown, t: (key: string) => string): string {
  const msg = err instanceof Error ? err.message : '';
  const hit = ERROR_MAP.find(([needle]) => msg.includes(needle));
  return t(hit ? hit[1] : 'phoneVerify.errGeneric');
}

export default function PhoneVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const markPhoneVerified = useUserStore((s) => s.markPhoneVerified);

  const [step, setStep] = useState<Step>('phone');
  const [countryCode, setCountryCode] = useState('84'); // 국가코드 숫자(기본 84). 국가 목록은 두지 않는다 — 서버가 최종 판정
  const [localDigits, setLocalDigits] = useState(''); // 국가코드 뒤 로컬 자릿수
  const [normalizedPhone, setNormalizedPhone] = useState(''); // 백엔드가 돌려준 E.164 — verify 호출에 그대로 사용
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [otpDevBypass, setOtpDevBypass] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // 백엔드 __DEV OTP 우회(auth.py _otp_bypass_enabled()) 활성 여부 — 운영에서는 항상 false
  useEffect(() => {
    let cancelled = false;
    fetchAppConfig()
      .then((cfg) => {
        if (cancelled) return;
        setOtpDevBypass(cfg.otpDevBypass);
      })
      .catch(() => {
        // 응답 실패 시 otpDevBypass를 false로 유지 (fail-closed: dev 우회가 활성화되지 않음)
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const timer = setInterval(() => setExpiresIn((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [expiresIn]);

  // 84 → 백엔드 _VN_MOBILE_RE 와 정합: 로컬부 3/5/7/8/9로 시작하는 9자리.
  // 그 외 → 백엔드 _E164_RE 와 정합: 국가코드 1~3자리(첫 자리 1~9) + 번호, 합계 7~15자리 (서버가 최종 판정).
  // 우회 활성 시에만 4자리 이상으로 완화.
  const isVn = countryCode === '84';
  const countryCodeValid = /^[1-9]\d{0,2}$/.test(countryCode);
  const phoneValid = otpDevBypass
    ? countryCodeValid && /^[0-9]{4,}$/.test(localDigits)
    : isVn
      ? /^[35789]\d{8}$/.test(localDigits)
      : countryCodeValid && localDigits.length > 0 && (countryCode + localDigits).length >= 7 && (countryCode + localDigits).length <= 15;
  const phoneFormatHint = localDigits.length > 0 && !phoneValid && !error;

  const requestOtp = async (phone: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequestOtp(phone);
      setNormalizedPhone(res.phone);
      setResendCooldown(res.resend_cooldown_sec);
      setExpiresIn(res.expires_in_sec);
      setDigits(['', '', '', '', '', '']);
      setStep('otp');
    } catch (err) {
      setError(mapOtpError(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = () => {
    if (!phoneValid || loading) return;
    void requestOtp(`+${countryCode}${localDigits}`);
  };

  const handleResend = () => {
    if (resendCooldown > 0 || loading || !normalizedPhone) return;
    void requestOtp(normalizedPhone);
  };

  const handleDigitChange = (i: number, v: string) => {
    const v2 = v.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[i] = v2;
    setDigits(next);
    setError(null);
    if (v2 && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handleDigitKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length < 6 || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiVerifyOtp(normalizedPhone, code);
      markPhoneVerified(res.phone);
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from ?? '/market/new', { replace: true });
    } catch (err) {
      setError(mapOtpError(err, t));
      setDigits(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const mm = Math.floor(expiresIn / 60);
  const ss = expiresIn % 60;
  const timeText = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  return (
    <>
      <TopBar title={t('phoneVerify.headerTitle')} />
      <div className={styles.body}>
        {otpDevBypass && <p className={styles.timer}>{t('phoneVerify.devBypassBanner')}</p>}
        {step === 'phone' ? (
          <>
            <h1 className={styles.title}>{t('phoneVerify.title')}</h1>
            <p className={styles.sub}>{t('phoneVerify.subtitle')}</p>

            <div className={`${styles.input} ${error ? styles.inputError : ''}`}>
              <div className={styles.inputShine} />
              {/* 국가코드 직접 입력(기본 84) — 국가 목록 하드코딩 금지, 채널 라우팅은 서버(sms_client) 담당 */}
              <div className={styles.flagGroup}>
                <span className={styles.code}>+</span>
                <input
                  type="tel"
                  className={styles.codeInput}
                  aria-label={t('phoneVerify.countryCodeLabel')}
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value.replace(/\D/g, '').slice(0, 3));
                    setError(null);
                  }}
                  inputMode="numeric"
                  maxLength={3}
                />
              </div>
              <input
                type="tel"
                placeholder={t(isVn ? 'phoneVerify.phonePlaceholder' : 'phoneVerify.phonePlaceholderIntl')}
                value={localDigits}
                onChange={(e) => {
                  setLocalDigits(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
                inputMode="numeric"
                autoFocus
              />
            </div>

            {error && <p className={styles.error}><CircleAlert size={14} className={styles.errorIcon} /> {error}</p>}
            {phoneFormatHint && (
              <p className={styles.error}>
                <CircleAlert size={14} className={styles.errorIcon} />
                {t(otpDevBypass ? 'phoneVerify.phoneFormatHintDev' : isVn ? 'phoneVerify.phoneFormatHint' : 'phoneVerify.phoneFormatHintIntl')}
              </p>
            )}

            <div className={styles.spacer} />

            <Button onClick={handleRequestOtp} disabled={!phoneValid || loading}>
              {t('phoneVerify.getCodeBtn')}
            </Button>
          </>
        ) : (
          <>
            <h1 className={styles.title}>{t('phoneVerify.otpTitle')}</h1>
            <p className={styles.sub}>{t('phoneVerify.otpSubtitle', { phone: normalizedPhone })}</p>

            <div className={styles.otpRow}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputsRef.current[i] = el)}
                  className={`${styles.otpCell} ${d ? styles.otpCellActive : ''} ${error ? styles.otpCellError : ''}`}
                  value={d}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKey(i, e)}
                  inputMode="numeric"
                  maxLength={1}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            {error ? (
              <p className={styles.error}><CircleAlert size={14} className={styles.errorIcon} /> {error}</p>
            ) : expiresIn <= 0 ? (
              <p className={styles.error}>{t('phoneVerify.expired')}</p>
            ) : (
              <p className={styles.timer}>{t('phoneVerify.expiresIn', { time: timeText })}</p>
            )}

            <p className={styles.timer}>
              {resendCooldown > 0 ? (
                t('phoneVerify.resendCooldown', { sec: resendCooldown })
              ) : (
                <button className={styles.resend} onClick={handleResend} disabled={loading}>
                  {t('phoneVerify.resendBtn')}
                </button>
              )}
            </p>

            <div className={styles.spacer} />

            <Button onClick={handleVerify} disabled={digits.join('').length < 6 || loading || expiresIn <= 0}>
              {t('phoneVerify.verifyBtn')}
            </Button>

            <p className={styles.timer} style={{ marginTop: 12 }}>
              <button className={styles.resend} onClick={() => { setStep('phone'); setError(null); }}>
                {t('phoneVerify.changeNumber')}
              </button>
            </p>
          </>
        )}
      </div>
    </>
  );
}
