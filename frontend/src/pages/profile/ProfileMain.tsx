import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Settings, Building2, Coffee, Moon, BadgeCheck, Smartphone, ChevronRight,
  Route, Flag, Medal, Gem, Trophy, Bike, Store, Plus, Camera, Flame,
  MessageCircle, MoreVertical, ClipboardList, Check, Circle, Award,
  UserPlus, type LucideIcon,
} from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import { useDmStore } from '@/store/useDmStore';
import { fetchTrades, type TradeHistory } from '@/api/market';
import ReviewSheet from '@/components/market/ReviewSheet';
import TradeRow from '@/components/market/TradeRow';
import { SkillTree } from './SkillTree';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useDialogStore } from '@/store/useDialogStore';
import { expToNextLevel } from '@/lib/rewards';
import { formatNumber, formatRelativeTime, splitNumberParts } from '@/lib/format';
import type { BadgeWithEarned, FeedPost, QuestHistoryItem, UserStats } from '@/api/types';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { Chip } from '@/components/ui/Chip';
import { TrustTierChip } from '@/components/ui/TrustTierChip';
import { StatusBar } from '@/components/layout/StatusBar';
import { fetchMe, fetchUserStats, fetchQuestHistory, fetchAllBadges } from '@/api/profile';
import { fetchWallet } from '@/api/wallet';
import { fetchFollowCounts } from '@/api/follows';
import { fetchMyFeed, deleteFeedPost } from '@/api/feed';
import type { FeedPage } from '@/api/feed';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { ImageViewer } from '@/pages/feed/FeedList';
import { toast } from '@/components/ui/Toast';
import { emojiUrl } from '@/lib/emoji';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import styles from './ProfileMain.module.css';

interface MileageTier {
  key: string;
  icon: LucideIcon;
  km: number;
  color: string;
  bg: string;
  grad: string;
}

// 등급 램프 색상은 토큰에 없는 고유 팔레트(브론즈/실버 등) — design-system §3 경계 사례로 유지.
const MILEAGE_TIERS: MileageTier[] = [
  { key: 'Starter',  icon: Flag,   km: 0,     color: '#8A8E9E', bg: 'rgba(138,142,158,.1)',  grad: 'linear-gradient(90deg,#8A8E9E,#A0AEC0)' },
  { key: 'Bronze',   icon: Medal,  km: 100,   color: '#CD7F32', bg: 'rgba(205,127,50,.12)',   grad: 'linear-gradient(90deg,#CD7F32,#E8A84C)' },
  { key: 'Silver',   icon: Medal,  km: 500,   color: '#718096', bg: 'rgba(160,174,192,.12)',   grad: 'linear-gradient(90deg,#718096,#A0AEC0)' },
  { key: 'Gold',     icon: Medal,  km: 2000,  color: '#D69E2E', bg: 'rgba(255,184,0,.12)',     grad: 'linear-gradient(90deg,#D69E2E,#FFB800)' },
  { key: 'Platinum', icon: Gem,    km: 5000,  color: '#00B5A0', bg: 'rgba(0,229,204,.12)',     grad: 'linear-gradient(90deg,#00B5A0,#00E5CC)' },
  { key: 'Legend',   icon: Trophy, km: 10000, color: '#FF5A1F', bg: 'rgba(255,90,31,.12)',     grad: 'linear-gradient(90deg,#FF5A1F,#FF9966)' },
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

export default function ProfileMain() {
  // ── hooks (must be before any early return) ──────────────
  const user = useUserStore((s) => s.user);
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const navigate = useNavigate();
  const dmUnread = useDmStore((s) => s.totalUnread);
  const refreshDmUnread = useDmStore((s) => s.refreshUnread);

  const [gp, setGp] = useState(0);
  const [gc, setGc] = useState(0);

  useEffect(() => {
    refreshDmUnread();
  }, [refreshDmUnread]);

  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [reviewTarget, setReviewTarget] = useState<{ targetId: string; listingId: string } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetchTrades(user.id).then(setTrades).catch(() => setTrades([]));
  }, [user?.id]);

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

  const [tab, setTab] = useState<'feeds' | 'history' | 'badges'>('feeds');
  const [activeBadge, setActiveBadge] = useState<BadgeWithEarned | null>(null);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [totalMileage, setTotalMileage] = useState(0);
  const [questHistory, setQuestHistory] = useState<QuestHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [badges, setBadges] = useState<BadgeWithEarned[]>([]);

  const headerRef = useRef<HTMLDivElement>(null);
  const socialRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetHandleRef = useRef<HTMLDivElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);

  // ── 드래그 가능 시트 로직 ──
  const [sheetTop, setSheetTop] = useState(9999);
  const [socialTop, setSocialTop] = useState(0);
  const [scrollable, setScrollable] = useState(false);
  const snapMin = useRef(0);
  const snapMax = useRef(0);
  const dragging = useRef(false);
  const dragFromHandle = useRef(false);
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
    dragFromHandle.current = sheetHandleRef.current?.contains(e.target as Node) ?? false;
  }, [sheetTop]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const body = sheetBodyRef.current;
    if (!body) return;
    const dy = e.touches[0].clientY - dragStartY.current;

    if (!dragging.current) {
      if (atTop.current && !dragFromHandle.current) {
        if (dy < 0) return;
        if (body.scrollTop > 1) return;
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
    } else if (sheetBodyRef.current) {
      sheetBodyRef.current.scrollTop = 0; // 접힘 시 내부 스크롤 리셋
    }
  }, [sheetTop]);

  const [followCounts, setFollowCounts] = useState({ followerCount: 0, followingCount: 0 });
  const [qrSheetOpen, setQrSheetOpen] = useState(false);

  // ── 거래 이력 서브탭 ──
  const [tradeTab, setTradeTab] = useState<'bought' | 'sold'>('bought');

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
        <button className={styles.settingsBtn} onClick={() => navigate('/settings')} aria-label={t('settings.title')}>
          <Settings size={20} strokeWidth={2} />
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

        <div style={{ margin: '8px auto 24px', display: 'flex', justifyContent: 'center', gap: 6 }}>
          <Chip variant="surface">
            {u.riderStyle === 'commuter' ? (
              <><Building2 size={13} /> {t('profileSetup.styleCommuterTitle')}</>
            ) : u.riderStyle === 'cafe_hunter' ? (
              <><Coffee size={13} /> {t('profileSetup.styleCafeHunterTitle')}</>
            ) : (
              <><Moon size={13} /> {t('profileSetup.styleNightRiderTitle')}</>
            )}
          </Chip>
          <TrustTierChip temp={u.mannerTemp} />
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
            <span className={`${styles.socialNum} num`}>{formatNumber(followCounts.followerCount)}</span>
            <span className={styles.socialLabel}>{t('follow.followers')}</span>
          </button>
          <div className={styles.socialDivider} />
          <button className={styles.socialCell} onClick={() => navigate(`/following/${u.id}`)}>
            <span className={`${styles.socialNum} num`}>{formatNumber(followCounts.followingCount)}</span>
            <span className={styles.socialLabel}>{t('follow.following')}</span>
          </button>
        </div>

        <div className={styles.profileActions}>
          <button className={styles.shareProfileBtn} onClick={() => setQrSheetOpen(true)}>
            {t('profile.share')}
          </button>
          <button className={styles.addFriendIconBtn} onClick={() => navigate('/friends/add')} aria-label={t('follow.addFriend')}>
            <UserPlus size={18} strokeWidth={2.2} />
          </button>
          <button className={styles.addFriendIconBtn} onClick={() => navigate('/dm')} aria-label={t('tabbar.chat')}>
            <MessageCircle size={18} strokeWidth={2.2} />
            {dmUnread > 0 && <span className={`${styles.chatBadge} num`}>{dmUnread > 300 ? '300+' : dmUnread}</span>}
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
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.sheetHandle} ref={sheetHandleRef}>
          <div className={styles.sheetGrabber} />
        </div>
        <div
          className={styles.sheetBody}
          ref={sheetBodyRef}
          style={{ overflowY: scrollable ? 'auto' : 'hidden' }}
        >
        {/* SGR-330: 휴대폰 인증 신뢰 카드 — 판매자 신뢰도 트리거 */}
        <button
          type="button"
          onClick={() => { if (!u.phoneVerified) navigate('/auth/phone-verify'); }}
          disabled={u.phoneVerified}
          className={`${styles.verifyCard} ${u.phoneVerified ? styles.verifyCardDone : ''}`}
        >
          <span className={`${styles.verifyIcon} ${u.phoneVerified ? styles.verifyIconDone : ''}`}>
            {u.phoneVerified ? <BadgeCheck size={20} /> : <Smartphone size={20} />}
          </span>
          <span className={styles.verifyText}>
            <span className={styles.verifyTitle}>
              {u.phoneVerified ? t('profile.phoneVerifyDone') : t('profile.phoneVerifyNeeded')}
            </span>
            {!u.phoneVerified && (
              <span className={styles.verifySub}>{t('profile.phoneVerifyNeededSub')}</span>
            )}
          </span>
          {!u.phoneVerified && <ChevronRight size={18} className={styles.verifyChevron} />}
        </button>

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

        {/* SGR-209 A4: 스킬 트리 — SGR-287 마켓 피벗으로 임시 숨김(코드 보존) */}
        <div style={{ display: 'none' }}>
          <SkillTree />
        </div>

        {/* 거래 이력 — 구매/판매 서브탭 */}
        <div className={styles.tradeSection}>
          <div className={styles.tradeHeader}>
            <h3 className={styles.tradeSectionTitle}>{t('profile.tradeHistory', { defaultValue: '거래 이력' })}</h3>
            {trades.length > 0 && (
              <button type="button" className={styles.tradeMore} onClick={() => navigate('/trades')}>
                {t('profile.seeAll', { defaultValue: '전체 보기' })} <ChevronRight size={14} />
              </button>
            )}
          </div>
          <div className={styles.tradeSubTabRow}>
            <button
              type="button"
              className={`${styles.tradeSubTab} ${tradeTab === 'bought' ? styles.tradeSubTabActive : ''}`}
              onClick={() => setTradeTab('bought')}
            >
              {t('profile.tradeBought', { defaultValue: '구매' })}
            </button>
            <button
              type="button"
              className={`${styles.tradeSubTab} ${tradeTab === 'sold' ? styles.tradeSubTabActive : ''}`}
              onClick={() => setTradeTab('sold')}
            >
              {t('profile.tradeSold', { defaultValue: '판매' })}
            </button>
          </div>
          {(() => {
            const filtered = trades.filter((tr) => tr.role === (tradeTab === 'bought' ? 'bought' : 'sold'));
            return filtered.length === 0 ? (
              <p className={styles.tradeEmpty}>
                {tradeTab === 'bought'
                  ? t('profile.noTradesBought')
                  : t('profile.noTradesSold')}
              </p>
            ) : (
              filtered.slice(0, 3).map((tr) => (
                <TradeRow
                  key={tr.appointmentId}
                  trade={tr}
                  variant="plain"
                  onOpen={() => navigate(`/market/${tr.listingId}`)}
                  onReview={() => setReviewTarget({ targetId: tr.counterpartId, listingId: tr.listingId })}
                />
              ))
            );
          })()}
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
                <div className={styles.odometerTitle}><Route size={15} /> {t('profile.odometer')}</div>
                <div className={styles.odometerTierBadge} style={{ background: tier.bg, color: tier.color }}>
                  <tier.icon size={12} /> {t(tierI18nKey)}
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
                    <tier.icon size={11} /> {t(tierI18nKey)} {formatNumber(tier.km)}km
                  </span>
                  {next ? (
                    <span className={styles.odometerBarLabelNext}>
                      <next.icon size={11} /> {t(`profile.tier${next.key}` as const)} {formatNumber(next.km)}km <ChevronRight size={11} />
                    </span>
                  ) : (
                    <span className={styles.odometerBarLabelNext} style={{ color: tier.color }}>
                      <Trophy size={11} /> {t('profile.tierMax')}
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
                      <span className={styles.tierIcon}><mt.icon size={13} /></span>
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

        {/* 내 매물 진입 버튼 */}
        <button
          type="button"
          onClick={() => navigate('/market/search?mine=1')}
          className={styles.entryRow}
        >
          <span className={styles.entryIcon}><Bike size={18} /></span>
          <span className={styles.entryLabel}>{t('profile.tabMyListings')}</span>
          <ChevronRight size={18} className={styles.entryChevron} />
        </button>

        {/* SGR-312: 비즈니스 파트너 진입 (상태 분기는 /biz/status 화면이 처리) */}
        <button
          type="button"
          onClick={() => navigate('/biz/status')}
          className={`${styles.entryRow} ${styles.entryRowSpaced}`}
        >
          <span className={styles.entryIcon}><Store size={18} /></span>
          <span className={styles.entryLabel}>{t('biz.menuEntry', { defaultValue: '비즈니스 파트너' })}</span>
          <ChevronRight size={18} className={styles.entryChevron} />
        </button>

        {/* SGR-287: 피드/이력/뱃지 탭 제거 — 피드만 노출(피드 영역 라벨) */}
        <h3 className={styles.feedSectionLabel}>{t('profile.tabFeeds')}</h3>

        {tab === 'feeds' && (
          <div className={styles.feedsList}>
            <button className={styles.newPostBtn} onClick={() => navigate('/feed/new')}>
              <Plus size={16} /> {t('profile.newPost')}
            </button>
            {feedsLoading && myFeeds.length === 0 ? (
              <div className={styles.feedCard}>
                <SkeletonRows count={3} />
              </div>
            ) : myFeeds.length === 0 ? (
              <div className={styles.feedCard}>
                <StateBlock icon={Camera} title={t('profile.emptyFeeds')} desc={t('profile.emptyFeedsSub')} />
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
                        <span><Flame size={13} /> <span className="num">{p.cheerCount}</span></span>
                        <span><MessageCircle size={13} /> <span className="num">{p.commentCount}</span></span>
                        <span>{formatRelativeTime(p.createdAt)}</span>
                      </div>
                    </div>
                    <button
                      className={styles.feedCardMenu}
                      onClick={() => setMenuPostId(menuPostId === p.id ? null : p.id)}
                    >
                      <MoreVertical size={18} />
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
              <div className={styles.feedCard}>
                <SkeletonRows count={3} />
              </div>
            ) : questHistory.length === 0 ? (
              <div className={styles.feedCard}>
                <StateBlock icon={ClipboardList} title={t('profile.emptyHistory')} desc={t('profile.emptyHistorySub')} />
              </div>
            ) : (
              <>
                {questHistory.map((h) => (
                  <div key={h.id} className={styles.historyRow}>
                    <div className={styles.historyThumb}><Check size={20} strokeWidth={2.5} /></div>
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
              <div className={styles.feedCard} style={{ gridColumn: '1 / -1' }}>
                <StateBlock icon={Award} title={t('profile.emptyBadges')} desc={t('profile.emptyBadgesSub')} />
              </div>
            ) : badges.map((bw) => {
              const lang = i18n.language as 'ko' | 'vi' | 'en';
              const displayName = bw.badge[`name_${lang}`] || bw.badge.name;
              // icon_url 은 서버 데이터(콘텐츠) — 이모지/URL 그대로 렌더. 미지정 시에만 lucide 폴백.
              const iconEmoji = bw.badge.icon_url || '';
              const isEmoji = iconEmoji !== '' && !iconEmoji.startsWith('http');
              return (
                <button key={bw.badge.id} className={`${styles.badgeCell} ${!bw.earned ? styles.badgeLocked : ''}`} onClick={() => setActiveBadge(bw)}>
                  <div className={styles.badgeIcon}>
                    {iconEmoji === ''
                      ? <Award size={36} className={styles.badgeFallbackIcon} />
                      : isEmoji ? iconEmoji : <AppImage src={iconEmoji} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />}
                  </div>
                  <div className={styles.badgeName}>{displayName}</div>
                </button>
              );
            })}
          </div>
        )}
        </div>{/* sheetBody */}
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
        const iconEmoji = b.icon_url || '';
        const isEmoji = iconEmoji !== '' && !iconEmoji.startsWith('http');
        const conditionText = b.condition_rule
          ? b.condition_rule.conditions.map((c) => `${c.metric} ${c.op} ${c.value}`).join(` ${b.condition_rule.operator} `)
          : b.condition_type ? `${b.condition_type} ≥ ${b.condition_value}` : '';
        return (
          <div className={styles.modalBackdrop} onClick={() => setActiveBadge(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHero}>
                <div className={styles.modalBadgeIcon}>
                  {iconEmoji === ''
                    ? <Award size={80} color="white" strokeWidth={1.5} />
                    : isEmoji ? iconEmoji : <AppImage src={iconEmoji} alt="" style={{ width: 96, height: 96, objectFit: 'contain' }} />}
                </div>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.modalKey}>{displayName}</div>
                <h2 className={styles.modalDesc}>{displayDesc}</h2>
                {conditionText && (
                  <div className={styles.modalCondition}>
                    <span>{activeBadge.earned ? <Check size={12} strokeWidth={3} /> : <Circle size={9} />}</span>
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

      <ReviewSheet
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        targetId={reviewTarget?.targetId ?? ''}
        listingId={reviewTarget?.listingId}
        onSubmitted={() => { if (user?.id) fetchTrades(user.id).then(setTrades).catch(() => {}); }}
      />
    </div>
  );
}
