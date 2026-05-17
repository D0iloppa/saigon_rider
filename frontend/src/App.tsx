import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { Dialog } from '@/components/ui/Dialog';
import { useUserStore } from '@/store/useUserStore';
import { changeLang } from '@/lib/i18n';
import { loadSession, clearSession } from '@/lib/session';
import { apiLogin } from '@/api/auth';
import { emojiUrl } from '@/lib/emoji';
import { setSessionExpiredHandler, SessionExpiredError } from '@/api/client';
import PrivateRoute from '@/components/auth/PrivateRoute';

// Auth
import Splash from '@/pages/auth/Splash';
import PhoneInput from '@/pages/auth/PhoneInput';
import OtpInput from '@/pages/auth/OtpInput';
import ProfileSetup from '@/pages/auth/ProfileSetup';

// Home
import WorldMap from '@/pages/home/WorldMap';

// Quest
import QuestList from '@/pages/quest/QuestList';
import QuestDetail from '@/pages/quest/QuestDetail';

// Ride
import RideActive from '@/pages/ride/RideActive';
import RideResultSuccess from '@/pages/ride/RideResultSuccess';
import RideResultFail from '@/pages/ride/RideResultFail';

// Feed
import FeedList from '@/pages/feed/FeedList';
import FeedCreate from '@/pages/feed/FeedCreate';
import FeedEdit from '@/pages/feed/FeedEdit';

// DM
import DmList from '@/pages/dm/DmList';
import DmDetail from '@/pages/dm/DmDetail';

// Profile
import ProfileMain from '@/pages/profile/ProfileMain';
import FollowerList from '@/pages/profile/FollowerList';
import FollowingList from '@/pages/profile/FollowingList';
import FriendList from '@/pages/profile/FriendList';
import FriendAdd from '@/pages/profile/FriendAdd';

// Settings
import Settings from '@/pages/settings/Settings';
import NotiSettings from '@/pages/settings/NotiSettings';
import LangSettings from '@/pages/settings/LangSettings';
import AccountSettings from '@/pages/settings/AccountSettings';
import ProfileEdit from '@/pages/settings/ProfileEdit';

// Deep link
import LinkRouter from '@/pages/link/LinkRouter';

export default function App() {
  const user = useUserStore((s) => s.user);
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const logout = useUserStore((s) => s.logout);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFade, setSplashFade] = useState(false);
  const [gifReady, setGifReady] = useState(false);
  const bootStartTime = useRef(Date.now());

  // 세션 만료 전역 핸들러 등록
  useEffect(() => {
    setSessionExpiredHandler(() => {
      logout();
      window.location.replace('/splash');
    });
  }, [logout]);

  // unhandled promise rejection에서 SessionExpiredError 무시 (이미 리다이렉트 처리됨)
  useEffect(() => {
    function onUnhandled(e: PromiseRejectionEvent) {
      if (e.reason instanceof SessionExpiredError) e.preventDefault();
    }
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => window.removeEventListener('unhandledrejection', onUnhandled);
  }, []);

  // GIF 백그라운드 프리로드
  useEffect(() => {
    const img = new Image();
    img.onload = () => setGifReady(true);
    img.src = emojiUrl('1f3cd');
  }, []);

  // 앱 기동 시: 쿠키 세션 → 자동 로그인 시도
  useEffect(() => {
    if (user?.language) changeLang(user.language);

    const session = loadSession();
    if (!session) {
      setBootstrapped(true);
      return;
    }

    apiLogin(session.phone, session.passcode)
      .then((result) => {
        loginFromBackend(result.user);
      })
      .catch(() => {
        clearSession();
        logout();
      })
      .finally(() => {
        setBootstrapped(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <Toaster position="bottom-center" gap={6} visibleToasts={3} />
      <Dialog />
      <AppShell splashVisible={splashVisible} splashFade={splashFade} gifReady={gifReady}>
        {bootstrapped && <Routes>
          {/* default */}
          <Route path="/" element={<Navigate to="/splash" replace />} />

          {/* Auth flow (public) */}
          <Route path="/splash" element={<Splash />} />
          <Route path="/auth/phone" element={<PhoneInput />} />
          <Route path="/auth/otp" element={<OtpInput />} />
          <Route path="/auth/profile-setup" element={<ProfileSetup />} />

          {/* Deep link entry (auth-aware inside) */}
          <Route path="/link" element={<LinkRouter />} />

          {/* Protected: Main */}
          <Route path="/home" element={<PrivateRoute><WorldMap /></PrivateRoute>} />
          <Route path="/quests" element={<PrivateRoute><QuestList /></PrivateRoute>} />
          <Route path="/quests/:id" element={<PrivateRoute><QuestDetail /></PrivateRoute>} />
          <Route path="/feed" element={<PrivateRoute><FeedList /></PrivateRoute>} />
          <Route path="/feed/new" element={<PrivateRoute><FeedCreate /></PrivateRoute>} />
          <Route path="/feed/edit/:postId" element={<PrivateRoute><FeedEdit /></PrivateRoute>} />
          <Route path="/dm" element={<PrivateRoute><DmList /></PrivateRoute>} />
          <Route path="/dm/:conversationId" element={<PrivateRoute><DmDetail /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfileMain /></PrivateRoute>} />
          <Route path="/followers/:userId" element={<PrivateRoute><FollowerList /></PrivateRoute>} />
          <Route path="/following/:userId" element={<PrivateRoute><FollowingList /></PrivateRoute>} />
          <Route path="/friends/:userId" element={<PrivateRoute><FriendList /></PrivateRoute>} />
          <Route path="/friends/add" element={<PrivateRoute><FriendAdd /></PrivateRoute>} />

          {/* Protected: Ride flow */}
          <Route path="/ride/active" element={<PrivateRoute><RideActive /></PrivateRoute>} />
          <Route path="/ride/result/success" element={<PrivateRoute><RideResultSuccess /></PrivateRoute>} />
          <Route path="/ride/result/fail" element={<PrivateRoute><RideResultFail /></PrivateRoute>} />

          {/* Protected: Settings */}
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/settings/notifications" element={<PrivateRoute><NotiSettings /></PrivateRoute>} />
          <Route path="/settings/language" element={<PrivateRoute><LangSettings /></PrivateRoute>} />
          <Route path="/settings/account" element={<PrivateRoute><AccountSettings /></PrivateRoute>} />
          <Route path="/settings/profile" element={<PrivateRoute><ProfileEdit /></PrivateRoute>} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>}
      </AppShell>
    </BrowserRouter>
  );
}
