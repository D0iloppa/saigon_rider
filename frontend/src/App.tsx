import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { Dialog } from '@/components/ui/Dialog';
import { useUserStore } from '@/store/useUserStore';
import { changeLang } from '@/lib/i18n';
import { loadSession, clearSession } from '@/lib/session';
import { apiLogin } from '@/api/auth';
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

// Profile
import ProfileMain from '@/pages/profile/ProfileMain';

// Settings
import Settings from '@/pages/settings/Settings';
import NotiSettings from '@/pages/settings/NotiSettings';
import LangSettings from '@/pages/settings/LangSettings';
import AccountSettings from '@/pages/settings/AccountSettings';

// Deep link
import LinkRouter from '@/pages/link/LinkRouter';

export default function App() {
  const user = useUserStore((s) => s.user);
  const loginFromBackend = useUserStore((s) => s.loginFromBackend);
  const logout = useUserStore((s) => s.logout);
  const [bootstrapped, setBootstrapped] = useState(false);

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
        // 세션 만료 또는 서버 오류 → 쿠키·Zustand 상태 모두 초기화
        clearSession();
        logout();
      })
      .finally(() => {
        setBootstrapped(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bootstrapped) return null; // 세션 확인 전 렌더 보류

  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors />
      <Dialog />
      <AppShell>
        <Routes>
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
          <Route path="/profile" element={<PrivateRoute><ProfileMain /></PrivateRoute>} />

          {/* Protected: Ride flow */}
          <Route path="/ride/active" element={<PrivateRoute><RideActive /></PrivateRoute>} />
          <Route path="/ride/result/success" element={<PrivateRoute><RideResultSuccess /></PrivateRoute>} />
          <Route path="/ride/result/fail" element={<PrivateRoute><RideResultFail /></PrivateRoute>} />

          {/* Protected: Settings */}
          <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
          <Route path="/settings/notifications" element={<PrivateRoute><NotiSettings /></PrivateRoute>} />
          <Route path="/settings/language" element={<PrivateRoute><LangSettings /></PrivateRoute>} />
          <Route path="/settings/account" element={<PrivateRoute><AccountSettings /></PrivateRoute>} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
