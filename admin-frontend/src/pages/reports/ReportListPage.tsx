import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Select, Table, Tabs } from 'antd'
import dayjs from 'dayjs'
import { useReports, type ReportRow } from '../../api/reports'
import StatusTag from '../../components/StatusTag'

const TARGET_TABS = [
  { key: 'ALL', label: '전체' },
  { key: 'LISTING', label: '매물' },
  { key: 'USER', label: '유저' },
  { key: 'DM', label: 'DM' },
  { key: 'REVIEW', label: '후기' },
]

const TARGET_LABEL: Record<string, string> = { LISTING: '매물', USER: '유저', DM: 'DM', REVIEW: '후기' }

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'PENDING', label: '대기' },
  { value: 'REVIEWING', label: '검토중' },
  { value: 'RESOLVED', label: '처리완료' },
  { value: 'REJECTED', label: '기각' },
]

export default function ReportListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // 대시보드 "미처리 신고" 카드는 ?status=open 으로 이동하는데, 백엔드는
  // PENDING/REVIEWING/RESOLVED/REJECTED 단일값만 받고 'open'(대기+검토중 묶음)은 지원하지 않는다.
  // 미지원 값이면 PENDING 기본 선택으로 해석한다.
  const initialStatus = useMemo(() => {
    const raw = searchParams.get('status')
    if (!raw) return ''
    return STATUS_OPTIONS.some((o) => o.value === raw) ? raw : 'PENDING'
  }, [searchParams])

  const [targetType, setTargetType] = useState('ALL')
  const [status, setStatus] = useState(initialStatus)
  const [page, setPage] = useState(1)
  const size = 20

  const { data, isLoading } = useReports({
    target_type: targetType === 'ALL' ? undefined : targetType,
    status: status || undefined,
    page,
    size,
  })

  const columns = [
    { title: '유형', dataIndex: 'target_type', key: 'target_type', width: 70, render: (v: string) => TARGET_LABEL[v] ?? v },
    { title: '사유', dataIndex: 'reason', key: 'reason' },
    { title: '신고자', key: 'reporter', render: (_: unknown, r: ReportRow) => r.reporter.nickname ?? '-' },
    {
      title: '피신고자',
      key: 'reported',
      render: (_: unknown, r: ReportRow) => (
        <span>
          {r.reported_user.nickname ?? '-'}
          {r.reported_user.report_count > 0 && (
            <span style={{ marginLeft: 6, color: '#fa541c' }}>· 누적신고 {r.reported_user.report_count}건</span>
          )}
        </span>
      ),
    },
    { title: '대상', key: 'target', render: (_: unknown, r: ReportRow) => (r.listing ? r.listing.title : '-') },
    { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <StatusTag kind="report" status={v} /> },
    {
      title: '접수일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    { title: '처리자', dataIndex: 'handled_by', key: 'handled_by', render: (v: string | null) => v ?? '-' },
  ]

  return (
    <>
      <Tabs
        activeKey={targetType}
        onChange={(k) => {
          setTargetType(k)
          setPage(1)
        }}
        items={TARGET_TABS.map((t) => ({ key: t.key, label: t.label }))}
        tabBarExtraContent={
          <Select
            style={{ width: 140 }}
            value={status}
            options={STATUS_OPTIONS}
            onChange={(v) => {
              setStatus(v)
              setPage(1)
            }}
          />
        }
      />
      <Table<ReportRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        onRow={(record) => ({ onClick: () => navigate(`/reports/${record.id}`), style: { cursor: 'pointer' } })}
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
