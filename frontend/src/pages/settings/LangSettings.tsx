import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { RadioCircle } from '@/components/ui/RadioCircle';
import { useUserStore } from '@/store/useUserStore';
import type { Language } from '@/api/types';
import styles from './Settings.module.css';
import { changeLang } from '@/lib/i18n';

const LANGS: { key: Language; flag: string; title: string; sub: string }[] = [
  { key: 'vi', flag: '🇻🇳', title: 'Tiếng Việt', sub: 'Vietnamese' },
  { key: 'en', flag: '🇺🇸', title: 'English', sub: 'English' },
  { key: 'ko', flag: '🇰🇷', title: '한국어', sub: 'Korean' },
];

export default function LangSettings() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const setLanguage = useUserStore((s) => s.setLanguage);

  if (!user) return null;

  const handleSelect = (l: Language) => {
    setLanguage(l);
    setTimeout(() => navigate(-1), 200);
  };

  return (
    <>
      <TopBar title={t('settings.language')} />
      <div className={styles.body}>
        <div className={styles.sectionCard}>
          {LANGS.map((l) => (
            <button
              key={l.key}
              className={styles.langItem}
              onClick={() => handleSelect(l.key)}
            >
              <span className={styles.langFlag}>{l.flag}</span>
              <div className={styles.langText}>
                <div className={styles.langTitle}>{l.title}</div>
                <div className={styles.langSub}>{l.sub}</div>
              </div>
              <RadioCircle checked={user.language === l.key} />
            </button>
          ))}
        </div>
        <p className={styles.caption}>{t('settings.langCaption')}</p>
      </div>
    </>
  );
}
