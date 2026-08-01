import { useRef, useState } from 'react'
import { Alert, Button, Card, DatePicker, InputNumber, Select, Space, Table, Tag, Typography, message } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../api/client'
import {
  useFuelMeta,
  useFuelPipelineHealth,
  useFuelPrices,
  useTriggerFuelFetch,
  useUpsertFuelPrice,
  type FuelFetchLogRow,
  type FuelPriceRow,
} from '../../api/fuel'

const BRAND_LABEL: Record<string, string> = {
  PETROLIMEX: 'Petrolimex',
  PVOIL: 'PV Oil',
  SAIGON_PETRO: 'Saigon Petro',
  MIPEC: 'Mipec',
  COMECO: 'Comeco',
  MARKET_AVG: '시장 평균',
}

const FUEL_TYPE_LABEL: Record<string, string> = {
  RON95_III: 'RON 95-III',
  RON95_V: 'RON 95-V',
  E5_RON92_II: 'E5 RON 92-II',
  DO_001S_V: 'DO 0.01S-V',
  DO_005S_II: 'DO 0.05S-II',
}

function staleBadge(staleDays: number | null) {
  if (staleDays === null) return <Tag color="red">현재가 없음</Tag>
  if (staleDays > 14) return <Tag color="red">{staleDays}일 전 (점검 필요)</Tag>
  if (staleDays > 10) return <Tag color="orange">{staleDays}일 전 (조정 임박)</Tag>
  return <Tag color="green">{staleDays}일 전 (정상)</Tag>
}

export default function FuelPricePage() {
  const { data: meta } = useFuelMeta()
  const { data: prices, isLoading: pricesLoading, isError: pricesError } = useFuelPrices()
  const { data: health, isLoading: healthLoading } = useFuelPipelineHealth()
  const upsertMutation = useUpsertFuelPrice()
  const refreshMutation = useTriggerFuelFetch()
  const qc = useQueryClient()
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleTriggerRefresh = () => {
    refreshMutation.mutate(undefined, {
      onSuccess: () => {
        message.success('수집을 시작했습니다 — 완료까지 최대 1분')
        if (pollTimer.current) clearInterval(pollTimer.current)
        let ticks = 0
        pollTimer.current = setInterval(() => {
          ticks += 1
          qc.invalidateQueries({ queryKey: ['fuel-pipeline-health'] })
          if (ticks >= 10 && pollTimer.current) {
            clearInterval(pollTimer.current)
            pollTimer.current = null
          }
        }, 4000)
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          message.warning('이미 수집이 진행 중입니다')
        } else {
          message.error(err instanceof Error ? err.message : '수집 시작에 실패했습니다.')
        }
      },
    })
  }

  const [brand, setBrand] = useState<string | undefined>()
  const [fuelType, setFuelType] = useState<string | undefined>()
  const [priceVnd, setPriceVnd] = useState<number | null>(null)
  const [effectiveDate, setEffectiveDate] = useState<Dayjs | null>(null)

  const handleSave = () => {
    if (!brand || !fuelType) {
      message.warning('브랜드와 연료 종류를 선택하세요.')
      return
    }
    if (priceVnd === null || priceVnd < 10_000 || priceVnd > 60_000) {
      message.warning('가격은 10,000 ~ 60,000 사이여야 합니다.')
      return
    }
    upsertMutation.mutate(
      {
        brand,
        fuel_type: fuelType,
        price_vnd: priceVnd,
        effective_date: effectiveDate ? effectiveDate.format('YYYY-MM-DD') : undefined,
      },
      {
        onSuccess: () => {
          message.success('저장되었습니다.')
          setPriceVnd(null)
          setEffectiveDate(null)
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.'),
      }
    )
  }

  const priceColumns = [
    { title: '브랜드', dataIndex: 'brand', key: 'brand', render: (v: string) => BRAND_LABEL[v] ?? v },
    { title: '연료 종류', dataIndex: 'fuel_type', key: 'fuel_type', render: (v: string) => FUEL_TYPE_LABEL[v] ?? v },
    {
      title: '가격 (VND)',
      dataIndex: 'price_vnd',
      key: 'price_vnd',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString('en-US'),
    },
    { title: '적용일', dataIndex: 'effective_date', key: 'effective_date' },
    { title: 'source', dataIndex: 'source', key: 'source', render: (v: string) => <span style={{ color: '#94a3b8' }}>{v}</span> },
  ]

  const logColumns = [
    {
      title: '예정시각',
      dataIndex: 'scheduled_at',
      key: 'scheduled_at',
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    { title: 'source', dataIndex: 'source', key: 'source' },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (v: string | null) => <Tag color={v === 'SUCCESS' ? 'green' : 'red'}>{v ?? '-'}</Tag>,
    },
    {
      title: '적재/발견',
      key: 'counts',
      align: 'right' as const,
      render: (_: unknown, r: FuelFetchLogRow) => `${r.items_inserted}/${r.items_found}`,
    },
    {
      title: '오류',
      dataIndex: 'error_message',
      key: 'error_message',
      render: (v: string | null) => <span style={{ color: '#94a3b8' }}>{(v ?? '').slice(0, 80)}</span>,
    },
  ]

  if (pricesError) {
    return <Alert type="error" showIcon message="유가 정보를 불러오지 못했습니다." />
  }

  return (
    <>
      <Card title="수집 파이프라인 상태" size="small" loading={healthLoading} style={{ marginBottom: 16 }}>
        <Space size={28} wrap style={{ marginBottom: 16 }}>
          <span>최신가 노후도: {staleBadge(health?.stale_days ?? null)}</span>
          <span>
            마지막 성공 수집: <b>{health?.last_success_at ? dayjs(health.last_success_at).format('YYYY-MM-DD HH:mm') : '없음'}</b>
          </span>
          <span>
            {health && health.consecutive_failures > 0 ? (
              <Tag color="red">연속 실패 {health.consecutive_failures}회</Tag>
            ) : (
              <Tag color="green">최근 정상</Tag>
            )}
          </span>
          <Button loading={refreshMutation.isPending} onClick={handleTriggerRefresh}>
            지금 수집 실행
          </Button>
        </Space>
        <Table
          size="small"
          rowKey={(r: FuelFetchLogRow) => `${r.source}-${r.scheduled_at}`}
          columns={logColumns}
          dataSource={health?.logs ?? []}
          locale={{ emptyText: '수집 로그가 없습니다.' }}
          pagination={false}
        />
      </Card>

      <Card title="참고가 등록" size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            style={{ width: 160 }}
            placeholder="브랜드"
            value={brand}
            onChange={setBrand}
            options={(meta?.brands ?? []).map((b) => ({ value: b, label: BRAND_LABEL[b] ?? b }))}
          />
          <Select
            style={{ width: 160 }}
            placeholder="연료 종류"
            value={fuelType}
            onChange={setFuelType}
            options={(meta?.fuel_types ?? []).map((f) => ({ value: f, label: FUEL_TYPE_LABEL[f] ?? f }))}
          />
          <InputNumber
            style={{ width: 140 }}
            placeholder="가격 (VND)"
            min={10_000}
            max={60_000}
            step={10}
            value={priceVnd}
            onChange={setPriceVnd}
          />
          <DatePicker placeholder="적용일 (선택, 기본 오늘)" value={effectiveDate} onChange={setEffectiveDate} />
          <Button type="primary" loading={upsertMutation.isPending} onClick={handleSave}>
            저장
          </Button>
        </Space>
      </Card>

      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        ACTIVE 참고가
      </Typography.Text>
      <Table<FuelPriceRow>
        rowKey={(r) => `${r.brand}-${r.fuel_type}`}
        loading={pricesLoading}
        columns={priceColumns}
        dataSource={prices ?? []}
        locale={{ emptyText: '등록된 ACTIVE 참고가가 없습니다.' }}
        pagination={false}
      />
    </>
  )
}
