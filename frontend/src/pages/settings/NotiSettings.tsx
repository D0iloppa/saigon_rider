import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Toggle } from '@/components/ui/Toggle';
import { SettingsRow } from '@/components/ui/SettingsRow';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import {
  fetchNotificationSettings,
  updateNotificationSettings,
  type NotificationSettingsFields,
} from '@/api/notifications';
import styles from './Settings.module.css';

type NotiField = keyof NotificationSettingsFields;

const SECTIONS: { titleKey: string; items: NotiField[] }[] = [
  {
    titleKey: 'settings.notiSectionQuest',
    items: ['quest_recommend', 'quest_expire', 'event'],
  },
  {
    titleKey: 'settings.notiSectionResult',
    items: ['ride_result'],
  },
  {
    titleKey: 'settings.notiSectionSocial',
    items: ['social'],
  },
];

const LABEL_KEYS: Record<NotiField, string> = {
  quest_recommend: 'settings.notiItemRecommended',
  quest_expire: 'settings.notiItemExpiring',
  event: 'settings.notiItemEventStart',
  ride_result: 'settings.notiItemQuestDone',
  social: 'settings.notiItemSocial',
};

const DEFAULT_STATE: NotificationSettingsFields = {
  quest_recommend: true,
  quest_expire: true,
  event: true,
  ride_result: true,
  social: true,
};

export default function NotiSettings() {
  const { t } = useTranslation();
  const userId = useUserStore((s) => s.user?.id);
  const [state, setState] = useState<NotificationSettingsFields>(DEFAULT_STATE);

  useEffect(() => {
    if (!userId) return;
    fetchNotificationSettings(userId)
      .then((res) =>
        setState({
          quest_recommend: res.quest_recommend,
          quest_expire: res.quest_expire,
          event: res.event,
          ride_result: res.ride_result,
          social: res.social,
        }),
      )
      .catch(() => toast.error(t('settings.notiLoadError', { defaultValue: '알림 설정을 불러오지 못했습니다' })));
  }, [userId]);

  const handleToggle = async (key: NotiField, value: boolean) => {
    if (!userId) return;
    const prev = state;
    const next = { ...state, [key]: value };
    setState(next);
    try {
      await updateNotificationSettings(userId, next);
    } catch {
      setState(prev);
      toast.error(t('settings.notiSaveError', { defaultValue: '알림 설정을 저장하지 못했습니다' }));
    }
  };

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
                  label={t(LABEL_KEYS[key])}
                  right={
                    <Toggle
                      checked={state[key]}
                      onChange={(v) => handleToggle(key, v)}
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
