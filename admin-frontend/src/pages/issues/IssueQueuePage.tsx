import { useState } from 'react'
import { Alert, Descriptions, Empty, Segmented, Select, Skeleton, Table, Tag } from 'antd'
import { WarningFilled } from '@ant-design/icons'
import dayjs from 'dayjs'
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
