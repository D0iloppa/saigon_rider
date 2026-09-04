import { useState } from 'react'
import { Alert, Card, Empty, Select, Skeleton, Table } from 'antd'
import { useFirstTouch } from '../../api/funnel'
import StatCard from '../../components/StatCard'

const DAYS_OPTIONS = [30, 90, 180, 365].map((d) => ({ value: d, label: `최근 ${d}일` }))

export default function FirstTouchPage() {
  const [days, setDays] = useState(90)

  const firstTouchQ = useFirstTouch(days)

  const columns = [
    { title: '유입출처', dataIndex: 'utm_source', key: 'utm_source' },
    { title: '매체', dataIndex: 'utm_medium', key: 'utm_medium' },
    { title: '익명방문', dataIndex: 'anon_count', key: 'anon_count', width: 120 },
    { title: '회원연결', dataIndex: 'linked_count', key: 'linked_count', width: 120 },
    {
      title: '전환율',
      dataIndex: 'conversion_rate',
      key: 'conversion_rate',
      width: 100,
      render: (rate: number | null) => (rate != null ? `${(rate * 100).toFixed(1)}%` : '-'),
    },
  ]

  const totalAnon = firstTouchQ.data?.rows.reduce((sum, row) => sum + row.anon_count, 0) ?? 0

  return (
    <div className="analytics-page">
      <Card style={{ marginBottom: 16 }}>
        <div className="analytics-filter-row">
          <label>
            기간
            <Select value={days} onChange={setDays} options={DAYS_OPTIONS} style={{ width: 140 }} />
          </label>
        </div>
      </Card>

      {firstTouchQ.isError && (
        <Alert
          type="error"
          showIcon
          message="비회원 유입경로 데이터를 불러오지 못했습니다."
          description={firstTouchQ.error instanceof Error ? firstTouchQ.error.message : undefined}
        />
      )}

      {firstTouchQ.isLoading && (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      )}

      {firstTouchQ.data && (
        <>
          <StatCard
            title="총 익명 방문"
            value={totalAnon}
            state={firstTouchQ.data.status.state}
            coverage={firstTouchQ.data.status.coverage}
            tone="default"
          />

          <Card style={{ marginTop: 16 }}>
            {firstTouchQ.data.status.state === 'cold' ? (
              <Empty description="아직 UTM 유입이 기록되지 않았습니다." />
            ) : (
              <Table
                rowKey={(row) => `${row.utm_source}-${row.utm_medium}`}
                columns={columns}
                dataSource={firstTouchQ.data.rows}
                pagination={{ pageSize: 20 }}
                size="small"
              />
            )}
          </Card>
        </>
      )}
    </div>
  )
}
