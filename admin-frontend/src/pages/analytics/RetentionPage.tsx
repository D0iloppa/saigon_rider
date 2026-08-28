import { useState } from 'react'
import { Alert, Card, Empty, Select, Skeleton, Table, Tag } from 'antd'
import { useRetentionCohorts } from '../../api/retention'
import type { CohortRetentionRow } from '../../api/retention'

const WEEK_OPTIONS = [4, 8, 12].map((w) => ({ value: w, label: `최근 ${w}주` }))

/** 리텐션율을 팀 teal 토큰(--admin-teal-600) 농도로 표현하는 히트맵 셀.
 * null = 아직 그 시점(가입일+N일)에 도달하지 않은 코호트(0%와 구분).
 * suppressed = 모집단 5명 미만 — 재식별 위험 완화를 위해 값 대신 '<5' 만 표기. */
function RetentionCell({ value, suppressed }: { value: number | null; suppressed: boolean }) {
  if (value === null) {
    return <Tag className="admin-status admin-status-neutral">집계 전</Tag>
  }
  if (suppressed) {
    return <Tag className="admin-status admin-status-neutral">{'<5'}</Tag>
  }
  const pct = Math.round(value * 1000) / 10
  const intensity = Math.max(0, Math.min(100, pct))
  return (
    <div
      style={{
        background: `color-mix(in srgb, var(--admin-teal-600) ${intensity}%, var(--admin-teal-50))`,
        color: intensity > 55 ? '#ffffff' : 'var(--admin-gray-900)',
        borderRadius: 6,
        padding: '4px 8px',
        textAlign: 'center',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {pct.toFixed(1)}%
    </div>
  )
}

export default function RetentionPage() {
  const [weeks, setWeeks] = useState(8)
  const cohortsQ = useRetentionCohorts({ weeks })

  const columns = [
    { title: '가입 주차', dataIndex: 'cohort_week', key: 'cohort_week' },
    {
      title: '모집단',
      key: 'population',
      render: (_: unknown, row: CohortRetentionRow) =>
        row.suppressed ? <Tag className="admin-status admin-status-neutral">{'<5'}</Tag> : row.population,
    },
    {
      title: 'D1',
      key: 'd1',
      render: (_: unknown, row: CohortRetentionRow) => (
        <RetentionCell value={row.d1_retention} suppressed={row.suppressed} />
      ),
    },
    {
      title: 'D7',
      key: 'd7',
      render: (_: unknown, row: CohortRetentionRow) => (
        <RetentionCell value={row.d7_retention} suppressed={row.suppressed} />
      ),
    },
    {
      title: 'D30',
      key: 'd30',
      render: (_: unknown, row: CohortRetentionRow) => (
        <RetentionCell value={row.d30_retention} suppressed={row.suppressed} />
      ),
    },
  ]

  return (
    <div className="analytics-page">
      <Card style={{ marginBottom: 16 }}>
        <div className="analytics-filter-row">
          <label>
            기간
            <Select value={weeks} onChange={setWeeks} options={WEEK_OPTIONS} style={{ width: 140 }} />
          </label>
        </div>
        <p className="analytics-hint">
          코호트는 가입 주차(created_at, VN 로컬) 기준. D1/D7/D30 은 가입일+N일 이후에도 접속(last_seen_at)한
          비율이다. 아직 N일이 지나지 않은 코호트는 &quot;집계 전&quot;으로 표시하고, 모집단이 5명 미만인
          코호트는 재식별 위험 완화를 위해 값 대신 &quot;&lt;5&quot; 로 억제 표시한다.
        </p>
      </Card>

      {cohortsQ.isError && (
        <Alert
          type="error"
          showIcon
          message="리텐션 지표를 불러오지 못했습니다."
          description={cohortsQ.error instanceof Error ? cohortsQ.error.message : undefined}
        />
      )}

      {cohortsQ.isLoading && (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      )}

      {cohortsQ.data && (
        <Card title="코호트 리텐션 히트맵 (D1 / D7 / D30)">
          {cohortsQ.data.length === 0 ? (
            <Empty description="표본 부족 — 이 기간에 가입한 코호트가 없습니다." />
          ) : (
            <Table
              rowKey="cohort_week"
              columns={columns}
              dataSource={cohortsQ.data}
              pagination={false}
              size="small"
            />
          )}
        </Card>
      )}
    </div>
  )
}
