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
  FunnelPlotOutlined,
  IssuesCloseOutlined,
  LineChartOutlined,
  NotificationOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  BarChartOutlined,
  UnorderedListOutlined,
  SearchOutlined,
  SettingOutlined,
  TableOutlined,
  ShopOutlined,
  SolutionOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  TrophyOutlined,
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
  { key: 'group-trust', label: 'TRUST', children: [
    { key: '/reports', icon: <FlagOutlined />, label: '신고센터' },
    { key: '/issues', icon: <UnorderedListOutlined />, label: '통합 이슈 큐' },
    { key: '/issues/weekly-summary', icon: <BarChartOutlined />, label: '주간 이슈 집계' },
    { key: '/issues/reporter-trust', icon: <SafetyOutlined />, label: '신고자 신뢰도' },
    { key: '/users', icon: <TeamOutlined />, label: '유저 관리' },
    { key: '/listings', icon: <ShopOutlined />, label: '매물 관리' },
    { key: '/listings/dealer-candidates', icon: <UserSwitchOutlined />, label: '업자 후보' },
    { key: '/trades/completion-requests', icon: <IssuesCloseOutlined />, label: '거래 완료 이의' },
  ] },
  { key: 'group-care', label: 'CUSTOMER', children: [{ key: '/support', icon: <CustomerServiceOutlined />, label: '고객센터' }] },
  { key: 'group-analytics', label: 'ANALYTICS', children: [
    { key: '/analytics/liquidity', icon: <LineChartOutlined />, label: '유동성 지표 패널' },
    { key: '/analytics/funnel', icon: <FunnelPlotOutlined />, label: '전환 퍼널' },
    { key: '/analytics/zero-results', icon: <SearchOutlined />, label: '0건 검색어' },
    { key: '/analytics/retention', icon: <TableOutlined />, label: '코호트 리텐션' },
  ] },
  { key: 'group-biz', label: 'BUSINESS', children: [
    { key: '/biz/accounts', icon: <SolutionOutlined />, label: '파트너 심사' },
    { key: '/biz/ads', icon: <NotificationOutlined />, label: '광고 심사' },
    { key: '/biz/ad-tiers', icon: <DollarOutlined />, label: '광고 티어 정책' },
  ] },
  { key: 'group-community', label: 'COMMUNITY', children: [{ key: '/community/feed', icon: <PictureOutlined />, label: '피드 관리' }] },
  { key: 'group-map', label: 'NEIGHBORHOOD MAP', children: [
    { key: '/map/poi', icon: <EnvironmentOutlined />, label: 'POI 관리' },
    { key: '/map/place-suggestions', icon: <CompassOutlined />, label: '장소 제보 심사' },
    { key: '/map/gas-submissions', icon: <ThunderboltOutlined />, label: '주유소 제보 심사' },
    { key: '/map/repair-submissions', icon: <ToolOutlined />, label: '정비소 제보 심사' },
    { key: '/map/fuel-prices', icon: <DollarOutlined />, label: '유가 관리' },
    { key: '/map/ride-policy', icon: <AimOutlined />, label: '라이딩 정책' },
  ] },
  { key: 'group-content', label: 'CONTENT & POLICY', children: [
    { key: '/cms/notices', icon: <BellOutlined />, label: '공지 관리' },
    { key: '/cms/faqs', icon: <FileTextOutlined />, label: 'FAQ 관리' },
    { key: '/cms/badges', icon: <TrophyOutlined />, label: '배지 관리' },
    { key: '/settings/banned-keywords', icon: <SafetyCertificateOutlined />, label: '금칙어' },
  ] },
]

/** Finds the group (submenu) key whose children contain the given leaf key, for accordion default-open. */
function findGroupKey(groups: { key: string; children: { key: string }[] }[], targetKey: string) {
  return groups.find((group) => group.children.some((child) => child.key === targetKey))?.key
}

const PAGE_META = [
  { path: '/cms/notices', title: '공지 관리', description: '앱에 노출되는 공지 사항을 작성하고 게시합니다.' },
  { path: '/cms/faqs', title: 'FAQ 관리', description: '사용자 도움말 문답을 관리합니다.' },
  { path: '/cms/badges', title: '배지 관리', description: '유저에게 부여되는 배지와 습득 조건을 관리합니다.' },
  { path: '/settings/banned-keywords', title: '금칙어 관리', description: '대화 안전 정책에 적용되는 금칙어를 관리합니다.' },
  { path: '/system/engine-settings', title: 'ENGINE 설정', description: 'Engine 운영 현황과 보상·아이템·퀘스트·상점 정책을 탭에서 관리합니다.' },
  { path: '/system/accounts', title: '관리자 계정', description: '관리자 계정을 추가, 수정, 삭제합니다.' },
  { path: '/audit-logs', title: '감사 로그', description: '관리자 조치와 접근 이력을 확인합니다.' },
  { path: '/reports', title: '신고센터', description: '신고 접수부터 조치까지의 검토 흐름을 관리합니다.' },
  { path: '/issues/weekly-summary', title: '주간 이슈 집계', description: '최근 유형별 건수와 중위 처리시간을 확인합니다.' },
  { path: '/issues/reporter-trust', title: '신고자 신뢰도', description: '검수 큐 정렬 참고용 신고자별 기각률·취소 이력입니다. 조회 전용이며 신고 접수를 막지 않습니다.' },
  { path: '/issues', title: '통합 이슈 큐', description: '신고·문의·업체 이슈·외부 등록 건을 채널 구분 없이 심각도 순으로 확인합니다.' },
  { path: '/users', title: '유저 관리', description: '유저 상태, 제재 이력 및 신뢰 정보를 확인합니다.' },
  { path: '/listings/dealer-candidates', title: '업자 후보', description: '업자로 추정되는 판매자 목록입니다. 제재가 아닌 비즈 프로필 전환 안내가 유일한 조치입니다.' },
  { path: '/listings', title: '매물 관리', description: '등록 매물을 검토하고 필요한 운영 조치를 적용합니다.' },
  { path: '/trades/completion-requests', title: '거래 완료 이의', description: '구매자가 완료를 요청했으나 판매자가 확인하지 않은 거래를 검토합니다.' },
  { path: '/support', title: '고객센터', description: '사용자 문의와 답변 상태를 관리합니다.' },
  { path: '/analytics/liquidity', title: '유동성 지표 패널', description: '마켓플레이스 파일럿 성패 판정 기준(L-1~L-5)을 목표선과 함께 확인합니다.' },
  { path: '/analytics/funnel', title: '전환 퍼널', description: '가입부터 거래완료까지 세그먼트별 전환 퍼널을 확인합니다.' },
  { path: '/analytics/zero-results', title: '0건 검색어', description: '결과 0건 검색어를 확인해 필드 에이전트 발굴 대상을 정합니다.' },
  { path: '/analytics/retention', title: '코호트 리텐션', description: '가입 주차별 D1/D7/D30 리텐션율을 히트맵으로 확인합니다.' },
  { path: '/community/feed', title: '피드 관리', description: '공식계정 피드를 작성하고, 사용자 피드 게시물을 조회·삭제합니다.' },
  { path: '/map/poi', title: 'POI 관리', description: '동네지도에 노출되는 POI를 등록하고 관리합니다.' },
  { path: '/map/place-suggestions', title: '장소 제보 심사', description: '사용자가 제보한 장소를 승인하거나 반려합니다.' },
  { path: '/map/gas-submissions', title: '주유소 제보 심사', description: '사용자가 제보한 주유소를 승인하거나 반려합니다.' },
  { path: '/map/repair-submissions', title: '정비소 제보 심사', description: '사용자가 제보한 정비소를 승인하거나 반려합니다.' },
  { path: '/map/fuel-prices', title: '유가 관리', description: '브랜드별 참고 유가를 등록하고 수집 파이프라인 상태를 확인합니다.' },
  { path: '/map/ride-policy', title: '라이딩 정책', description: '체크포인트 근접 거리, 거리 밴드, 일일 퀘스트 기본 슬롯을 설정합니다.' },
  { path: '/biz/accounts', title: '비즈니스 파트너 심사', description: '비즈니스 계정 신청을 심사하고 그룹·정지 등 계정을 관리합니다.' },
  { path: '/biz/ads', title: '인앱 광고 심사', description: '비즈니스 파트너가 등록한 광고 소재를 심사합니다.' },
  { path: '/biz/ad-tiers', title: '광고 티어 정책', description: '월 가격과 노출 빈도 가중치를 관리합니다.' },
  { path: '/system/settings', title: '설정', description: '관리자 프로필, 닉네임 단어사전, 앱 버전, 서비스 설정을 관리합니다.' },
  { path: '/', title: '운영 현황', description: '오늘 확인해야 할 운영 지표와 처리 대기 항목입니다.' },
]

export default function AdminLayout() {
  const me = useMe()
  const { mode, toggle } = useAdminTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const isPrivileged = me.role === 'root' || me.role === 'admin'
  const baseItems = isPrivileged
    ? MENU_ITEMS
    : MENU_ITEMS.map((group) =>
        group.key === 'group-map'
          ? { ...group, children: group.children.filter((child) => child.key !== '/map/ride-policy') }
          : group,
      )
  const systemChildren = [
    { key: '/system/settings', icon: <SettingOutlined />, label: '설정' },
    ...(isPrivileged ? [
      { key: '/system/accounts', icon: <UserSwitchOutlined />, label: '관리자 계정' },
      { key: '/system/engine-settings', icon: <ToolOutlined />, label: 'ENGINE 설정' },
      { key: '/audit-logs', icon: <AuditOutlined />, label: '감사로그' },
    ] : []),
  ]
  const items = [...baseItems, { key: 'group-system', label: 'SYSTEM', children: systemChildren }]
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
