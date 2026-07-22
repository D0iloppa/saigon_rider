import { Avatar, Breadcrumb, Button, Layout, Menu, Tag, Typography } from 'antd'
import {
  AuditOutlined,
  BellOutlined,
  CompassOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  FlagOutlined,
  NotificationOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  SolutionOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  MoonOutlined,
  SunOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'
import { useAdminTheme, useMe } from '../App'
import ErrorBoundary from './ErrorBoundary'

const { Sider, Header, Content } = Layout

const MENU_ITEMS = [
  { type: 'group' as const, label: 'OVERVIEW', children: [{ key: '/', icon: <DashboardOutlined />, label: '대시보드' }] },
  { type: 'group' as const, label: 'TRUST & SAFETY', children: [
    { key: '/reports', icon: <FlagOutlined />, label: '신고센터' },
    { key: '/users', icon: <TeamOutlined />, label: '유저 관리' },
    { key: '/listings', icon: <ShopOutlined />, label: '매물 관리' },
  ] },
  { type: 'group' as const, label: 'CUSTOMER CARE', children: [{ key: '/support', icon: <CustomerServiceOutlined />, label: '고객센터' }] },
  { type: 'group' as const, label: 'CONTENT & POLICY', children: [
    { key: '/cms/notices', icon: <BellOutlined />, label: '공지 관리' },
    { key: '/cms/faqs', icon: <FileTextOutlined />, label: 'FAQ 관리' },
    { key: '/settings/banned-keywords', icon: <SafetyCertificateOutlined />, label: '금칙어' },
  ] },
  { type: 'group' as const, label: '동네지도', children: [
    { key: '/map/poi', icon: <EnvironmentOutlined />, label: 'POI 관리' },
    { key: '/map/place-suggestions', icon: <CompassOutlined />, label: '장소 제보 심사' },
    { key: '/map/gas-submissions', icon: <ThunderboltOutlined />, label: '주유소 제보 심사' },
    { key: '/map/repair-submissions', icon: <ToolOutlined />, label: '정비소 제보 심사' },
  ] },
  { type: 'group' as const, label: '비즈니스', children: [
    { key: '/biz/accounts', icon: <SolutionOutlined />, label: '파트너 심사' },
    { key: '/biz/ads', icon: <NotificationOutlined />, label: '광고 심사' },
  ] },
]

const PAGE_META = [
  { path: '/cms/notices', title: '공지 관리', description: '앱에 노출되는 공지 사항을 작성하고 게시합니다.' },
  { path: '/cms/faqs', title: 'FAQ 관리', description: '사용자 도움말 문답을 관리합니다.' },
  { path: '/settings/banned-keywords', title: '금칙어 관리', description: '대화 안전 정책에 적용되는 금칙어를 관리합니다.' },
  { path: '/audit-logs', title: '감사 로그', description: '관리자 조치와 접근 이력을 확인합니다.' },
  { path: '/reports', title: '신고센터', description: '신고 접수부터 조치까지의 검토 흐름을 관리합니다.' },
  { path: '/users', title: '유저 관리', description: '유저 상태, 제재 이력 및 신뢰 정보를 확인합니다.' },
  { path: '/listings', title: '매물 관리', description: '등록 매물을 검토하고 필요한 운영 조치를 적용합니다.' },
  { path: '/support', title: '고객센터', description: '사용자 문의와 답변 상태를 관리합니다.' },
  { path: '/map/poi', title: 'POI 관리', description: '동네지도에 노출되는 POI를 등록하고 관리합니다.' },
  { path: '/map/place-suggestions', title: '장소 제보 심사', description: '사용자가 제보한 장소를 승인하거나 반려합니다.' },
  { path: '/map/gas-submissions', title: '주유소 제보 심사', description: '사용자가 제보한 주유소를 승인하거나 반려합니다.' },
  { path: '/map/repair-submissions', title: '정비소 제보 심사', description: '사용자가 제보한 정비소를 승인하거나 반려합니다.' },
  { path: '/biz/accounts', title: '비즈니스 파트너 심사', description: '비즈니스 계정 신청을 심사하고 그룹·정지 등 계정을 관리합니다.' },
  { path: '/biz/ads', title: '인앱 광고 심사', description: '비즈니스 파트너가 등록한 광고 소재를 심사합니다.' },
  { path: '/', title: '운영 현황', description: '오늘 확인해야 할 운영 지표와 처리 대기 항목입니다.' },
]

export default function AdminLayout() {
  const me = useMe()
  const { mode, toggle } = useAdminTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const items = me.role === 'root'
    ? [...MENU_ITEMS, { type: 'group' as const, label: 'SYSTEM', children: [{ key: '/audit-logs', icon: <AuditOutlined />, label: '감사 로그' }] }]
    : MENU_ITEMS
  const page = PAGE_META.find((item) => location.pathname.startsWith(item.path)) ?? PAGE_META[PAGE_META.length - 1]

  const handleLogout = async () => {
    await logout().catch(() => undefined)
    window.location.href = '/admin/login'
  }

  return (
    <Layout className="admin-shell">
      <Sider width={256} className="admin-sider" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="admin-brand"><img className="admin-brand-mark" src="/admin/saigon-rider-logo.png" alt="" /><div><strong>Saigon Rider</strong><span>Operations Console</span></div></div>
        <Menu theme={mode} mode="inline" style={{ flex: 1 }} items={items} selectedKeys={[page.path]} onClick={({ key }) => navigate(key)} />
        <div className="admin-sider-footer">
          <Avatar>{me.username.slice(0, 1).toUpperCase()}</Avatar>
          <div><strong>{me.username}</strong><span>{me.role === 'root' ? 'Root administrator' : 'Administrator'}</span></div>
          <Button type="text" size="small" onClick={handleLogout}>로그아웃</Button>
        </div>
      </Sider>
      <Layout className="admin-main">
        <Header className="admin-topbar">
          <div className="admin-location"><Breadcrumb items={[{ title: '관리자' }, { title: page.title }]} /><span>{page.title}</span></div>
          <div className="admin-account">
            <Button className="admin-landing-link" type="text" icon={<GlobalOutlined />} href="https://www.saigon-rider.com/" target="_blank" rel="noopener noreferrer">랜딩 페이지</Button>
            <Button className="admin-theme-toggle" type="text" shape="circle" icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} aria-label={mode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'} title={mode === 'dark' ? '라이트 모드' : '다크 모드'} />
            <Avatar>{me.username.slice(0, 1).toUpperCase()}</Avatar><span>{me.username}</span><Tag className={me.role === 'root' ? 'role-root' : 'role-admin'}>{me.role.toUpperCase()}</Tag>
          </div>
        </Header>
        <Content className="admin-content">
          <div className="admin-page-header">
            <Typography.Title level={1}>{page.title}</Typography.Title>
            <p>{page.description}</p>
          </div>
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  )
}
