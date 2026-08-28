import { useState } from 'react'
import { Alert, Card, Empty, Select, Skeleton, Table } from 'antd'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { useWeeklyIssueSummary, type CategoryStat } from '../../api/issues'
import { adminColors } from '../../theme/tokens'

const DAYS_OPTIONS = [
  { value: 7, label: '최근 7일' },
  { value: 14, label: '최근 14일' },
  { value: 30, label: '최근 30일' },
]

/** 016 §8-3 #26 [학습] 단계 — 재발 통계의 원료. 카테고리별 건수는 막대차트로, 상세 수치는 표로 함께 제공한다. */
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
      ) : (data ?? []).length === 0 ? (
        <Empty description="집계된 이슈가 없습니다." />
      ) : (
        <>
          <Card size="small" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={adminColors.chartGrid} vertical={false} />
                <XAxis dataKey="category" fontSize={12} tickMargin={8} />
                <YAxis allowDecimals={false} fontSize={12} />
                <ChartTooltip />
                <Legend />
                <Bar dataKey="count" name="건수" fill={adminColors.chart[0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Table<CategoryStat>
            rowKey="category"
            columns={columns}
            dataSource={data ?? []}
            pagination={false}
          />
        </>
      )}
    </>
  )
}
