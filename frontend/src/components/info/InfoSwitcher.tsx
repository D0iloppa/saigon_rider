import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './InfoSwitcher.module.css';

export type InfoPageKey = 'weather' | 'flood' | 'gas' | 'repair';

const ITEMS: { key: InfoPageKey; path: string; icon: string; titleKey: string }[] = [
  { key: 'weather', path: '/info/weather', icon: '🌡', titleKey: 'info.weather.title' },
  { key: 'flood', path: '/info/flood', icon: '🌊', titleKey: 'info.flood.title' },
  { key: 'gas', path: '/info/gas', icon: '⛽', titleKey: 'info.gas.title' },
  { key: 'repair', path: '/info/repair', icon: '🔧', titleKey: 'info.repair.title' },
];

/** info 4모듈(날씨·침수·주유·정비) 간 전환 메뉴. 현재 ?lat&lng 쿼리를 유지해 맥락 보존. */
export default function InfoSwitcher({ current }: { current: InfoPageKey }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={styles.iconBtn} onClick={() => setOpen(true)} aria-label={t('info.switchTitle', '다른 정보 보기')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      {open && (
        <div className={styles.backdrop} onClick={() => setOpen(false)}>
          <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
            <div className={styles.menuHeader}>{t('info.switchTitle', '다른 정보 보기')}</div>
            {ITEMS.map((it) => {
              const active = it.key === current;
              return (
                <button
                  key={it.key}
                  className={`${styles.item} ${active ? styles.itemActive : ''}`}
                  onClick={() => {
                    setOpen(false);
                    if (!active) navigate(`${it.path}${search}`);
                  }}
                >
                  <span className={styles.itemIcon}>{it.icon}</span>
                  <span>{t(it.titleKey)}</span>
                  {active && <span className={styles.check}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
