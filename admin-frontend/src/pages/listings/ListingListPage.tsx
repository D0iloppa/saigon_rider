import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Select, Space, Table } from 'antd'
import dayjs from 'dayjs'
import { useListings, type AdminListingRow } from '../../api/listings'
import StatusTag from '../../components/StatusTag'

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'ON_SALE', label: '판매중' },
  { value: 'RESERVED', label: '예약중' },
  { value: 'SOLD', label: '판매완료' },
  { value: 'HIDDEN', label: '숨김' },
  { value: 'REMOVED', label: '삭제됨' },
]

export default function ListingListPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const size = 20

  const { data, isLoading } = useListings({ q: q || undefined, status: status || undefined, page, size })

  const columns = [
    {
      title: '썸네일',
      dataIndex: 'thumbnail_url',
      key: 'thumbnail_url',
      width: 64,
      render: (v: string | null) =>
        v ? <img src={v} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : '-',
    },
    { title: '제목', dataIndex: 'title', key: 'title' },
    { title: '가격', dataIndex: 'price_vnd', key: 'price_vnd', render: (v: number) => `${v.toLocaleString()}đ` },
    { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <StatusTag kind="listing" status={v} /> },
    {
      title: '판매자',
      key: 'seller',
      render: (_: unknown, r: AdminListingRow) => (
        <a
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/users/${r.seller.id}`)
          }}
        >
          {r.seller.nickname ?? '-'}
        </a>
      ),
    },
    { title: '신고수', dataIndex: 'report_count', key: 'report_count', width: 80 },
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
        <Input.Search
          placeholder="제목 검색"
          allowClear
          style={{ width: 280 }}
          onSearch={(v) => {
            setQ(v)
            setPage(1)
          }}
        />
        <Select
          style={{ width: 140 }}
          value={status}
          options={STATUS_OPTIONS}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        />
      </Space>
      <Table<AdminListingRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        onRow={(record) => ({ onClick: () => navigate(`/listings/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
    </>
  )
}
