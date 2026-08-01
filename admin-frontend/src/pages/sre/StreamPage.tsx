import { useState } from 'react'
import { Button, DatePicker, Input, Modal, Radio, Select, Table, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useGpsTrace, useStreamInfo, useStreamMessages, type GpsTraceParams, type StreamMessage } from '../../api/stream'

const { Text } = Typography

// legacy stream.html + gps_trace.html 과 동일 (parity) — Redis Stream 모니터 + GPS 이동경로 조회.
// 지도 시각화(Google Maps 폴리라인)는 SPA에 지도 라이브러리가 없어 포인트 목록 + 요약 통계로 단순화 (parity gap).

const TYPE_COLORS: Record<string, string> = { gps: 'green', heartbeat: 'blue', event: 'orange' }

function formatMessage(type: string, raw: string): string {
  try {
    const o = JSON.parse(raw)
    if (type === 'gps' && o.x !== undefined && o.y !== undefined) {
      return `위도 ${o.y} 경도 ${o.x} 이동 ${o.d || 0}m`
    }
    if (type === 'heartbeat') return 'alive'
    if (type === 'event' && o.n) return `event ${o.n}`
  } catch {
    // JSON 아님 — 원본 그대로 표시
  }
  return raw
}

function formatTs(ts: string): string {
  const n = Number(ts)
  if (!Number.isFinite(n)) return ts
  return dayjs(n * 1000).format('YYYY-MM-DD HH:mm:ss')
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', background: 'rgba(0,0,0,.02)', border: '1px solid rgba(0,0,0,.06)', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 11, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value.toLocaleString()}</div>
    </div>
  )
}

function GpsTraceModal({ onClose }: { onClose: () => void }) {
  const [uuid, setUuid] = useState('')
  const [platform, setPlatform] = useState<'ios' | 'android'>('ios')
  const [start, setStart] = useState<Dayjs | null>(dayjs().subtract(1, 'hour'))
  const [end, setEnd] = useState<Dayjs | null>(dayjs())
  const [params, setParams] = useState<GpsTraceParams | null>(null)

  const { data, isLoading } = useGpsTrace(params)

  const handleSearch = () => {
    if (!uuid.trim() || !start || !end) return
    setParams({ uuid: uuid.trim(), platform, start: start.format('YYYY-MM-DDTHH:mm:ss'), end: end.format('YYYY-MM-DDTHH:mm:ss') })
  }

  return (
    <Modal open title="GPS 이동경로 조회" onCancel={onClose} footer={null} width={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <Input placeholder="단말 UUID 입력..." value={uuid} onChange={(e) => setUuid(e.target.value)} />
        <Radio.Group value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <Radio value="ios">iOS</Radio>
          <Radio value="android">Android</Radio>
        </Radio.Group>
        <div style={{ display: 'flex', gap: 8 }}>
          <DatePicker showTime value={start} onChange={setStart} placeholder="시작 시간" />
          <DatePicker showTime value={end} onChange={setEnd} placeholder="종료 시간" />
        </div>
        <Button type="primary" onClick={handleSearch} loading={isLoading}>
          조회
        </Button>
      </div>

      {data && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <StatCard label="GPS 포인트" value={data.point_count} color="#68d391" />
            <StatCard label="총 이동거리(m)" value={Math.round(data.total_distance)} color="#ff8055" />
          </div>
          <Table
            size="small"
            rowKey={(r) => `${r.ts}-${r.lat}-${r.lng}`}
            dataSource={data.points}
            pagination={false}
            columns={[
              { title: '시각', dataIndex: 'ts', key: 'ts', render: (v: number) => dayjs(v * 1000).format('HH:mm:ss') },
              { title: '위도', dataIndex: 'lat', key: 'lat' },
              { title: '경도', dataIndex: 'lng', key: 'lng' },
              { title: '이동(m)', dataIndex: 'd', key: 'd' },
            ]}
          />
        </>
      )}
    </Modal>
  )
}

export default function StreamPage() {
  const [type, setType] = useState<string>('')
  const [uuidFilter, setUuidFilter] = useState('')
  const [count, setCount] = useState(50)
  const [gpsModalOpen, setGpsModalOpen] = useState(false)

  const { data: info } = useStreamInfo()
  const { data: messages, isLoading } = useStreamMessages({ count, type: type || undefined, uuid: uuidFilter || undefined })

  const groups = info?.groups ?? []
  const pendingCount = groups.reduce((sum, g) => sum + (g.pending ?? 0), 0)
  const consumerCount = groups.reduce((sum, g) => sum + (g.consumers ?? 0), 0)

  return (
    <>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
        Redis Streams 실시간 모니터 — 읽기 전용 (메시지 소비에 영향 없음)
      </Text>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatCard label="적재 건수" value={info?.length ?? 0} color="#ff8055" />
        <StatCard label="Consumer Groups" value={groups.length} color="inherit" />
        <StatCard label="Pending (미처리)" value={pendingCount} color={pendingCount > 100 ? '#fc8181' : '#68d391'} />
        <StatCard label="Active Consumers" value={consumerCount} color="#68d391" />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <Select
          value={type}
          onChange={setType}
          style={{ width: 140 }}
          options={[
            { value: '', label: '전체 타입' },
            { value: 'gps', label: 'gps' },
            { value: 'heartbeat', label: 'heartbeat' },
            { value: 'event', label: 'event' },
          ]}
        />
        <Input placeholder="UUID 검색..." value={uuidFilter} onChange={(e) => setUuidFilter(e.target.value)} style={{ width: 240 }} />
        <Select
          value={count}
          onChange={setCount}
          style={{ width: 100 }}
          options={[
            { value: 50, label: '50건' },
            { value: 100, label: '100건' },
            { value: 200, label: '200건' },
            { value: 500, label: '500건' },
          ]}
        />
        <Button type="primary" style={{ marginLeft: 'auto', background: '#ff8055', borderColor: '#ff8055' }} onClick={() => setGpsModalOpen(true)}>
          GPS 체크
        </Button>
      </div>

      <Table<StreamMessage>
        rowKey="id"
        loading={isLoading}
        dataSource={messages ?? []}
        pagination={false}
        columns={[
          { title: 'Stream ID', dataIndex: 'id', key: 'id', render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
          { title: 'Type', dataIndex: 'type', key: 'type', render: (v: string) => <Tag color={TYPE_COLORS[v] ?? 'default'}>{v}</Tag> },
          {
            title: 'UUID',
            dataIndex: 'uuid',
            key: 'uuid',
            render: (v: string, r: StreamMessage) => (
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {v} {r.phone ? <Text type="secondary">({r.phone})</Text> : <Text type="secondary">(unlinked)</Text>}
              </span>
            ),
          },
          { title: 'Message', dataIndex: 'message', key: 'message', render: (v: string, r: StreamMessage) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{formatMessage(r.type, v)}</span> },
          { title: 'Timestamp', dataIndex: 'ts', key: 'ts', render: (v: string) => <span style={{ fontSize: 12 }}>{formatTs(v)}</span> },
        ]}
      />

      {gpsModalOpen && <GpsTraceModal onClose={() => setGpsModalOpen(false)} />}
    </>
  )
}
