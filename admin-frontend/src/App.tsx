import { createContext, useContext, type ReactNode } from 'react'
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
import NoticeListPage from './pages/cms/NoticeListPage'
import NoticeEditPage from './pages/cms/NoticeEditPage'
import FaqListPage from './pages/cms/FaqListPage'
import BannedKeywordPage from './pages/cms/BannedKeywordPage'
import AuditLogPage from './pages/audit/AuditLogPage'
import PoiListPage from './pages/map/PoiListPage'
import PoiEditPage from './pages/map/PoiEditPage'
import PlaceSuggestionListPage from './pages/map/PlaceSuggestionListPage'
import GasSubmissionListPage from './pages/map/GasSubmissionListPage'
import RepairSubmissionListPage from './pages/map/RepairSubmissionListPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
})

const MeContext = createContext<Me | null>(null)

/** AuthGate 하위에서 현재 로그인 관리자 정보를 읽는다. */
export function useMe(): Me {
  const me = useContext(MeContext)
  if (!me) throw new Error('useMe must be used within AuthGate')
  return me
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
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={koKR} theme={{ token: { colorPrimary: '#0f8f8b', colorInfo: '#0f8f8b', colorLink: '#0f766e', colorBgLayout: '#f5f7fa', colorBorder: '#dfe5ec', borderRadius: 10, fontSize: 14 }, components: { Layout: { siderBg: '#111b2d', headerBg: '#ffffff' }, Menu: { darkItemBg: '#111b2d' } } }}>
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
              <Route path="/cms/notices" element={<NoticeListPage />} />
              <Route path="/cms/notices/new" element={<NoticeEditPage />} />
              <Route path="/cms/notices/:id" element={<NoticeEditPage />} />
              <Route path="/cms/faqs" element={<FaqListPage />} />
              <Route path="/settings/banned-keywords" element={<BannedKeywordPage />} />
              <Route path="/audit-logs" element={<AuditLogPage />} />
              <Route path="/map/poi" element={<PoiListPage />} />
              <Route path="/map/poi/new" element={<PoiEditPage />} />
              <Route path="/map/poi/:id" element={<PoiEditPage />} />
              <Route path="/map/place-suggestions" element={<PlaceSuggestionListPage />} />
              <Route path="/map/gas-submissions" element={<GasSubmissionListPage />} />
              <Route path="/map/repair-submissions" element={<RepairSubmissionListPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  )
}
