import { Table, Typography } from 'antd'
import {
  useOpsChannelRatio,
  useOpsDailyNet,
  useOpsGachaRoi,
  useOpsPityDistribution,
  type ChannelRatioRow,
  type DailyNetRow,
  type GachaRoiRow,
  type PityDistributionRow,
} from '../../api/ops'

const { Text } = Typography

// legacy sre_ops.html 의 4개 섹션과 동일 (parity) — 인플레 모니터링/가챠 ROI/채널 비율/천장 분포
function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#ff8055', marginBottom: 4 }}>{title}</div>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 14 }}>
        {sub}
      </Text>
      {children}
    </div>
  )
}

export default function OpsDashboardPage() {
  const { data: dailyNet, isLoading: netLoading } = useOpsDailyNet()
  const { data: gachaRoi, isLoading: roiLoading } = useOpsGachaRoi()
  const { data: channelRatio, isLoading: ratioLoading } = useOpsChannelRatio()
  const { data: pityDist, isLoading: pityLoading } = useOpsPityDistribution()

  return (
    <>
      <Section title="① 일일 GOLD/XP 발행/소모 (최근 7일)" sub="net이 지속 양수면 인플레 신호 → 가챠 가격 인상 또는 신규 아이템 출시 검토">
        <Table<DailyNetRow>
          rowKey={(r) => `${r.day}-${r.currency}`}
          loading={netLoading}
          dataSource={dailyNet ?? []}
          pagination={false}
          columns={[
            { title: '날짜', dataIndex: 'day', key: 'day' },
            { title: '통화', dataIndex: 'currency', key: 'currency' },
            { title: '발행(EARN)', dataIndex: 'earned', key: 'earned', render: (v: number) => v.toLocaleString() },
            { title: '소모(SPEND)', dataIndex: 'spent', key: 'spent', render: (v: number) => v.toLocaleString() },
            {
              title: 'NET',
              dataIndex: 'net',
              key: 'net',
              render: (v: number) => <span style={{ color: v >= 0 ? '#68d391' : '#fc8181' }}>{v >= 0 ? `+${v.toLocaleString()}` : v.toLocaleString()}</span>,
            },
          ]}
        />
      </Section>

      <Section title="② 가챠별 ROI 분석 (최근 30일)" sub="dup_rate ≥ 60% → 풀 협소 신호: 아이템 추가 또는 컬렉션 신규 고려">
        <Table<GachaRoiRow>
          rowKey="gacha_code"
          loading={roiLoading}
          dataSource={gachaRoi ?? []}
          pagination={false}
          columns={[
            { title: '가챠 코드', dataIndex: 'gacha_code', key: 'gacha_code' },
            { title: '총 풀', dataIndex: 'pulls', key: 'pulls', render: (v: number) => v.toLocaleString() },
            { title: '고유 유저', dataIndex: 'unique_users', key: 'unique_users', render: (v: number) => v.toLocaleString() },
            { title: '평균 등급 점수', dataIndex: 'avg_rarity_score', key: 'avg_rarity_score', render: (v: number) => v.toFixed(2) },
            { title: '천장 히트', dataIndex: 'pity_hits', key: 'pity_hits', render: (v: number) => v.toLocaleString() },
            {
              title: '중복률',
              dataIndex: 'dup_rate_pct',
              key: 'dup_rate_pct',
              render: (v: number) => <span style={{ color: v >= 60 ? '#fc8181' : 'inherit' }}>{v.toFixed(1)}%</span>,
            },
          ]}
        />
      </Section>

      <Section title="③ 가챠 vs 상점 사용 비율 (최근 30일)" sub="통상 가챠:상점 = 7:3. 상점 비율이 너무 높으면 가챠 매력도 점검 필요">
        <Table<ChannelRatioRow>
          rowKey="source"
          loading={ratioLoading}
          dataSource={channelRatio ?? []}
          pagination={false}
          columns={[
            { title: '채널', dataIndex: 'source', key: 'source' },
            { title: '거래 수', dataIndex: 'purchases', key: 'purchases', render: (v: number) => v.toLocaleString() },
            { title: '고유 유저', dataIndex: 'users', key: 'users', render: (v: number) => v.toLocaleString() },
          ]}
        />
      </Section>

      <Section title="④ 천장 도달자 분포 (상위 20행)" sub="천장 직전(pity_count 높음)에 유저가 몰리면 &quot;마지막 한 번&quot; 심리 과도 의존 신호">
        <Table<PityDistributionRow>
          rowKey={(r) => `${r.gacha_code}-${r.pity_count}`}
          loading={pityLoading}
          dataSource={(pityDist ?? []).slice(0, 20)}
          pagination={false}
          columns={[
            { title: '가챠 코드', dataIndex: 'gacha_code', key: 'gacha_code' },
            { title: '천장 카운터', dataIndex: 'pity_count', key: 'pity_count' },
            { title: '유저 수', dataIndex: 'users', key: 'users', render: (v: number) => v.toLocaleString() },
          ]}
        />
      </Section>
    </>
  )
}
