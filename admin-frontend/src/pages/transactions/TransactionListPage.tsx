import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Select, Space, Table } from 'antd'
import dayjs from 'dayjs'
import { useTransactions, type TransactionPaymentStatus, type TransactionRow } from '../../api/transactions'
import StatusTag from '../../components/StatusTag'

/** F033 — 수동 QR 거래 조회. 조회 전용 목록: 상태·기간 필터만 있고 상태를 바꾸는 조작은 없다. */

const STATUS_OPTIONS: { value: TransactionPaymentStatus | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'AWAITING_PAYMENT', label: '입금대기' },
  { value: 'PAYMENT_REPORTED', label: '입금신고' },
  { value: 'PAYMENT_CONFIRMED', label: '수령확인' },
]

export default function TransactionListPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<TransactionPaymentStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const size = 20

  const { data, isLoading } = useTransactions({
    payment_status: status === 'all' ? undefined : status,
    page,
    size,
  })

  const columns = [
    { title: '매물', dataIndex: 'listing_title', key: 'listing_title' },
    {
      title: '금액',
      dataIndex: 'amount_vnd',
      key: 'amount_vnd',
      render: (v: number) => `${v.toLocaleString()}đ`,
    },
    {
      title: '판매자',
      key: 'seller',
      render: (_: unknown, r: TransactionRow) =>
        r.seller.id ? <a onClick={(e) => { e.stopPropagation(); navigate(`/users/${r.seller.id}`) }}>{r.seller.nickname ?? '-'}</a> : '-',
    },
    {
      title: '구매자',
      key: 'buyer',
      render: (_: unknown, r: TransactionRow) =>
        r.buyer.id ? <a onClick={(e) => { e.stopPropagation(); navigate(`/users/${r.buyer.id}`) }}>{r.buyer.nickname ?? '-'}</a> : '-',
    },
    {
      title: '상태',
      dataIndex: 'payment_status',
      key: 'payment_status',
      render: (v: string) => <StatusTag kind="transaction" status={v} />,
    },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 160 }}
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        />
      </Space>
      <Table<TransactionRow>
        rowKey="appointment_id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        onRow={(record) => ({
          onClick: () => navigate(`/transactions/${record.appointment_id}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
    </>
  )
}
