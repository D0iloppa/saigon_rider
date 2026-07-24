import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Avatar, Segmented, Space, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import { useBizAdsByPartner, type BizAdRow } from '../../api/biz'

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '대기' },
  APPROVED: { color: 'green', label: '승인됨' },
  REJECTED: { color: 'default', label: '반려됨' },
  STOPPED: { color: 'red', label: '중단됨' },
}

function adPeriod(r: BizAdRow): string {
  if (!r.starts_at && !r.ends_at) return '상시'
  const fmt = (v: string | null) => (v ? dayjs(v).format('YY-MM-DD') : '—')
  return `${fmt(r.starts_at)} ~ ${fmt(r.ends_at)}`
}

export default function BizAccountAdsPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [scope, setScope] = useState<'launching' | 'all'>('launching')

  const { data, isLoading, isError, error } = useBizAdsByPartner(id, scope === 'launching')

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="파트너 광고 목록을 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    {
      title: '',
      key: 'image',
      width: 56,
      render: (_: unknown, r: BizAdRow) => <Avatar src={r.image_url ?? undefined} shape="square">{r.title.slice(0, 1)}</Avatar>,
    },
    { title: '제목', dataIndex: 'title', key: 'title' },
    { title: '게시기간', key: 'period', render: (_: unknown, r: BizAdRow) => adPeriod(r) },
    {
      title: '심사 상태',
      dataIndex: 'review_status',
      key: 'review_status',
      render: (v: string) => <Tag color={STATUS_TAG[v]?.color ?? 'default'}>{STATUS_TAG[v]?.label ?? v}</Tag>,
    },
    {
      title: '광고 티어',
      dataIndex: 'tier_name',
      key: 'tier_name',
      render: (v: string | null) => <Tag color="blue">{v ?? '-'}</Tag>,
    },
    {
      title: '신청 월 가격 (VND)',
      dataIndex: 'monthly_price_snapshot_vnd',
      key: 'monthly_price_snapshot_vnd',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString('en-US'),
    },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Segmented
          value={scope}
          onChange={(v) => setScope(v as 'launching' | 'all')}
          options={[
            { value: 'launching', label: '론칭중' },
            { value: 'all', label: '전체' },
          ]}
        />
      </Space>
      <Table<BizAdRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        locale={{ emptyText: '등록된 광고가 없습니다.' }}
        pagination={false}
        onRow={(r) => ({ onClick: () => navigate(`/biz/ads/${r.id}`), style: { cursor: 'pointer' } })}
      />
    </>
  )
}
