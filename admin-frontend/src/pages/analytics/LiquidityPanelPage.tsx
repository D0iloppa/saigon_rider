import { useState } from 'react'
import { Alert, Card, Empty, InputNumber, Select, Skeleton, Switch, Table, Tag } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, InfoCircleOutlined } from '@ant-design/icons'
import { useLiquidityPanel } from '../../api/liquidity'
import type { ListingLiquidityRow, SearchLiquidityRow } from '../../api/liquidity'

const WEEK_OPTIONS = [4, 8, 12, 26].map((w) => ({ value: w, label: `최근 ${w}주` }))

/** null(표본 부족)을 0%로 오인하지 않도록 별도 렌더링. 목표 대비 달성 여부는 색+아이콘을 함께 쓴다. */
function RateCell({
  value,
  target,
  higherIsBetter,
}: {
  value: number | null
  target: number
  higherIsBetter: boolean
}) {
  if (value === null) {
    return <Tag className="admin-status admin-status-neutral">표본 부족</Tag>
  }
  const meets = higherIsBetter ? value >= target : value <= target
  const pct = `${(value * 100).toFixed(1)}%`
  return (
    <span className={meets ? 'liquidity-rate-ok' : 'liquidity-rate-miss'}>
      {meets ? <CheckCircleFilled /> : <CloseCircleFilled />} {pct}
    </span>
  )
}

function HoursCell({ value, target }: { value: number | null; target: number }) {
  if (value === null) {
    return <Tag className="admin-status admin-status-neutral">표본 부족</Tag>
  }
  const meets = value <= target
  return (
    <span className={meets ? 'liquidity-rate-ok' : 'liquidity-rate-miss'}>
      {meets ? <CheckCircleFilled /> : <CloseCircleFilled />} {value.toFixed(1)}시간
    </span>
  )
}

export default function LiquidityPanelPage() {
  const [weeks, setWeeks] = useState(8)
  const [wardId, setWardId] = useState<number | null>(null)
  const [includeDemo, setIncludeDemo] = useState(false)

  const panelQ = useLiquidityPanel({ weeks, ward_id: wardId ?? undefined, include_demo: includeDemo })

  const listingColumns = [
    { title: '주차', dataIndex: 'week_start', key: 'week_start' },
    { title: '구', dataIndex: 'ward_id', key: 'ward_id', render: (v: number | null) => v ?? '전체' },
    { title: '표본 매물수', dataIndex: 'sample_listings', key: 'sample_listings' },
    {
      title: 'L-1 문의 전환율',
      key: 'l1',
      render: (_: unknown, row: ListingLiquidityRow) => (
        <RateCell value={row.l1_inquiry_rate} target={panelQ.data!.targets.l1_inquiry_rate_target} higherIsBetter />
      ),
    },
    {
      title: 'L-2 거래 전환율',
      key: 'l2',
      render: (_: unknown, row: ListingLiquidityRow) => (
        <RateCell value={row.l2_deal_rate} target={panelQ.data!.targets.l2_deal_rate_target} higherIsBetter />
      ),
    },
    {
      title: 'L-4 첫 문의까지 시간(중앙값)',
      key: 'l4',
      render: (_: unknown, row: ListingLiquidityRow) => (
        <HoursCell value={row.l4_median_hours_to_inquiry} target={panelQ.data!.targets.l4_median_hours_target} />
      ),
    },
    { title: 'L-5 신규 활성 판매자', dataIndex: 'l5_new_active_sellers', key: 'l5' },
  ]

  const searchColumns = [
    { title: '주차', dataIndex: 'week_start', key: 'week_start' },
    { title: '총 검색수', dataIndex: 'total_searches', key: 'total_searches' },
    {
      title: 'L-3 검색 0건 비율',
      key: 'l3',
      render: (_: unknown, row: SearchLiquidityRow) => (
        <RateCell
          value={row.l3_zero_result_rate}
          target={panelQ.data!.targets.l3_zero_result_rate_target}
          higherIsBetter={false}
        />
      ),
    },
  ]

  return (
    <div className="analytics-page">
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="목표선은 대표 확정 전 제안값입니다 (D-31 확정 전, 016 §6-6 제안값)"
        description="확정치가 아닙니다. 대표 확정 후 백엔드 상수(liquidity.py)가 바뀌면 이 화면의 목표선도 함께 바뀝니다."
        style={{ marginBottom: 16 }}
      />

      <Card style={{ marginBottom: 16 }}>
        <div className="analytics-filter-row">
          <label>
            기간
            <Select value={weeks} onChange={setWeeks} options={WEEK_OPTIONS} style={{ width: 140 }} />
          </label>
          <label>
            구(ward)
            <InputNumber
              value={wardId ?? undefined}
              onChange={(v) => setWardId(v ?? null)}
              placeholder="전체"
              style={{ width: 120 }}
            />
          </label>
          <label className="analytics-switch-label">
            <Switch checked={includeDemo} onChange={setIncludeDemo} />
            시연 계정 포함
          </label>
        </div>
        <p className="analytics-hint">
          기본(끄기)은 매물 188건을 보유한 단일 시연 계정(SaigonRider)을 제외한 값입니다. 켜면 시연 계정을 포함한 값으로
          다시 조회합니다 — 파일럿 판정에는 항상 끈 값을 기준으로 삼으세요.
        </p>
      </Card>

      {panelQ.isError && (
        <Alert
          type="error"
          showIcon
          message="유동성 지표를 불러오지 못했습니다."
          description={panelQ.error instanceof Error ? panelQ.error.message : undefined}
        />
      )}

      {panelQ.isLoading && (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      )}

      {panelQ.data && (
        <>
          <Card title="매물 유동성 (L-1, L-2, L-4, L-5)" style={{ marginBottom: 16 }}>
            {panelQ.data.listings.length === 0 ? (
              <Empty description="표본 부족 — 조건에 해당하는 매물이 없습니다." />
            ) : (
              <Table
                rowKey={(r) => `${r.week_start}-${r.ward_id ?? 'all'}`}
                columns={listingColumns}
                dataSource={panelQ.data.listings}
                pagination={{ pageSize: 20 }}
                size="small"
              />
            )}
          </Card>

          <Card title="검색 유동성 (L-3)">
            {panelQ.data.search.length === 0 ? (
              <Empty description="표본 부족 — 이 기간에 검색 이벤트가 없습니다. 0%가 아니라 데이터 없음입니다." />
            ) : (
              <Table
                rowKey="week_start"
                columns={searchColumns}
                dataSource={panelQ.data.search}
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
