import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { MOCK_BADGES } from '@/data/feed';
import { Button } from '@/components/ui/Button';
import { expToNextLevel } from '@/lib/rewards';
import { formatNumber } from '@/lib/format';
import type { Badge } from '@/api/types';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { Chip } from '@/components/ui/Chip';
import { apiUploadAvatar, apiUpdateNickname } from '@/api/profile';
import styles from './ProfileMain.module.css';

const RECENT_RIDES = [
  { id: 'r1', title: 'Bến Thành Loop', date: '2026.05.12', result: 'A' },
  { id: 'r2', title: 'Phú Nhuận Cafe Tour', date: '2026.05.11', result: 'B' },
  { id: 'r3', title: 'Thủ Đức Sprint', date: '2026.05.10', result: 'A' },
  { id: 'r4', title: 'Bùi Viện Night Sweep', date: '2026.05.09', result: 'B' },
];

export default function ProfileMain() {
  // ── hooks (must be before any early return) ──────────────
  const user = useUserStore((s) => s.user);
  const updateAvatar = useUserStore((s) => s.updateAvatar);
  const updateNickname = useUserStore((s) => s.updateNickname);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [tab, setTab] = useState<'history' | 'badges' | 'gear'>('history');
  const [activeBadge, setActiveBadge] = useState<Badge | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [nickModal, setNickModal] = useState(false);
  const [nickInput, setNickInput] = useState('');
  const [nickSaving, setNickSaving] = useState(false);
  const [nickError, setNickError] = useState('');

  // ── guard (TypeScript narrows user → User below this line) ──
  if (!user) return null;

  // user이 User로 narrowing된 이후 캡처 → async 클로저에서도 타입 안전
  const u = user;
  const { needed, progress } = expToNextLevel(u.levelExp, u.level);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError('');
    try {
      const result = await apiUploadAvatar(u.id, file);
      updateAvatar(result.user.avatar_url ?? '');
    } catch (err: any) {
      setAvatarError(err.message ?? t('profile.avatarError'));
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function openNickModal() {
    setNickInput(u.nickname ?? '');
    setNickError('');
    setNickModal(true);
  }

  async function handleNickSave() {
    const trimmed = nickInput.trim();
    if (!trimmed) return;
    setNickSaving(true);
    setNickError('');
    try {
      await apiUpdateNickname(u.id, trimmed);
      updateNickname(trimmed);
      setNickModal(false);
    } catch (err: any) {
      setNickError(err.message ?? t('profile.nicknameError'));
    } finally {
      setNickSaving(false);
    }
  }

  const TABS = [
    { key: 'history' as const, label: t('profile.tabHistory') },
    { key: 'badges'  as const, label: t('profile.tabBadges') },
    { key: 'gear'    as const, label: t('profile.tabGear') },
  ];

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.noise} />
        <button className={styles.settingsBtn} onClick={() => navigate('/settings')}>
          ⚙
        </button>

        {/* Avatar */}
        <div className={styles.avatarWrap}>
          <img
            src={u.avatarUrl}
            alt=""
            className={`${styles.avatar} ${avatarUploading ? styles.avatarLoading : ''}`}
          />
          <button
            className={styles.cameraBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            aria-label={t('profile.editAvatar')}
          >
            {avatarUploading ? '⏳' : '📷'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
          <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)' }}>
            <LevelBadge level={u.level} />
          </div>
        </div>

        {avatarError && <p className={styles.avatarErrorMsg}>{avatarError}</p>}

        {/* Nickname */}
        <div className={styles.nickRow}>
          <h1 className={styles.nick}>{u.nickname}</h1>
          <button className={styles.editNickBtn} onClick={openNickModal} aria-label={t('profile.editNickname')}>
            ✏️
          </button>
        </div>

        <div style={{ margin: '8px auto 24px', display: 'flex', justifyContent: 'center' }}>
          <Chip variant="surface">
            🌙{' '}
            {u.riderStyle === 'commuter'
              ? t('profileSetup.styleCommuterTitle')
              : u.riderStyle === 'cafe_hunter'
              ? t('profileSetup.styleCafeHunterTitle')
              : t('profileSetup.styleNightRiderTitle')}
          </Chip>
        </div>

        <div className={styles.levelRow}>
          <span className={styles.levelText}>LV.{u.level}</span>
          <span className={styles.levelTextRight}>
            {t('profile.expToNextLevel', { exp: formatNumber(needed), level: u.level + 1 })}
          </span>
        </div>
        <div className={styles.levelBar}>
          <div className={styles.levelBarFill} style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {/* Sheet */}
      <div className={styles.sheet}>
        <div className={styles.currencyBento}>
          <div className={styles.currencyCell} style={{ borderColor: 'var(--xp)' }}>
            <span style={{ fontSize: 28 }}>💎</span>
            <div className={styles.currencyNum}>{formatNumber(u.xpPoints)}</div>
            <div className={styles.currencyLabel}>{t('ride.xpPointsLabel')}</div>
          </div>
          <div className={styles.currencyCell} style={{ borderColor: 'var(--gold)' }}>
            <span style={{ fontSize: 28 }}>🪙</span>
            <div className={styles.currencyNum}>{formatNumber(u.gold)}</div>
            <div className={styles.currencyLabel}>{t('profile.gold')}</div>
          </div>
          <div className={styles.currencyCell} style={{ borderColor: 'var(--brand-500)' }}>
            <span style={{ fontSize: 28 }}>⭐</span>
            <div className={styles.currencyNum}>{u.skillPoints}</div>
            <div className={styles.currencyLabel}>{t('profile.skillPt')}</div>
          </div>
        </div>

        <div className={styles.statsCard}>
          <h3 className={styles.cardTitle}>{t('profile.thisMonth')}</h3>
          <div className={styles.statsRow}>
            <div>
              <div className={styles.statBig}>248</div>
              <div className={styles.statSmall}>km</div>
            </div>
            <div>
              <div className={styles.statBig}>18</div>
              <div className={styles.statSmall}>{t('tabbar.quests')}</div>
            </div>
            <div>
              <div className={styles.statBig}>A-</div>
              <div className={styles.statSmall}>{t('ride.safety')}</div>
            </div>
          </div>
          <svg viewBox="0 0 280 60" className={styles.chart}>
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--neon-cyan)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--neon-cyan)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M 0 40 Q 35 30 70 32 T 140 28 T 210 24 T 280 18 L 280 60 L 0 60 Z" fill="url(#chartGrad)" />
            <path d="M 0 40 Q 35 30 70 32 T 140 28 T 210 24 T 280 18" stroke="var(--neon-cyan)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <circle cx="280" cy="18" r="4" fill="var(--neon-cyan)" />
            <circle cx="280" cy="18" r="8" fill="var(--neon-cyan)" opacity="0.3" />
          </svg>
        </div>

        <div className={styles.tabRow}>
          {TABS.map((tb) => (
            <button key={tb.key} className={`${styles.tab} ${tab === tb.key ? styles.tabActive : ''}`} onClick={() => setTab(tb.key)}>
              {tb.label}
            </button>
          ))}
        </div>

        {tab === 'history' && (
          <div className={styles.list}>
            {RECENT_RIDES.map((r) => (
              <div key={r.id} className={styles.historyRow}>
                <div className={styles.historyThumb}>🏍</div>
                <div className={styles.historyText}>
                  <div className={styles.historyTitle}>{r.title}</div>
                  <div className={styles.historyDate}>{r.date}</div>
                </div>
                <div className={`${styles.gradeChip} ${r.result === 'A' ? styles.gradeA : styles.gradeB}`}>
                  {r.result}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'badges' && (
          <div className={styles.badgeGrid}>
            {MOCK_BADGES.map((b) => (
              <button key={b.key} className={`${styles.badgeCell} ${!b.earned ? styles.badgeLocked : ''}`} onClick={() => setActiveBadge(b)}>
                <div className={styles.badgeIcon}>{b.iconEmoji}</div>
                <div className={styles.badgeName}>{b.name}</div>
              </button>
            ))}
          </div>
        )}

        {tab === 'gear' && (
          <div className={styles.emptyTab}>
            <span style={{ fontSize: 48 }}>🛡</span>
            <p>{t('profile.noGear')}</p>
          </div>
        )}
      </div>

      {/* Badge detail modal */}
      {activeBadge && (
        <div className={styles.modalBackdrop} onClick={() => setActiveBadge(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHero}>
              <div className={styles.modalBadgeIcon}>{activeBadge.iconEmoji}</div>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalKey}>{activeBadge.name}</div>
              <h2 className={styles.modalDesc}>{activeBadge.description}</h2>
              <div className={styles.modalCondition}>
                <span>{activeBadge.earned ? '✓' : '○'}</span>
                {activeBadge.condition}
              </div>
              {activeBadge.earnedAt && (
                <p className={styles.modalDate}>
                  {t('profile.earnedAt', { date: new Date(activeBadge.earnedAt).toLocaleDateString() })}
                </p>
              )}
              <div className={styles.modalActions}>
                <Button variant="ghost" onClick={() => setActiveBadge(null)}>{t('common.close')}</Button>
                {activeBadge.earned && <Button>{t('common.share')}</Button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nickname edit modal */}
      {nickModal && (
        <div className={styles.modalBackdrop} onClick={() => setNickModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalBody}>
              <div className={styles.modalKey}>{t('profile.editNickname')}</div>
              <input
                className={styles.nickInput}
                value={nickInput}
                onChange={(e) => setNickInput(e.target.value)}
                maxLength={30}
                placeholder={t('profile.nicknamePlaceholder')}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleNickSave()}
              />
              {nickError && <p className={styles.nickErrorMsg}>{nickError}</p>}
              <div className={styles.modalActions}>
                <Button variant="ghost" onClick={() => setNickModal(false)} disabled={nickSaving}>
                  {t('common.close')}
                </Button>
                <Button onClick={handleNickSave} disabled={nickSaving || !nickInput.trim()}>
                  {nickSaving ? t('profile.saving') : t('profile.saveBtn')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
