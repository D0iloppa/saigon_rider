import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Segmented, Table, Tabs, Tag } from 'antd'
import dayjs from 'dayjs'
import { useTickets, type TicketRow } from '../../api/support'
import StatusTag from '../../components/StatusTag'

const STATUS_TABS = [
  { key: '', label: '전체' },
  { key: 'OPEN', label: '접수' },
  { key: 'IN_PROGRESS', label: '처리중' },
  { key: 'RESOLVED', label: '해결' },
]

const ASSIGNEE_FILTERS = [
  { value: '', label: '전체' },
  { value: 'me', label: '내 담당' },
  { value: 'unassigned', label: '미배정' },
]

export default function SupportListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // 대시보드 "미답변 문의" 카드는 ?status=open 으로 이동한다 (백엔드 실제 값은 대문자 OPEN).
  const initialStatus = useMemo(() => {
    const raw = searchParams.get('status')
    if (raw === 'open') return 'OPEN'
    return STATUS_TABS.some((t) => t.key === raw) ? (raw as string) : ''
  }, [searchParams])

  const [status, setStatus] = useState(initialStatus)
  const [assignee, setAssignee] = useState('')
  const [page, setPage] = useState(1)
  const size = 30

  const { data, isLoading } = useTickets({ status: status || undefined, assignee: assignee || undefined, page, size })

  const columns = [
    { title: '제목', dataIndex: 'title', key: 'title' },
    { title: '작성자', key: 'user', render: (_: unknown, r: TicketRow) => r.user.nickname ?? '-' },
    { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <StatusTag kind="support" status={v} /> },
    {
      title: '담당자',
      dataIndex: 'assignee_username',
      key: 'assignee_username',
      render: (v: string | null) => (v ? v : <Tag>미배정</Tag>),
    },
    {
      title: '접수일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '최근 답변',
      dataIndex: 'last_reply_at',
      key: 'last_reply_at',
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
  ]

  return (
    <>
      <Tabs
        activeKey={status}
        onChange={(k) => {
          setStatus(k)
          setPage(1)
        }}
        items={STATUS_TABS.map((t) => ({ key: t.key, label: t.label }))}
      />
      <Segmented
        style={{ marginBottom: 16 }}
        options={ASSIGNEE_FILTERS}
        value={assignee}
        onChange={(v) => {
          setAssignee(v as string)
          setPage(1)
        }}
      />
      <Table<TicketRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        onRow={(record) => ({ onClick: () => navigate(`/support/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize: size,
          total: data?.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />
    </>
  )
}
