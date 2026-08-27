import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { isWalkieTalkieOptedOut, setWalkieTalkieOptOut } from '@/lib/walkieTalkieConsent';
import styles from './Settings.module.css';

type NotiField = keyof NotificationSettingsFields;
type VisibleField = 'social' | 'chat' | 'keyword_alert';

const SECTIONS: { titleKey: string; items: VisibleField[]; captionKey?: string }[] = [
  {
    titleKey: 'settings.notiSectionSocial',
    items: ['social'],
  },
  {
    titleKey: 'settings.notiSectionChat',
    items: ['chat'],
  },
  {
    titleKey: 'settings.notiSectionKeyword',
    items: ['keyword_alert'],
    captionKey: 'settings.notiKeywordCaption',
  },
];

const LABEL_KEYS: Record<VisibleField, string> = {
  social: 'settings.notiItemSocial',
  chat: 'settings.notiItemChat',
  keyword_alert: 'settings.notiKeywordMaster',
};

const DEFAULT_STATE: NotificationSettingsFields = {
  quest_recommend: true,
  quest_expire: true,
  event: true,
  ride_result: true,
  social: true,
  keyword_alert: true,
  chat: true,
};

export default function NotiSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useUserStore((s) => s.user?.id);
  const [state, setState] = useState<NotificationSettingsFields>(DEFAULT_STATE);
  // 워키토키(음성메시지) 옵트아웃 — A-9. 녹음 기능(A-4~A-7) 자체가 아직 없어 서버 필드가
  // 없다. 기능이 붙기 전까지는 로컬(localStorage)에만 저장한다.
  const [walkieOptOut, setWalkieOptOutState] = useState(() => isWalkieTalkieOptedOut());

  // 토글은 "사용" 여부로 보여준다 — 사용자에게는 옵트아웃보다 자연스러운 프레이밍.
  const handleWalkieEnabledToggle = (enabled: boolean) => {
    setWalkieOptOutState(!enabled);
    setWalkieTalkieOptOut(!enabled);
  };

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
          keyword_alert: res.keyword_alert,
          chat: res.chat,
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
            {/* D-1(2026-08-17): 종전엔 탭 불가한 안내 텍스트였다 — 전용 페이지(D-4)로
                가는 링크로 격상한다. */}
            {s.captionKey === 'settings.notiKeywordCaption' ? (
              <button type="button" className={styles.captionLink} onClick={() => navigate('/market/keyword-alerts')}>
                {t(s.captionKey)}
              </button>
            ) : s.captionKey ? (
              <p className={styles.caption}>{t(s.captionKey)}</p>
            ) : null}
          </div>
        ))}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('settings.notiSectionWalkie')}</h3>
          <div className={styles.sectionCard}>
            <SettingsRow
              label={t('settings.walkieTalkieEnabled')}
              right={
                <Toggle
                  checked={!walkieOptOut}
                  onChange={handleWalkieEnabledToggle}
                />
              }
            />
          </div>
          <p className={styles.caption}>{t('settings.walkieTalkieOptOutCaption')}</p>
        </div>
        <p className={styles.caption}>{t('settings.notiImportantNote')}</p>
      </div>
    </>
  );
}
