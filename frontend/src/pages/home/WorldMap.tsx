import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { fetchRecommendedQuests } from '@/api/quests';
import { expToNextLevel } from '@/lib/rewards';
import { formatNumber } from '@/lib/format';
import type { Quest } from '@/api/types';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MapPin } from '@/components/ui/MapPin';
import { Chip } from '@/components/ui/Chip';
import { emojiUrl } from '@/lib/emoji';
import { AppImage } from '@/components/ui/AppImage';
import styles from './WorldMap.module.css';

function GifIcon({ code, size = 32, className = '' }: { code: string; size?: number; className?: string }) {
  return (
    <img
      className={className}
      src={emojiUrl(code)}
      width={size} height={size} alt=""
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

const CURRENCY_CARDS = [
  { icon: '1f48e', color: 'var(--xp)',       numColor: 'var(--xp)',    label: 'XP',      key: 'xpPoints'    },
  { icon: '1fa99', color: 'var(--gold)',      numColor: '#A07010',      label: 'GOLD',    key: 'gold'        },
  { icon: '2b50',  color: 'var(--brand-500)', numColor: 'var(--gold)',  label: 'SKILL PT', key: 'skillPoints' },
] as const;

export default function WorldMap() {
  const user = useUserStore((s) => s.user);
  const refreshUser = useUserStore((s) => s.refreshUser);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [recommendedList, setRecommendedList] = useState<Quest[]>([]);
  const [recIdx, setRecIdx] = useState(0);
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left');
  const [loading, setLoading] = useState(true);
  const didInit = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    refreshUser();
    const uid = useUserStore.getState().user?.id;
    if (uid) {
      fetchRecommendedQuests(uid).then((list) => {
        setRecommendedList(list);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  if (!user) return null;
  const { needed, progress } = expToNextLevel(user.levelExp, user.level);

  return (
    <div className={styles.root}>
      {/* <AlertDialog
        open={debugConfirm}
        title={{ mode: 'html', value: `<b>[DEBUG]</b><p>${NATIVE_KEYS.GET_LOCATION}</p>` }}
        message="네이티브 브릿지를 호출합니다"
        onClose={() => setDebugConfirm(false)}
        onConfirm={() => {
          setDebugConfirm(false);
          nativeInterface
            .request(NATIVE_KEYS.GET_LOCATION, { mode: 1 })
            .then((raw) => setLocationMsg(raw))
            .catch((err: Error) => setLocationMsg(`Error: ${err.message}`));
        }}
      />
      <AlertDialog
        open={locationMsg !== null}
        title={{ mode: 'html', value: `<b>[DEBUG]</b><p>${NATIVE_KEYS.GET_LOCATION} 응답</p>` }}
        pre={locationMsg ?? undefined}
        onClose={() => setLocationMsg(null)}
      /> */}
      {/* ── Header (grad-sunset + noise) ── */}
      <div className={styles.header}>
        <div className={styles.noise} />

        {/* User row */}
        <div className={styles.userRow}>
          <div className={styles.avatarWrap}>
            <AppImage src={user.avatarUrl} alt="" className={styles.avatar} variant="circle" />
          </div>
          <div>
            <div className={styles.nick}>{user.nickname}</div>
            <div className={`micro ${styles.levelMicro}`}>LV.{user.level}</div>
          </div>
        </div>

        {/* Header icons: bell + settings */}
        <div className={styles.headerIcons}>
          <div className={styles.bellWrap}>
            <GifIcon code="1f514" size={32} className={styles.gifIcon} />
            <span className={styles.notifDot} />
          </div>
          <button
            className={styles.iconGif}
            aria-label={t('common.settings')}
            onClick={() => navigate('/settings')}
          >
            <GifIcon code="2699" size={32} className={styles.gifIcon} />
          </button>
        </div>

        {/* Greeting + progress */}
        <div className={styles.greet}>
          {t('home.greet', { name: user.nickname.replace('@', '') })}
        </div>
        <div className={styles.progressLabel}>
          {t('home.progressLabel', { needed: formatNumber(needed), nextLevel: user.level + 1 })}
        </div>
        <div style={{ padding: '0 8px' }}>
          <ProgressBar progress={progress * 100} />
        </div>
      </div>

      {/* Scrollable content */}
      <div className={styles.scroll}>
        {/* ── Currency cards ── */}
        <div className={styles.currencyRow}>
          {CURRENCY_CARDS.map((c) => (
            <div key={c.key} className={styles.currencyCard} style={{ borderTop: `4px solid ${c.color}` }}>
              <div className={styles.cardShine} />
              <GifIcon code={c.icon} size={36} className={styles.currencyGif} />
              <div className={`num ${styles.currencyNum}`} style={{ color: c.numColor }}>
                {formatNumber(user[c.key] as number)}
              </div>
              <div className={`micro ${styles.currencyLabel}`}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* ── World Map ── */}
        <div className={styles.mapWrap}>
          <svg viewBox="0 0 370 220" className={styles.map} xmlns="http://www.w3.org/2000/svg">
            {/* River Saigon */}
            <path d="M185,10 Q200,50 190,90 Q180,130 195,170 Q205,200 200,220"
              stroke="#6ED8D0" strokeWidth="14" fill="none" opacity="0.7"/>
            {/* Quận 1 — conquered */}
            <polygon points="155,60 205,50 225,90 200,120 160,115 140,85"
              fill="var(--brand-200)" stroke="#FF9966" strokeWidth="1.5"/>
            {/* Q.3 */}
            <polygon points="100,50 155,60 140,85 100,90 75,70"
              fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.5"/>
            {/* Bình Thạnh */}
            <polygon points="205,50 245,40 260,75 240,100 225,90"
              fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.5"/>
            {/* Q.7 — conquered */}
            <polygon points="140,115 200,120 210,160 165,170 130,145"
              fill="#FFD6B8" stroke="#FF9966" strokeWidth="1.5"/>
            {/* Phú Nhuận */}
            <polygon points="100,90 140,85 130,120 100,125 80,105"
              fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.5"/>
            {/* Thủ Đức */}
            <polygon points="240,100 280,90 290,130 260,150 240,130"
              fill="var(--surface-2)" stroke="var(--line)" strokeWidth="1.5"/>
            {/* Labels */}
            <text x="173" y="88" fontFamily="Space Grotesk" fontSize="9" fontWeight="700" fill="#4A4F62" textAnchor="middle">Q.1</text>
            <text x="113" y="72" fontFamily="Space Grotesk" fontSize="9" fontWeight="700" fill="#8A8E9E" textAnchor="middle">Q.3</text>
            <text x="236" y="68" fontFamily="Space Grotesk" fontSize="9" fontWeight="700" fill="#8A8E9E" textAnchor="middle">B.THẠNH</text>
            <text x="172" y="145" fontFamily="Space Grotesk" fontSize="9" fontWeight="700" fill="#4A4F62" textAnchor="middle">Q.7</text>
            <text x="107" y="108" fontFamily="Space Grotesk" fontSize="9" fontWeight="700" fill="#8A8E9E" textAnchor="middle">P.NHUẬN</text>
            <text x="262" y="120" fontFamily="Space Grotesk" fontSize="9" fontWeight="700" fill="#8A8E9E" textAnchor="middle">THỦ ĐỨC</text>
          </svg>

          {/* Quest pins */}
          <MapPin style={{ top: 42, left: 134 }}>+3</MapPin>
          <MapPin style={{ top: 75, left: 218 }}>+2</MapPin>
          <MapPin style={{ top: 130, left: 148 }}>★</MapPin>

          {/* City chip */}
          <div className={styles.mapChip}>
            <Chip variant="glass-light">
              <GifIcon code="1f1fb-1f1f3" size={16} />
              <span>HCM City</span>
            </Chip>
          </div>
        </div>

        {/* ── Recommended quests ── */}
        {loading ? (
          <div className={`shimmer ${styles.recSkeleton}`} />
        ) : recommendedList.length > 0 ? (
          <div
            className={styles.recCard}
            onTouchStart={(e) => {
              swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }}
            onTouchEnd={(e) => {
              if (!swipeStart.current) return;
              const dx = e.changedTouches[0].clientX - swipeStart.current.x;
              const dy = e.changedTouches[0].clientY - swipeStart.current.y;
              swipeStart.current = null;
              if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
              if (dx < 0) {
                setSlideDir('left');
                setRecIdx((i) => Math.min(i + 1, recommendedList.length - 1));
              } else {
                setSlideDir('right');
                setRecIdx((i) => Math.max(i - 1, 0));
              }
            }}
          >
            <div className={styles.recHeader}>
              <div className={`micro ${styles.recTag}`}>
                {t('home.tonightsPick')} · 22:00–02:00
              </div>
              {recommendedList.length > 1 && (
                <div className={styles.recDots}>
                  {recommendedList.map((_, i) => (
                    <span
                      key={i}
                      className={`${styles.dot} ${i === recIdx ? styles.dotActive : ''}`}
                      onClick={() => { setSlideDir(i > recIdx ? 'left' : 'right'); setRecIdx(i); }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div
              key={recIdx}
              className={`${styles.recSlide} ${slideDir === 'left' ? styles.slideFromRight : styles.slideFromLeft}`}
            >
              {(() => {
              const quest = recommendedList[recIdx];
              return (
                <>
                  <div className={styles.recBody}>
                    <div className={styles.recThumb}>
                      <AppImage src={quest.thumbnailUrls} alt="" />
                    </div>
                    <div className={styles.recInfo}>
                      <h3 className={styles.recTitle}>{quest.title}</h3>
                      <div className={styles.recRewards}>
                        <span className={styles.rewardItem}>
                          <GifIcon code="1f48e" size={16} />
                          <span style={{ color: 'var(--xp)' }}>+{quest.rewardExp}</span>
                        </span>
                        <span className={styles.rewardItem}>
                          <GifIcon code="1fa99" size={16} />
                          <span style={{ color: '#A07010' }}>+{quest.rewardGold}</span>
                        </span>
                        {quest.rewardItems.length > 0 && (
                          <span className={styles.rewardItem}>
                            <GifIcon code="1f3c6" size={16} />
                            <span style={{ color: '#A07010' }}>×{quest.rewardItems.length}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className={styles.recBtn}
                    onClick={() => navigate(`/quests/${quest.id}`)}
                  >
                    {t('home.startQuestBtn')}
                  </button>
                </>
              );
            })()}
            </div>
          </div>
        ) : (
          <div className={styles.recEmpty}>
            <p>{t('home.noRecommendedQuest')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
