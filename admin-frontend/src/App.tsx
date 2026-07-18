import { createContext, useContext, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigProvider, Spin } from 'antd'
import koKR from 'antd/locale/ko_KR'
import { fetchMe, type Me } from './api/auth'
import AdminLayout from './components/AdminLayout'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import PlaceholderPage from './pages/PlaceholderPage'

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
      <ConfigProvider locale={koKR}>
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
              <Route path="/reports" element={<PlaceholderPage title="신고센터" />} />
              <Route path="/users" element={<PlaceholderPage title="유저 관리" />} />
              <Route path="/listings" element={<PlaceholderPage title="매물 관리" />} />
              <Route path="/support" element={<PlaceholderPage title="고객센터" />} />
              <Route path="/cms/notices" element={<PlaceholderPage title="공지 관리" />} />
              <Route path="/cms/faqs" element={<PlaceholderPage title="FAQ 관리" />} />
              <Route path="/settings/banned-keywords" element={<PlaceholderPage title="금칙어" />} />
              <Route path="/audit-logs" element={<PlaceholderPage title="감사 로그" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  )
}
