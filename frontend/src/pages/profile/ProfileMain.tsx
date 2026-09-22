import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Settings, Building2, Coffee, Moon, BadgeCheck, Smartphone, ChevronRight,
  Route, Flag, Medal, Gem, Trophy, Bike, Store, Plus, Camera, Flame,
  MessageCircle, MoreVertical, ClipboardList,
  UserPlus, AlertCircle, Eye, type LucideIcon,
  Share2, MoreHorizontal,
} from 'lucide-react';
import { useUserStore } from '@/store/useUserStore';
import { DEFAULT_AVATAR_URL } from '@/lib/defaults';
import { useDmStore } from '@/store/useDmStore';
import { fetchTrades, type TradeHistory } from '@/api/market';
import ReviewSheet from '@/components/market/ReviewSheet';
import TradeRow from '@/components/market/TradeRow';
import { SkillTree } from './SkillTree';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useDialogStore } from '@/store/useDialogStore';
import { expToNextLevel } from '@/lib/rewards';
import { formatNumber, formatRelativeTime, splitNumberParts } from '@/lib/format';
import type { FeedPost, UserStats } from '@/api/types';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { Chip } from '@/components/ui/Chip';
import { TrustTierChip } from '@/components/ui/TrustTierChip';
import { StatusBar } from '@/components/layout/StatusBar';
import { fetchMe, fetchUserStats } from '@/api/profile';
import { fetchWallet } from '@/api/wallet';
import { fetchFollowCounts } from '@/api/follows';
import { fetchMyFeed, deleteFeedPost } from '@/api/feed';
import type { FeedPage } from '@/api/feed';
import { fetchBusinessProfiles, fetchBizOwnerReviews, type BusinessProfile } from '@/api/biz';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { toast } from '@/components/ui/Toast';
import { emojiUrl } from '@/lib/emoji';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import styles from './ProfileMain.module.css';
import sys from '@/styles/system.module.css';
import { SHOW_LEGACY_GAME_ECONOMY, SHOW_LIFETIME_DISTANCE } from '@/lib/featureFlags';

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
  const refreshDmUnread = useDmStore((s) => s.refreshUnread);

  const [gp, setGp] = useState(0);
  const [gc, setGc] = useState(0);

  useEffect(() => {
    refreshDmUnread();
  }, [refreshDmUnread]);

  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [tradesError, setTradesError] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ targetId: string; listingId: string } | null>(null);

  // P1-16: 조회 실패를 "거래 0건"으로 위장하지 않고 구분해 재시도를 제공
  const loadTrades = useCallback(() => {
    const uid = user?.id;
    if (!uid) return;
    fetchTrades(uid).then((tr) => { setTrades(tr); setTradesError(false); }).catch(() => setTradesError(true));
  }, [user?.id]);

  useEffect(() => { loadTrades(); }, [loadTrades]);

  useEffect(() => {
    if (!user?.phone) return;
    fetchMe(user.phone).then((dto) => {
      if (dto) loginFromBackend(dto);
    });
    if (SHOW_LEGACY_GAME_ECONOMY) {
      fetchWallet().then((w) => {
        setGp(w.gold_balance);
        setGc(w.xp_balance);
      }).catch(() => {});
    }
  }, []);
  const { t } = useTranslation();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [totalMileage, setTotalMileage] = useState(0);

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
  const [socialActionsOpen, setSocialActionsOpen] = useState(false);

  // W4: 프로필 바텀시트 진입 경로 — 파트너(APPROVED 업체 보유) 여부에 따라 위치·문구를 분기
  // (D-5, ai-docs/task/active/260819_lounge_entry_task.md). 기본값은 비파트너([])로 두어
  // 대다수(비파트너) 사용자에게는 현행 위치 그대로 즉시 노출되고, 파트너로 판명되면 상단 카드로 전환된다.
  // F2-5: APPROVED 판정뿐 아니라 PENDING/REJECTED 신청 여부도 알아야 진입 문구를 상태별로 갈라줄 수 있다
  const [bizProfiles, setBizProfiles] = useState<BusinessProfile[]>([]);
  const [bizLoading, setBizLoading] = useState(true);
  const [bizUnansweredCount, setBizUnansweredCount] = useState<number | null>(null);

  // ── 거래 이력 서브탭 ──
  const [tradeTab, setTradeTab] = useState<'bought' | 'sold'>('bought');

  // ── feeds 탭 상태 ──
  const [myFeeds, setMyFeeds] = useState<FeedPost[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [feedsPage, setFeedsPage] = useState(1);
  const [feedsHasMore, setFeedsHasMore] = useState(true);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const openDialog = useDialogStore((s) => s.open);

  useEffect(() => {
    if (!user?.id) return;
    fetchFollowCounts(user.id).then(setFollowCounts);
    fetchUserStats(user.id).then((s) => {
      setStats(s);
      setTotalMileage(Number(s.lifetime_km));
    }).catch(() => {});
  }, [user?.id]);

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
    if (user?.id && myFeeds.length === 0) {
      loadMyFeeds(1, true);
    }
  }, [user?.id]);

  // W4: 파트너 판정 — BizManage.tsx 가 쓰는 것과 동일한 fetchBusinessProfiles()를 재사용(신규 판정 API 없음)
  useEffect(() => {
    if (!user?.id) return;
    fetchBusinessProfiles()
      .then((list) => { setBizProfiles(list); setBizLoading(false); })
      .catch(() => { setBizProfiles([]); setBizLoading(false); });
  }, [user?.id]);

  // W4: 요약 카드 대표 업체는 기존과 동일하게 첫 번째 승인 업체를 노출
  const activeBizProfile = bizProfiles.find((p) => p.status === 'APPROVED') ?? null;
  const approvedBizProfiles = bizProfiles.filter((p) => p.status === 'APPROVED');
  const [bizPickerOpen, setBizPickerOpen] = useState(false);

  // O-2: 배지 숫자는 보유한 모든 업체(APPROVED)의 미답변 합산 — 단일 업체만 세던 것을 교체
  useEffect(() => {
    if (approvedBizProfiles.length === 0) {
      setBizUnansweredCount(null);
      return;
    }
    let cancelled = false;
    Promise.all(approvedBizProfiles.map((p) => fetchBizOwnerReviews(p.id, { limit: 1 })))
      .then((results) => {
        if (cancelled) return;
        setBizUnansweredCount(results.reduce((sum, r) => sum + r.unansweredCount, 0));
      })
      .catch(() => { if (!cancelled) setBizUnansweredCount(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizProfiles]);

  // O-2: 업체가 2개 이상이면 라운지 이동 전 선택 단계를 거친다 (1개면 바로 이동)
  const openBizLounge = () => {
    if (approvedBizProfiles.length > 1) {
      setBizPickerOpen(true);
    } else {
      navigate('/biz/manage');
    }
  };
  const selectBizLounge = (profileId: string) => {
    setBizPickerOpen(false);
    navigate('/biz/manage', { state: { profileId } });
  };

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
          {SHOW_LEGACY_GAME_ECONOMY && (
            <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)' }}>
              <LevelBadge level={u.level} />
            </div>
          )}
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

        {SHOW_LEGACY_GAME_ECONOMY && (
          <>
            <div className={styles.levelRow}>
              <span className={styles.levelText}>LV.{u.level}</span>
              <span className={styles.levelTextRight}>
                {t('profile.expToNextLevel', { exp: formatNumber(needed), level: u.level + 1 })}
              </span>
            </div>
            <div className={styles.levelBar}>
              <div className={styles.levelBarFill} style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        )}
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
          <button className={styles.socialMoreBtn} onClick={() => setSocialActionsOpen(true)} aria-label={t('common.expand')}>
            <MoreHorizontal size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className={styles.profileActions}>
          <button
            type="button"
            onClick={() => navigate('/market/search?mine=1')}
            className={styles.heroEntryRow}
          >
            <span className={styles.heroEntryIcon}><Bike size={18} /></span>
            <span className={styles.heroEntryLabel}>{t('profile.tabMyListings')}</span>
            <ChevronRight size={18} className={styles.heroEntryChevron} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/trades')}
            className={styles.heroEntryRow}
          >
            <span className={styles.heroEntryIcon}><ClipboardList size={18} /></span>
            <span className={styles.heroEntryLabel}>{t('profile.tradeHistory', { defaultValue: '거래 이력' })}</span>
            <ChevronRight size={18} className={styles.heroEntryChevron} />
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
        {/* SGR-330: 휴대폰 인증 신뢰 카드 — 판매자 신뢰도 트리거. FR-2 제안 ①: 인증 완료 후에는
            여기 카드 자리를 비우고(진행 성격이 없어졌으므로), 완료 표시는 시트 하단 진입 행으로 격하한다. */}
        {!u.phoneVerified && (
          <button
            type="button"
            onClick={() => navigate('/auth/phone-verify')}
            className={styles.verifyCard}
          >
            <span className={styles.verifyIcon}>
              <Smartphone size={20} />
            </span>
            <span className={styles.verifyText}>
              <span className={styles.verifyTitle}>{t('profile.phoneVerifyNeeded')}</span>
              <span className={styles.verifySub}>{t('profile.phoneVerifyNeededSub')}</span>
            </span>
            <ChevronRight size={18} className={styles.verifyChevron} />
          </button>
        )}

        {/* W4: 파트너(APPROVED 업체 보유) 요약 카드 — 휴대폰 인증 바로 아래로 승격 (D-5) */}
        {bizLoading && bizProfiles.length === 0 ? (
          <div className={styles.verifyCard} style={{ cursor: 'default', opacity: 0.6 }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }} className={sys.skelBar} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className={`${sys.skelBar} ${sys.skelBarWide}`} />
              <div className={`${sys.skelBar} ${sys.skelBarNarrow}`} />
            </div>
            <div style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0 }} className={sys.skelBar} />
          </div>
        ) : activeBizProfile && (
          <button
            type="button"
            onClick={openBizLounge}
            className={styles.verifyCard}
          >
            <span className={styles.verifyIcon}><Store size={20} /></span>
            <span className={styles.verifyText}>
              <span className={styles.verifyTitle}>
                {activeBizProfile.name}
                {!!bizUnansweredCount && bizUnansweredCount > 0 && (
                  <span className={styles.loungeBadge}>
                    {bizUnansweredCount > 99 ? '99+' : bizUnansweredCount}
                  </span>
                )}
              </span>
              <span className={styles.verifySub}>{t('biz.loungeCardSubtitle', { defaultValue: '파트너 라운지 관리' })}</span>
            </span>
            <ChevronRight size={18} className={styles.verifyChevron} />
          </button>
        )}

        {SHOW_LEGACY_GAME_ECONOMY && <div className={styles.currencyBento}>
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
        </div>}

        {/* SGR-209 A4: 스킬 트리 — SGR-287 마켓 피벗으로 임시 숨김(코드 보존) */}
        <div style={{ display: 'none' }}>
          <SkillTree />
        </div>

        {/* Odometer Card */}
        {SHOW_LIFETIME_DISTANCE && (() => {
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

        {/* 다른 사람에게 보이는 내 프로필 — 공개 프로필 페이지(/profile/:userId)를 내 id 로 연다.
            이 화면은 자기관리 화면이라 공개 구성(활동·거래 정보·판매 매물)을 여기에 겹쳐 넣지 않고,
            남이 보는 그 페이지로 보내 "보이는 그대로" 를 확인시킨다 (2026-09-10, 대표 요청). */}
        <button
          type="button"
          onClick={() => navigate(`/profile/${u.id}`)}
          className={styles.entryRow}
        >
          <span className={styles.entryIcon}><Eye size={18} /></span>
          <span className={styles.entryLabel}>{t('profile.viewAsOthers')}</span>
          <ChevronRight size={18} className={styles.entryChevron} />
        </button>

        {/* SGR-312: 비즈니스 파트너 진입 (상태 분기는 /biz/status 화면이 처리) —
            W4: 파트너(APPROVED 업체 보유)는 위 요약 카드로 승격되므로 여기서는 미가입자에게만 노출 (D-5) */}
        {!activeBizProfile && (
          <button
            type="button"
            onClick={() => navigate('/biz/status')}
            className={`${styles.entryRow} ${styles.entryRowSpaced}`}
          >
            <span className={styles.entryIcon}><Store size={18} /></span>
            <span className={styles.entryLabel}>
              {/* F2-5: PENDING/REJECTED 신청자에게 "시작하기"(처음부터 다시)로 안내하지 않도록
                  신청 이력이 있으면 중립 라벨(biz.menuEntry)로, 미신청자에게만 초대 문구를 보여준다.
                  실제 상태 분기(REJECTED 재신청 등)는 이동 대상 /biz/status 가 처리한다(D-5). */}
              {bizProfiles.length > 0
                ? t('biz.menuEntry', { defaultValue: '비즈니스 파트너' })
                : t('biz.menuEntryInvite', { defaultValue: '비즈니스 파트너 시작하기' })}
            </span>
            <ChevronRight size={18} className={styles.entryChevron} />
          </button>
        )}

        {/* FR-2 제안 ①: 인증 완료 후에는 카드가 아니라 진입 행 형식으로 시트 하단에 격하 */}
        {u.phoneVerified && (
          <div className={styles.entryRow} style={{ cursor: 'default' }}>
            <span className={styles.entryIcon}><BadgeCheck size={18} /></span>
            <span className={styles.entryLabel}>{t('profile.phoneVerifyDone')}</span>
          </div>
        )}

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
          {tradesError ? (
            <StateBlock
              icon={AlertCircle}
              tone="error"
              title={t('profile.tradesLoadError', { defaultValue: '거래 이력을 불러오지 못했어요' })}
              actionLabel={t('common.retry')}
              onAction={loadTrades}
            />
          ) : (() => {
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
                  onOpen={() => navigate(`/dm/${tr.conversationId}`)}
                  onReview={() => setReviewTarget({ targetId: tr.counterpartId, listingId: tr.listingId })}
                />
              ))
            );
          })()}
        </div>

        {/* SGR-287: 피드/이력/뱃지 탭 제거 — 피드만 노출(피드 영역 라벨) */}
        <h3 className={styles.feedSectionLabel}>{t('profile.tabFeeds')}</h3>

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
                  <div
                    key={p.id}
                    className={styles.feedCard}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/feed/post/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/feed/post/${p.id}`);
                      }
                    }}
                  >
                    {p.photoUrls.length > 0 && (
                      <ImageCarousel
                        urls={p.photoUrls}
                        onImageClick={() => navigate(`/feed/post/${p.id}`)}
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
                      onClick={(e) => { e.stopPropagation(); setMenuPostId(menuPostId === p.id ? null : p.id); }}
                    >
                      <MoreVertical size={18} />
                    </button>
                    {menuPostId === p.id && (
                      <div className={styles.feedCardDropdown} onClick={(e) => e.stopPropagation()}>
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
        </div>{/* sheetBody */}
      </div>{/* sheet */}

      {/* FR-1 제안 ②: 공유(QR)·친구추가는 소셜축이라 거래 진입과 같은 행에 두지 않고 접힘 액션 열로 격하 */}
      <BottomSheet open={socialActionsOpen} onClose={() => setSocialActionsOpen(false)}>
        <div className={styles.qrSheet}>
          <button
            type="button"
            className={styles.collapsedActionRow}
            onClick={() => { setSocialActionsOpen(false); setQrSheetOpen(true); }}
          >
            <Share2 size={16} strokeWidth={2.2} />
            {t('profile.share')}
          </button>
          <button
            type="button"
            className={styles.collapsedActionRow}
            onClick={() => { setSocialActionsOpen(false); navigate('/friends/add'); }}
          >
            <UserPlus size={16} strokeWidth={2.2} />
            {t('follow.addFriend')}
          </button>
        </div>
      </BottomSheet>

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
                src: u.avatarUrl || DEFAULT_AVATAR_URL,
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

      {/* O-2: 다중 업체 보유 시 라운지 이동 전 업체 선택 */}
      <BottomSheet open={bizPickerOpen} onClose={() => setBizPickerOpen(false)}>
        <div className={styles.qrSheet}>
          <h3 className={styles.qrTitle}>{t('biz.loungePickerTitle', { defaultValue: '어느 업체로 이동할까요?' })}</h3>
          {approvedBizProfiles.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.verifyCard}
              onClick={() => selectBizLounge(p.id)}
            >
              <span className={styles.verifyIcon}><Store size={20} /></span>
              <span className={styles.verifyText}>
                <span className={styles.verifyTitle}>{p.name}</span>
              </span>
              <ChevronRight size={18} className={styles.verifyChevron} />
            </button>
          ))}
        </div>
      </BottomSheet>

      <ReviewSheet
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        targetId={reviewTarget?.targetId ?? ''}
        listingId={reviewTarget?.listingId}
        onSubmitted={loadTrades}
      />
    </div>
  );
}
