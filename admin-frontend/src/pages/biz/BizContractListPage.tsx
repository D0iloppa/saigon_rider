import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Input, Select, Space, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import { useBizContracts, useBizPaymentWiring, type BizContractRow } from '../../api/biz'

const STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: 'accepted', label: '입금안내 미발급' },
  { value: 'awaiting_payment', label: '입금대기' },
  { value: 'partially_paid', label: '부분입금' },
  { value: 'paid', label: '완납대기' },
  { value: 'active', label: '활성' },
  { value: 'cancelled', label: '취소' },
  { value: 'refunded', label: '환불' },
]

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  accepted: { color: 'default', label: '입금안내 미발급' },
  awaiting_payment: { color: 'gold', label: '입금대기' },
  partially_paid: { color: 'orange', label: '부분입금' },
  paid: { color: 'blue', label: '완납대기' },
  active: { color: 'green', label: '활성' },
  cancelled: { color: 'default', label: '취소' },
  refunded: { color: 'red', label: '환불' },
}

export default function BizContractListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState(searchParams.get('q') ?? '')

  const { data, isLoading, isError, error } = useBizContracts('all', q || undefined)
  const { data: wiring } = useBizPaymentWiring()

  const rows = useMemo(() => (status ? (data ?? []).filter((r) => r.status === status) : data ?? []), [data, status])

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="계약 목록을 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    {
      title: '결제코드',
      dataIndex: 'payment_code',
      key: 'payment_code',
      render: (v: string, r: BizContractRow) => <a onClick={() => navigate(`/biz/contracts/${r.id}`)}>{v}</a>,
    },
    { title: '광고', dataIndex: 'ad_title', key: 'ad_title' },
    { title: '파트너', dataIndex: 'partner_name', key: 'partner_name' },
    { title: '기간(월)', dataIndex: 'months', key: 'months', align: 'right' as const },
    {
      title: '청구액(VND)',
      dataIndex: 'amount_vnd',
      key: 'amount_vnd',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString('en-US'),
    },
    {
      title: '입금액(VND)',
      dataIndex: 'received_vnd',
      key: 'received_vnd',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString('en-US'),
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={STATUS_TAG[v]?.color ?? 'default'}>{STATUS_TAG[v]?.label ?? v}</Tag>,
    },
    {
      title: '입금기한',
      key: 'due_at',
      render: (_: unknown, r: BizContractRow) =>
        r.due_at ? (
          <span style={{ color: r.overdue ? '#dc2626' : undefined }}>
            {dayjs(r.due_at).format('YYYY-MM-DD')}
            {r.overdue ? ' (초과)' : ''}
          </span>
        ) : (
          '-'
        ),
    },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      {wiring && !wiring.ready && (
        <Alert type="warning" showIcon message="계좌 배선 미완료" description="계좌 정보(.env)가 배선되지 않아 입금 안내가 발급되지 않습니다." />
      )}
      {wiring && !wiring.toss.ready && (
        <Alert
          type="warning"
          showIcon
          message="카드(토스) 결제 배선 미완료"
          description="토스 결제 레일이 배선되지 않아 계약 페이지에 카드 결제 수단이 노출되지 않습니다."
        />
      )}
      <Space wrap>
        <Select style={{ width: 180 }} value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <Input.Search
          style={{ width: 260 }}
          placeholder="결제코드 또는 업체명 검색"
          allowClear
          defaultValue={q}
          onSearch={setQ}
        />
      </Space>
      <Table<BizContractRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: '등록된 계약이 없습니다.' }}
        pagination={false}
      />
    </Space>
  )
}
