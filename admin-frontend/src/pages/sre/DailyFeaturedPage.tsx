import { useState } from 'react'
import { Button, DatePicker, InputNumber, Select, Table, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useDailyFeaturedHistory, useRefreshDailyFeatured, useShopItems, type DailyFeaturedRow } from '../../api/shop'

const RARITY_ORDER: Record<string, number> = { C: 0, R: 1, E: 2, L: 3, M: 4 }

export default function DailyFeaturedPage() {
  const { data: history, isLoading } = useDailyFeaturedHistory()
  const { data: shopItems } = useShopItems()
  const refresh = useRefreshDailyFeatured()

  const [date, setDate] = useState<Dayjs>(dayjs())
  const [codes, setCodes] = useState<string[]>([])
  const [discountPct, setDiscountPct] = useState<number>(30)

  const itemOptions = (shopItems ?? [])
    .slice()
    .sort((a, b) => a.slot.localeCompare(b.slot) || (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0))
    .map((i) => ({
      value: i.item_code,
      label: `[${i.rarity}] ${i.display_name} (${i.slot}) — ${i.shop_price_gp ?? '?'} GOLD`,
    }))

  const handleReuse = (itemCode: string) => {
    setCodes((cur) => (cur.includes(itemCode) ? cur : [...cur, itemCode]))
  }

  const handleRefresh = () => {
    if (codes.length === 0) {
      message.warning('아이템을 하나 이상 선택하세요.')
      return
    }
    refresh.mutate(
      {
        date: date.format('YYYY-MM-DD'),
        items: codes.map((item_code, idx) => ({ item_code, discount_pct: discountPct, sort_order: idx })),
      },
      {
        onSuccess: () => message.success('일일 추천이 갱신되었습니다.'),
        onError: (err) => message.error(err instanceof Error ? err.message : '갱신에 실패했습니다.'),
      }
    )
  }

  const columns = [
    { title: '날짜', dataIndex: 'featured_date', key: 'featured_date', width: 120 },
    { title: '코드', dataIndex: 'item_code', key: 'item_code', render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
    { title: '아이템명', dataIndex: 'item_name', key: 'item_name' },
    { title: '할인율', key: 'discount_pct', render: (_: unknown, r: DailyFeaturedRow) => `${r.discount_pct}%` },
    { title: '순서', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
    {
      title: '',
      key: 'row_actions',
      width: 90,
      render: (_: unknown, r: DailyFeaturedRow) => (
        <Button size="small" onClick={() => handleReuse(r.item_code)}>
          재등록
        </Button>
      ),
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>추천 날짜</div>
          <DatePicker value={date} onChange={(v) => setDate(v ?? dayjs())} allowClear={false} />
        </div>
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>추천 아이템</div>
          <Select mode="multiple" style={{ width: '100%' }} value={codes} onChange={setCodes} options={itemOptions} placeholder="아이템 선택" />
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>할인율 (%)</div>
          <InputNumber min={0} max={100} value={discountPct} onChange={(v) => setDiscountPct(v ?? 30)} />
        </div>
        <Button type="primary" loading={refresh.isPending} onClick={handleRefresh}>
          갱신
        </Button>
      </div>
      <Table<DailyFeaturedRow> rowKey={(r) => `${r.featured_date}_${r.item_code}`} loading={isLoading} columns={columns} dataSource={history ?? []} pagination={false} />
    </>
  )
}
