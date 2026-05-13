import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';
import { MOCK_BADGES } from '@/data/feed';
import { Button } from '@/components/ui/Button';
import { expToNextLevel } from '@/lib/rewards';
import { formatNumber } from '@/lib/format';
import type { Badge } from '@/api/types';
import styles from './ProfileMain.module.css';

const TABS = [
  { key: 'history', label: '기록' },
  { key: 'badges', label: '배지' },
  { key: 'gear', label: '장비' },
] as const;

const RECENT_RIDES = [
  { id: 'r1', title: 'Bến Thành Loop', date: '2026.05.12', result: 'A' },
  { id: 'r2', title: 'Phú Nhuận 카페 투어', date: '2026.05.11', result: 'B' },
  { id: 'r3', title: 'Thủ Đức 스프린트', date: '2026.05.10', result: 'A' },
  { id: 'r4', title: 'Bùi Viện Night Sweep', date: '2026.05.09', result: 'B' },
];

export default function ProfileMain() {
  const user = useUserStore((s) => s.user);
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('history');
  const [activeBadge, setActiveBadge] = useState<Badge | null>(null);

  if (!user) return null;
  const { needed, progress } = expToNextLevel(user.levelExp, user.level);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.noise} />
        <button
          className={styles.settingsBtn}
          onClick={() => navigate('/settings')}
        >
          ⚙
        </button>
        <div className={styles.avatarWrap}>
          <img src={user.avatarUrl} alt="" className={styles.avatar} />
          <div className={styles.levelBadge}>{user.level}</div>
        </div>
        <h1 className={styles.nick}>{user.nickname}</h1>
        <div className={styles.styleChip}>
          🌙{' '}
          {user.riderStyle === 'commuter'
            ? 'Commuter'
            : user.riderStyle === 'cafe_hunter'
            ? 'Café Hunter'
            : 'Night Rider'}
        </div>

        <div className={styles.levelRow}>
          <span className={styles.levelText}>LV.{user.level}</span>
          <span className={styles.levelTextRight}>
            {formatNumber(needed)} EXP TO LV.{user.level + 1}
          </span>
        </div>
        <div className={styles.levelBar}>
          <div className={styles.levelBarFill} style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {/* Sheet */}
      <div className={styles.sheet}>
        {/* Currency Bento */}
        <div className={styles.currencyBento}>
          <div className={styles.currencyCell} style={{ borderColor: 'var(--xp)' }}>
            <span style={{ fontSize: 28 }}>💎</span>
            <div className={styles.currencyNum}>{formatNumber(user.xpPoints)}</div>
            <div className={styles.currencyLabel}>XP Points</div>
          </div>
          <div className={styles.currencyCell} style={{ borderColor: 'var(--gold)' }}>
            <span style={{ fontSize: 28 }}>🪙</span>
            <div className={styles.currencyNum}>{formatNumber(user.gold)}</div>
            <div className={styles.currencyLabel}>Gold</div>
          </div>
          <div className={styles.currencyCell} style={{ borderColor: 'var(--brand-500)' }}>
            <span style={{ fontSize: 28 }}>⭐</span>
            <div className={styles.currencyNum}>{user.skillPoints}</div>
            <div className={styles.currencyLabel}>Skill Pt</div>
          </div>
        </div>

        {/* Monthly stats */}
        <div className={styles.statsCard}>
          <h3 className={styles.cardTitle}>이번 달</h3>
          <div className={styles.statsRow}>
            <div>
              <div className={styles.statBig}>248</div>
              <div className={styles.statSmall}>km</div>
            </div>
            <div>
              <div className={styles.statBig}>18</div>
              <div className={styles.statSmall}>퀘스트</div>
            </div>
            <div>
              <div className={styles.statBig}>A-</div>
              <div className={styles.statSmall}>안전</div>
            </div>
          </div>
          <svg viewBox="0 0 280 60" className={styles.chart}>
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--neon-cyan)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--neon-cyan)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M 0 40 Q 35 30 70 32 T 140 28 T 210 24 T 280 18 L 280 60 L 0 60 Z"
              fill="url(#chartGrad)"
            />
            <path
              d="M 0 40 Q 35 30 70 32 T 140 28 T 210 24 T 280 18"
              stroke="var(--neon-cyan)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="280" cy="18" r="4" fill="var(--neon-cyan)" />
            <circle cx="280" cy="18" r="8" fill="var(--neon-cyan)" opacity="0.3" />
          </svg>
        </div>

        {/* Tabs */}
        <div className={styles.tabRow}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
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
                <div
                  className={`${styles.gradeChip} ${
                    r.result === 'A' ? styles.gradeA : styles.gradeB
                  }`}
                >
                  {r.result}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'badges' && (
          <div className={styles.badgeGrid}>
            {MOCK_BADGES.map((b) => (
              <button
                key={b.key}
                className={`${styles.badgeCell} ${!b.earned ? styles.badgeLocked : ''}`}
                onClick={() => setActiveBadge(b)}
              >
                <div className={styles.badgeIcon}>{b.iconEmoji}</div>
                <div className={styles.badgeName}>{b.name}</div>
              </button>
            ))}
          </div>
        )}

        {tab === 'gear' && (
          <div className={styles.emptyTab}>
            <span style={{ fontSize: 48 }}>🛡</span>
            <p>장착할 수 있는 장비가 없어요</p>
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
                  획득: {new Date(activeBadge.earnedAt).toLocaleDateString('ko-KR')}
                </p>
              )}
              <div className={styles.modalActions}>
                <Button variant="ghost" onClick={() => setActiveBadge(null)}>
                  닫기
                </Button>
                {activeBadge.earned && <Button>공유</Button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
