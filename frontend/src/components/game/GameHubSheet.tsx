import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CurrencyHUD } from '@/components/ui/CurrencyHUD';
import { fetchWallet } from '@/api/wallet';
import { useDialogStore } from '@/store/useDialogStore';
import { emojiUrl } from '@/lib/emoji';
import styles from './GameHubSheet.module.css';

interface GameHubSheetProps {
  open: boolean;
  onClose: () => void;
}

const HUBS = [
  { path: '/garage',    emoji: '1f3cd', label: 'gameHub.garage' },
  { path: '/inventory', emoji: '1f4e6', label: 'gameHub.inventory' },
  { path: '/shop',      emoji: '1f6d2', label: 'gameHub.shop' },
  { path: '/gacha',     emoji: '1f48e', label: 'gameHub.gacha' },
  { path: '/season',    emoji: '2b50',  label: 'gameHub.season', comingSoon: true },
  { path: '/info',      emoji: '1f4cd', label: 'gameHub.info' },
] as const;

export function GameHubSheet({ open, onClose }: GameHubSheetProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [gold, setGold] = useState(0);
  const [xp, setXp] = useState(0);

  useEffect(() => {
    if (!open) return;
    fetchWallet().then((w) => {
      setGold(w.gold_balance);
      setXp(w.xp_balance);
    }).catch(() => {});
  }, [open]);

  const go = (hub: (typeof HUBS)[number]) => {
    if ('comingSoon' in hub && hub.comingSoon) {
      onClose();
      useDialogStore.getState().open({
        message: { mode: 'code', value: 'gameHub.comingSoon' },
      });
      return;
    }
    onClose();
    navigate(hub.path);
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.header}>
        <CurrencyHUD gold={gold} xp={xp} className={styles.hud} />
      </div>

      <div className={styles.grid}>
        {HUBS.map((hub) => (
          <button
            key={hub.path + hub.emoji}
            className={styles.cell}
            onClick={() => go(hub)}
          >
            <div className={styles.iconWrap}>
              <img
                src={emojiUrl(hub.emoji)}
                width={36}
                height={36}
                alt=""
                className={styles.emoji}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <span className={styles.label}>{t(hub.label)}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
