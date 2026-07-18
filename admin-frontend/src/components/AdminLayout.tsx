import { Button, Layout, Menu, Space, Tag, Typography } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'
import { useMe } from '../App'

const { Sider, Header, Content } = Layout

const MENU_ITEMS = [
  { key: '/', label: '대시보드' },
  { key: '/reports', label: '신고센터' },
  { key: '/users', label: '유저 관리' },
  { key: '/listings', label: '매물 관리' },
  { key: '/support', label: '고객센터' },
  { key: '/cms/notices', label: '공지 관리' },
  { key: '/cms/faqs', label: 'FAQ 관리' },
  { key: '/settings/banned-keywords', label: '금칙어' },
]

export default function AdminLayout() {
  const me = useMe()
  const location = useLocation()
  const navigate = useNavigate()

  const items = me.role === 'root' ? [...MENU_ITEMS, { key: '/audit-logs', label: '감사 로그' }] : MENU_ITEMS
  const selectedKey = items.some((i) => i.key === location.pathname) ? location.pathname : '/'

  const handleLogout = async () => {
    await logout().catch(() => {
      // 이미 만료된 세션이어도 로그인 화면으로 보낸다
    })
    window.location.href = '/admin/login'
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ color: '#fff', fontWeight: 700, padding: '16px', fontSize: 16 }}>Saigon Rider 관리자</div>
        <Menu
          theme="dark"
          mode="inline"
          style={{ flex: 1 }}
          items={items}
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(key)}
        />
        <div style={{ padding: '16px' }}>
          <a href="/admin-legacy/dashboard" target="_self" style={{ color: 'rgba(255,255,255,0.65)' }}>
            레거시 콘솔 열기
          </a>
        </div>
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          <Space>
            <Typography.Text strong>{me.username}</Typography.Text>
            <Tag color={me.role === 'root' ? 'red' : 'blue'}>{me.role.toUpperCase()}</Tag>
            <Button size="small" onClick={handleLogout}>
              로그아웃
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
