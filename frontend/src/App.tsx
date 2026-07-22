import { BrowserRouter, Routes, Route, Navigate, useLocation, type Location } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SpriteProvider } from '@/lib/items/SpriteProvider';
import { QuestCardSprites } from '@/components/quest/QuestCardSprites';
import { AppShell } from '@/components/layout/AppShell';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useUserStore } from '@/store/useUserStore';
import { useDmStore } from '@/store/useDmStore';
import { changeLang } from '@/lib/i18n';
import { loadSession, clearSession } from '@/lib/session';
import { bootstrapSession, leaveBootstrapForLogin } from '@/lib/sessionBootstrap';
import { apiSessionVerify } from '@/api/auth';
import { emojiUrl } from '@/lib/emoji';
import { setSessionExpiredHandler, SessionExpiredError, setAccountRestrictedHandler, AccountRestrictedError } from '@/api/client';
import { native } from '@/lib/native';
import { fetchAppConfig } from '@/api/appVersion';
import PrivateRoute from '@/components/auth/PrivateRoute';
import VerifiedSellerRoute from '@/components/auth/VerifiedSellerRoute';

// Auth
import Splash from '@/pages/auth/Splash';
import OAuthLogin from '@/pages/auth/OAuthLogin';
import OAuthResult from '@/pages/auth/OAuthResult';
import ProfileSetup from '@/pages/auth/ProfileSetup';
import PhoneVerify from '@/pages/auth/PhoneVerify';
import Suspended from '@/pages/auth/Suspended';

// Home
import WorldMap from '@/pages/home/WorldMap'; // 백업 (미사용)
import WorldMapV2 from '@/pages/home/WorldMapV2';

// 동네지도 (RideNav 지도 재사용)
import NeighborhoodMap from '@/pages/map/NeighborhoodMap';
import NeighborhoodProfile from '@/pages/map/NeighborhoodProfile';
import MapFavorites from '@/pages/map/MapFavorites';
import NeighborhoodCategories from '@/pages/map/NeighborhoodCategories';

// Market (오토바이 라이더 거래 — 퀘스트 탭 자리 신규 엔트리)
import MarketMain from '@/pages/market/MarketMain';
import MarketCreate from '@/pages/market/MarketCreate';
import MarketDetail from '@/pages/market/MarketDetail';
import MarketWishlist from '@/pages/market/MarketWishlist';
import MarketSearch from '@/pages/market/MarketSearch';
import AdDetail from '@/pages/market/AdDetail';

// Biz (비즈니스 파트너, SGR-312 BP-2)
import BizIntro from '@/pages/biz/BizIntro';
import BizApply from '@/pages/biz/BizApply';
import BizStatus from '@/pages/biz/BizStatus';
import BizManage from '@/pages/biz/BizManage';
import BizAdsNew from '@/pages/biz/BizAdsNew';
import BizAdDetail from '@/pages/biz/BizAdDetail';
import BizPublic from '@/pages/biz/BizPublic';

// Quest
import QuestList from '@/pages/quest/QuestList';
import QuestDetail from '@/pages/quest/QuestDetail';
import QuestCheckPage from '@/pages/quest/QuestCheckPage';

// Ride
import RideResultSuccess from '@/pages/ride/RideResultSuccess';
import RideResultFail from '@/pages/ride/RideResultFail';

// Feed
import FeedList from '@/pages/feed/FeedList';
import FeedCreate from '@/pages/feed/FeedCreate';
import FeedEdit from '@/pages/feed/FeedEdit';
import FeedDetail from '@/pages/feed/FeedDetail';

// DM
import DmList from '@/pages/dm/DmList';
import DmDetail from '@/pages/dm/DmDetail';

// 알림함
import NotificationInbox from '@/pages/notifications/NotificationInbox';

// Profile
import ProfileMain from '@/pages/profile/ProfileMain';
import TradeHistory from '@/pages/profile/TradeHistory';
import FollowerList from '@/pages/profile/FollowerList';
import FollowingList from '@/pages/profile/FollowingList';
import FriendList from '@/pages/profile/FriendList';
import FriendAdd from '@/pages/profile/FriendAdd';

// Gacha
import GachaMain from '@/pages/gacha/GachaMain';
import GachaPull from '@/pages/gacha/GachaPull';

// Shop
import ShopCatalog from '@/pages/shop/ShopCatalog';
import ItemDetail from '@/pages/shop/ItemDetail';
import CouponShop from '@/pages/shop/CouponShop';
import MyCoupons from '@/pages/shop/MyCoupons';

// Garage
import Garage from '@/pages/garage/Garage';

// Inventory
import Inventory from '@/pages/inventory/Inventory';
import EquipPreview from '@/pages/inventory/EquipPreview';

// Season
import SeasonPass from '@/pages/season/SeasonPass';

// Settings
import Settings from '@/pages/settings/Settings';
import NotiSettings from '@/pages/settings/NotiSettings';
import LangSettings from '@/pages/settings/LangSettings';
import AccountSettings from '@/pages/settings/AccountSettings';
import BlockedUsers from '@/pages/settings/BlockedUsers';
import ProfileEdit from '@/pages/settings/ProfileEdit';
import CustomerSupport from '@/pages/settings/CustomerSupport';
import SupportDetail from '@/pages/settings/SupportDetail';
import PrivacyPolicy from '@/pages/settings/PrivacyPolicy';
import TermsOfService from '@/pages/settings/TermsOfService';

// Notices / FAQ
import NoticeList from '@/pages/notices/NoticeList';
import NoticeDetail from '@/pages/notices/NoticeDetail';
import FaqList from '@/pages/faq/FaqList';

// Guide
import SafeTradeGuide from '@/pages/guide/SafeTradeGuide';

// Info
import InfoHub from '@/pages/info/InfoHub';
import InfoWeather from '@/pages/info/InfoWeather';
import InfoFloodMap from '@/pages/info/InfoFloodMap';
import InfoFloodReport from '@/pages/info/InfoFloodReport';
import InfoGasList from '@/pages/info/InfoGasList';
import InfoRepairList from '@/pages/info/InfoRepairList';
import InfoRepairDetail from '@/pages/info/InfoRepairDetail';
import InfoRepairWrite from '@/pages/info/InfoRepairWrite';
import InfoRepairReviews from '@/pages/info/InfoRepairReviews';
import RideNav from '@/pages/ride/RideNav';

// Deep link
import LinkRouter from '@/pages/link/LinkRouter';
import NotificationBridge from '@/pages/link/NotificationBridge';

import styles from './App.module.css';

/**
 * 라우트-모달 (2026-07-12): 동네지도에서 상세 진입 시 navigate state 로 backgroundLocation
 * 을 실어 보내면, 배경 라우트(지도)를 그대로 유지한 채 상세 3종(업체/매물/피드)을 전체화면
 * 오버레이 레이어로 얹는다. URL 은 실제 상세 경로 — 딥링크/공유/하드웨어 뒤로가기 모두 정상.
 * backgroundLocation 없는 진입(마켓 리스트·커뮤니티·딥링크 등)은 기존 페이지 이동 그대로.
 */
function BackgroundRoutes({ children }: { children: ReactNode }) {
  const location = useLocation();
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
  return (
    <>
      <Routes location={backgroundLocation ?? location}>{children}</Routes>
      {backgroundLocation && (
        <div className={styles.detailOverlay}>
          <Routes>
            <Route path="/biz/:id" element={<PrivateRoute><BizPublic /></PrivateRoute>} />
            <Route path="/market/:id" element={<PrivateRoute><MarketDetail /></PrivateRoute>} />
            <Route path="/feed/post/:postId" element={<PrivateRoute><FeedDetail /></PrivateRoute>} />
          </Routes>
        </div>
      )}
    </>
  );
}

export default function App() {
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

  // 세션 만료 전역 핸들러 등록
  useEffect(() => {
    setSessionExpiredHandler(() => {
      logout();
      sessionStorage.setItem('session_expired', '1');
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

  // 앱 기동 시: 쿠키 세션 → 자동 로그인 시도
  useEffect(() => {
    if (user?.language) changeLang(user.language);

    let active = true;
    setBootstrapError(false);
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
    const delay = Math.max(0, 1200 - elapsed);
    const t1 = setTimeout(() => setSplashFade(true), delay);
    const t2 = setTimeout(() => setSplashVisible(false), delay + 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [bootstrapped]);

  return (
    <BrowserRouter>
      <NotificationBridge />
      <SpriteProvider />
      <QuestCardSprites />
      <Toaster position="top-center" gap={6} visibleToasts={3} />
      <Dialog />
      <ConfirmDialog />
      <AppShell
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
          <Route path="/auth/profile-setup" element={<ProfileSetup />} />
          <Route path="/auth/phone-verify" element={<PhoneVerify />} />
          {/* 정지/밴 안내 — PrivateRoute 로 감싸지 않는다: 밴 유저는 최초 로그인부터 isAuthenticated 가 없을 수 있음 */}
          <Route path="/suspended" element={<Suspended />} />

          {/* Deep link entry (auth-aware inside) */}
          <Route path="/link" element={<LinkRouter />} />

          {/* Protected: Main */}
          <Route path="/home" element={<PrivateRoute><WorldMapV2 /></PrivateRoute>} />
          <Route path="/map" element={<PrivateRoute><NeighborhoodMap /></PrivateRoute>} />
          <Route path="/map/profile" element={<PrivateRoute><NeighborhoodProfile /></PrivateRoute>} />
          <Route path="/map/favorites" element={<PrivateRoute><MapFavorites /></PrivateRoute>} />
          <Route path="/map/categories" element={<PrivateRoute><NeighborhoodCategories /></PrivateRoute>} />
          <Route path="/market" element={<PrivateRoute><MarketMain /></PrivateRoute>} />
          <Route path="/market/search" element={<PrivateRoute><MarketSearch /></PrivateRoute>} />
          <Route path="/market/ad/:id" element={<PrivateRoute><AdDetail /></PrivateRoute>} />
          <Route path="/market/new" element={<VerifiedSellerRoute><MarketCreate /></VerifiedSellerRoute>} />
          <Route path="/market/wishlist" element={<PrivateRoute><MarketWishlist /></PrivateRoute>} />
          <Route path="/market/:id" element={<PrivateRoute><MarketDetail /></PrivateRoute>} />
          <Route path="/biz/intro" element={<PrivateRoute><BizIntro /></PrivateRoute>} />
          <Route path="/biz/apply" element={<PrivateRoute><BizApply /></PrivateRoute>} />
          <Route path="/biz/status" element={<PrivateRoute><BizStatus /></PrivateRoute>} />
          <Route path="/biz/manage" element={<PrivateRoute><BizManage /></PrivateRoute>} />
          <Route path="/biz/ads/new" element={<PrivateRoute><BizAdsNew /></PrivateRoute>} />
          <Route path="/biz/ads/:id" element={<PrivateRoute><BizAdDetail /></PrivateRoute>} />
          <Route path="/biz/:id" element={<PrivateRoute><BizPublic /></PrivateRoute>} />
          {/* 퀘스트: 하단 네비 비활성(메뉴 제거). 라우트는 딥링크·직접접근용 보존 */}
          <Route path="/quests" element={<PrivateRoute><QuestList /></PrivateRoute>} />
          <Route path="/quests/:id" element={<PrivateRoute><QuestDetail /></PrivateRoute>} />
          <Route path="/quest-check/:userQuestId" element={<PrivateRoute><QuestCheckPage /></PrivateRoute>} />
          <Route path="/feed" element={<PrivateRoute><FeedList /></PrivateRoute>} />
          <Route path="/feed/new" element={<PrivateRoute><FeedCreate /></PrivateRoute>} />
          <Route path="/feed/edit/:postId" element={<PrivateRoute><FeedEdit /></PrivateRoute>} />
          <Route path="/feed/post/:postId" element={<PrivateRoute><FeedDetail /></PrivateRoute>} />
          <Route path="/dm" element={<PrivateRoute><DmList /></PrivateRoute>} />
          <Route path="/dm/:conversationId" element={<PrivateRoute><DmDetail /></PrivateRoute>} />
          <Route path="/notifications" element={<PrivateRoute><NotificationInbox /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfileMain /></PrivateRoute>} />
          <Route path="/trades" element={<PrivateRoute><TradeHistory /></PrivateRoute>} />
          <Route path="/followers/:userId" element={<PrivateRoute><FollowerList /></PrivateRoute>} />
          <Route path="/following/:userId" element={<PrivateRoute><FollowingList /></PrivateRoute>} />
          <Route path="/friends/:userId" element={<PrivateRoute><FriendList /></PrivateRoute>} />
          <Route path="/friends/add" element={<PrivateRoute><FriendAdd /></PrivateRoute>} />

          {/* Protected: Ride flow */}
          <Route path="/ride/result/success" element={<PrivateRoute><RideResultSuccess /></PrivateRoute>} />
          <Route path="/ride/result/fail" element={<PrivateRoute><RideResultFail /></PrivateRoute>} />

          {/* Protected: Gacha */}
          <Route path="/gacha" element={<PrivateRoute><GachaMain /></PrivateRoute>} />
          <Route path="/gacha/pull/:gachaCode" element={<PrivateRoute><GachaPull /></PrivateRoute>} />

          {/* Protected: Shop */}
          <Route path="/shop" element={<PrivateRoute><ShopCatalog /></PrivateRoute>} />
          <Route path="/shop/item/:itemCode" element={<PrivateRoute><ItemDetail /></PrivateRoute>} />
          <Route path="/shop/coupons" element={<PrivateRoute><CouponShop /></PrivateRoute>} />
          <Route path="/coupons/mine" element={<PrivateRoute><MyCoupons /></PrivateRoute>} />

          {/* Protected: Garage */}
          <Route path="/garage" element={<PrivateRoute><Garage /></PrivateRoute>} />

          {/* Protected: Inventory */}
          <Route path="/inventory" element={<PrivateRoute><Inventory /></PrivateRoute>} />
          <Route path="/inventory/equip-preview" element={<PrivateRoute><EquipPreview /></PrivateRoute>} />

          {/* Protected: Season */}
          <Route path="/season" element={<PrivateRoute><SeasonPass /></PrivateRoute>} />

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
          <Route path="/settings/privacy" element={<PrivateRoute><PrivacyPolicy /></PrivateRoute>} />
          <Route path="/settings/terms" element={<PrivateRoute><TermsOfService /></PrivateRoute>} />
          <Route path="/notices" element={<PrivateRoute><NoticeList /></PrivateRoute>} />
          <Route path="/notices/:id" element={<PrivateRoute><NoticeDetail /></PrivateRoute>} />
          <Route path="/faq" element={<PrivateRoute><FaqList /></PrivateRoute>} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </BackgroundRoutes>}
      </AppShell>
    </BrowserRouter>
  );
}
