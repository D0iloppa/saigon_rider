import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { StatusBar } from '@/components/layout/StatusBar';
import { RadioCircle } from '@/components/ui/RadioCircle';
import { emojiUrl } from '@/lib/emoji';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import { apiSaveProfileSetup, fetchRandomNickname } from '@/api/profile';
import type { RiderStyle } from '@/api/types';
import styles from './ProfileSetup.module.css';

const STYLES: { key: RiderStyle; gifCode: string; titleKey: string; subKey: string }[] = [
  { key: 'commuter',    gifCode: '1f3cd', titleKey: 'profileSetup.styleCommuterTitle',    subKey: 'profileSetup.styleCommuterSub' },
  { key: 'cafe_hunter', gifCode: '2615',  titleKey: 'profileSetup.styleCafeHunterTitle',   subKey: 'profileSetup.styleCafeHunterSub' },
  { key: 'night_rider', gifCode: '1f31f', titleKey: 'profileSetup.styleNightRiderTitle', subKey: 'profileSetup.styleNightRiderSub' },
];

function GifIcon({ code, size = 56 }: { code: string; size?: number }) {
  return (
    <img
      src={emojiUrl(code)}
      width={size}
      height={size}
      alt=""
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const setProfile = useUserStore((s) => s.setProfile);
  const { t } = useTranslation();

  const [nickname, setNickname] = useState('');
  const [style, setStyle] = useState<RiderStyle | null>('night_rider');
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const isValid = nickname.length >= 2 && nickname.length <= 12 && style;

  const handleSkip = async () => {
    if (!user?.id || skipping) return;
    setSkipping(true);
    try {
      // 가입 시 이미 랜덤 닉네임이 부여됨 → 건너뛰기는 현재(랜덤) 닉네임 유지.
      // 혹시 비어 있으면(구버전 계정) 그때만 새로 발급.
      const keepNick = user.nickname || (await fetchRandomNickname());
      const saved = await apiSaveProfileSetup(user.id, keepNick, null);
      const rtCode: RiderStyle = (typeof saved.rider_type === 'object' && saved.rider_type !== null
        ? (saved.rider_type.code?.toLowerCase() ?? 'commuter')
        : typeof saved.rider_type === 'string' ? saved.rider_type.toLowerCase() : 'commuter') as RiderStyle;
      setProfile(saved.nickname ?? keepNick, rtCode);
      navigate('/home');
    } catch {
      navigate('/home');
    } finally {
      setSkipping(false);
    }
  };

  const handleSubmit = async () => {
    if (nickname.length < 2) {
      toast.error(t('profileSetup.errorNicknameTooShort'));
      return;
    }
    if (!style) {
      toast.error(t('profileSetup.errorNoStyle'));
      return;
    }

    if (!user?.id) {
      toast.error(t('common.errorUnexpected'));
      return;
    }

    setSaving(true);
    try {
      await apiSaveProfileSetup(user.id, nickname, style);
      setProfile(nickname, style);
      navigate('/home');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorUnexpected'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.root}>
      <StatusBar />
      {/* Nav row: dot indicator + skip */}
      <div className={styles.navRow}>
        <div className={styles.dots}>
          <span className={`${styles.dot} ${styles.dotActive}`} />
          <span className={`${styles.dot} ${styles.dotActive}`} />
          <span className={styles.dot} />
        </div>
        <button className={styles.skipBtn} onClick={handleSkip} disabled={skipping}>
          {t('profileSetup.skip')}
        </button>
      </div>

      <div className={styles.body}>
        <h1 className={styles.title}>
          {t('profileSetup.titleLine1')}
          <br />
          {t('profileSetup.titleLine2')}
        </h1>

        {/* Nickname */}
        <div className={styles.nickField}>
          <GifIcon code="1f3cd" size={28} />
          <input
            placeholder={t('profileSetup.nicknamePlaceholder')}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
          />
          {nickname.length >= 2 && <GifIcon code="2705" size={24} />}
        </div>

        {/* Rider style cards */}
        <div className={styles.styleList}>
          {STYLES.map((s) => {
            const selected = style === s.key;
            return (
              <button
                key={s.key}
                className={`${styles.styleCard} ${selected ? styles.selected : ''}`}
                onClick={() => setStyle(s.key)}
              >
                {selected && <div className={styles.selectedOverlay} />}
                <div className={styles.styleIcon}>
                  <GifIcon code={s.gifCode} size={52} />
                </div>
                <div className={styles.styleText}>
                  <h3>{t(s.titleKey)}</h3>
                  <p>{t(s.subKey)}</p>
                </div>
                <RadioCircle checked={selected} />
              </button>
            );
          })}
        </div>

        <div className={styles.spacer} />
      </div>

      {/* Bottom CTA — gradient fade */}
      <div className={styles.bottomCta}>
        <Button onClick={handleSubmit} disabled={!isValid || saving}>
          {t('profileSetup.startBtn')}
        </Button>
      </div>
    </div>
  );
}
