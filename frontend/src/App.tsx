import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';

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

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          {/* default */}
          <Route path="/" element={<Navigate to="/home" replace />} />

          {/* Auth flow */}
          <Route path="/splash" element={<Splash />} />
          <Route path="/auth/phone" element={<PhoneInput />} />
          <Route path="/auth/otp" element={<OtpInput />} />
          <Route path="/auth/profile-setup" element={<ProfileSetup />} />

          {/* Main */}
          <Route path="/home" element={<WorldMap />} />
          <Route path="/quests" element={<QuestList />} />
          <Route path="/quests/:id" element={<QuestDetail />} />
          <Route path="/feed" element={<FeedList />} />
          <Route path="/profile" element={<ProfileMain />} />

          {/* Ride flow */}
          <Route path="/ride/active" element={<RideActive />} />
          <Route path="/ride/result/success" element={<RideResultSuccess />} />
          <Route path="/ride/result/fail" element={<RideResultFail />} />

          {/* Settings */}
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/notifications" element={<NotiSettings />} />
          <Route path="/settings/language" element={<LangSettings />} />
          <Route path="/settings/account" element={<AccountSettings />} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
