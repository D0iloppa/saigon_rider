import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Card, Col, Descriptions, Empty, Row, Segmented, Select, Skeleton, Table, Tag, Typography } from 'antd'
import { WarningFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useActionQueueSummary } from '../../api/actionQueue'
import { useIssues, type IssueRow } from '../../api/issues'
import { useTicket } from '../../api/support'

// 016 §8-3: 채널이 4개여도 대기열은 1개 — source 는 채널 필터일 뿐.
const SOURCE_OPTIONS = [
  { label: '전체', value: 'ALL' },
  { label: '신고버튼', value: 'REPORT' },
  { label: '고객문의', value: 'APP' },
  { label: '업체 이슈(#27)', value: 'BIZ' },
  { label: '외부/수기', value: 'EXTERNAL' },
]

const SOURCE_LABEL: Record<string, string> = {
  REPORT: '신고버튼',
  APP: '고객문의',
  BIZ: '업체 이슈',
  EXTERNAL: '외부/수기',
}

const SEVERITY_LABEL: Record<string, string> = {
  SEV1: 'SEV1 · 최상위',
  SEV2: 'SEV2',
  SEV3: 'SEV3',
  SEV4: 'SEV4',
}

/** SEV1 은 색만으로 구분하지 않는다 — 아이콘 + 라벨 병기(요구사항 명시). */
function SeverityTag({ severity }: { severity: string }) {
  if (severity === 'SEV1') {
    return (
      <Tag icon={<WarningFilled />} color="error" style={{ fontWeight: 700 }}>
        {SEVERITY_LABEL.SEV1}
      </Tag>
    )
  }
  const color = severity === 'SEV2' ? 'warning' : severity === 'SEV3' ? 'processing' : 'default'
  return <Tag color={color}>{SEVERITY_LABEL[severity] ?? severity}</Tag>
}

/** #27 업체 이슈 채널 — support_tickets.contract_context(계약ID·tier·구·기간)를 노출한다.
 * 통합 큐 응답(IssueRow)에는 이 필드가 없어(issues.py 스키마 미포함) 행을 펼칠 때만
 * 티켓 상세(/admin/api/support/tickets/{id})를 조회해 보여준다 — 조회 전용, 지연 로딩. */
function ContractContextPanel({ ticketId }: { ticketId: string }) {
  const { data, isLoading, isError } = useTicket(ticketId)
  if (isLoading) return <Skeleton active paragraph={{ rows: 2 }} />
  if (isError || !data) return <Alert type="warning" showIcon message="계약 정보를 불러오지 못했습니다." />
  const ctx = data.contract_context as
    | { ad_id?: string; tier_name?: string; district_id?: number; starts_at?: string | null; ends_at?: string | null }
    | null
    | undefined
  if (!ctx) return <Alert type="info" showIcon message="이 티켓에는 연결된 계약 정보가 없습니다." />
  return (
    <Descriptions size="small" column={2} bordered title="계약 컨텍스트 (#27)">
      <Descriptions.Item label="광고 ID">{ctx.ad_id ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="티어">{ctx.tier_name ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="구">{ctx.district_id != null ? `구 #${ctx.district_id}` : '-'}</Descriptions.Item>
      <Descriptions.Item label="계약 기간">
        {ctx.starts_at ? dayjs(ctx.starts_at).format('YYYY-MM-DD') : '-'} ~{' '}
        {ctx.ends_at ? dayjs(ctx.ends_at).format('YYYY-MM-DD') : '-'}
      </Descriptions.Item>
    </Descriptions>
  )
}

// 섹션 카드 자체(미리보기 항목이 아닌 카드 여백)를 클릭했을 때 이동할 목적지 —
// 대기열이 0건이어도(items 가 비어도) 해당 목록 화면으로는 갈 수 있어야 하므로
// section.items[0] 에 의존하지 않고 섹션별로 고정한다. App.tsx MENU_ITEMS 의 실제 라우트 그대로.
const SECTION_ROUTE: Record<string, string> = {
  report: '/reports',
  ticket: '/support',
  biz_account: '/biz/accounts',
  biz_ad: '/biz/ads',
  trade_completion: '/trades/completion-requests',
  field_report: '/map/place-suggestions',
}

/** 오늘의 조치 큐 — 신고/문의/파트너승인/광고승인/완료요청/제보 6종을 카드로 나열한다.
 * 각 카드는 해당 대기열의 기존 화면(라우트 재사용, App.tsx 무변경)으로 이동만 시킨다.
 * 아래의 신고+문의 통합 테이블(기존 IssueQueuePage 본연 기능)은 그대로 유지 — 카드는
 * "6종 전체를 한눈에" 보는 진입점이고, 신고/문의 상세 큐잉·필터는 여전히 아래 테이블이 맡는다. */
function ActionQueueBoard() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useActionQueueSummary()

  if (isError) {
    return <Alert type="warning" showIcon message="오늘의 조치 큐 요약을 불러오지 못했습니다." style={{ marginBottom: 16 }} />
  }
  if (isLoading || !data) {
    return <Skeleton active paragraph={{ rows: 3 }} style={{ marginBottom: 16 }} />
  }

  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
      {data.sections.map((section) => (
        <Col xs={24} sm={12} md={8} lg={4} key={section.key}>
          <Card
            hoverable
            size="small"
            onClick={() => navigate(SECTION_ROUTE[section.key] ?? '/')}
            title={section.label}
          >
            <Typography.Title level={3} style={{ margin: 0 }}>
              {section.count}
            </Typography.Title>
            {section.items.slice(0, 3).map((item) => (
              <div
                key={item.id}
                style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(item.route)
                }}
              >
                {item.title}
              </div>
            ))}
          </Card>
        </Col>
      ))}
    </Row>
  )
}

export default function IssueQueuePage() {
  const [source, setSource] = useState('ALL')
  const [limit, setLimit] = useState(50)

  const { data, isLoading, isError, error } = useIssues({
    source: source === 'ALL' ? undefined : source,
    limit,
  })

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="이슈 큐를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    {
      title: '심각도',
      dataIndex: 'severity',
      key: 'severity',
      width: 130,
      render: (v: string) => <SeverityTag severity={v} />,
    },
    {
      title: '채널',
      dataIndex: 'source',
      key: 'source',
      width: 110,
      render: (v: string) => SOURCE_LABEL[v] ?? v,
    },
    { title: '유형', dataIndex: 'category', key: 'category' },
    { title: '제목/사유', key: 'title', render: (_: unknown, r: IssueRow) => r.title ?? r.category },
    { title: '상태', dataIndex: 'status', key: 'status' },
    {
      title: '접수일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]

  return (
    <>
      <ActionQueueBoard />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Segmented options={SOURCE_OPTIONS} value={source} onChange={(v) => setSource(v as string)} />
        <Select
          style={{ width: 160 }}
          value={limit}
          onChange={setLimit}
          options={[
            { value: 50, label: '최근 50건' },
            { value: 100, label: '최근 100건' },
            { value: 200, label: '최근 200건' },
          ]}
        />
      </div>
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Table<IssueRow>
          rowKey={(r) => `${r.kind}-${r.id}`}
          columns={columns}
          dataSource={data ?? []}
          pagination={false}
          locale={{ emptyText: <Empty description="표시할 이슈가 없습니다." /> }}
          expandable={{
            rowExpandable: (r) => r.kind === 'TICKET',
            expandedRowRender: (r) => <ContractContextPanel ticketId={r.id} />,
          }}
        />
      )}
    </>
  )
}
