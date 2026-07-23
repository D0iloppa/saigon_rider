import { useEffect, useMemo, useState } from 'react'
import { Button, Input, InputNumber, Modal, Select, Switch, Table, Tag, message } from 'antd'
import { useShopItems, useUpdateShopItem, type ShopItem, type ShopItemWriteBody } from '../../api/shop'

// legacy sre_shop_list.html 의 rarity select 와 동일 (parity)
const RARITIES = ['C', 'R', 'E', 'L', 'M']

interface FormState {
  shop_price_gp: number | null
  shop_price_gc: number | null
  is_shop_visible: boolean
  season_lock: boolean
  required_season_code: string
}

function toForm(i: ShopItem): FormState {
  return {
    shop_price_gp: i.shop_price_gp,
    shop_price_gc: i.shop_price_gc,
    is_shop_visible: i.is_shop_visible,
    season_lock: i.season_lock,
    required_season_code: i.required_season_code ?? '',
  }
}

export default function ShopListPage() {
  const { data, isLoading } = useShopItems()
  const [editing, setEditing] = useState<ShopItem | null>(null)
  const [q, setQ] = useState('')
  const [rarity, setRarity] = useState('')
  const [visible, setVisible] = useState('')

  const filtered = useMemo(() => {
    let items = data ?? []
    if (q.trim()) {
      const ql = q.trim().toLowerCase()
      items = items.filter((i) => i.item_code.toLowerCase().includes(ql) || i.display_name.toLowerCase().includes(ql))
    }
    if (rarity) items = items.filter((i) => i.rarity === rarity)
    if (visible === '0' || visible === '1') {
      const flag = visible === '1'
      items = items.filter((i) => i.is_shop_visible === flag)
    }
    return items
  }, [data, q, rarity, visible])

  const columns = [
    { title: '코드', dataIndex: 'item_code', key: 'item_code', render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
    { title: '표시 이름', dataIndex: 'display_name', key: 'display_name' },
    { title: '등급', dataIndex: 'rarity', key: 'rarity', width: 80 },
    { title: '컬렉션', key: 'collection_code', render: (_: unknown, r: ShopItem) => r.collection_code || '—' },
    { title: '가격 (GP/GC)', key: 'price', render: (_: unknown, r: ShopItem) => `${r.shop_price_gp ?? '—'} / ${r.shop_price_gc ?? '—'}` },
    {
      title: '노출',
      key: 'is_shop_visible',
      width: 90,
      render: (_: unknown, r: ShopItem) => (r.is_shop_visible ? <Tag color="green">노출</Tag> : <Tag>숨김</Tag>),
    },
    {
      title: '시즌잠금',
      key: 'season_lock',
      width: 100,
      render: (_: unknown, r: ShopItem) => (r.season_lock ? <Tag color="orange">시즌잠금</Tag> : '—'),
    },
    {
      title: '',
      key: 'row_actions',
      width: 90,
      render: (_: unknown, r: ShopItem) => (
        <Button size="small" onClick={() => setEditing(r)}>
          수정
        </Button>
      ),
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <Input placeholder="코드 또는 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} allowClear />
        <Select
          placeholder="등급"
          value={rarity || undefined}
          onChange={(v) => setRarity(v ?? '')}
          allowClear
          style={{ width: 160 }}
          options={RARITIES.map((r) => ({ value: r, label: r }))}
        />
        <Select
          placeholder="노출"
          value={visible || undefined}
          onChange={(v) => setVisible(v ?? '')}
          allowClear
          style={{ width: 140 }}
          options={[
            { value: '1', label: '노출' },
            { value: '0', label: '숨김' },
          ]}
        />
      </div>
      <Table<ShopItem> rowKey="item_code" loading={isLoading} columns={columns} dataSource={filtered} pagination={false} />
      {editing && <ShopItemEditModal target={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ShopItemEditModal({ target, onClose }: { target: ShopItem; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(toForm(target))
  const updateShopItem = useUpdateShopItem()

  useEffect(() => {
    setForm(toForm(target))
  }, [target])

  const set = <K extends keyof FormState>(key: K) => (v: FormState[K]) => setForm((f) => ({ ...f, [key]: v }))

  const handleOk = () => {
    const body: ShopItemWriteBody = {
      shop_price_gp: form.shop_price_gp,
      shop_price_gc: form.shop_price_gc,
      is_shop_visible: form.is_shop_visible,
      season_lock: form.season_lock,
      required_season_code: form.required_season_code.trim() || null,
    }
    updateShopItem.mutate(
      { item_code: target.item_code, body },
      {
        onSuccess: () => {
          message.success('저장되었습니다.')
          onClose()
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.'),
      }
    )
  }

  return (
    <Modal
      title={`상점 아이템 수정 — ${target.display_name}`}
      open
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={updateShopItem.isPending}
      okText="저장"
      cancelText="취소"
      destroyOnClose
      width={520}
    >
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>GP 가격</div>
          <InputNumber style={{ width: '100%' }} placeholder="없음" min={0} value={form.shop_price_gp} onChange={(v) => set('shop_price_gp')(v ?? null)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>GC 가격</div>
          <InputNumber style={{ width: '100%' }} placeholder="없음" min={0} value={form.shop_price_gc} onChange={(v) => set('shop_price_gc')(v ?? null)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>상점 노출</div>
          <div style={{ paddingTop: 4 }}>
            <Switch checked={form.is_shop_visible} onChange={set('is_shop_visible')} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>시즌 잠금</div>
          <div style={{ paddingTop: 4 }}>
            <Switch checked={form.season_lock} onChange={set('season_lock')} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>시즌 코드 (시즌 잠금 시)</div>
        <Input
          placeholder="SEASON_2026_Q2"
          value={form.required_season_code}
          onChange={(e) => set('required_season_code')(e.target.value)}
          style={{ fontFamily: 'monospace' }}
        />
      </div>
    </Modal>
  )
}
