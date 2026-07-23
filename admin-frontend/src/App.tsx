import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigProvider, Spin } from 'antd'
import koKR from 'antd/locale/ko_KR'
import { fetchMe, type Me } from './api/auth'
import AdminLayout from './components/AdminLayout'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import ReportListPage from './pages/reports/ReportListPage'
import ReportDetailPage from './pages/reports/ReportDetailPage'
import UserListPage from './pages/users/UserListPage'
import UserDetailPage from './pages/users/UserDetailPage'
import ListingListPage from './pages/listings/ListingListPage'
import ListingDetailPage from './pages/listings/ListingDetailPage'
import SupportListPage from './pages/support/SupportListPage'
import SupportDetailPage from './pages/support/SupportDetailPage'
import FeedListPage from './pages/community/FeedListPage'
import FeedDetailPage from './pages/community/FeedDetailPage'
import NoticeListPage from './pages/cms/NoticeListPage'
import NoticeEditPage from './pages/cms/NoticeEditPage'
import FaqListPage from './pages/cms/FaqListPage'
import BannedKeywordPage from './pages/cms/BannedKeywordPage'
import BadgeListPage from './pages/cms/BadgeListPage'
import AuditLogPage from './pages/audit/AuditLogPage'
import PoiListPage from './pages/map/PoiListPage'
import PoiEditPage from './pages/map/PoiEditPage'
import PlaceSuggestionListPage from './pages/map/PlaceSuggestionListPage'
import GasSubmissionListPage from './pages/map/GasSubmissionListPage'
import RepairSubmissionListPage from './pages/map/RepairSubmissionListPage'
import FuelPricePage from './pages/map/FuelPricePage'
import RidePolicyPage from './pages/map/RidePolicyPage'
import BizAccountListPage from './pages/biz/BizAccountListPage'
import BizAccountDetailPage from './pages/biz/BizAccountDetailPage'
import BizAccountAdsPage from './pages/biz/BizAccountAdsPage'
import BizAdListPage from './pages/biz/BizAdListPage'
import BizAdDetailPage from './pages/biz/BizAdDetailPage'
import AdminAccountListPage from './pages/system/AdminAccountListPage'
import RewardPolicyPage from './pages/sre/RewardPolicyPage'
import ItemListPage from './pages/sre/ItemListPage'
import OpsDashboardPage from './pages/sre/OpsDashboardPage'
import { adminDarkTheme, adminTheme } from './theme/tokens'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
})

const MeContext = createContext<Me | null>(null)
type AdminThemeMode = 'light' | 'dark'
const ThemeModeContext = createContext<{ mode: AdminThemeMode; toggle: () => void } | null>(null)

function readThemeMode(): AdminThemeMode {
  try {
    const saved = localStorage.getItem('saigon-admin-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage can be blocked by browser privacy policy; the in-memory theme still works.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** AuthGate 하위에서 현재 로그인 관리자 정보를 읽는다. */
export function useMe(): Me {
  const me = useContext(MeContext)
  if (!me) throw new Error('useMe must be used within AuthGate')
  return me
}

export function useAdminTheme() {
  const value = useContext(ThemeModeContext)
  if (!value) throw new Error('useAdminTheme must be used within App')
  return value
}

/** root/admin 전용 라우트 가드 (defense-in-depth — 백엔드도 403). manager 는 대시보드로 리다이렉트. */
function PrivilegedRoute({ children }: { children: ReactNode }) {
  const me = useMe()
  if (me.role !== 'root' && me.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function AuthGate({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: fetchMe })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }
  if (!me) return <Navigate to="/login" replace />
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>
}

export default function App() {
  const [mode, setMode] = useState<AdminThemeMode>(readThemeMode)

  useEffect(() => {
    document.documentElement.dataset.adminTheme = mode
    try {
      localStorage.setItem('saigon-admin-theme', mode)
    } catch {
      // Keep the selected mode for this session when persistence is unavailable.
    }
  }, [mode])

  return (
    <ThemeModeContext.Provider value={{ mode, toggle: () => setMode((current) => current === 'light' ? 'dark' : 'light') }}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={koKR} theme={mode === 'dark' ? adminDarkTheme : adminTheme}>
        <BrowserRouter basename="/admin">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <AuthGate>
                  <AdminLayout />
                </AuthGate>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/reports" element={<ReportListPage />} />
              <Route path="/reports/:id" element={<ReportDetailPage />} />
              <Route path="/users" element={<UserListPage />} />
              <Route path="/users/:id" element={<UserDetailPage />} />
              <Route path="/listings" element={<ListingListPage />} />
              <Route path="/listings/:id" element={<ListingDetailPage />} />
              <Route path="/support" element={<SupportListPage />} />
              <Route path="/support/:id" element={<SupportDetailPage />} />
              <Route path="/community/feed" element={<FeedListPage />} />
              <Route path="/community/feed/:id" element={<FeedDetailPage />} />
              <Route path="/cms/notices" element={<NoticeListPage />} />
              <Route path="/cms/notices/new" element={<NoticeEditPage />} />
              <Route path="/cms/notices/:id" element={<NoticeEditPage />} />
              <Route path="/cms/faqs" element={<FaqListPage />} />
              <Route path="/cms/badges" element={<BadgeListPage />} />
              <Route path="/settings/banned-keywords" element={<BannedKeywordPage />} />
              <Route path="/audit-logs" element={<PrivilegedRoute><AuditLogPage /></PrivilegedRoute>} />
              <Route path="/map/poi" element={<PoiListPage />} />
              <Route path="/map/poi/new" element={<PoiEditPage />} />
              <Route path="/map/poi/:id" element={<PoiEditPage />} />
              <Route path="/map/place-suggestions" element={<PlaceSuggestionListPage />} />
              <Route path="/map/gas-submissions" element={<GasSubmissionListPage />} />
              <Route path="/map/repair-submissions" element={<RepairSubmissionListPage />} />
              <Route path="/map/fuel-prices" element={<FuelPricePage />} />
              <Route path="/map/ride-policy" element={<PrivilegedRoute><RidePolicyPage /></PrivilegedRoute>} />
              <Route path="/biz/accounts" element={<BizAccountListPage />} />
              <Route path="/biz/accounts/:id" element={<BizAccountDetailPage />} />
              <Route path="/biz/accounts/:id/ads" element={<BizAccountAdsPage />} />
              <Route path="/biz/ads" element={<BizAdListPage />} />
              <Route path="/biz/ads/:id" element={<BizAdDetailPage />} />
              <Route path="/system/accounts" element={<PrivilegedRoute><AdminAccountListPage /></PrivilegedRoute>} />
              <Route path="/sre/reward-policies" element={<PrivilegedRoute><RewardPolicyPage /></PrivilegedRoute>} />
              <Route path="/sre/items" element={<PrivilegedRoute><ItemListPage /></PrivilegedRoute>} />
              <Route path="/sre/ops" element={<PrivilegedRoute><OpsDashboardPage /></PrivilegedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </ConfigProvider>
      </QueryClientProvider>
    </ThemeModeContext.Provider>
  )
}
