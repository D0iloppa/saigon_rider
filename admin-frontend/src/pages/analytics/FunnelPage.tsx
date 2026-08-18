import { useState } from 'react'
import { Alert, Card, Empty, Input, Select, Skeleton, Table } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { useSegmentedFunnel } from '../../api/funnel'
import type { SegmentedFunnelRow } from '../../api/funnel'

const DAYS_OPTIONS = [28, 56, 90, 180].map((d) => ({ value: d, label: `최근 ${d}일 가입 코호트` }))
const PERSONA_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'seller', label: '판매자' },
  { value: 'buyer', label: '구매자' },
]

type StageKey =
  | 'signups'
  | 'verified_phone'
  | 'searched'
  | 'listing_viewed'
  | 'inquiry_started'
  | 'contact_exchanged'
  | 'deal_completed'

const STAGE_COLUMNS: { key: StageKey; title: string }[] = [
  { key: 'signups', title: '가입' },
  { key: 'verified_phone', title: '휴대폰 인증' },
  { key: 'searched', title: '검색' },
  { key: 'listing_viewed', title: '매물 조회' },
  { key: 'inquiry_started', title: '문의 시작(대리지표)' },
  { key: 'contact_exchanged', title: '연락처 교환(대리지표)' },
  { key: 'deal_completed', title: '거래완료(자기신고·하한선)' },
]

export default function FunnelPage() {
  const [days, setDays] = useState(56)
  const [persona, setPersona] = useState('')
  const [acqSource, setAcqSource] = useState('')

  const funnelQ = useSegmentedFunnel({
    days,
    persona: persona || undefined,
    acq_source: acqSource || undefined,
  })

  const columns = [
    { title: '주차(가입 코호트)', dataIndex: 'week_start', key: 'week_start' },
    { title: '유입출처', dataIndex: 'acq_source', key: 'acq_source' },
    { title: '페르소나', dataIndex: 'persona', key: 'persona' },
    { title: '구(판매자만)', dataIndex: 'ward_id', key: 'ward_id', render: (v: number | null) => v ?? '—' },
    ...STAGE_COLUMNS.map((c) => ({ title: c.title, dataIndex: c.key, key: c.key })),
  ]

  const totals = (funnelQ.data ?? []).reduce<Record<StageKey, number>>(
    (acc, row) => {
      for (const c of STAGE_COLUMNS) acc[c.key] += row[c.key]
      return acc
    },
    { signups: 0, verified_phone: 0, searched: 0, listing_viewed: 0, inquiry_started: 0, contact_exchanged: 0, deal_completed: 0 },
  )

  return (
    <div className="analytics-page">
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="계측 한계 안내"
        description={
          <>
            이 화면은 실데이터가 있는 단계만 보여줍니다 — 미계측 단계는 0으로 그리지 않고 표시 자체를 하지 않습니다.
            <br />
            구(ward)는 판매자의 최근 매물 기준으로만 채워지며 구매자는 항상 공란(—)입니다.
            <br />
            거래완료는 자기신고(trade_complete) 기반이라 실제 거래보다 낮게 잡히는 <strong>하한선</strong>입니다. 문의
            시작·연락처 교환도 이벤트 존재로 근사한 대리지표입니다.
          </>
        }
        style={{ marginBottom: 16 }}
      />

      <Card style={{ marginBottom: 16 }}>
        <div className="analytics-filter-row">
          <label>
            기간
            <Select value={days} onChange={setDays} options={DAYS_OPTIONS} style={{ width: 200 }} />
          </label>
          <label>
            페르소나
            <Select value={persona} onChange={setPersona} options={PERSONA_OPTIONS} style={{ width: 140 }} />
          </label>
          <label>
            유입출처
            <Input
              value={acqSource}
              onChange={(e) => setAcqSource(e.target.value)}
              placeholder="예: organic, u:xxxx"
              style={{ width: 180 }}
              allowClear
            />
          </label>
        </div>
      </Card>

      {funnelQ.isError && (
        <Alert
          type="error"
          showIcon
          message="퍼널 데이터를 불러오지 못했습니다."
          description={funnelQ.error instanceof Error ? funnelQ.error.message : undefined}
        />
      )}

      {funnelQ.isLoading && (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      )}

      {funnelQ.data && (
        <>
          <Card title="선택 조건 합계" style={{ marginBottom: 16 }}>
            <div className="analytics-funnel-totals">
              {STAGE_COLUMNS.map((c) => (
                <div key={c.key} className="analytics-funnel-total-item">
                  <span>{c.title}</span>
                  <strong>{totals[c.key].toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </Card>

          <Card title="세그먼트 상세 (주차 x 유입출처 x 페르소나 x 구)">
            {funnelQ.data.length === 0 ? (
              <Empty description="조건에 해당하는 코호트가 없습니다." />
            ) : (
              <Table
                rowKey={(r) => `${r.week_start}-${r.acq_source}-${r.persona}-${r.ward_id ?? 'null'}`}
                columns={columns}
                dataSource={funnelQ.data}
                pagination={{ pageSize: 20 }}
                size="small"
                scroll={{ x: true }}
              />
            )}
          </Card>
        </>
      )}
    </div>
  )
}
