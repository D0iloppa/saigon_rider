import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Toggle } from '@/components/ui/Toggle';
import { SettingsRow } from '@/components/ui/SettingsRow';
import styles from './Settings.module.css';

type NotiKey =
  | 'notiItemRecommended'
  | 'notiItemExpiring'
  | 'notiItemEventStart'
  | 'notiItemQuestDone'
  | 'notiItemLevelUp'
  | 'notiItemBadge'
  | 'notiItemCheer'
  | 'notiItemComment'
  | 'notiItemFriendReq';

const SECTIONS: { titleKey: string; items: NotiKey[] }[] = [
  {
    titleKey: 'settings.notiSectionQuest',
    items: ['notiItemRecommended', 'notiItemExpiring', 'notiItemEventStart'],
  },
  {
    titleKey: 'settings.notiSectionResult',
    items: ['notiItemQuestDone', 'notiItemLevelUp', 'notiItemBadge'],
  },
  {
    titleKey: 'settings.notiSectionSocial',
    items: ['notiItemCheer', 'notiItemComment', 'notiItemFriendReq'],
  },
];

const DEFAULT_STATE: Record<NotiKey, boolean> = {
  notiItemRecommended: true,
  notiItemExpiring: true,
  notiItemEventStart: false,
  notiItemQuestDone: true,
  notiItemLevelUp: true,
  notiItemBadge: true,
  notiItemCheer: true,
  notiItemComment: true,
  notiItemFriendReq: false,
};

export default function NotiSettings() {
  const { t } = useTranslation();
  const [state, setState] = useState<Record<NotiKey, boolean>>(DEFAULT_STATE);

  return (
    <>
      <TopBar title={t('settings.notiSettings')} />
      <div className={styles.body}>
        {SECTIONS.map((s) => (
          <div key={s.titleKey} className={styles.section}>
            <h3 className={styles.sectionTitle}>{t(s.titleKey)}</h3>
            <div className={styles.sectionCard}>
              {s.items.map((key) => (
                <SettingsRow
                  key={key}
                  label={t(`settings.${key}`)}
                  right={
                    <Toggle
                      checked={state[key]}
                      onChange={(v) => setState((p) => ({ ...p, [key]: v }))}
                    />
                  }
                />
              ))}
            </div>
          </div>
        ))}
        <p className={styles.caption}>{t('settings.notiImportantNote')}</p>
      </div>
    </>
  );
}
