import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { useUserStore } from '@/store/useUserStore';
import { MOCK_BADGES } from '@/data/feed';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useDialogStore } from '@/store/useDialogStore';
import { expToNextLevel } from '@/lib/rewards';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import type { Badge, FeedPost } from '@/api/types';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { Chip } from '@/components/ui/Chip';
import { StatusBar } from '@/components/layout/StatusBar';
import { fetchMe } from '@/api/profile';
import { fetchFollowCounts } from '@/api/follows';
import { fetchMyFeed, deleteFeedPost } from '@/api/feed';
import type { FeedPage } from '@/api/feed';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { ImageViewer } from '@/pages/feed/FeedList';
import { toast } from '@/components/ui/Toast';
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
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.phone) return;
    fetchMe(user.phone).then((dto) => {
      if (dto) loginFromBackend(dto);
    });
  }, []);
  const { t } = useTranslation();

  const [tab, setTab] = useState<'feeds' | 'history' | 'badges' | 'gear'>('feeds');
  const [activeBadge, setActiveBadge] = useState<Badge | null>(null);

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
                    {feedsLoading ? t('common.loading') : '더 보기'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

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
      </div>{/* sheet */}

      {viewerState && (
        <ImageViewer
          srcs={viewerState.srcs}
          initialIndex={viewerState.index}
          onClose={() => setViewerState(null)}
        />
      )}

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


      <BottomSheet open={qrSheetOpen} onClose={() => setQrSheetOpen(false)}>
        <div className={styles.qrSheet}>
          <h3 className={styles.qrTitle}>{t('profile.share', '프로필 공유')}</h3>
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
          <p className={styles.qrGuide}>{t('profile.shareGuide', '이 QR코드를 스캔하면 프로필을 볼 수 있어요')}</p>
        </div>
      </BottomSheet>
    </div>
  );
}
