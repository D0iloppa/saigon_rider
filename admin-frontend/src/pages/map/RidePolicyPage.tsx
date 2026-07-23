import { useEffect, useState } from 'react'
import { Alert, Button, Card, Input, InputNumber, Skeleton, Space, Table, Typography, message } from 'antd'
import { useRidePolicy, useSaveRidePolicy, type RideBand } from '../../api/ridePolicy'

export default function RidePolicyPage() {
  const { data, isLoading, isError, error } = useRidePolicy()
  const saveMutation = useSaveRidePolicy()

  const [proximityM, setProximityM] = useState<number | null>(null)
  const [dailySlots, setDailySlots] = useState<number | null>(null)
  const [bands, setBands] = useState<RideBand[]>([])

  useEffect(() => {
    if (data) {
      setProximityM(data.proximity_m)
      setDailySlots(data.daily_quest_base_slots)
      setBands(data.bands)
    }
  }, [data])

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="라이딩 정책을 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !data) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  const updateBand = (index: number, patch: Partial<RideBand>) => {
    setBands((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const removeBand = (index: number) => {
    setBands((rows) => rows.filter((_, i) => i !== index))
  }

  const addBand = () => {
    setBands((rows) => [...rows, { code: '', threshold_m: 0 }])
  }

  const handleSave = () => {
    if (proximityM === null || proximityM <= 0) {
      message.warning('근접 거리(m)는 0 보다 큰 정수여야 합니다.')
      return
    }
    if (dailySlots === null || dailySlots < 1 || dailySlots > 10) {
      message.warning('일일 퀘스트 기본 슬롯은 1 ~ 10 사이의 정수여야 합니다.')
      return
    }
    const codes = bands.map((b) => b.code.trim()).filter((c) => c !== '')
    if (codes.length === 0) {
      message.warning('밴드는 1개 이상 필요합니다.')
      return
    }
    if (new Set(codes).size !== codes.length) {
      message.warning('밴드 코드가 중복되었습니다.')
      return
    }
    if (bands.some((b) => b.code.trim() !== '' && b.threshold_m <= 0)) {
      message.warning('threshold 는 0 보다 큰 정수여야 합니다.')
      return
    }

    saveMutation.mutate(
      {
        proximity_m: proximityM,
        daily_quest_base_slots: dailySlots,
        bands: bands.filter((b) => b.code.trim() !== '').map((b) => ({ code: b.code.trim(), threshold_m: b.threshold_m })),
      },
      {
        onSuccess: () => message.success('저장되었습니다.'),
        onError: (err) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.'),
      }
    )
  }

  const bandColumns = [
    {
      title: '밴드 코드',
      key: 'code',
      render: (_: unknown, r: RideBand, index: number) => (
        <Input placeholder="BAND_5KM" value={r.code} onChange={(e) => updateBand(index, { code: e.target.value })} />
      ),
    },
    {
      title: '거리 임계값 (m)',
      key: 'threshold_m',
      render: (_: unknown, r: RideBand, index: number) => (
        <InputNumber
          style={{ width: '100%' }}
          min={1}
          placeholder="5000"
          value={r.threshold_m}
          onChange={(v) => updateBand(index, { threshold_m: v ?? 0 })}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, _r: RideBand, index: number) => (
        <Button size="small" danger onClick={() => removeBand(index)}>
          삭제
        </Button>
      ),
    },
  ]

  return (
    <Card title="라이딩 표시 정책">
      <Space direction="vertical" size={16} style={{ display: 'flex' }}>
        <Space size={24} wrap>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block' }}>
              체크포인트 근접 거리 (m)
            </Typography.Text>
            <InputNumber style={{ width: 180 }} min={1} value={proximityM} onChange={setProximityM} />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block' }}>
              일일 퀘스트 기본 슬롯
            </Typography.Text>
            <InputNumber style={{ width: 180 }} min={1} max={10} value={dailySlots} onChange={setDailySlots} />
          </div>
        </Space>

        <div>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            거리 밴드
          </Typography.Text>
          <Table<RideBand>
            rowKey={(_r, index) => index ?? 0}
            size="small"
            columns={bandColumns}
            dataSource={bands}
            pagination={false}
            locale={{ emptyText: '등록된 밴드가 없습니다.' }}
          />
          <Button style={{ marginTop: 8 }} onClick={addBand}>
            밴드 추가
          </Button>
        </div>

        <Button type="primary" loading={saveMutation.isPending} onClick={handleSave}>
          저장
        </Button>
      </Space>
    </Card>
  )
}
