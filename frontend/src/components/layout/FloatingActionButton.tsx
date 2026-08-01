import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emojiUrl } from '@/lib/emoji';
import { GameHubSheet } from '@/components/game/GameHubSheet';
import styles from './FloatingActionButton.module.css';

export function FloatingActionButton() {
  const [hubOpen, setHubOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <button
        className={styles.fab}
        onClick={() => setHubOpen(true)}
        aria-label={t('tabbar.startRide')}
      >
        <img
          className={styles.fabIcon}
          src={emojiUrl('1f3cd')}
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </button>
      <GameHubSheet open={hubOpen} onClose={() => setHubOpen(false)} />
    </>
  );
}
