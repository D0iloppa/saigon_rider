import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Select, Space, Table } from 'antd'
import dayjs from 'dayjs'
import { useUsers, type AdminUserRow } from '../../api/users'
import StatusTag from '../../components/StatusTag'

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'ACTIVE', label: '정상' },
  { value: 'SUSPENDED', label: '정지' },
  { value: 'BANNED', label: '영구정지' },
]

export default function UserListPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const size = 30

  const { data, isLoading } = useUsers({ q: q || undefined, status: status || undefined, page, size })

  const columns = [
    { title: '닉네임', dataIndex: 'nickname', key: 'nickname', render: (v: string | null) => v ?? '-' },
    { title: '전화', dataIndex: 'phone', key: 'phone', render: (v: string | null) => v ?? '-' },
    { title: '레벨', dataIndex: 'level', key: 'level', width: 70 },
    { title: '매너온도', dataIndex: 'manner_temp', key: 'manner_temp', width: 90, render: (v: number) => v.toFixed(1) },
    { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <StatusTag kind="user" status={v} /> },
    {
      title: '정지만료',
      dataIndex: 'suspended_until',
      key: 'suspended_until',
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    { title: '폰인증', dataIndex: 'phone_verified', key: 'phone_verified', render: (v: boolean) => (v ? '완료' : '미완료') },
    { title: '누적신고', dataIndex: 'report_count', key: 'report_count', width: 90 },
    { title: '매물수', dataIndex: 'listing_count', key: 'listing_count', width: 80 },
    { title: '가입일', dataIndex: 'created_at', key: 'created_at', render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '최근접속',
      dataIndex: 'last_seen_at',
      key: 'last_seen_at',
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="닉네임 또는 전화번호 검색"
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
      <Table<AdminUserRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        onRow={(record) => ({ onClick: () => navigate(`/users/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
    </>
  )
}
