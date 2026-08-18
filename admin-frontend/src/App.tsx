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
import ReviewDetailPage from './pages/reviews/ReviewDetailPage'
import IssueQueuePage from './pages/issues/IssueQueuePage'
import WeeklyIssueSummaryPage from './pages/issues/WeeklyIssueSummaryPage'
import ReporterTrustPage from './pages/issues/ReporterTrustPage'
import UserListPage from './pages/users/UserListPage'
import UserDetailPage from './pages/users/UserDetailPage'
import ListingListPage from './pages/listings/ListingListPage'
import ListingDetailPage from './pages/listings/ListingDetailPage'
import DealerCandidatesPage from './pages/listings/DealerCandidatesPage'
import CompletionRequestListPage from './pages/trades/CompletionRequestListPage'
import SupportListPage from './pages/support/SupportListPage'
import SupportDetailPage from './pages/support/SupportDetailPage'
import LiquidityPanelPage from './pages/analytics/LiquidityPanelPage'
import FunnelPage from './pages/analytics/FunnelPage'
import ZeroResultSearchPage from './pages/analytics/ZeroResultSearchPage'
import FeedListPage from './pages/community/FeedListPage'
import FeedDetailPage from './pages/community/FeedDetailPage'
import FeedEditPage from './pages/community/FeedEditPage'
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
import BizAdTierPage from './pages/biz/BizAdTierPage'
import AdminAccountListPage from './pages/system/AdminAccountListPage'
import SettingsPage from './pages/system/SettingsPage'
import EngineSettingsPage from './pages/system/EngineSettingsPage'
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
              <Route path="/reviews/:id" element={<ReviewDetailPage />} />
              <Route path="/issues" element={<IssueQueuePage />} />
              <Route path="/issues/weekly-summary" element={<WeeklyIssueSummaryPage />} />
              <Route path="/issues/reporter-trust" element={<ReporterTrustPage />} />
              <Route path="/users" element={<UserListPage />} />
              <Route path="/users/:id" element={<UserDetailPage />} />
              <Route path="/listings" element={<ListingListPage />} />
              <Route path="/listings/dealer-candidates" element={<DealerCandidatesPage />} />
              <Route path="/listings/:id" element={<ListingDetailPage />} />
              <Route path="/trades/completion-requests" element={<CompletionRequestListPage />} />
              <Route path="/support" element={<SupportListPage />} />
              <Route path="/support/:id" element={<SupportDetailPage />} />
              <Route path="/analytics/liquidity" element={<LiquidityPanelPage />} />
              <Route path="/analytics/funnel" element={<FunnelPage />} />
              <Route path="/analytics/zero-results" element={<ZeroResultSearchPage />} />
              <Route path="/community/feed" element={<FeedListPage />} />
              <Route path="/community/feed/new" element={<FeedEditPage />} />
              <Route path="/community/feed/:id" element={<FeedDetailPage />} />
              <Route path="/community/feed/:id/edit" element={<FeedEditPage />} />
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
              <Route path="/biz/ad-tiers" element={<BizAdTierPage />} />
              <Route path="/system/accounts" element={<PrivilegedRoute><AdminAccountListPage /></PrivilegedRoute>} />
              <Route path="/system/settings" element={<SettingsPage />} />
              <Route path="/system/dev-context" element={<Navigate to="/system/engine-settings?tab=dev-context" replace />} />
              <Route path="/system/engine-settings" element={<PrivilegedRoute><EngineSettingsPage /></PrivilegedRoute>} />
              <Route path="/sre/reward-policies" element={<Navigate to="/system/engine-settings?tab=reward-policies" replace />} />
              <Route path="/sre/items" element={<Navigate to="/system/engine-settings?tab=items" replace />} />
              <Route path="/sre/quests" element={<Navigate to="/system/engine-settings?tab=quests" replace />} />
              <Route path="/sre/ops" element={<Navigate to="/system/engine-settings?tab=ops" replace />} />
              <Route path="/sre/push" element={<Navigate to="/system/engine-settings?tab=push" replace />} />
              <Route path="/sre/stream" element={<Navigate to="/system/engine-settings?tab=stream" replace />} />
              <Route path="/sre/gacha" element={<Navigate to="/system/engine-settings?tab=gacha" replace />} />
              <Route path="/sre/shop" element={<Navigate to="/system/engine-settings?tab=shop" replace />} />
              <Route path="/sre/daily-featured" element={<Navigate to="/system/engine-settings?tab=daily-featured" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </ConfigProvider>
      </QueryClientProvider>
    </ThemeModeContext.Provider>
  )
}
