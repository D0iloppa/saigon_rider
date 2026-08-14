import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBar } from '@/components/layout/StatusBar';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import { changeLang } from '@/lib/i18n';
import type { Language } from '@/api/types';
import { consumeReturnTo, saveReturnTo } from '@/lib/returnTo';
import styles from './Splash.module.css';

// 국기는 flag-icons 스프라이트(fi) 사용 — 이모지 국기는 단말별 렌더 편차가 큼 (PhoneVerify/LangSettings 와 동일 관례)
const LANGS: { code: Language; flagCode: string; label: string }[] = [
  { code: 'vi', flagCode: 'vn', label: 'VI' },
  { code: 'en', flagCode: 'us', label: 'EN' },
  { code: 'ko', flagCode: 'kr', label: 'KO' },
];

export default function Splash() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const [pickerOpen, setPickerOpen] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);

  // PrivateRoute 가 넘긴 원래 목적지(state.from)를 세션에 보관 — OAuth 이탈 후에도 살아남는다. (P0-2)
  useEffect(() => {
    const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    if (from?.pathname) saveReturnTo(from.pathname + (from.search ?? ''));
  }, [location.state]);

  useEffect(() => {
    if (isAuthenticated) {
      // **로그인 사용자 = 홈 / 비로그인 둘러보기 = 마켓** (대표 결정 2026-08-13).
      // 홈에 유가·날씨·침수·주유소·정비소 진입점이 걸려 있어 로그인 사용자에게는 홈이 맞고,
      // 마켓 우선은 아직 로그인하지 않은 사람에게 가치를 먼저 보여주는 목적이었다 — 두 목적을
      // 사용자 상태로 분리했다. 게스트 CTA 는 아래 splash.startBtn(→ /market).
      //
      // ⚠️ 로그인 후 목적지는 이 파일 말고도 OAuthLogin·OAuthResult·ProfileSetup 에 있다(총 8곳).
      // 한 곳만 바꾸면 경로별로 갈린다 — 계약 테스트 `pages/market/marketFirstValue.contract.test.mjs`
      // 가 4파일 전부를 검사한다.
      navigate(consumeReturnTo() ?? '/home', { replace: true });
      return;
    }
    if (sessionStorage.getItem('session_expired')) {
      sessionStorage.removeItem('session_expired');
      toast.error(t('common.sessionExpired'));
    }
  }, [isAuthenticated, navigate, t]);

  // 현재 언어에 맞는 항목 (없으면 vi 기본)
  const current = LANGS.find((l) => l.code === i18n.language) ?? LANGS[0];

  const handleSelect = (lang: Language) => {
    changeLang(lang);
    setPickerOpen(false);
  };

  // 칩 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  return (
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.noise} />

      {/* Photo hero */}
      <div className={styles.photoHero}>
        <video
          src="/assets/videos/saigon-hero.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
        <div className={styles.heroOverlay} />
      </div>

      <StatusBar variant="light" />

      {/* Language Selector */}
      <div ref={chipRef} className={styles.langPickerWrap}>
        <button
          className={styles.langChip}
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Select language"
        >
          <span className={`fi fi-${current.flagCode} ${styles.langFlag}`} />
          <span className={styles.langLabel}>{current.label} <ChevronDown size={12} /></span>
        </button>

        {pickerOpen && (
          <div className={styles.langDropdown}>
            {LANGS.map((l) => (
              <button
                key={l.code}
                className={`${styles.langOption} ${l.code === current.code ? styles.langOptionActive : ''}`}
                onClick={() => handleSelect(l.code)}
              >
                <span className={`fi fi-${l.flagCode} ${styles.langFlag}`} />
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Central wordmark */}
      <div className={styles.wordmark}>
        <p className={styles.wordmarkTag}>{t('splash.subtitle')}</p>
        <div className={styles.wordmarkTitle}>SAIGON<br />RIDER</div>
      </div>

      {/* Bottom sheet — 다크 스플래시 배경 전용 유리 표면 (공용 glass-surface 는 라이트 테마용이라 회색으로 보임) */}
      <div className={styles.sheet}>
        <div className={styles.sheetInner}>
          <Button onClick={() => navigate('/market')}>{t('splash.startBtn')}</Button>
        </div>
      </div>
    </div>
  );
}
