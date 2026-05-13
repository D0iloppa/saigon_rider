import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { useUserStore } from '@/store/useUserStore';
import type { Language } from '@/api/types';
import styles from './Settings.module.css';

const LANGS: { key: Language; flag: string; title: string; sub: string }[] = [
  { key: 'ko', flag: '🇰🇷', title: '한국어', sub: 'Korean' },
  { key: 'vi', flag: '🇻🇳', title: 'Tiếng Việt', sub: 'Vietnamese' },
  { key: 'en', flag: '🇺🇸', title: 'English', sub: 'English' },
];

export default function LangSettings() {
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const setLanguage = useUserStore((s) => s.setLanguage);

  if (!user) return null;

  const handleSelect = (l: Language) => {
    setLanguage(l);
    setTimeout(() => navigate(-1), 200);
  };

  return (
    <>
      <TopBar title="언어" />
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
              <div
                className={`${styles.radio} ${
                  user.language === l.key ? styles.radioActive : ''
                }`}
              >
                {user.language === l.key && <span className={styles.radioDot} />}
              </div>
            </button>
          ))}
        </div>
        <p className={styles.caption}>변경 사항은 즉시 적용됩니다</p>
      </div>
    </>
  );
}
