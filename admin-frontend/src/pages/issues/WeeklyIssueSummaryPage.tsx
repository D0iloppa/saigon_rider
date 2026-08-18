import { useState } from 'react'
import { Alert, Empty, Select, Skeleton, Table } from 'antd'
import { useWeeklyIssueSummary, type CategoryStat } from '../../api/issues'

const DAYS_OPTIONS = [
  { value: 7, label: '최근 7일' },
  { value: 14, label: '최근 14일' },
  { value: 30, label: '최근 30일' },
]

/** 016 §8-3 #26 [학습] 단계 — 재발 통계의 원료. 표 하나로 충분해 차트를 붙이지 않는다(과설계 금지). */
export default function WeeklyIssueSummaryPage() {
  const [days, setDays] = useState(7)
  const { data, isLoading, isError, error } = useWeeklyIssueSummary(days)

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="주간 집계를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    { title: '유형', dataIndex: 'category', key: 'category' },
    { title: '건수', dataIndex: 'count', key: 'count', width: 100, align: 'right' as const },
    {
      title: '중위 처리시간',
      dataIndex: 'median_resolution_hours',
      key: 'median_resolution_hours',
      width: 160,
      align: 'right' as const,
      render: (v: number | null) => (v == null ? '처리완료 건 없음' : `${v.toFixed(1)}시간`),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Select style={{ width: 160 }} value={days} onChange={setDays} options={DAYS_OPTIONS} />
      </div>
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <Table<CategoryStat>
          rowKey="category"
          columns={columns}
          dataSource={data ?? []}
          pagination={false}
          locale={{ emptyText: <Empty description="집계된 이슈가 없습니다." /> }}
        />
      )}
    </>
  )
}
