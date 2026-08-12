import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import dayjs from 'dayjs'
import {
  useCompletionRequests,
  useResolveCompletionRequest,
  type CompletionRequestRow,
  type CompletionRequestState,
} from '../../api/trades'

/** S-16 / D-7 — 구매자가 완료를 요청했는데 아직 완료되지 않은 거래를 운영자가 판단한다.
 *  자동 완료는 없다(D-7): 완료는 판매자 확인 또는 여기의 강제완료 중 하나를 반드시 거친다. */

const STATE_OPTIONS: { value: CompletionRequestState; label: string }[] = [
  { value: 'pending', label: '판매자 미응답' },
  { value: 'declined', label: '판매자 거절' },
  { value: 'all', label: '전체' },
]

const HOURS_OPTIONS = [
  { value: 0, label: '경과시간 전체' },
  { value: 24, label: '24시간 이상' },
  { value: 72, label: '72시간 이상' },
  { value: 168, label: '7일 이상' },
]

type ResolveTarget = { row: CompletionRequestRow; action: 'force-complete' | 'dismiss' }

export default function CompletionRequestListPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<CompletionRequestState>('pending')
  const [minPendingHours, setMinPendingHours] = useState(0)
  const [page, setPage] = useState(1)
  const size = 20
  const [target, setTarget] = useState<ResolveTarget | null>(null)
  const [reason, setReason] = useState('')

  const { data, isLoading } = useCompletionRequests({
    state,
    min_pending_hours: minPendingHours || undefined,
    page,
    size,
  })
  const resolve = useResolveCompletionRequest()

  const closeModal = () => {
    setTarget(null)
    setReason('')
  }

  const submit = () => {
    if (!target || !reason.trim()) return
    resolve.mutate(
      { appointmentId: target.row.appointment_id, action: target.action, reason: reason.trim() },
      {
        onSuccess: () => {
          message.success(target.action === 'force-complete' ? '거래를 완료 처리했습니다.' : '요청을 기각했습니다.')
          closeModal()
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      },
    )
  }

  const columns = [
    { title: '매물', dataIndex: 'listing_title', key: 'listing_title' },
    {
      title: '가격',
      dataIndex: 'price_vnd',
      key: 'price_vnd',
      render: (v: number) => `${v.toLocaleString()}đ`,
    },
    {
      title: '판매자',
      key: 'seller',
      render: (_: unknown, r: CompletionRequestRow) =>
        r.seller.id ? <a onClick={() => navigate(`/users/${r.seller.id}`)}>{r.seller.nickname ?? '-'}</a> : '-',
    },
    {
      title: '구매자(요청자)',
      key: 'buyer',
      render: (_: unknown, r: CompletionRequestRow) =>
        r.buyer.id ? <a onClick={() => navigate(`/users/${r.buyer.id}`)}>{r.buyer.nickname ?? '-'}</a> : '-',
    },
    {
      title: '약속일시',
      dataIndex: 'when_at',
      key: 'when_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '요청일시',
      dataIndex: 'completion_requested_at',
      key: 'completion_requested_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '경과',
      dataIndex: 'pending_hours',
      key: 'pending_hours',
      width: 90,
      // 방치 정도가 곧 우선순위 — 72시간(3일)을 넘으면 눈에 띄게 한다.
      render: (v: number) => <Tag color={v >= 72 ? 'red' : v >= 24 ? 'orange' : 'default'}>{v}시간</Tag>,
    },
    {
      title: '판매자 거절',
      dataIndex: 'completion_declined_at',
      key: 'completion_declined_at',
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '조치',
      key: 'actions',
      render: (_: unknown, r: CompletionRequestRow) => (
        <Space>
          <Button size="small" type="primary" onClick={() => setTarget({ row: r, action: 'force-complete' })}>
            강제완료
          </Button>
          <Button size="small" danger onClick={() => setTarget({ row: r, action: 'dismiss' })}>
            기각
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 160 }}
          value={state}
          options={STATE_OPTIONS}
          onChange={(v) => {
            setState(v)
            setPage(1)
          }}
        />
        <Select
          style={{ width: 160 }}
          value={minPendingHours}
          options={HOURS_OPTIONS}
          onChange={(v) => {
            setMinPendingHours(v)
            setPage(1)
          }}
        />
      </Space>
      <Table<CompletionRequestRow>
        rowKey="appointment_id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        onRow={(record) => ({
          onClick: () => navigate(`/listings/${record.listing_id}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
      <Modal
        open={!!target}
        title={target?.action === 'force-complete' ? '거래 강제완료' : '완료 요청 기각'}
        okText={target?.action === 'force-complete' ? '완료 처리' : '기각'}
        okButtonProps={{ danger: target?.action === 'dismiss', disabled: !reason.trim() }}
        confirmLoading={resolve.isPending}
        onOk={submit}
        onCancel={closeModal}
      >
        <p style={{ marginTop: 0 }}>
          {target?.action === 'force-complete'
            ? `'${target?.row.listing_title}' 거래를 완료로 확정하고 매물을 판매완료(SOLD)로 바꿉니다. 되돌릴 수 없습니다.`
            : `'${target?.row.listing_title}' 완료 요청을 기각합니다. 거래는 완료되지 않고 구매자는 다시 요청할 수 있습니다.`}
        </p>
        {/* 사유는 양측에게 알림 본문으로 그대로 전달되고 감사로그에도 남는다 — 필수. */}
        <Input.TextArea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="사유 (양측 알림과 감사로그에 기록됩니다)"
        />
      </Modal>
    </>
  )
}
