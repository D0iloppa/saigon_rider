import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { useUserStore } from '@/store/useUserStore';
import { SkillTree } from './SkillTree';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useDialogStore } from '@/store/useDialogStore';
import { expToNextLevel } from '@/lib/rewards';
import { formatNumber, formatRelativeTime, splitNumberParts } from '@/lib/format';
import type { BadgeWithEarned, FeedPost, QuestHistoryItem, UserStats } from '@/api/types';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { Chip } from '@/components/ui/Chip';
import { StatusBar } from '@/components/layout/StatusBar';
import { fetchMe, fetchUserStats, fetchQuestHistory, fetchAllBadges } from '@/api/profile';
import { fetchWallet } from '@/api/wallet';
import { fetchFollowCounts } from '@/api/follows';
import { fetchMyFeed, deleteFeedPost } from '@/api/feed';
import type { FeedPage } from '@/api/feed';
import { fetchInventory } from '@/api/inventory';
import type { InventoryItem } from '@/api/inventory';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { ImageViewer } from '@/pages/feed/FeedList';
import { toast } from '@/components/ui/Toast';
import { emojiUrl } from '@/lib/emoji';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import styles from './ProfileMain.module.css';

interface MileageTier {
  key: string;
  icon: string;
  km: number;
  color: string;
  bg: string;
  grad: string;
}

const MILEAGE_TIERS: MileageTier[] = [
  { key: 'Starter',  icon: '🏁', km: 0,     color: '#8A8E9E', bg: 'rgba(138,142,158,.1)',  grad: 'linear-gradient(90deg,#8A8E9E,#A0AEC0)' },
  { key: 'Bronze',   icon: '🥉', km: 100,   color: '#CD7F32', bg: 'rgba(205,127,50,.12)',   grad: 'linear-gradient(90deg,#CD7F32,#E8A84C)' },
  { key: 'Silver',   icon: '🥈', km: 500,   color: '#718096', bg: 'rgba(160,174,192,.12)',   grad: 'linear-gradient(90deg,#718096,#A0AEC0)' },
  { key: 'Gold',     icon: '🥇', km: 2000,  color: '#D69E2E', bg: 'rgba(255,184,0,.12)',     grad: 'linear-gradient(90deg,#D69E2E,#FFB800)' },
  { key: 'Platinum', icon: '💎', km: 5000,  color: '#00B5A0', bg: 'rgba(0,229,204,.12)',     grad: 'linear-gradient(90deg,#00B5A0,#00E5CC)' },
  { key: 'Legend',   icon: '🏆', km: 10000, color: '#FF5A1F', bg: 'rgba(255,90,31,.12)',     grad: 'linear-gradient(90deg,#FF5A1F,#FF9966)' },
];

function getTier(km: number): MileageTier {
  let tier = MILEAGE_TIERS[0];
  for (const t of MILEAGE_TIERS) {
    if (km >= t.km) tier = t;
  }
  return tier;
}

function getNextTier(km: number): MileageTier | null {
  for (const t of MILEAGE_TIERS) {
    if (km < t.km) return t;
  }
  return null;
}

const RARITY_STYLE: Record<string, string> = {
  R: 'garageItemRare',
  E: 'garageItemEpic',
  L: 'garageItemLegend',
  M: 'garageItemMythic',
};

export default function ProfileMain() {
  // ── hooks (must be before any early return) ──────────────
  const user = useUserStore((s) => s.user);
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const navigate = useNavigate();

  const [gp, setGp] = useState(0);
  const [gc, setGc] = useState(0);

  useEffect(() => {
    if (!user?.phone) return;
    fetchMe(user.phone).then((dto) => {
      if (dto) loginFromBackend(dto);
    });
    fetchWallet().then((w) => {
      setGp(w.gold_balance);
      setGc(w.xp_balance);
    }).catch(() => {});
  }, []);
  const { t, i18n } = useTranslation();

  const [tab, setTab] = useState<'feeds' | 'history' | 'badges' | 'gear'>('feeds');
  const [activeBadge, setActiveBadge] = useState<BadgeWithEarned | null>(null);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [equippedItems, setEquippedItems] = useState<InventoryItem[]>([]);
  const [totalMileage, setTotalMileage] = useState(0);
  const [questHistory, setQuestHistory] = useState<QuestHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [badges, setBadges] = useState<BadgeWithEarned[]>([]);

  const headerRef = useRef<HTMLDivElement>(null);
  const socialRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── 드래그 가능 시트 로직 ──
  const [sheetTop, setSheetTop] = useState(9999);
  const [socialTop, setSocialTop] = useState(0);
  const [scrollable, setScrollable] = useState(false);
  const snapMin = useRef(0);
  const snapMax = useRef(0);
  const dragging = useRef(false);
  const atTop = useRef(false);
  const dragStartY = useRef(0);
  const dragStartTop = useRef(0);
  const scrollTimer = useRef(0);

  const computeSnaps = useCallback(() => {
    const hH = headerRef.current?.offsetHeight ?? 0;
    const sH = socialRef.current?.offsetHeight ?? 0;
    snapMin.current = hH;
    snapMax.current = hH + sH + 24;
    setSocialTop(hH);
    return snapMax.current;
  }, []);

  useEffect(() => {
    const val = computeSnaps();
    setSheetTop(val);
    const ro = new ResizeObserver(() => {
      const newMax = computeSnaps();
      setSheetTop((prev) => (prev >= snapMax.current ? newMax : Math.min(prev, newMax)));
    });
    if (headerRef.current) ro.observe(headerRef.current);
    if (socialRef.current) ro.observe(socialRef.current);
    return () => ro.disconnect();
  }, [computeSnaps]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragStartY.current = e.touches[0].clientY;
    dragStartTop.current = sheetTop;
    dragging.current = false;
  }, [sheetTop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const dy = e.touches[0].clientY - dragStartY.current;

    if (!dragging.current) {
      if (atTop.current) {
        if (dy < 0) return;
        if (sheet.scrollTop > 1) return;
      }
      if (Math.abs(dy) < 5) return;
      dragging.current = true;
      window.clearTimeout(scrollTimer.current);
      atTop.current = false;
      setScrollable(false);
    }

    if (dragging.current) {
      e.preventDefault();
      const newTop = Math.min(snapMax.current, Math.max(snapMin.current, dragStartTop.current + dy));
      setSheetTop(newTop);
    }
  }, [sheetTop]);

  const handleTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const mid = (snapMin.current + snapMax.current) / 2;
    const target = sheetTop < mid ? snapMin.current : snapMax.current;
    setSheetTop(target);
    if (target === snapMin.current) {
      atTop.current = true;
      scrollTimer.current = window.setTimeout(() => setScrollable(true), 100);
    }
  }, [sheetTop]);

  const [followCounts, setFollowCounts] = useState({ followerCount: 0, followingCount: 0 });
  const [qrSheetOpen, setQrSheetOpen] = useState(false);

  // ── feeds 탭 상태 ──
  const [myFeeds, setMyFeeds] = useState<FeedPost[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [feedsPage, setFeedsPage] = useState(1);
  const [feedsHasMore, setFeedsHasMore] = useState(true);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [viewerState, setViewerState] = useState<{ srcs: string[]; index: number } | null>(null);
  const openDialog = useDialogStore((s) => s.open);

  useEffect(() => {
    if (!user?.id) return;
    fetchFollowCounts(user.id).then(setFollowCounts);
    fetchUserStats(user.id).then((s) => {
      setStats(s);
      setTotalMileage(Number(s.lifetime_km));
    }).catch(() => {});
    fetchAllBadges(user.id).then(setBadges).catch(() => {});
    fetchInventory(user.id).then((inv) => {
      setEquippedItems(inv.items.filter((i) => i.is_equipped));
    }).catch(() => {});
  }, [user?.id]);

  const loadHistory = useCallback(async (page: number, reset = false) => {
    if (!user?.id) return;
    setHistoryLoading(true);
    try {
      const res = await fetchQuestHistory(user.id, page);
      setQuestHistory((prev) => reset ? res.items : [...prev, ...res.items]);
      setHistoryHasMore(res.items.length >= res.size);
      setHistoryPage(page);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (tab === 'history' && user?.id && questHistory.length === 0) {
      loadHistory(1, true);
    }
  }, [tab, user?.id]);

  const loadMyFeeds = useCallback(async (page: number, reset = false) => {
    if (!user?.id) return;
    setFeedsLoading(true);
    try {
      const res: FeedPage = await fetchMyFeed(user.id, page);
      setMyFeeds((prev) => reset ? res.items : [...prev, ...res.items]);
      setFeedsHasMore(res.items.length >= res.size);
      setFeedsPage(page);
    } finally {
      setFeedsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (tab === 'feeds' && user?.id && myFeeds.length === 0) {
      loadMyFeeds(1, true);
    }
  }, [tab, user?.id]);

  const confirmDeleteFeed = (postId: string) => {
    openDialog({
      title: { mode: 'code', value: 'profile.deletePostConfirm' },
      confirmLabel: { mode: 'code', value: 'profile.deletePost' },
      onConfirm: async () => {
        if (!user?.id) return;
        try {
          await deleteFeedPost(postId, user.id);
          setMyFeeds((prev) => prev.filter((p) => p.id !== postId));
          toast.success(t('profile.deletePostSuccess'));
        } catch {
          toast.error(t('profile.deletePostError'));
        }
      },
    });
  };

  // ── guard (TypeScript narrows user → User below this line) ──
  if (!user) return null;

  // user이 User로 narrowing된 이후 캡처 → async 클로저에서도 타입 안전
  const u = user;
  const { needed, progress } = expToNextLevel(u.levelExp, u.level);


  const TABS = [
    { key: 'feeds'   as const, label: t('profile.tabFeeds') },
    { key: 'history' as const, label: t('profile.tabHistory') },
    { key: 'badges'  as const, label: t('profile.tabBadges') },
    { key: 'gear'    as const, label: t('profile.tabGear') },
  ];

  return (
    <div className={styles.root}>
      {/* 단일 그라데이션 배경 + noise */}
      <div className={styles.bgFixed}>
        <div className={styles.noise} />
      </div>

      {/* Section 1: 고정 헤더 (아바타 ~ 레벨바) */}
      <div className={styles.fixedHeader} ref={headerRef}>
        <div style={{ position: 'relative', zIndex: 10 }}>
          <StatusBar variant="light" />
        </div>
        <button className={styles.settingsBtn} onClick={() => navigate('/settings')}>
          ⚙
        </button>

        <div className={styles.avatarWrap}>
          <AppImage
            src={u.avatarUrl}
            alt=""
            className={styles.avatar}
            variant="circle"
          />
          <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)' }}>
            <LevelBadge level={u.level} />
          </div>
        </div>

        <div className={styles.nickRow}>
          <h1 className={styles.nick}>{u.nickname}</h1>
        </div>

        <div style={{ margin: '8px auto 24px', display: 'flex', justifyContent: 'center' }}>
          <Chip variant="surface">
            {u.riderStyle === 'commuter'
              ? `🏢 ${t('profileSetup.styleCommuterTitle')}`
              : u.riderStyle === 'cafe_hunter'
              ? `☕ ${t('profileSetup.styleCafeHunterTitle')}`
              : `🌙 ${t('profileSetup.styleNightRiderTitle')}`}
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

      {/* Section 2: 소셜 + 액션 (fixed, Section 1 바로 아래) */}
      <div className={styles.socialSection} ref={socialRef} style={{ top: socialTop }}>
        <div className={styles.socialRow}>
          <button className={styles.socialCell} onClick={() => navigate(`/followers/${u.id}`)}>
            <span className={styles.socialNum}>{formatNumber(followCounts.followerCount)}</span>
            <span className={styles.socialLabel}>{t('follow.followers')}</span>
          </button>
          <div className={styles.socialDivider} />
          <button className={styles.socialCell} onClick={() => navigate(`/following/${u.id}`)}>
            <span className={styles.socialNum}>{formatNumber(followCounts.followingCount)}</span>
            <span className={styles.socialLabel}>{t('follow.following')}</span>
          </button>
        </div>

        <div className={styles.profileActions}>
          <button className={styles.shareProfileBtn} onClick={() => setQrSheetOpen(true)}>
            {t('profile.share')}
          </button>
          <button className={styles.addFriendIconBtn} onClick={() => navigate('/friends/add')} aria-label={t('follow.addFriend')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="16" y1="11" x2="22" y2="11" />
            </svg>
          </button>
        </div>
      </div>

      {/* Section 3: 드래그 가능 Sheet */}
      <div
        className={styles.sheet}
        ref={sheetRef}
        style={{
          top: sheetTop,
          transition: dragging.current ? 'none' : 'top .3s cubic-bezier(.2,.8,.2,1)',
          overflowY: scrollable ? 'auto' : 'hidden',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.sheetGrabber} />
        <div className={styles.currencyBento}>
          <div className={styles.currencyCell} style={{ borderColor: 'var(--gc)' }}>
            <img src={emojiUrl('1f48e')} width={36} height={36} alt="" style={{ display: 'block', margin: '0 auto' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div className={styles.currencyNum}>{formatNumber(gc)}</div>
            <div className={styles.currencyLabel}>{t('currency.xp')}</div>
          </div>
          <div className={styles.currencyCell} style={{ borderColor: 'var(--gold)' }}>
            <img src={emojiUrl('1fa99')} width={36} height={36} alt="" style={{ display: 'block', margin: '0 auto' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div className={styles.currencyNum}>{formatNumber(gp)}</div>
            <div className={styles.currencyLabel}>{t('currency.gold')}</div>
          </div>
          <div className={styles.currencyCell} style={{ borderColor: 'var(--brand-500)' }}>
            <img src={emojiUrl('26a1')} width={36} height={36} alt="" style={{ display: 'block', margin: '0 auto' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div className={styles.currencyNum}>{u.skillPoints}</div>
            <div className={styles.currencyLabel}>{t('profile.skillPt')}</div>
          </div>
        </div>

        {/* SGR-209 A4: 스킬 트리 */}
        <SkillTree />

        {/* SGR-213: 내 쿠폰함 진입 */}
        <button
          type="button"
          onClick={() => navigate('/coupons/mine')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            margin: '12px 0', padding: '14px 16px', borderRadius: 16,
            border: '1px solid var(--line)', background: 'white', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 24 }}>🎁</span>
          <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            {t('coupon.my_box')}
          </span>
          <span style={{ color: 'var(--text-3)', fontSize: 18 }}>›</span>
        </button>

        {/* Garage Banner */}
        <div className={styles.garageBanner} onClick={() => navigate('/garage')}>
          <div className={equippedItems.length > 0 ? styles.garageIconWrap : styles.garageIconWrapEmpty}>
            <img src={emojiUrl('1f3cd')} width={28} height={28} alt="" onError={(e) => { e.currentTarget.textContent = '🏍'; }} />
          </div>
          <div className={styles.garageInfo}>
            {equippedItems.length > 0 ? (
              <>
                <div className={styles.garageTitle}>
                  {t('profile.myRide')}
                  <span className={styles.garageBadge}>{t('profile.equipped', { count: equippedItems.length })}</span>
                </div>
                <div className={styles.garageEquipped}>
                  {equippedItems.slice(0, 5).map((item) => (
                    <div
                      key={item.user_item_id}
                      className={styles[RARITY_STYLE[item.rarity] as keyof typeof styles] as string || styles.garageItemThumb}
                    >
                      <ItemSvgRenderer itemCode={item.item_code} slot={item.item_slot} size={18} rarity={item.rarity} />
                    </div>
                  ))}
                  {equippedItems.length < 5 && Array.from({ length: 5 - equippedItems.length }).map((_, i) => (
                    <div key={`empty-${i}`} className={styles.garageItemEmpty}>+</div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className={styles.garageTitle}>{t('profile.myRide')}</div>
                <div className={styles.garageEmptyHint}>{t('profile.garageEmpty')}</div>
              </>
            )}
          </div>
          <div className={styles.garageArrow}>›</div>
        </div>

        {/* Odometer Card */}
        {(() => {
          const tier = getTier(totalMileage);
          const next = getNextTier(totalMileage);
          const tierI18nKey = `profile.tier${tier.key}` as const;
          const barPct = next
            ? Math.max(5, Math.min(95, ((totalMileage - tier.km) / (next.km - tier.km)) * 100))
            : 100;
          return (
            <div className={styles.odometerCard}>
              <div className={styles.odometerHeader}>
                <div className={styles.odometerTitle}>🛣 {t('profile.odometer')}</div>
                <div className={styles.odometerTierBadge} style={{ background: tier.bg, color: tier.color }}>
                  {tier.icon} {t(tierI18nKey)}
                </div>
              </div>

              <div className={styles.odometerBig}>
                {(() => {
                  const { int, frac } = splitNumberParts(totalMileage);
                  return (
                    <>
                      <span className={styles.odometerNum}>{int}</span>
                      {frac && <span className={styles.odometerFrac}>{frac}</span>}
                    </>
                  );
                })()}
                <span className={styles.odometerUnit}>km</span>
                <div className={styles.odometerSubtitle}>{t('profile.totalDistance')}</div>
              </div>

              <div className={styles.odometerProgress}>
                <div className={styles.odometerBarWrap}>
                  <div className={styles.odometerBarFill} style={{ width: `${barPct}%`, background: tier.grad }} />
                </div>
                <div className={styles.odometerBarLabels}>
                  <span className={styles.odometerBarLabelCurrent}>
                    {tier.icon} {t(tierI18nKey)} {formatNumber(tier.km)}km
                  </span>
                  {next ? (
                    <span className={styles.odometerBarLabelNext}>
                      {next.icon} {t(`profile.tier${next.key}` as const)} {formatNumber(next.km)}km →
                    </span>
                  ) : (
                    <span className={styles.odometerBarLabelNext} style={{ color: tier.color }}>
                      🏆 {t('profile.tierMax')}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.tierMilestones}>
                {MILEAGE_TIERS.map((mt) => {
                  const achieved = totalMileage >= mt.km;
                  const isCurrent = tier.key === mt.key;
                  const cls = achieved && isCurrent
                    ? styles.tierMilestoneAchievedCurrent
                    : achieved
                    ? styles.tierMilestoneAchieved
                    : isCurrent
                    ? styles.tierMilestoneCurrent
                    : styles.tierMilestone;
                  return (
                    <div key={mt.key} className={cls}>
                      <span className={styles.tierIcon}>{mt.icon}</span>
                      <span className={styles.tierName}>{t(`profile.tier${mt.key}` as const)}</span>
                      <span className={styles.tierKm}>{formatNumber(mt.km)}km</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className={styles.statsCard}>
          <h3 className={styles.cardTitle}>{t('profile.thisMonth')}</h3>
          <div className={styles.statsRow}>
            <div>
              <div className={styles.statBig}>{stats ? Number(stats.total_km).toFixed(2) : '—'}</div>
              <div className={styles.statSmall}>km</div>
            </div>
            <div>
              <div className={styles.statBig}>{stats?.quest_count ?? '—'}</div>
              <div className={styles.statSmall}>{t('tabbar.quests')}</div>
            </div>
            <div>
              <div className={styles.statBig}>{stats?.avg_safety_grade ?? '—'}</div>
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

        {tab === 'feeds' && (
          <div className={styles.feedsList}>
            <button className={styles.newPostBtn} onClick={() => navigate('/feed/new')}>
              + {t('profile.newPost')}
            </button>
            {feedsLoading && myFeeds.length === 0 ? (
              <div className={styles.emptyTab}>
                <p>{t('common.loading')}</p>
              </div>
            ) : myFeeds.length === 0 ? (
              <div className={styles.emptyTab}>
                <span style={{ fontSize: 48 }}>📸</span>
                <p>{t('profile.emptyFeeds')}</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>{t('profile.emptyFeedsSub')}</p>
              </div>
            ) : (
              <>
                {myFeeds.map((p) => (
                  <div key={p.id} className={styles.feedCard}>
                    {p.photoUrls.length > 0 && (
                      <ImageCarousel
                        urls={p.photoUrls}
                        onImageClick={(idx) => setViewerState({ srcs: p.photoUrls, index: idx })}
                      />
                    )}
                    <div className={styles.feedCardBody}>
                      {p.caption && <p className={styles.feedCardCaption}>{p.caption}</p>}
                      {p.hashtags.length > 0 && (
                        <div className={styles.feedCardTags}>
                          {p.hashtags.map((tag) => (
                            <span key={tag} className={styles.feedCardTag}>#{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className={styles.feedCardMeta}>
                        <span>🔥 {p.cheerCount}</span>
                        <span>💬 {p.commentCount}</span>
                        <span>{formatRelativeTime(p.createdAt)}</span>
                      </div>
                    </div>
                    <button
                      className={styles.feedCardMenu}
                      onClick={() => setMenuPostId(menuPostId === p.id ? null : p.id)}
                    >
                      ⋮
                    </button>
                    {menuPostId === p.id && (
                      <div className={styles.feedCardDropdown}>
                        <button onClick={() => { setMenuPostId(null); navigate(`/feed/edit/${p.id}`); }}>
                          {t('profile.editPost')}
                        </button>
                        <button onClick={() => { setMenuPostId(null); confirmDeleteFeed(p.id); }}>
                          {t('profile.deletePost')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {feedsHasMore && (
                  <button
                    className={styles.loadMoreBtn}
                    onClick={() => loadMyFeeds(feedsPage + 1)}
                    disabled={feedsLoading}
                  >
                    {feedsLoading ? t('common.loading') : t('profile.loadMore')}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className={styles.list}>
            {historyLoading && questHistory.length === 0 ? (
              <div className={styles.emptyTab}>
                <p>{t('common.loading')}</p>
              </div>
            ) : questHistory.length === 0 ? (
              <div className={styles.emptyTab}>
                <span style={{ fontSize: 48 }}>📋</span>
                <p>{t('profile.emptyHistory')}</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>{t('profile.emptyHistorySub')}</p>
              </div>
            ) : (
              <>
                {questHistory.map((h) => (
                  <div key={h.id} className={styles.historyRow}>
                    <div className={styles.historyThumb}>✅</div>
                    <div className={styles.historyText}>
                      <div className={styles.historyTitle}>{h.quest_title || t('profile.unknownQuest')}</div>
                      <div className={styles.historyDate}>
                        {h.completed_at ? new Date(h.completed_at).toLocaleDateString() : ''}
                        {h.distance_km != null && ` · ${Number(h.distance_km).toFixed(1)}km`}
                      </div>
                    </div>
                    {h.safety_grade && (
                      <div className={`${styles.gradeChip} ${h.safety_grade === 'A' ? styles.gradeA : styles.gradeB}`}>
                        {h.safety_grade}
                      </div>
                    )}
                  </div>
                ))}
                {historyHasMore && (
                  <button
                    className={styles.loadMoreBtn}
                    onClick={() => loadHistory(historyPage + 1)}
                    disabled={historyLoading}
                  >
                    {historyLoading ? t('common.loading') : t('profile.loadMore')}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'badges' && (
          <div className={styles.badgeGrid}>
            {badges.length === 0 ? (
              <div className={styles.emptyTab} style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 48 }}>🏅</span>
                <p>{t('profile.emptyBadges')}</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>{t('profile.emptyBadgesSub')}</p>
              </div>
            ) : badges.map((bw) => {
              const lang = i18n.language as 'ko' | 'vi' | 'en';
              const displayName = bw.badge[`name_${lang}`] || bw.badge.name;
              const iconEmoji = bw.badge.icon_url || '🏅';
              const isEmoji = !iconEmoji.startsWith('http');
              return (
                <button key={bw.badge.id} className={`${styles.badgeCell} ${!bw.earned ? styles.badgeLocked : ''}`} onClick={() => setActiveBadge(bw)}>
                  <div className={styles.badgeIcon}>
                    {isEmoji ? iconEmoji : <AppImage src={iconEmoji} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />}
                  </div>
                  <div className={styles.badgeName}>{displayName}</div>
                </button>
              );
            })}
          </div>
        )}

        {tab === 'gear' && (
          <div className={styles.emptyTab}>
            <span style={{ fontSize: 48 }}>🏍</span>
            <p>{t('profile.noGear')}</p>
            <button
              className={styles.newPostBtn}
              style={{ marginTop: 16, maxWidth: 200 }}
              onClick={() => navigate('/garage')}
            >
              {t('profile.openGarage')}
            </button>
          </div>
        )}
      </div>{/* sheet */}

      {viewerState && (
        <ImageViewer
          srcs={viewerState.srcs}
          initialIndex={viewerState.index}
          onClose={() => setViewerState(null)}
        />
      )}

      {/* Badge detail modal */}
      {activeBadge && (() => {
        const lang = i18n.language as 'ko' | 'vi' | 'en';
        const b = activeBadge.badge;
        const displayName = b[`name_${lang}`] || b.name;
        const displayDesc = b[`description_${lang}`] || b.description || '';
        const iconEmoji = b.icon_url || '🏅';
        const isEmoji = !iconEmoji.startsWith('http');
        const conditionText = b.condition_rule
          ? b.condition_rule.conditions.map((c) => `${c.metric} ${c.op} ${c.value}`).join(` ${b.condition_rule.operator} `)
          : b.condition_type ? `${b.condition_type} ≥ ${b.condition_value}` : '';
        return (
          <div className={styles.modalBackdrop} onClick={() => setActiveBadge(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHero}>
                <div className={styles.modalBadgeIcon}>
                  {isEmoji ? iconEmoji : <AppImage src={iconEmoji} alt="" style={{ width: 96, height: 96, objectFit: 'contain' }} />}
                </div>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.modalKey}>{displayName}</div>
                <h2 className={styles.modalDesc}>{displayDesc}</h2>
                {conditionText && (
                  <div className={styles.modalCondition}>
                    <span>{activeBadge.earned ? '✓' : '○'}</span>
                    {conditionText}
                  </div>
                )}
                {activeBadge.acquired_at && (
                  <p className={styles.modalDate}>
                    {t('profile.earnedAt', { date: new Date(activeBadge.acquired_at).toLocaleDateString() })}
                  </p>
                )}
                <div className={styles.modalActions}>
                  <Button variant="ghost" onClick={() => setActiveBadge(null)}>{t('common.close')}</Button>
                  {activeBadge.earned && <Button>{t('common.share')}</Button>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      <BottomSheet open={qrSheetOpen} onClose={() => setQrSheetOpen(false)}>
        <div className={styles.qrSheet}>
          <h3 className={styles.qrTitle}>{t('profile.share')}</h3>
          <div className={styles.qrCanvas}>
            <QRCodeCanvas
              value={u.id}
              size={180}
              level="H"
              includeMargin
              imageSettings={{
                src: u.avatarUrl || '/saigon-default.jpg',
                x: undefined,
                y: undefined,
                height: 36,
                width: 36,
                excavate: true,
              }}
            />
          </div>
          <div className={styles.qrInfo}>
            <span className={styles.qrNickname}>{u.nickname}</span>
            <LevelBadge level={u.level} />
          </div>
          <p className={styles.qrGuide}>{t('profile.shareGuide')}</p>
        </div>
      </BottomSheet>
    </div>
  );
}
