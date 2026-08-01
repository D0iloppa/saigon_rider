import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { StatusBar } from '@/components/layout/StatusBar';
import { RadioCircle } from '@/components/ui/RadioCircle';
import { emojiUrl } from '@/lib/emoji';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import { apiSaveProfileSetup, apiSaveConsent, checkNicknameAvailable, fetchRandomNickname } from '@/api/profile';
import type { RiderStyle } from '@/api/types';
import styles from './ProfileSetup.module.css';

// 기존 legal.privacyHtml/termsHtml (settings/PrivacyPolicy·TermsOfService) 의 "시행일" 과 동일 — 새 문안 아님.
const CONSENT_DOCUMENT_VERSION = '2026-06-01';

type NicknameCheckStatus = 'idle' | 'checking' | 'available' | 'taken';

const NICKNAME_CHECK_DEBOUNCE_MS = 400;

const STYLES: { key: RiderStyle; gifCode: string; titleKey: string; subKey: string }[] = [
  { key: 'commuter',    gifCode: '1f3cd', titleKey: 'profileSetup.styleCommuterTitle',    subKey: 'profileSetup.styleCommuterSub' },
  { key: 'cafe_hunter', gifCode: '2615',  titleKey: 'profileSetup.styleCafeHunterTitle',   subKey: 'profileSetup.styleCafeHunterSub' },
  { key: 'night_rider', gifCode: '1f31f', titleKey: 'profileSetup.styleNightRiderTitle', subKey: 'profileSetup.styleNightRiderSub' },
];

function GifIcon({ code, size = 56 }: { code: string; size?: number }) {
  return (
    <img
      src={emojiUrl(code)}
      width={size}
      height={size}
      alt=""
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const setProfile = useUserStore((s) => s.setProfile);
  const markConsentAgreed = useUserStore((s) => s.markConsentAgreed);
  const { t } = useTranslation();

  const [nickname, setNickname] = useState('');
  const [style, setStyle] = useState<RiderStyle | null>('night_rider');
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [nickStatus, setNickStatus] = useState<NicknameCheckStatus>('idle');
  // F-9: 약관/개인정보처리방침 동의 없이는 가입(온보딩)이 진행되지 않는다.
  const [agreed, setAgreed] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 하단 CTA 버튼이 키보드에 가려진다 —
  // 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다. (ai-docs/context/keyboard-ux.md 케이스 1)
  const isIosNative = native.platform === 'ios';

  // 닉네임 중복 확인 — 입력 이벤트(onChange)는 그대로 두고 값 변화만 감지해 debounce (F-03-1: IME 조합 이슈 회피)
  useEffect(() => {
    const trimmed = nickname.trim();
    // 현재(가입 시 부여된) 닉네임을 그대로 유지하는 경우는 중복이 아니므로 조회하지 않음
    if (trimmed.length < 2 || trimmed === user?.nickname) {
      setNickStatus('idle');
      return;
    }
    setNickStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await checkNicknameAvailable(trimmed);
        setNickStatus(res.available ? 'available' : 'taken');
      } catch {
        setNickStatus('idle');
      }
    }, NICKNAME_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [nickname, user?.nickname]);

  const isValid =
    nickname.length >= 2 && nickname.length <= 20 && style && nickStatus !== 'taken' && nickStatus !== 'checking';

  const handleSkip = async () => {
    if (!user?.id || skipping || !agreed) return;
    setSkipping(true);
    try {
      const consented = await apiSaveConsent(user.id, CONSENT_DOCUMENT_VERSION, CONSENT_DOCUMENT_VERSION);
      // PrivateRoute 가 서버 값(consentAgreedAt)으로 게이트하므로, 로컬 store 도 즉시 반영해야
      // navigate('/home') 후 바로 되돌아오는 왕복(bounce)이 나지 않는다.
      if (consented.consent_agreed_at) markConsentAgreed(consented.consent_agreed_at);
      // 가입 시 이미 랜덤 닉네임이 부여됨 → 건너뛰기는 현재(랜덤) 닉네임 유지.
      // 혹시 비어 있으면(구버전 계정) 그때만 새로 발급.
      const keepNick = user.nickname || (await fetchRandomNickname());
      const saved = await apiSaveProfileSetup(user.id, keepNick, null);
      const rtCode: RiderStyle = (typeof saved.rider_type === 'object' && saved.rider_type !== null
        ? (saved.rider_type.code?.toLowerCase() ?? 'commuter')
        : typeof saved.rider_type === 'string' ? saved.rider_type.toLowerCase() : 'commuter') as RiderStyle;
      setProfile(saved.nickname ?? keepNick, rtCode);
      navigate('/home');
    } catch {
      navigate('/home');
    } finally {
      setSkipping(false);
    }
  };

  const handleSubmit = async () => {
    if (nickname.length < 2) {
      toast.error(t('profileSetup.errorNicknameTooShort'));
      return;
    }
    if (!style) {
      toast.error(t('profileSetup.errorNoStyle'));
      return;
    }
    if (!agreed) {
      toast.error(t('profileSetup.errorConsentRequired'));
      return;
    }

    if (!user?.id) {
      toast.error(t('common.errorUnexpected'));
      return;
    }

    setSaving(true);
    try {
      const consented = await apiSaveConsent(user.id, CONSENT_DOCUMENT_VERSION, CONSENT_DOCUMENT_VERSION);
      if (consented.consent_agreed_at) markConsentAgreed(consented.consent_agreed_at);
      await apiSaveProfileSetup(user.id, nickname, style);
      setProfile(nickname, style);
      navigate('/home');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorUnexpected'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.root}>
      <StatusBar />
      {/* Nav row: dot indicator + skip */}
      <div className={styles.navRow}>
        <div className={styles.dots}>
          <span className={`${styles.dot} ${styles.dotActive}`} />
          <span className={`${styles.dot} ${styles.dotActive}`} />
          <span className={styles.dot} />
        </div>
        <button className={styles.skipBtn} onClick={handleSkip} disabled={skipping || !agreed}>
          {t('profileSetup.skip')}
        </button>
      </div>

      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
        <h1 className={styles.title}>
          {t('profileSetup.titleLine1')}
          <br />
          {t('profileSetup.titleLine2')}
        </h1>

        {/* Nickname */}
        <div className={styles.nickField}>
          <GifIcon code="1f3cd" size={28} />
          <input
            placeholder={t('profileSetup.nicknamePlaceholder')}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20} /* 자동부여 닉네임(형용사+명사+숫자, ~18자)이 잘리지 않게 — 12는 자기 닉네임도 truncate 해 중복확인이 오판됐음 */
          />
          {nickname.length >= 2 && <GifIcon code="2705" size={24} />}
        </div>
        {nickStatus !== 'idle' && (
          <p className={`${styles.nickHint} ${styles[`nickHint_${nickStatus}`]}`}>
            {t(`profileSetup.nicknameCheck_${nickStatus}`)}
          </p>
        )}

        {/* Rider style cards */}
        <div className={styles.styleList}>
          {STYLES.map((s) => {
            const selected = style === s.key;
            return (
              <button
                key={s.key}
                className={`${styles.styleCard} ${selected ? styles.selected : ''}`}
                onClick={() => setStyle(s.key)}
              >
                {selected && <div className={styles.selectedOverlay} />}
                <div className={styles.styleIcon}>
                  <GifIcon code={s.gifCode} size={52} />
                </div>
                <div className={styles.styleText}>
                  <h3>{t(s.titleKey)}</h3>
                  <p>{t(s.subKey)}</p>
                </div>
                <RadioCircle checked={selected} />
              </button>
            );
          })}
        </div>

        <div className={styles.spacer} />

        {/* F-9: 약관/개인정보처리방침 동의 — 체크 전에는 시작/건너뛰기 모두 막는다 */}
        <label className={styles.consentRow}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            {t('profileSetup.consentPrefix')}
            <Link to="/settings/terms" className={styles.consentLink}>{t('profileSetup.consentTermsLink')}</Link>
            {t('profileSetup.consentMid')}
            <Link to="/settings/privacy" className={styles.consentLink}>{t('profileSetup.consentPrivacyLink')}</Link>
            {t('profileSetup.consentSuffix')}
          </span>
        </label>
      </div>

      {/* Bottom CTA — gradient fade */}
      <div className={styles.bottomCta}>
        <Button onClick={handleSubmit} disabled={!isValid || saving || !agreed}>
          {t('profileSetup.startBtn')}
        </Button>
      </div>
    </div>
  );
}
