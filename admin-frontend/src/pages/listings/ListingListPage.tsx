import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Input, Select, Space, Table, Tooltip } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useListings, type AdminListingRow } from '../../api/listings'
import BulkModerateModal from '../../components/BulkModerateModal'
import ListingFlags from '../../components/ListingFlags'
import StatusTag from '../../components/StatusTag'

const SORT_OPTIONS = [
  { value: 'created_desc', label: '최신순' },
  { value: 'risk', label: '위험도순' },
]

// 016 §4-4 #39 — risk_score 는 검수 큐 정렬 가중치일 뿐(자동 숨김/차단 없음, M1). 백엔드가
// 신호별 기여도를 응답에 내려주지 않아(listing_risk.py risk_score_sql 은 합산값만 SELECT) 어떤
// 신호가 점수를 올렸는지는 이 화면에서 보여줄 수 없다 — 갭으로 기록(보고 참고).
const RISK_SCORE_EXPLAINER =
  '가격 이상도·계정 신규도·지문 재사용·연락처 노출·금칙어 근접 5개 신호의 가중합입니다. ' +
  '검수 큐 정렬 참고용일 뿐 자동 조치 기준이 아닙니다. ' +
  '카테고리 표본이 20건 미만이면 가격 이상도 신호는 0으로 계산됩니다 — 점수가 낮다고 안전을 의미하지 않습니다.'

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
  // 기본 정렬은 그대로 최신순(created_desc) — 위험도순은 운영자가 선택해야만 적용된다.
  const [sortBy, setSortBy] = useState<'created_desc' | 'risk'>('created_desc')
  const [page, setPage] = useState(1)
  const size = 20
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkAction, setBulkAction] = useState<'REMOVE' | 'RESTORE' | null>(null)

  const { data, isLoading, isError, error } = useListings({
    q: q || undefined,
    status: status || undefined,
    sort_by: sortBy,
    page,
    size,
  })

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
      title: '플래그',
      key: 'flags',
      render: (_: unknown, r: AdminListingRow) => <ListingFlags flags={r.flags} />,
    },
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
      title: (
        <>
          위험도{' '}
          <Tooltip title={RISK_SCORE_EXPLAINER}>
            <InfoCircleOutlined />
          </Tooltip>
        </>
      ),
      dataIndex: 'risk_score',
      key: 'risk_score',
      width: 90,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="매물 목록을 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

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
        <Select
          style={{ width: 140 }}
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={(v) => {
            setSortBy(v)
            setPage(1)
          }}
        />
        {selectedIds.length > 0 && (
          <Space>
            <span>{selectedIds.length}건 선택됨</span>
            <Button onClick={() => setBulkAction('RESTORE')}>선택 승인</Button>
            <Button danger onClick={() => setBulkAction('REMOVE')}>
              선택 반려
            </Button>
          </Space>
        )}
      </Space>
      <Table<AdminListingRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        locale={{ emptyText: '등록된 매물이 없습니다' }}
        rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as string[]) }}
        onRow={(record) => ({ onClick: () => navigate(`/listings/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
      {bulkAction && (
        <BulkModerateModal
          open
          listingIds={selectedIds}
          action={bulkAction}
          onClose={() => {
            setBulkAction(null)
            setSelectedIds([])
          }}
        />
      )}
    </>
  )
}
