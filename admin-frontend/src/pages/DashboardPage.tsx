import { useNavigate } from 'react-router-dom'
import { Alert, Card, Col, Row, Skeleton, Table } from 'antd'
import { CustomerServiceOutlined, RightOutlined, WarningOutlined } from '@ant-design/icons'
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
const [NEW_USERS, NEW_LISTINGS, TRADES, REPORTS, TICKETS] = adminColors.chart

const REASON_COLUMNS = [
  { title: '사유', dataIndex: 'reason', key: 'reason' },
  { title: '건수', dataIndex: 'count', key: 'count', width: 80, align: 'right' as const },
]

/** '오늘 n / 최근 7일 m' 형태의 일반 스탯 카드. */
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

  return (
    <Row gutter={[16, 16]} className="dashboard-kpi">
      {/* 경고 스탯 — 0이면 기본색, >0이면 경고색. 클릭 시 해당 큐로 이동 */}
      <Col xs={24} sm={12} className="dashboard-priority">
        <StatCard title="미처리 신고" value={s.reports_open} suffix="건" tone="error" icon={<WarningOutlined />} onClick={() => navigate('/reports?status=open')} detail={<>오늘 접수 {s.reports_today.toLocaleString()} · 최근 7일 처리 {s.reports_resolved_7d.toLocaleString()} <RightOutlined /></>} />
      </Col>
      <Col xs={24} sm={12} className="dashboard-priority support">
        <StatCard title="미답변 문의" value={s.tickets_open} suffix="건" tone="warning" icon={<CustomerServiceOutlined />} onClick={() => navigate('/support?status=open')} detail={<>오늘 접수 {s.tickets_today.toLocaleString()} <RightOutlined /></>} />
      </Col>

      {/* 일반 스탯 */}
      <Col xs={12} sm={8} xl={6}>
        <StatCard title="DAU (오늘 접속)" value={s.dau} suffix="명" />
      </Col>
      <Col xs={12} sm={8} xl={6}>
        <StatCard title="신규 가입" value={s.new_users_today} suffix="명" detail={`최근 7일 ${s.new_users_7d.toLocaleString()}`} />
      </Col>
      <Col xs={12} sm={8} xl={6}>
        <StatCard title="매물 등록" value={s.listings_today} suffix="건" detail={`최근 7일 ${s.listings_7d.toLocaleString()}`} />
      </Col>
      <Col xs={12} sm={8} xl={6}>
        <StatCard title="거래 성사" value={s.trades_today} suffix="건" detail={`최근 7일 ${s.trades_7d.toLocaleString()}`} />
      </Col>
      <Col xs={12} sm={8} xl={6}>
        <StatCard title="판매중 매물" value={s.listings_on_sale} suffix="건" detail={`숨김 ${s.listings_hidden.toLocaleString()}`} />
      </Col>
      <Col xs={12} sm={8} xl={6}>
        <StatCard title="이용정지 계정" value={s.users_suspended} suffix="명" detail={`영구밴 ${s.users_banned.toLocaleString()}`} />
      </Col>
      <Col xs={12} sm={8} xl={6}>
        <StatCard title="첫 응답 SLA (7일)" value={s.first_reply_sla_hours === null ? '—' : s.first_reply_sla_hours.toFixed(1)} suffix={s.first_reply_sla_hours === null ? undefined : '시간'} detail="관리자 답변까지 평균" />
      </Col>

      {/* 14일 추이 차트 */}
      <Col xs={24} xl={16}>
        <Card title="최근 14일 추이">
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
              <Line
                type="monotone"
                dataKey="reports_created"
                name="신고"
                stroke={REPORTS}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="tickets_created"
                name="문의"
                stroke={TICKETS}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </Col>

      {/* 미처리 신고 사유 상위 */}
      <Col xs={24} xl={8}>
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
      </Col>
    </Row>
  )
}
