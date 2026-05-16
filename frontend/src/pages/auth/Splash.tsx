import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { StatusBar } from '@/components/layout/StatusBar';
import { useUserStore } from '@/store/useUserStore';
import { changeLang } from '@/lib/i18n';
import type { Language } from '@/api/types';
import { emojiUrl } from '@/lib/emoji';
import styles from './Splash.module.css';

const LANGS: { code: Language; flagCode: string; label: string }[] = [
  { code: 'vi', flagCode: '1f1fb-1f1f3', label: 'VI' },
  { code: 'en', flagCode: '1f1fa-1f1f8', label: 'EN' },
  { code: 'ko', flagCode: '1f1f0-1f1f7', label: 'KO' },
];

export default function Splash() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const [pickerOpen, setPickerOpen] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home', { replace: true });
    }
  }, [isAuthenticated, navigate]);

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
        <img
          src="https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&q=80"
          onError={(e) => {
            const t = e.currentTarget;
            t.onerror = null;
            t.src = 'https://picsum.photos/seed/saigon-night/800/1000';
          }}
          alt=""
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
          <img
            className={styles.langFlag}
            src={emojiUrl(current.flagCode)}
            alt={current.label}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <span className={styles.langLabel}>{current.label} ▾</span>
        </button>

        {pickerOpen && (
          <div className={styles.langDropdown}>
            {LANGS.map((l) => (
              <button
                key={l.code}
                className={`${styles.langOption} ${l.code === current.code ? styles.langOptionActive : ''}`}
                onClick={() => handleSelect(l.code)}
              >
                <img
                  className={styles.langFlag}
                  src={emojiUrl(l.flagCode)}
                  alt={l.label}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
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

      {/* Bottom sheet */}
      <div className={styles.sheet}>
        <Button onClick={() => navigate('/auth/phone?mode=register')}>{t('splash.startBtn')}</Button>
        <button
          className={styles.loginBtn}
          onClick={() => navigate('/auth/phone?mode=login')}
        >
          {t('splash.loginBtn')}
        </button>
      </div>
    </div>
  );
}
