import { useEffect, useState } from 'react'
import { Avatar, Breadcrumb, Button, Layout, Menu, Tag, Tooltip, Typography } from 'antd'
import {
  AimOutlined,
  AuditOutlined,
  BellOutlined,
  CompassOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  FlagOutlined,
  NotificationOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  SolutionOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserSwitchOutlined,
  MoonOutlined,
  SunOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'
import { useAdminTheme, useMe } from '../App'
import ErrorBoundary from './ErrorBoundary'

const { Sider, Header, Content } = Layout

const MENU_ITEMS = [
  { key: 'group-overview', label: 'OVERVIEW', children: [{ key: '/', icon: <DashboardOutlined />, label: '대시보드' }] },
  { key: 'group-trust', label: 'TRUST & SAFETY', children: [
    { key: '/reports', icon: <FlagOutlined />, label: '신고센터' },
    { key: '/users', icon: <TeamOutlined />, label: '유저 관리' },
    { key: '/listings', icon: <ShopOutlined />, label: '매물 관리' },
  ] },
  { key: 'group-care', label: 'CUSTOMER CARE', children: [{ key: '/support', icon: <CustomerServiceOutlined />, label: '고객센터' }] },
  { key: 'group-community', label: '커뮤니티', children: [{ key: '/community/feed', icon: <PictureOutlined />, label: '피드 관리' }] },
  { key: 'group-content', label: 'CONTENT & POLICY', children: [
    { key: '/cms/notices', icon: <BellOutlined />, label: '공지 관리' },
    { key: '/cms/faqs', icon: <FileTextOutlined />, label: 'FAQ 관리' },
    { key: '/settings/banned-keywords', icon: <SafetyCertificateOutlined />, label: '금칙어' },
  ] },
  { key: 'group-map', label: '동네지도', children: [
    { key: '/map/poi', icon: <EnvironmentOutlined />, label: 'POI 관리' },
    { key: '/map/place-suggestions', icon: <CompassOutlined />, label: '장소 제보 심사' },
    { key: '/map/gas-submissions', icon: <ThunderboltOutlined />, label: '주유소 제보 심사' },
    { key: '/map/repair-submissions', icon: <ToolOutlined />, label: '정비소 제보 심사' },
    { key: '/map/fuel-prices', icon: <DollarOutlined />, label: '유가 관리' },
    { key: '/map/ride-policy', icon: <AimOutlined />, label: '라이딩 정책' },
  ] },
  { key: 'group-biz', label: '비즈니스', children: [
    { key: '/biz/accounts', icon: <SolutionOutlined />, label: '파트너 심사' },
    { key: '/biz/ads', icon: <NotificationOutlined />, label: '광고 심사' },
  ] },
]

/** Finds the group (submenu) key whose children contain the given leaf key, for accordion default-open. */
function findGroupKey(groups: { key: string; children: { key: string }[] }[], targetKey: string) {
  return groups.find((group) => group.children.some((child) => child.key === targetKey))?.key
}

const PAGE_META = [
  { path: '/cms/notices', title: '공지 관리', description: '앱에 노출되는 공지 사항을 작성하고 게시합니다.' },
  { path: '/cms/faqs', title: 'FAQ 관리', description: '사용자 도움말 문답을 관리합니다.' },
  { path: '/settings/banned-keywords', title: '금칙어 관리', description: '대화 안전 정책에 적용되는 금칙어를 관리합니다.' },
  { path: '/system/accounts', title: '관리자 계정', description: '관리자 계정을 추가, 수정, 삭제합니다.' },
  { path: '/audit-logs', title: '감사 로그', description: '관리자 조치와 접근 이력을 확인합니다.' },
  { path: '/reports', title: '신고센터', description: '신고 접수부터 조치까지의 검토 흐름을 관리합니다.' },
  { path: '/users', title: '유저 관리', description: '유저 상태, 제재 이력 및 신뢰 정보를 확인합니다.' },
  { path: '/listings', title: '매물 관리', description: '등록 매물을 검토하고 필요한 운영 조치를 적용합니다.' },
  { path: '/support', title: '고객센터', description: '사용자 문의와 답변 상태를 관리합니다.' },
  { path: '/community/feed', title: '피드 관리', description: '사용자 피드 게시물을 조회하고 필요 시 삭제합니다.' },
  { path: '/map/poi', title: 'POI 관리', description: '동네지도에 노출되는 POI를 등록하고 관리합니다.' },
  { path: '/map/place-suggestions', title: '장소 제보 심사', description: '사용자가 제보한 장소를 승인하거나 반려합니다.' },
  { path: '/map/gas-submissions', title: '주유소 제보 심사', description: '사용자가 제보한 주유소를 승인하거나 반려합니다.' },
  { path: '/map/repair-submissions', title: '정비소 제보 심사', description: '사용자가 제보한 정비소를 승인하거나 반려합니다.' },
  { path: '/map/fuel-prices', title: '유가 관리', description: '브랜드별 참고 유가를 등록하고 수집 파이프라인 상태를 확인합니다.' },
  { path: '/map/ride-policy', title: '라이딩 정책', description: '체크포인트 근접 거리, 거리 밴드, 일일 퀘스트 기본 슬롯을 설정합니다.' },
  { path: '/biz/accounts', title: '비즈니스 파트너 심사', description: '비즈니스 계정 신청을 심사하고 그룹·정지 등 계정을 관리합니다.' },
  { path: '/biz/ads', title: '인앱 광고 심사', description: '비즈니스 파트너가 등록한 광고 소재를 심사합니다.' },
  { path: '/', title: '운영 현황', description: '오늘 확인해야 할 운영 지표와 처리 대기 항목입니다.' },
]

export default function AdminLayout() {
  const me = useMe()
  const { mode, toggle } = useAdminTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const items = me.role === 'root' || me.role === 'admin'
    ? [...MENU_ITEMS, { key: 'group-system', label: 'SYSTEM', children: [
        { key: '/system/accounts', icon: <UserSwitchOutlined />, label: '관리자 계정' },
        { key: '/audit-logs', icon: <AuditOutlined />, label: '감사 로그' },
      ] }]
    : MENU_ITEMS
  const page = PAGE_META.find((item) => location.pathname.startsWith(item.path)) ?? PAGE_META[PAGE_META.length - 1]

  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const activeGroup = findGroupKey(items, page.path)
    return activeGroup ? [activeGroup] : []
  })

  useEffect(() => {
    const activeGroup = findGroupKey(items, page.path)
    if (activeGroup) setOpenKeys((prev) => (prev.includes(activeGroup) ? prev : [...prev, activeGroup]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.path])

  const anyOpen = openKeys.length > 0
  const handleToggleAll = () => setOpenKeys(anyOpen ? [] : items.map((group) => group.key))

  const handleLogout = async () => {
    await logout().catch(() => undefined)
    window.location.href = '/admin/login'
  }

  return (
    <Layout className="admin-shell">
      <Sider width={256} className="admin-sider">
        <div className="admin-brand">
          <img className="admin-brand-mark" src="/admin/saigon-rider-logo.png" alt="" />
          <div><strong>Saigon Rider</strong><span>Operations Console</span></div>
          <Tooltip title={anyOpen ? '전체 접기' : '전체 열기'}>
            <Button
              className="admin-menu-toggle-all"
              type="text"
              shape="circle"
              size="small"
              icon={anyOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={handleToggleAll}
              aria-label={anyOpen ? '전체 접기' : '전체 열기'}
            />
          </Tooltip>
        </div>
        <div className="admin-sider-menu">
          <Menu
            theme={mode}
            mode="inline"
            inlineIndent={16}
            items={items}
            selectedKeys={[page.path]}
            openKeys={openKeys}
            onOpenChange={setOpenKeys}
            onClick={({ key }) => navigate(key)}
          />
        </div>
        <div className="admin-sider-footer">
          <Avatar>{me.username.slice(0, 1).toUpperCase()}</Avatar>
          <div><strong>{me.username}</strong><span>{me.role === 'root' ? 'Root administrator' : me.role === 'admin' ? 'Administrator' : 'Manager'}</span></div>
          <Button type="text" size="small" onClick={handleLogout}>로그아웃</Button>
        </div>
      </Sider>
      <Layout className="admin-main">
        <Header className="admin-topbar">
          <div className="admin-location"><Breadcrumb items={[{ title: '관리자' }, { title: page.title }]} /><span>{page.title}</span></div>
          <div className="admin-account">
            <Button className="admin-landing-link" type="text" icon={<GlobalOutlined />} href="https://www.saigon-rider.com/" target="_blank" rel="noopener noreferrer">랜딩 페이지</Button>
            <Button className="admin-theme-toggle" type="text" shape="circle" icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} aria-label={mode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'} title={mode === 'dark' ? '라이트 모드' : '다크 모드'} />
            <Avatar>{me.username.slice(0, 1).toUpperCase()}</Avatar><span>{me.username}</span><Tag className={me.role === 'root' ? 'role-root' : me.role === 'admin' ? 'role-admin' : 'role-manager'}>{me.role.toUpperCase()}</Tag>
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
