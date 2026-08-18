import { useState } from 'react'
import { Alert, Card, Empty, Select, Skeleton, Table } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { useZeroResultSearches } from '../../api/funnel'

const DAYS_OPTIONS = [7, 14, 30, 90].map((d) => ({ value: d, label: `최근 ${d}일` }))
const LIMIT_OPTIONS = [20, 50, 100].map((n) => ({ value: n, label: `상위 ${n}건` }))

export default function ZeroResultSearchPage() {
  const [days, setDays] = useState(14)
  const [limit, setLimit] = useState(20)

  const zeroResultsQ = useZeroResultSearches({ days, limit })

  const columns = [
    { title: '순위', key: 'rank', width: 60, render: (_: unknown, __: unknown, index: number) => index + 1 },
    { title: '검색어', dataIndex: 'query', key: 'query' },
    { title: '검색 횟수(0건)', dataIndex: 'search_count', key: 'search_count', width: 140 },
  ]

  return (
    <div className="analytics-page">
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="이 화면의 용도"
        description="단순 검색 로그가 아닙니다 — 필드 에이전트가 다음에 무엇을 발굴하러 다녀야 하는지(수요는 있는데 매물이 없는 품목) 정하는 데이터 소스입니다."
        style={{ marginBottom: 16 }}
      />

      <Card style={{ marginBottom: 16 }}>
        <div className="analytics-filter-row">
          <label>
            기간
            <Select value={days} onChange={setDays} options={DAYS_OPTIONS} style={{ width: 140 }} />
          </label>
          <label>
            표시 건수
            <Select value={limit} onChange={setLimit} options={LIMIT_OPTIONS} style={{ width: 140 }} />
          </label>
        </div>
      </Card>

      {zeroResultsQ.isError && (
        <Alert
          type="error"
          showIcon
          message="0건 검색어 목록을 불러오지 못했습니다."
          description={zeroResultsQ.error instanceof Error ? zeroResultsQ.error.message : undefined}
        />
      )}

      {zeroResultsQ.isLoading && (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      )}

      {zeroResultsQ.data && (
        <Card>
          {zeroResultsQ.data.length === 0 ? (
            <Empty description="표본 부족 — 이 기간에 결과 0건인 검색이 없습니다." />
          ) : (
            <Table
              rowKey="query"
              columns={columns}
              dataSource={zeroResultsQ.data}
              pagination={{ pageSize: 20 }}
              size="small"
            />
          )}
        </Card>
      )}
    </div>
  )
}
