import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Skeleton, Table } from 'antd'
import {
  CustomerServiceOutlined,
  ReloadOutlined,
  RightOutlined,
  ShopOutlined,
  SoundOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useDashboardDaily, useDashboardSummary, type ReasonCount } from '../api/dashboard'
import StatCard from '../components/StatCard'
import { adminColors } from '../theme/tokens'

// 검증된 카테고리 팔레트 (흰 배경 대비·CVD 분리 통과) — 보조 라인(신고/문의)은 점선으로 추가 구분
const [NEW_USERS, NEW_LISTINGS, TRADES, REPORTS, TICKETS, NEW_PARTNERS, NEW_ADS] = adminColors.chart

const REASON_COLUMNS = [
  { title: '사유', dataIndex: 'reason', key: 'reason' },
  { title: '건수', dataIndex: 'count', key: 'count', width: 80, align: 'right' as const },
]

function Metric({
  label,
  value,
  unit,
}: {
  label: string
  value: string | number
  unit?: string
}) {
  return (
    <div className="dashboard-status-metric">
      <dt>{label}</dt>
      <dd>{typeof value === 'number' ? value.toLocaleString() : value}{unit && <small>{unit}</small>}</dd>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const summaryQ = useDashboardSummary()
  const dailyQ = useDashboardDaily(14)

  if (summaryQ.isError || dailyQ.isError) {
    const err = summaryQ.error ?? dailyQ.error
    return <Alert type="error" showIcon message="대시보드 지표를 불러오지 못했습니다." description={err instanceof Error ? err.message : undefined} />
  }
  if (summaryQ.isLoading || dailyQ.isLoading || !summaryQ.data || !dailyQ.data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    )
  }

  const s = summaryQ.data
  const daily = dailyQ.data
  const pendingTotal = s.reports_open + s.tickets_open + s.biz_partners_pending + s.biz_ads_pending
  const updatedAt = Math.min(summaryQ.dataUpdatedAt, dailyQ.dataUpdatedAt)
  const updatedTime = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(updatedAt)
  const isRefreshing = summaryQ.isFetching || dailyQ.isFetching

  const actionRows = [
    {
      key: 'reports',
      label: '미처리 신고',
      count: s.reports_open,
      detail: `오늘 접수 ${s.reports_today.toLocaleString()} · 최근 7일 처리 ${s.reports_resolved_7d.toLocaleString()}`,
      icon: <WarningOutlined />,
      tone: 'error',
      actions: [
        { label: '접수 대기', path: '/reports?status=PENDING' },
        { label: '검토 중', path: '/reports?status=REVIEWING' },
      ],
    },
    {
      key: 'support',
      label: '미답변 문의',
      count: s.tickets_open,
      detail: `오늘 접수 ${s.tickets_today.toLocaleString()}`,
      icon: <CustomerServiceOutlined />,
      tone: 'warning',
      actions: [{ label: '목록 보기', path: '/support?status=open' }],
    },
    {
      key: 'partners',
      label: '파트너 심사대기',
      count: s.biz_partners_pending,
      detail: `승인 ${s.biz_partners_approved.toLocaleString()} · 정지 ${s.biz_partners_suspended.toLocaleString()}`,
      icon: <ShopOutlined />,
      tone: 'warning',
      actions: [{ label: '목록 보기', path: '/biz/accounts?status=PENDING' }],
    },
    {
      key: 'ads',
      label: '광고 심사대기',
      count: s.biz_ads_pending,
      detail: `론칭중 ${s.biz_ads_launching.toLocaleString()}`,
      icon: <SoundOutlined />,
      tone: 'warning',
      actions: [{ label: '목록 보기', path: '/biz/ads?status=PENDING' }],
    },
  ] as const

  return (
    <div className="dashboard-page">
      <div className="dashboard-toolbar" aria-label="대시보드 조회 정보">
        <span>오늘 · 최근 7일 기준</span>
        <div>
          <span>마지막 조회 {updatedTime}</span>
          <Button
            icon={<ReloadOutlined />}
            loading={isRefreshing}
            onClick={() => void Promise.all([summaryQ.refetch(), dailyQ.refetch()])}
          >
            새로고침
          </Button>
        </div>
      </div>

      <section className="dashboard-section dashboard-attention" aria-labelledby="dashboard-attention-title">
        <header className="dashboard-section-header">
          <div>
            <h2 id="dashboard-attention-title">확인 필요</h2>
            <p>처리가 필요한 운영 업무입니다.</p>
          </div>
          <strong>{pendingTotal.toLocaleString()}<small>건 대기</small></strong>
        </header>
        <div className="dashboard-action-list">
          {actionRows.map((item) => (
            <div
              key={item.key}
              className={`dashboard-action-row dashboard-action-${item.tone}${item.count === 0 ? ' is-zero' : ''}`}
            >
              <span className="dashboard-action-icon" aria-hidden="true">{item.icon}</span>
              <span className="dashboard-action-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <span className="dashboard-action-count">{item.count.toLocaleString()}<small>건</small></span>
              <span className="dashboard-action-links">
                {item.actions.map((action) => (
                  <button
                    key={action.path}
                    type="button"
                    className="dashboard-action-link"
                    onClick={() => navigate(action.path)}
                    aria-label={`${item.label} ${action.label}`}
                  >
                    {action.label} <RightOutlined />
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-flow-title">
        <header className="dashboard-section-header">
          <div>
            <h2 id="dashboard-flow-title">운영 흐름</h2>
            <p>오늘의 핵심 서비스 활동과 최근 7일 누계입니다.</p>
          </div>
        </header>
        <div className="dashboard-flow-grid">
          <StatCard title="DAU (오늘 접속)" value={s.dau} suffix="명" state="live" onClick={() => navigate('/users')} />
          <StatCard title="WAU (최근 7일 접속)" value={s.wau} suffix="명" state="live" onClick={() => navigate('/users')} />
          <StatCard title="MAU (최근 30일 접속)" value={s.mau} suffix="명" state="live" onClick={() => navigate('/users')} />
          <StatCard
            title="스티키니스 (DAU/MAU)"
            value={s.stickiness_dau_mau === null ? '—' : (s.stickiness_dau_mau * 100).toFixed(1)}
            suffix={s.stickiness_dau_mau === null ? undefined : '%'}
            state="live"
          />
          <StatCard title="신규 가입" value={s.new_users_today} suffix="명" detail={`최근 7일 누계 ${s.new_users_7d.toLocaleString()}`} onClick={() => navigate('/users')} />
          <StatCard title="매물 등록" value={s.listings_today} suffix="건" detail={`최근 7일 누계 ${s.listings_7d.toLocaleString()}`} onClick={() => navigate('/listings')} />
          <StatCard title="거래 성사" value={s.trades_today} suffix="건" detail={`최근 7일 누계 ${s.trades_7d.toLocaleString()}`} />
          <StatCard
            title="GMV (오늘)"
            value={s.gmv_vnd_today}
            suffix="VND"
            detail={`표본 ${s.gmv_sample_today.toLocaleString()}건 · 최근 7일 누계 ${s.gmv_vnd_7d.toLocaleString()}`}
            state={s.gmv_status_today.state}
            coverage={s.gmv_status_today.coverage}
          />
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-status-title">
        <header className="dashboard-section-header">
          <div>
            <h2 id="dashboard-status-title">운영 상태</h2>
            <p>도메인별 현재 재고와 운영 상태를 요약합니다.</p>
          </div>
        </header>
        <div className="dashboard-status-grid">
          <article className="dashboard-status-panel">
            <h3>계정 · 안전</h3>
            <dl>
              <Metric label="이용정지" value={s.users_suspended} unit="명" />
              <Metric label="영구밴" value={s.users_banned} unit="명" />
              <Metric label="첫 응답 SLA (7일)" value={s.first_reply_sla_hours === null ? '—' : s.first_reply_sla_hours.toFixed(1)} unit={s.first_reply_sla_hours === null ? undefined : '시간'} />
            </dl>
            <p>
              <Button type="link" onClick={() => navigate('/users')}>유저 목록</Button>
              <Button type="link" onClick={() => navigate('/reports')}>신고 목록</Button>
              <Button type="link" onClick={() => navigate('/support')}>문의 목록</Button>
            </p>
          </article>
          <article className="dashboard-status-panel">
            <h3>마켓</h3>
            <dl>
              <Metric label="판매중 매물" value={s.listings_on_sale} unit="건" />
              <Metric label="숨김" value={s.listings_hidden} unit="건" />
            </dl>
            <p><Button type="link" onClick={() => navigate('/listings')}>매물 목록</Button></p>
          </article>
          <article className="dashboard-status-panel">
            <h3>파트너</h3>
            <dl>
              <Metric label="승인" value={s.biz_partners_approved} unit="개" />
              <Metric label="정지" value={s.biz_partners_suspended} unit="개" />
              <Metric label="신규 신청 (오늘)" value={s.biz_partners_new_today} unit="건" />
              <Metric label="신규 신청 (7일)" value={s.biz_partners_new_7d} unit="건" />
            </dl>
            <p><Button type="link" onClick={() => navigate('/biz/accounts')}>파트너 목록</Button></p>
          </article>
          <article className="dashboard-status-panel dashboard-status-ads">
            <h3>광고</h3>
            <dl>
              <Metric label="론칭중" value={s.biz_ads_launching} unit="건" />
              <Metric label="신규 등록 (오늘)" value={s.biz_ads_today} unit="건" />
              <Metric label="신규 등록 (7일)" value={s.biz_ads_7d} unit="건" />
              <Metric label="월 구독액 snapshot (론칭중)" value={s.biz_ads_monthly_price_sum} unit="VND" />
            </dl>
            <p>
              {s.biz_ads_tier_counts.map((tier) => `${tier.name} ${tier.count.toLocaleString()}`).join(' · ') || '티어 없음'}
            </p>
            <p>
              <Button type="link" onClick={() => navigate('/biz/ads')}>광고 목록</Button>
              <Button type="link" onClick={() => navigate('/biz/ad-tiers')}>광고 티어 정책</Button>
            </p>
          </article>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-trend-title">
        <header className="dashboard-section-header">
          <div>
            <h2 id="dashboard-trend-title">14일 추이와 신고 원인</h2>
            <p>일자별 활동 흐름과 현재 미처리 신고 구성을 확인합니다.</p>
          </div>
        </header>
        <div className="dashboard-insight-grid">
          <Card title="최근 14일 추이" className="dashboard-main-chart">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={daily} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={adminColors.chartGrid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} tickMargin={8} />
                <YAxis allowDecimals={false} fontSize={12} />
                <ChartTooltip />
                <Legend />
                <Line type="monotone" dataKey="new_users" name="신규가입" stroke={NEW_USERS} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="new_listings" name="매물등록" stroke={NEW_LISTINGS} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="trades_completed" name="거래성사" stroke={TRADES} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="reports_created" name="신고" stroke={REPORTS} strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                <Line type="monotone" dataKey="tickets_created" name="문의" stroke={TICKETS} strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="파트너·광고 추이 (14일)">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={daily} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={adminColors.chartGrid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={12} tickMargin={8} />
                <YAxis allowDecimals={false} fontSize={12} />
                <ChartTooltip />
                <Legend />
                <Line type="monotone" dataKey="new_partners" name="신규 파트너" stroke={NEW_PARTNERS} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="new_ads" name="광고 등록" stroke={NEW_ADS} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card title="미처리 신고 사유 TOP 5">
            <Table<ReasonCount>
              size="small"
              rowKey="reason"
              columns={REASON_COLUMNS}
              dataSource={s.reports_by_reason}
              pagination={false}
              locale={{ emptyText: '미처리 신고가 없습니다' }}
            />
          </Card>
        </div>
      </section>
    </div>
  )
}
