import { BrowserRouter, Routes, Route, Navigate, useLocation, type Location } from 'react-router-dom';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { WalkieTalkieFloatingButton } from '@/components/dm/WalkieTalkieFloatingButton';
import { useUserStore } from '@/store/useUserStore';
import { useLocationStore } from '@/store/useLocationStore';
import { preloadRideMapStyle } from '@/lib/rideMapPreload';
import { useDmStore } from '@/store/useDmStore';
import { changeLang } from '@/lib/i18n';
import { loadSession, saveSession, clearSession } from '@/lib/session';
import { bootstrapSession, leaveBootstrapForLogin } from '@/lib/sessionBootstrap';
import { apiSessionVerify, apiDevLoginAs } from '@/api/auth';
import { emojiUrl } from '@/lib/emoji';
import { setSessionExpiredHandler, SessionExpiredError, setAccountRestrictedHandler, AccountRestrictedError } from '@/api/client';
import { native } from '@/lib/native';
import { registerLiveActivityPushToken } from '@/lib/liveActivityPush';
import { fetchAppConfig, fetchCurrentVersion, shouldForceUpdate, pickPlatformVersion } from '@/api/appVersion';
import { useProximityAlerts } from '@/hooks/useProximityAlerts';
import PrivateRoute from '@/components/auth/PrivateRoute';
import VerifiedSellerRoute from '@/components/auth/VerifiedSellerRoute';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { captureAcqRefFromUrl, captureUtmFirstTouchFromUrl } from '@/lib/acquisition';
import { useScreenTracking } from '@/hooks/useScreenTracking';

// Auth
import Splash from '@/pages/auth/Splash';
import OAuthLogin from '@/pages/auth/OAuthLogin';
import OAuthResult from '@/pages/auth/OAuthResult';
import AccountRestore from '@/pages/auth/AccountRestore';
import ProfileSetup from '@/pages/auth/ProfileSetup';
import PhoneVerify from '@/pages/auth/PhoneVerify';
import Suspended from '@/pages/auth/Suspended';

// Home — 로그인 후 첫 화면(부트스트랩 직후 진입)이라 eager 유지
import HomePage from '@/pages/home/HomePage';

// 동네지도 (RideNav 지도 재사용) — P2-1 우선순위 1: lazy (maplibre-gl 포함, 첫 화면 아님)
const NeighborhoodMap = lazyWithRetry(() => import('@/pages/map/NeighborhoodMap'));
const MapSearch = lazyWithRetry(() => import('@/pages/map/MapSearch'));
const NeighborhoodProfile = lazyWithRetry(() => import('@/pages/map/NeighborhoodProfile'));
const MapFavorites = lazyWithRetry(() => import('@/pages/map/MapFavorites'));
const MapFollows = lazyWithRetry(() => import('@/pages/map/MapFollows'));
const NeighborhoodCategories = lazyWithRetry(() => import('@/pages/map/NeighborhoodCategories'));

// Market (오토바이 라이더 거래 — 퀘스트 탭 자리 신규 엔트리)
const MarketMain = lazyWithRetry(() => import('@/pages/market/MarketMain'));
const MarketCreate = lazyWithRetry(() => import('@/pages/market/MarketCreate'));
const MarketEdit = lazyWithRetry(() => import('@/pages/market/MarketEdit'));
const MarketDetail = lazyWithRetry(() => import('@/pages/market/MarketDetail'));
const MarketWishlist = lazyWithRetry(() => import('@/pages/market/MarketWishlist'));
const MarketKeywordAlerts = lazyWithRetry(() => import('@/pages/market/MarketKeywordAlerts'));
const MarketSearch = lazyWithRetry(() => import('@/pages/market/MarketSearch'));
const AdDetail = lazyWithRetry(() => import('@/pages/market/AdDetail'));

// Biz (비즈니스 파트너, SGR-312 BP-2) — P2-1 우선순위 3: lazy (업체 관리)
const BizIntro = lazyWithRetry(() => import('@/pages/biz/BizIntro'));
const BizApply = lazyWithRetry(() => import('@/pages/biz/BizApply'));
const BizStatus = lazyWithRetry(() => import('@/pages/biz/BizStatus'));
const BizManage = lazyWithRetry(() => import('@/pages/biz/BizManage'));
const BizVerification = lazyWithRetry(() => import('@/pages/biz/BizVerification'));
const BizAdsNew = lazyWithRetry(() => import('@/pages/biz/BizAdsNew'));
const BizAdDetail = lazyWithRetry(() => import('@/pages/biz/BizAdDetail'));
const BizPublic = lazyWithRetry(() => import('@/pages/biz/BizPublic'));
const BizNewsCreate = lazyWithRetry(() => import('@/pages/biz/BizNewsCreate'));
const BizNewsDetail = lazyWithRetry(() => import('@/pages/biz/BizNewsDetail'));
const BizNewsManage = lazyWithRetry(() => import('@/pages/biz/BizNewsManage'));
const BizPriceManage = lazyWithRetry(() => import('@/pages/biz/BizPriceManage'));

// Quest
const QuestList = lazyWithRetry(() => import('@/pages/quest/QuestList'));
const QuestDetail = lazyWithRetry(() => import('@/pages/quest/QuestDetail'));
const QuestCheckPage = lazyWithRetry(() => import('@/pages/quest/QuestCheckPage'));

// Ride
const RideResultSuccess = lazyWithRetry(() => import('@/pages/ride/RideResultSuccess'));
const RideResultFail = lazyWithRetry(() => import('@/pages/ride/RideResultFail'));

// Feed
const FeedList = lazyWithRetry(() => import('@/pages/feed/FeedList'));
const FeedCreate = lazyWithRetry(() => import('@/pages/feed/FeedCreate'));
const FeedEdit = lazyWithRetry(() => import('@/pages/feed/FeedEdit'));
const FeedDetail = lazyWithRetry(() => import('@/pages/feed/FeedDetail'));

// DM
const DmList = lazyWithRetry(() => import('@/pages/dm/DmList'));
const DmDetail = lazyWithRetry(() => import('@/pages/dm/DmDetail'));
const DmGroupCreate = lazyWithRetry(() => import('@/pages/dm/DmGroupCreate'));
const DmBoard = lazyWithRetry(() => import('@/pages/dm/DmBoard'));
const DmBoardCompose = lazyWithRetry(() => import('@/pages/dm/DmBoardCompose'));
const DmBoardPost = lazyWithRetry(() => import('@/pages/dm/DmBoardPost'));

// 커뮤니티 그룹 (260827 Phase2)
const GroupList = lazyWithRetry(() => import('@/pages/community/GroupList'));
const GroupCreate = lazyWithRetry(() => import('@/pages/community/GroupCreate'));
const GroupDetail = lazyWithRetry(() => import('@/pages/community/GroupDetail'));

// 알림함
const NotificationInbox = lazyWithRetry(() => import('@/pages/notifications/NotificationInbox'));

// Profile
const ProfileMain = lazyWithRetry(() => import('@/pages/profile/ProfileMain'));
const UserProfile = lazyWithRetry(() => import('@/pages/profile/UserProfile'));
const TradeHistory = lazyWithRetry(() => import('@/pages/profile/TradeHistory'));
const FollowerList = lazyWithRetry(() => import('@/pages/profile/FollowerList'));
const FollowingList = lazyWithRetry(() => import('@/pages/profile/FollowingList'));
const FriendList = lazyWithRetry(() => import('@/pages/profile/FriendList'));
const FriendAdd = lazyWithRetry(() => import('@/pages/profile/FriendAdd'));

// Gacha
// [게이미피케이션 잠정보류 — 재개 시 주석 해제]
// import GachaMain from '@/pages/gacha/GachaMain';
// import GachaPull from '@/pages/gacha/GachaPull';

// Shop
// [게이미피케이션 잠정보류 — 재개 시 주석 해제]
// import ShopCatalog from '@/pages/shop/ShopCatalog';
// import ItemDetail from '@/pages/shop/ItemDetail';
// import CouponShop from '@/pages/shop/CouponShop';

// Inventory
// [게이미피케이션 잠정보류 — 재개 시 주석 해제]
// import Inventory from '@/pages/inventory/Inventory';
// import EquipPreview from '@/pages/inventory/EquipPreview';

// Season
// [게이미피케이션 잠정보류 — 재개 시 주석 해제]
// import SeasonPass from '@/pages/season/SeasonPass';

// Settings
const Settings = lazyWithRetry(() => import('@/pages/settings/Settings'));
const NotiSettings = lazyWithRetry(() => import('@/pages/settings/NotiSettings'));
const LangSettings = lazyWithRetry(() => import('@/pages/settings/LangSettings'));
const AccountSettings = lazyWithRetry(() => import('@/pages/settings/AccountSettings'));
const BlockedUsers = lazyWithRetry(() => import('@/pages/settings/BlockedUsers'));
const ProfileEdit = lazyWithRetry(() => import('@/pages/settings/ProfileEdit'));
const CustomerSupport = lazyWithRetry(() => import('@/pages/settings/CustomerSupport'));
const SupportDetail = lazyWithRetry(() => import('@/pages/settings/SupportDetail'));
const PrivacyPolicy = lazyWithRetry(() => import('@/pages/settings/PrivacyPolicy'));
const TermsOfService = lazyWithRetry(() => import('@/pages/settings/TermsOfService'));

// Notices / FAQ
const NoticeList = lazyWithRetry(() => import('@/pages/notices/NoticeList'));
const NoticeDetail = lazyWithRetry(() => import('@/pages/notices/NoticeDetail'));
const FaqList = lazyWithRetry(() => import('@/pages/faq/FaqList'));

// Guide
const SafeTradeGuide = lazyWithRetry(() => import('@/pages/guide/SafeTradeGuide'));

// Info
const InfoHub = lazyWithRetry(() => import('@/pages/info/InfoHub'));
const InfoWeather = lazyWithRetry(() => import('@/pages/info/InfoWeather'));
const InfoFloodMap = lazyWithRetry(() => import('@/pages/info/InfoFloodMap'));
const InfoFloodReport = lazyWithRetry(() => import('@/pages/info/InfoFloodReport'));
const InfoGasList = lazyWithRetry(() => import('@/pages/info/InfoGasList'));
const InfoRepairList = lazyWithRetry(() => import('@/pages/info/InfoRepairList'));
const InfoRepairDetail = lazyWithRetry(() => import('@/pages/info/InfoRepairDetail'));
const InfoRepairWrite = lazyWithRetry(() => import('@/pages/info/InfoRepairWrite'));
const InfoRepairReviews = lazyWithRetry(() => import('@/pages/info/InfoRepairReviews'));
// RideNav 도 지도(SaigonMapV5/maplibre-gl) 를 그린다 — 우선순위 1(지도) 대상
const RideNav = lazyWithRetry(() => import('@/pages/ride/RideNav'));

// Deep link — LinkRouter 는 첫 화면 목록(/splash·/auth/*·/home)에 없어 lazy.
// NotificationBridge 는 항상 마운트되는 전역 브리지라 eager 유지.
const LinkRouter = lazyWithRetry(() => import('@/pages/link/LinkRouter'));
import NotificationBridge from '@/pages/link/NotificationBridge';

// Error
const NotFound = lazyWithRetry(() => import('@/pages/error/NotFound'));

import styles from './App.module.css';

/**
 * 라우트-모달 (2026-07-12): 동네지도에서 상세 진입 시 navigate state 로 backgroundLocation
 * 을 실어 보내면, 배경 라우트(지도)를 그대로 유지한 채 상세 3종(업체/매물/피드)을 전체화면
 * 오버레이 레이어로 얹는다. URL 은 실제 상세 경로 — 딥링크/공유/하드웨어 뒤로가기 모두 정상.
 * backgroundLocation 없는 진입(마켓 리스트·커뮤니티·딥링크 등)은 기존 페이지 이동 그대로.
 */
// P2-1: 라우트 lazy 전환 후 청크 로딩 대기 중 보여줄 최소 fallback. 화면 전환마다
// 깜빡이지 않도록 BackgroundRoutes 전체를 감싸는 Suspense 하나만 둔다 — 이미 로드된
// 청크로의 이동은 재서스펜드되지 않으므로, 최초로 그 라우트에 진입할 때만 잠깐 보인다.
function RouteFallback() {
  const { t } = useTranslation();
  return <div className={styles.routeLoading}>{t('common.loading')}</div>;
}

function BackgroundRoutes({ children }: { children: ReactNode }) {
  const location = useLocation();
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes location={backgroundLocation ?? location}>{children}</Routes>
      {backgroundLocation && (
        <div className={styles.detailOverlay}>
          <Routes>
            <Route path="/biz/:id" element={<BizPublic />} />
            <Route path="/market/:id" element={<MarketDetail />} />
            <Route path="/feed/post/:postId" element={<PrivateRoute><FeedDetail /></PrivateRoute>} />
            <Route path="/profile/:userId" element={<PrivateRoute><UserProfile /></PrivateRoute>} />
          </Routes>
        </div>
      )}
    </Suspense>
  );
}

// 퀘스트 카드가 참조하는 인라인 스프라이트 — 전역 마운트하면 모든 화면의 DOM 최상단에
// 게임 아이템 텍스트 수백 자가 주입돼 스크린리더 낭독·번들이 오염된다(P1-1). QuestCard 를
// 실제로 렌더하는 /quests 하위 화면에서만 마운트한다.
// P2-1: 인라인 SVG 3개(rider/season/mythic-sprite, 총 146KB raw)가 메인 번들에 항상
// 포함돼 있었다 — lazy 로 분리해 /quests 진입 전에는 아예 받지 않는다. 화면에 보이지
// 않는 절대위치 0x0 요소라 fallback 은 null(깜빡임 없음).
// [게이미피케이션 잠정보류] SpriteProvider(@/lib/items/SpriteProvider, saigon-rider-items.svg)는
// 가챠/상점/인벤토리(App.tsx 하단 주석 처리된 라우트)에서만 쓰이고 지금은 마운트하는 화면이
// 없어 완전히 제거했다 — 재개 시 해당 라우트 활성화와 함께 그 화면에서만 복원할 것.
const QuestCardSprites = lazyWithRetry(() =>
  import('@/components/quest/QuestCardSprites').then((m) => ({ default: m.QuestCardSprites }))
);
function QuestSprites() {
  const { pathname } = useLocation();
  if (!pathname.startsWith('/quests')) return null;
  return (
    <Suspense fallback={null}>
      <QuestCardSprites />
    </Suspense>
  );
}

// 근접알림 워처 — 앱 전역에서 로그인 후 1회만 마운트한다(260806_proximity_ad_design.md §9-7).
// 특정 화면이 아니라 앱을 켜둔 동안 계속 봐야 하는 관심사다. 킬스위치
// (proximity_policy.is_enabled)는 서버가 candidates 를 빈 배열로 내려 자동 무동작 처리하므로
// 프론트에는 별도 게이트가 없다.
// ⚠️ 반드시 <BrowserRouter> **안**에서 마운트한다 — 이 훅은 광고 토스트 클릭 이동에
// useNavigate 를 쓴다. App() 본문에 두면 <BrowserRouter> 보다 먼저 실행돼 라우터 컨텍스트가
// 없고, react-router invariant 가 던져 앱 전체가 ErrorBoundary 로 떨어진다(회귀 2026-08-10
// ~08-11). QuestSprites 와 같은 이유·같은 형태의 얇은 래퍼다.
function ProximityAlerts({ enabled }: { enabled: boolean }) {
  useProximityAlerts(enabled);
  return null;
}

// 범용 화면 진입 계측 — QuestSprites/ProximityAlerts 와 같은 이유로 <BrowserRouter> 안에서만
// useLocation 을 쓸 수 있는 얇은 래퍼(App() 본문에 두면 라우터 컨텍스트가 없어 invariant 오류).
function ScreenTracking() {
  const { pathname } = useLocation();
  useScreenTracking(pathname);
  return null;
}

// 세션이 없는 게 정상인(=세션 만료 폴백을 돌리면 안 되는) 화면 경로 prefix.
// 새 예외 화면이 생기면 이 배열에만 추가하면 된다.
const SESSION_EXEMPT_PREFIXES = ['/splash', '/auth/oauth', '/auth/restore', '/settings/terms', '/settings/privacy'];

// 비로그인도 볼 수 있는 공개 열람 경로. 세션 만료 시 로그아웃은 하되 화면을 뺏지 않는다 —
// 익명으로 계속 읽을 수 있는 화면이라 스플래시로 밀어낼 이유가 없다. 같은 prefix 의 보호 화면
// (/market/new 등)은 logout() 직후 PrivateRoute 가 스스로 스플래시로 보낸다.
const PUBLIC_BROWSE_PREFIXES = ['/market', '/biz'];

export default function App() {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const logout = useUserStore((s) => s.logout);
  const refreshUnread = useDmStore((s) => s.refreshUnread);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const dmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFade, setSplashFade] = useState(false);
  const [gifReady, setGifReady] = useState(false);
  const bootStartTime = useRef(Date.now());
  // F-19: 강제 업데이트 — 판정 불가/미강제 시 항상 false(차단 안 함). shouldForceUpdate 참조.
  const [forceUpdateBlocked, setForceUpdateBlocked] = useState(false);

  // 세션 만료 전역 핸들러 등록
  useEffect(() => {
    setSessionExpiredHandler(() => {
      // 세션이 없는 게 정상인 화면(스플래시·OAuth 로그인/콜백)에서는 만료 폴백을 돌리지 않는다.
      // 여기서 튕기면 OAuth 왕복(특히 Zalo) 승인 대기가 중단된다. 예외 경로는 SESSION_EXEMPT_PREFIXES 배열에만 추가.
      const p = window.location.pathname;
      if (SESSION_EXEMPT_PREFIXES.some((prefix) => p.startsWith(prefix))) return;
      logout();
      sessionStorage.setItem('session_expired', '1');
      if (PUBLIC_BROWSE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) return;
      window.location.replace('/splash');
    });
  }, [logout]);

  // 정지/밴 계정 전역 핸들러 등록 — 세션은 유지(정지 해제 후 재로그인 불필요), 이미 /suspended 면
  // 재기동 시 재확인 호출이 다시 403을 내도 리로드를 반복하지 않도록 가드.
  useEffect(() => {
    setAccountRestrictedHandler((code, until) => {
      sessionStorage.setItem('account_restricted', JSON.stringify({ code, until }));
      if (window.location.pathname !== '/suspended') window.location.replace('/suspended');
    });
  }, []);

  // unhandled promise rejection에서 SessionExpiredError/AccountRestrictedError 무시 (이미 리다이렉트 처리됨)
  useEffect(() => {
    function onUnhandled(e: PromiseRejectionEvent) {
      if (e.reason instanceof SessionExpiredError || e.reason instanceof AccountRestrictedError) e.preventDefault();
    }
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => window.removeEventListener('unhandledrejection', onUnhandled);
  }, []);

  // 네이티브 컨테이너 배경을 현재 테마 배경(--bg)에 맞춘다 — iOS 에서 키보드로 웹뷰가
  // 리사이즈될 때 노출되는 영역이 검게 보이는 것 방지 (초기 1회 보장; 테마 토글은 useThemeStore).
  useEffect(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) native.setBackgroundColor(bg);
    // iOS 키보드 accessory bar(^ v Done)는 앱 전역에서 사용하지 않는다. iOS 외 no-op.
    native.setAccessoryBarVisible(false);
  }, []);

  // Live Activity 푸시토큰 → BFF 등록 (ai-docs/task/active/260829_live_activity_task.md Phase 3 배선 #12).
  // 토큰은 Activity 생성 직후·수명 중 갱신 시 iOS 가 밀어주므로 화면과 무관하게 앱 루트에서 한 번 구독한다.
  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    let cancelled = false;
    void native.liveActivity.onPushToken((e) => { void registerLiveActivityPushToken(e); }).then((h) => {
      if (cancelled) h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  // iOS 순수 오버레이 키보드는 시스템의 scroll-to-focused-input 팬을 네이티브에서 억제하므로,
  // "포커스된 입력이 키보드에 가리면 보이게 스크롤"은 전역으로 프론트가 대신한다.
  // 이미 자체 보정(스페이서/시트 리프트)이 있는 화면은 겹침이 없어 no-op.
  useEffect(() => {
    if (native.platform !== 'ios') return;
    let kbHeight = 0;
    let kbVisible = false;
    const timers: number[] = [];
    const clearTimers = () => { while (timers.length) window.clearTimeout(timers.pop()); };

    const revealFocused = () => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement)) return;
      if (!el.matches('input, textarea, select, [contenteditable="true"]')) return;
      const limit = window.innerHeight - kbHeight - 16;
      const delta = el.getBoundingClientRect().bottom - limit;
      if (delta <= 0) return;
      // 가장 가까운 스크롤 가능한 조상만 스크롤 (body 스크롤은 이 앱에 없음)
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        const oy = getComputedStyle(p).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) break;
        p = p.parentElement;
      }
      p?.scrollBy({ top: delta, behavior: 'smooth' });
    };

    // 키보드 높이 보정 padding 이 React 렌더로 반영된 뒤에 스크롤해야 공간이 있다 —
    // 렌더 직후(80ms)와 키보드 애니메이션 종료 후(320ms) 두 번 시도(둘 다 멱등).
    const schedule = () => {
      clearTimers();
      timers.push(window.setTimeout(revealFocused, 80), window.setTimeout(revealFocused, 320));
    };

    const off = native.onKeyboardChange(({ visible, height }) => {
      kbVisible = visible;
      kbHeight = height;
      if (visible) schedule(); else clearTimers();
    });
    // 키보드가 떠 있는 채로 다른 입력으로 포커스 이동 시엔 키보드 이벤트가 다시 오지 않는다.
    const onFocusIn = () => { if (kbVisible) schedule(); };
    document.addEventListener('focusin', onFocusIn);
    return () => {
      clearTimers();
      off();
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);

  // 인증된 경우 DM 미읽음 폴링 시작
  useEffect(() => {
    if (!user) {
      if (dmIntervalRef.current) { clearInterval(dmIntervalRef.current); dmIntervalRef.current = null; }
      return;
    }
    refreshUnread();
    fetchAppConfig().then((cfg) => {
      if (dmIntervalRef.current) clearInterval(dmIntervalRef.current);
      dmIntervalRef.current = setInterval(refreshUnread, cfg.dmPollInterval * 1000);
    });
    return () => {
      if (dmIntervalRef.current) { clearInterval(dmIntervalRef.current); dmIntervalRef.current = null; }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // GIF 백그라운드 프리로드
  useEffect(() => {
    const img = new Image();
    img.onload = () => setGifReady(true);
    img.src = emojiUrl('1f3cd');
  }, []);

  // 경로안내 지도(MapLibre) 스타일 프리로드 — '경로' 진입 시 빈 화면 구간을 줄인다.
  // 한가할 때 1회, 실패해도 무시(표시 전용 최적화).
  useEffect(() => { preloadRideMapStyle(); }, []);

  // 이동 추종 — 앱 전역에서 딱 한 번 워처를 건다(대표 지적 2026-08-06: "페이지이동을 하지
  // 않으면 위치가 반영되지 않는다"). 화면마다 걸면 워처가 중복되므로 여기서만 호출한다.
  // 'gps' 모드가 아닐 땐 스토어가 no-op 을 돌려주고, 모드가 바뀌면 다시 건다.
  const startWatching = useLocationStore((s) => s.startWatching);
  const locationMode = useLocationStore((s) => s.mode);
  const locationCoords = useLocationStore((s) => s.coords);
  // ⚠️ **좌표가 확정된 뒤에만** 건다. watchLocation 은 곧바로 OS 권한창을 띄우므로, 마운트
  // 즉시 걸면 useLocationStore 의 프리프롬프트(목적 안내)를 앞질러 버린다 — 그 다이얼로그가
  // 존재하는 이유(맥락 없는 권한창 = 반사적 거부) 자체가 무너진다. 로그인 전 인증 화면에서
  // 권한창이 뜨던 문제도 같은 원인이다. coords 는 ensureLocation 이 성공해야 채워진다.
  useEffect(() => {
    if (locationMode !== 'gps' || !locationCoords) return;
    return startWatching();
  }, [startWatching, locationMode, locationCoords]);

  // 앱 기동 시: 쿠키 세션 → 자동 로그인 시도
  useEffect(() => {
    if (user?.language) changeLang(user.language);

    let active = true;
    setBootstrapError(false);

    // 유입 귀속(016 §6-2 #30) — ?ref= 를 최초 1회만 캡처(first-touch). dev_login 분기보다
    // 먼저 둬서, 아래에서 URL 을 정리(replaceState)해도 ref 는 이미 저장된 뒤다.
    captureAcqRefFromUrl();
    // 딥링크 UTM first-touch(C6) — 같은 이유로 URL 정리 전에 먼저 관측한다.
    captureUtmFirstTouchFromUrl();

    // 개발 서버 전용 OAuth 우회 로그인 — ?dev_login=<uuid> 가 붙어 있으면 그 계정으로
    // 즉시 세션을 발급받는다. DEV_HOST 가 아닌 도메인에서는 백엔드가 항상 403을 내려
    // 이 분기는 그대로 실패하고 아래 일반 부트스트랩으로 자연히 이어지지 않으므로,
    // 실패 시에도 에러 화면 대신 일반 로그인 흐름(스플래시)으로 넘어가게 한다.
    const devLoginId = new URLSearchParams(window.location.search).get('dev_login');
    if (devLoginId) {
      window.history.replaceState(null, '', window.location.pathname);
      apiDevLoginAs(devLoginId)
        .then((result) => {
          if (!active) return;
          saveSession({ userId: result.user.id, sessionToken: result.session_token });
          loginFromBackend(result.user);
          sessionStorage.removeItem('account_restricted');
          setBootstrapped(true);
        })
        .catch(() => {
          if (active) setBootstrapped(true);
        });
      return () => { active = false; };
    }

    bootstrapSession({
      session: loadSession(),
      verify: async (userId, sessionToken) => (await apiSessionVerify(userId, sessionToken)).user,
      login: (verifiedUser) => {
        loginFromBackend(verifiedUser);
        sessionStorage.removeItem('account_restricted');
      },
      clear: clearSession,
      logout,
      isExpired: (error) => error instanceof SessionExpiredError,
      isRestricted: (error) => error instanceof AccountRestrictedError,
    }).then((result) => {
      if (!active || result === 'restricted') return;
      if (result === 'retryable-error') setBootstrapError(true);
      else setBootstrapped(true);
    });
    return () => { active = false; };
  }, [bootstrapAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // 부팅 완료 후 최소 1200ms 보장하고 splash fade-out
  useEffect(() => {
    if (!bootstrapped) return;
    const elapsed = Date.now() - bootStartTime.current;
    const delay = Math.max(0, 500 - elapsed);
    const t1 = setTimeout(() => setSplashFade(true), delay);
    const t2 = setTimeout(() => setSplashVisible(false), delay + 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [bootstrapped]);

  // F-19: 강제 업데이트 판정 — 부팅 완료 후 1회, 서버 현재 버전과 설치본 버전을 비교.
  // 판정 불가(웹/설치본 버전 미확인/서버 조회 실패)면 shouldForceUpdate 가 항상 false 를 반환 — fail-open.
  useEffect(() => {
    if (!bootstrapped) return;
    let active = true;
    (async () => {
      try {
        const [{ appVersion }, current] = await Promise.all([native.getDeviceInfo(), fetchCurrentVersion()]);
        const platformInfo = pickPlatformVersion(current);
        if (active) setForceUpdateBlocked(shouldForceUpdate(appVersion, platformInfo));
      } catch {
        // 조회 실패 — 차단하지 않음
      }
    })();
    return () => { active = false; };
  }, [bootstrapped]);

  if (bootstrapped && forceUpdateBlocked) {
    return (
      <div className={styles.forceUpdateBlock} role="alert">
        <span className={styles.forceUpdateEmoji} aria-hidden="true">🔄</span>
        <h1 className={styles.forceUpdateTitle}>{t('forceUpdate.title', { defaultValue: '업데이트가 필요해요' })}</h1>
        <p className={styles.forceUpdateBody}>
          {t('forceUpdate.body', { defaultValue: '새 버전이 있어요. 앱스토어에서 최신 버전으로 업데이트한 뒤 다시 실행해주세요.' })}
        </p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <NotificationBridge />
      <ProximityAlerts enabled={!!user} />
      <ScreenTracking />
      <QuestSprites />
      <Toaster
        position="top-center"
        gap={6}
        visibleToasts={3}
        offset={{ top: 'calc(var(--status-bar-height) + 12px)' }}
      />
      <Dialog />
      <ConfirmDialog />
      {/* 워키토키 플로팅 버블 (A-7) — 대표 지시 2026-08-27: DM 화면을 떠나도 유지되도록 앱 전역 렌더.
          대상 대화·닫힘 상태는 useWalkieTalkieBubbleStore 구독, activeConversationId 가 없으면 내부에서 렌더 스킵. */}
      <WalkieTalkieFloatingButton />
      <AppShell
        isAuthenticated={!!user}
        splashVisible={splashVisible}
        splashFade={splashFade}
        gifReady={gifReady}
        bootstrapError={bootstrapError}
        onBootstrapRetry={() => setBootstrapAttempt((attempt) => attempt + 1)}
        onBootstrapLogin={() => {
          leaveBootstrapForLogin(clearSession, logout, () => window.location.replace('/auth/oauth'));
        }}
      >
        {bootstrapped && <BackgroundRoutes>
          {/* default */}
          <Route path="/" element={<Navigate to="/splash" replace />} />

          {/* Auth flow (public) */}
          <Route path="/splash" element={<Splash />} />
          <Route path="/auth/oauth" element={<OAuthLogin />} />
          <Route path="/auth/oauth-result" element={<OAuthResult />} />
          {/* 탈퇴 계정 복구 안내 — 로그인 409(account_deleted) 에서 라우팅 (세션 없음이 정상) */}
          <Route path="/auth/restore" element={<AccountRestore />} />
          <Route path="/auth/profile-setup" element={<ProfileSetup />} />
          <Route path="/auth/phone-verify" element={<PhoneVerify />} />
          {/* 정지/밴 안내 — PrivateRoute 로 감싸지 않는다: 밴 유저는 최초 로그인부터 isAuthenticated 가 없을 수 있음 */}
          <Route path="/suspended" element={<Suspended />} />

          {/* Deep link entry (auth-aware inside) */}
          <Route path="/link" element={<LinkRouter />} />

          {/* Public read surfaces */}
          <Route path="/market" element={<MarketMain />} />
          <Route path="/market/search" element={<MarketSearch />} />
          <Route path="/market/:id" element={<MarketDetail />} />
          <Route path="/biz/:id" element={<BizPublic />} />

          {/* Protected: Main */}
          <Route path="/home" element={<PrivateRoute><HomePage /></PrivateRoute>} />
          <Route path="/map" element={<PrivateRoute><NeighborhoodMap /></PrivateRoute>} />
          <Route path="/map/search" element={<PrivateRoute><MapSearch /></PrivateRoute>} />
          <Route path="/map/profile" element={<PrivateRoute><NeighborhoodProfile /></PrivateRoute>} />
          <Route path="/map/favorites" element={<PrivateRoute><MapFavorites /></PrivateRoute>} />
          <Route path="/map/follows" element={<PrivateRoute><MapFollows /></PrivateRoute>} />
          <Route path="/map/categories" element={<PrivateRoute><NeighborhoodCategories /></PrivateRoute>} />
          <Route path="/market/ad/:id" element={<PrivateRoute><AdDetail /></PrivateRoute>} />
          <Route path="/market/new" element={<VerifiedSellerRoute><MarketCreate /></VerifiedSellerRoute>} />
          <Route path="/market/wishlist" element={<PrivateRoute><MarketWishlist /></PrivateRoute>} />
          <Route path="/market/keyword-alerts" element={<PrivateRoute><MarketKeywordAlerts /></PrivateRoute>} />
          <Route path="/market/:id/edit" element={<PrivateRoute><MarketEdit /></PrivateRoute>} />
          <Route path="/biz/intro" element={<PrivateRoute><BizIntro /></PrivateRoute>} />
          <Route path="/biz/apply" element={<PrivateRoute><BizApply /></PrivateRoute>} />
          <Route path="/biz/status" element={<PrivateRoute><BizStatus /></PrivateRoute>} />
          <Route path="/biz/manage" element={<PrivateRoute><BizManage /></PrivateRoute>} />
          <Route path="/biz/verification" element={<PrivateRoute><BizVerification /></PrivateRoute>} />
          <Route path="/biz/ads/new" element={<PrivateRoute><BizAdsNew /></PrivateRoute>} />
          <Route path="/biz/ads/:id" element={<PrivateRoute><BizAdDetail /></PrivateRoute>} />
          <Route path="/biz/news" element={<PrivateRoute><BizNewsManage /></PrivateRoute>} />
          <Route path="/biz/news/new" element={<PrivateRoute><BizNewsCreate /></PrivateRoute>} />
          <Route path="/biz/news/:id" element={<PrivateRoute><BizNewsDetail /></PrivateRoute>} />
          {/* T-1: 업체 프로필 → 매물 등록 — 검증된 업체 프로필 명의라 개인 휴대폰 인증 게이트(VerifiedSellerRoute) 불필요 */}
          <Route path="/biz/listings/new" element={<PrivateRoute><MarketCreate /></PrivateRoute>} />
          <Route path="/biz/prices" element={<PrivateRoute><BizPriceManage /></PrivateRoute>} />
          {/* 퀘스트: 하단 네비 비활성(메뉴 제거). 라우트는 딥링크·직접접근용 보존 */}
          <Route path="/quests" element={<PrivateRoute><QuestList /></PrivateRoute>} />
          <Route path="/quests/:id" element={<PrivateRoute><QuestDetail /></PrivateRoute>} />
          <Route path="/quest-check/:userQuestId" element={<PrivateRoute><QuestCheckPage /></PrivateRoute>} />
          <Route path="/feed" element={<PrivateRoute><FeedList /></PrivateRoute>} />
          <Route path="/feed/new" element={<PrivateRoute><FeedCreate /></PrivateRoute>} />
          <Route path="/feed/edit/:postId" element={<PrivateRoute><FeedEdit /></PrivateRoute>} />
          <Route path="/feed/post/:postId" element={<PrivateRoute><FeedDetail /></PrivateRoute>} />
          <Route path="/dm" element={<PrivateRoute><DmList /></PrivateRoute>} />
          <Route path="/dm/group/new" element={<PrivateRoute><DmGroupCreate /></PrivateRoute>} />
          {/* 게시판(init/218) — /dm/:id 보다 먼저 둘 필요는 없지만(정적 세그먼트가 우선 매칭),
              읽는 사람이 셋을 한 묶음으로 보도록 상세 라우트 위에 모아둔다. */}
          <Route path="/dm/:conversationId/board" element={<PrivateRoute><DmBoard /></PrivateRoute>} />
          <Route path="/dm/:conversationId/board/new" element={<PrivateRoute><DmBoardCompose /></PrivateRoute>} />
          <Route path="/dm/:conversationId/board/:postId" element={<PrivateRoute><DmBoardPost /></PrivateRoute>} />
          <Route path="/dm/:conversationId" element={<PrivateRoute><DmDetail /></PrivateRoute>} />
          <Route path="/community/groups" element={<PrivateRoute><GroupList /></PrivateRoute>} />
          <Route path="/community/groups/new" element={<PrivateRoute><GroupCreate /></PrivateRoute>} />
          <Route path="/group/:slug" element={<PrivateRoute><GroupDetail /></PrivateRoute>} />
          <Route path="/notifications" element={<PrivateRoute><NotificationInbox /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfileMain /></PrivateRoute>} />
          {/* 다른 사용자 프로필 — 종전 ProfileCard 바텀시트를 대체한다(2026-08-13).
              위 BackgroundRoutes 에도 등록돼 지도·목록에서 진입하면 배경이 보존된다. */}
          <Route path="/profile/:userId" element={<PrivateRoute><UserProfile /></PrivateRoute>} />
          <Route path="/trades" element={<PrivateRoute><TradeHistory /></PrivateRoute>} />
          <Route path="/followers/:userId" element={<PrivateRoute><FollowerList /></PrivateRoute>} />
          <Route path="/following/:userId" element={<PrivateRoute><FollowingList /></PrivateRoute>} />
          <Route path="/friends/:userId" element={<PrivateRoute><FriendList /></PrivateRoute>} />
          <Route path="/friends/add" element={<PrivateRoute><FriendAdd /></PrivateRoute>} />

          {/* Protected: Ride flow */}
          <Route path="/ride/result/success" element={<PrivateRoute><RideResultSuccess /></PrivateRoute>} />
          <Route path="/ride/result/fail" element={<PrivateRoute><RideResultFail /></PrivateRoute>} />

          {/* Protected: Gacha */}
          {/* [게이미피케이션 잠정보류 — 재개 시 주석 해제] */}
          {/* <Route path="/gacha" element={<PrivateRoute><GachaMain /></PrivateRoute>} /> */}
          {/* <Route path="/gacha/pull/:gachaCode" element={<PrivateRoute><GachaPull /></PrivateRoute>} /> */}

          {/* Protected: Shop */}
          {/* [게이미피케이션 잠정보류 — 재개 시 주석 해제] */}
          {/* <Route path="/shop" element={<PrivateRoute><ShopCatalog /></PrivateRoute>} /> */}
          {/* <Route path="/shop/item/:itemCode" element={<PrivateRoute><ItemDetail /></PrivateRoute>} /> */}
          {/* <Route path="/shop/coupons" element={<PrivateRoute><CouponShop /></PrivateRoute>} /> */}

          {/* Protected: Inventory */}
          {/* [게이미피케이션 잠정보류 — 재개 시 주석 해제] */}
          {/* <Route path="/inventory" element={<PrivateRoute><Inventory /></PrivateRoute>} /> */}
          {/* <Route path="/inventory/equip-preview" element={<PrivateRoute><EquipPreview /></PrivateRoute>} /> */}

          {/* Protected: Season */}
          {/* [게이미피케이션 잠정보류 — 재개 시 주석 해제] */}
          {/* <Route path="/season" element={<PrivateRoute><SeasonPass /></PrivateRoute>} /> */}

          {/* Protected: Info */}
          <Route path="/info" element={<PrivateRoute><InfoHub /></PrivateRoute>} />
          <Route path="/info/weather" element={<PrivateRoute><InfoWeather /></PrivateRoute>} />
          <Route path="/info/flood" element={<PrivateRoute><InfoFloodMap /></PrivateRoute>} />
          <Route path="/info/flood/report" element={<PrivateRoute><InfoFloodReport /></PrivateRoute>} />
          <Route path="/info/gas" element={<PrivateRoute><InfoGasList /></PrivateRoute>} />
          <Route path="/info/repair" element={<PrivateRoute><InfoRepairList /></PrivateRoute>} />
          <Route path="/info/repair/:shopId" element={<PrivateRoute><InfoRepairDetail /></PrivateRoute>} />
          <Route path="/info/repair/:shopId/write" element={<PrivateRoute><InfoRepairWrite /></PrivateRoute>} />
          <Route path="/info/repair/:shopId/reviews" element={<PrivateRoute><InfoRepairReviews /></PrivateRoute>} />
          <Route path="/ride-nav" element={<PrivateRoute><RideNav /></PrivateRoute>} />

          {/* Guide */}
          <Route path="/guide/safe-trade" element={<PrivateRoute><SafeTradeGuide /></PrivateRoute>} />

          {/* Protected: Settings */}
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/settings/notifications" element={<PrivateRoute><NotiSettings /></PrivateRoute>} />
          <Route path="/settings/language" element={<PrivateRoute><LangSettings /></PrivateRoute>} />
          <Route path="/settings/account" element={<PrivateRoute><AccountSettings /></PrivateRoute>} />
          <Route path="/settings/blocked" element={<PrivateRoute><BlockedUsers /></PrivateRoute>} />
          <Route path="/settings/profile" element={<PrivateRoute><ProfileEdit /></PrivateRoute>} />
          <Route path="/settings/support" element={<PrivateRoute><CustomerSupport /></PrivateRoute>} />
          <Route path="/settings/support/:id" element={<PrivateRoute><SupportDetail /></PrivateRoute>} />
          {/* F-9: 로그인 전(OAuthLogin)에서도 열람 가능해야 해서 공개 라우트로 둔다 — 내용은 정적 텍스트뿐 */}
          <Route path="/settings/privacy" element={<PrivacyPolicy />} />
          <Route path="/settings/terms" element={<TermsOfService />} />
          <Route path="/notices" element={<PrivateRoute><NoticeList /></PrivateRoute>} />
          <Route path="/notices/:id" element={<PrivateRoute><NoticeDetail /></PrivateRoute>} />
          <Route path="/faq" element={<PrivateRoute><FaqList /></PrivateRoute>} />

          {/* 404 — 오타 URL·삭제된 링크를 설명 없이 홈으로 흡수하지 않는다 (P2-7) */}
          <Route path="*" element={<NotFound />} />
        </BackgroundRoutes>}
      </AppShell>
    </BrowserRouter>
  );
}
