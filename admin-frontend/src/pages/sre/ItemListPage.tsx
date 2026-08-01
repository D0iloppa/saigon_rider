import { useEffect, useMemo, useState } from 'react'
import { Button, Input, InputNumber, Modal, Select, Table, Tag, message } from 'antd'
import {
  useCreateItem,
  useDeleteItem,
  useItems,
  useUpdateItem,
  type Item,
  type ItemCreateBody,
  type ItemWriteBody,
} from '../../api/items'

// legacy sre_items 페이지의 _ITEM_SLOTS / _ITEM_RARITIES / _ITEM_EFFECTS 와 동일 (parity)
const ITEM_SLOTS = [
  'MOTORCYCLE_BODY', 'SEAT', 'STICKER', 'RANK_CARD', 'HANDLEBAR', 'TAIL_LIGHT', 'ENGINE_COVER',
  'HEADLIGHT', 'MIRROR', 'NUMBER', 'GLOVES', 'BOOTS', 'EYEWEAR', 'NAMEPLATE', 'FRAME', 'BACKDROP',
  'TITLE', 'TRAIL', 'HORN', 'START_ANIM', 'EMOTE', 'BANNER', 'PET',
]
const ITEM_RARITIES = ['C', 'R', 'E', 'L', 'M'] as const
const RARITY_LABEL: Record<string, string> = { C: 'Common', R: 'Rare', E: 'Epic', L: 'Legendary', M: 'Mythic' }
const RARITY_COLOR: Record<string, string> = { C: '#94a3b8', R: '#60a5fa', E: '#a78bfa', L: '#fbbf24', M: '#f87171' }
const ITEM_EFFECTS: { v: string; l: string }[] = [
  { v: '', l: '효과 없음' },
  { v: 'RP_MULT', l: 'RP(경험치) 획득 배수' },
  { v: 'GOLD_MULT', l: 'Gold 획득 배수' },
  { v: 'QUEST_SLOT', l: '일일 퀘스트 슬롯 +' },
  { v: 'COST_DISCOUNT', l: '가챠/상점 비용 할인' },
]

interface FormState {
  item_code: string
  display_name: string
  slot: string
  rarity: string
  collection_code: string
  asset_uri: string
  shop_price_gp: number | null
  shop_price_gc: number | null
  is_shop_visible: boolean
  season_lock: boolean
  required_season_code: string
  effect_type: string
}

const EMPTY_FORM: FormState = {
  item_code: '',
  display_name: '',
  slot: ITEM_SLOTS[0],
  rarity: 'C',
  collection_code: '',
  asset_uri: '',
  shop_price_gp: null,
  shop_price_gc: null,
  is_shop_visible: false,
  season_lock: false,
  required_season_code: '',
  effect_type: '',
}

function toForm(i: Item): FormState {
  return {
    item_code: i.item_code,
    display_name: i.display_name,
    slot: i.slot,
    rarity: i.rarity,
    collection_code: i.collection_code ?? '',
    asset_uri: i.asset_uri ?? '',
    shop_price_gp: i.shop_price_gp,
    shop_price_gc: i.shop_price_gc,
    is_shop_visible: i.is_shop_visible,
    season_lock: i.season_lock,
    required_season_code: i.required_season_code ?? '',
    effect_type: i.effect_type ?? '',
  }
}

function toBody(form: FormState): ItemWriteBody {
  return {
    display_name: form.display_name.trim(),
    slot: form.slot,
    rarity: form.rarity,
    collection_code: form.collection_code.trim() || null,
    asset_uri: form.asset_uri.trim() || null,
    shop_price_gp: form.shop_price_gp,
    shop_price_gc: form.shop_price_gc,
    is_shop_visible: form.is_shop_visible,
    season_lock: form.season_lock,
    required_season_code: form.required_season_code.trim() || null,
    effect_type: form.effect_type || null,
  }
}

export default function ItemListPage() {
  const { data, isLoading } = useItems()
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const deleteItem = useDeleteItem()
  const [q, setQ] = useState('')
  const [slot, setSlot] = useState('')
  const [rarity, setRarity] = useState('')

  const filtered = useMemo(() => {
    let items = data ?? []
    if (q.trim()) {
      const ql = q.trim().toLowerCase()
      items = items.filter((i) => i.item_code.toLowerCase().includes(ql) || i.display_name.toLowerCase().includes(ql))
    }
    if (slot) items = items.filter((i) => i.slot === slot)
    if (rarity) items = items.filter((i) => i.rarity === rarity)
    return items
  }, [data, q, slot, rarity])

  const columns = [
    { title: '코드', dataIndex: 'item_code', key: 'item_code', render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
    { title: '표시 이름', dataIndex: 'display_name', key: 'display_name' },
    {
      title: '등급',
      key: 'rarity',
      render: (_: unknown, r: Item) => <span style={{ fontSize: 11, fontWeight: 700, color: RARITY_COLOR[r.rarity] }}>{RARITY_LABEL[r.rarity] ?? r.rarity}</span>,
    },
    { title: '슬롯', dataIndex: 'slot', key: 'slot' },
    { title: '컬렉션', key: 'collection_code', render: (_: unknown, r: Item) => <span style={{ fontSize: 11 }}>{r.collection_code || '—'}</span> },
    { title: '가격 (GOLD/XP)', key: 'price', render: (_: unknown, r: Item) => `${r.shop_price_gp ?? '—'} / ${r.shop_price_gc ?? '—'}` },
    {
      title: '상점 노출',
      key: 'is_shop_visible',
      width: 90,
      render: (_: unknown, r: Item) => (r.is_shop_visible ? <Tag color="green">노출</Tag> : <Tag>숨김</Tag>),
    },
    {
      title: '',
      key: 'row_actions',
      width: 160,
      render: (_: unknown, r: Item) => (
        <>
          <Button size="small" onClick={() => setEditing(r)}>
            수정
          </Button>
          <Button
            size="small"
            danger
            style={{ marginLeft: 8 }}
            onClick={() =>
              Modal.confirm({
                title: `아이템 [${r.item_code}]을 삭제할까요?`,
                content: '보유 유저가 있으면 삭제되지 않습니다.',
                onOk: () =>
                  deleteItem.mutate(r.item_code, {
                    onSuccess: () => message.success('삭제되었습니다.'),
                    onError: (err) => message.error(err instanceof Error ? err.message : '삭제에 실패했습니다.'),
                  }),
              })
            }
          >
            삭제
          </Button>
        </>
      ),
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <Input placeholder="코드 또는 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} allowClear />
        <Select
          placeholder="슬롯"
          value={slot || undefined}
          onChange={(v) => setSlot(v ?? '')}
          allowClear
          style={{ width: 200 }}
          options={ITEM_SLOTS.map((s) => ({ value: s, label: s }))}
        />
        <Select
          placeholder="등급"
          value={rarity || undefined}
          onChange={(v) => setRarity(v ?? '')}
          allowClear
          style={{ width: 160 }}
          options={ITEM_RARITIES.map((r) => ({ value: r, label: `${RARITY_LABEL[r]} (${r})` }))}
        />
        <div style={{ flex: 1 }} />
        <Button type="primary" onClick={() => setEditing('new')}>
          + 아이템 등록
        </Button>
      </div>
      <Table<Item> rowKey="item_code" loading={isLoading} columns={columns} dataSource={filtered} pagination={false} />
      {editing && <ItemModal target={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ItemModal({ target, onClose }: { target: Item | 'new'; onClose: () => void }) {
  const isNew = target === 'new'
  const [form, setForm] = useState<FormState>(isNew ? EMPTY_FORM : toForm(target))
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()

  useEffect(() => {
    setForm(isNew ? EMPTY_FORM : toForm(target))
  }, [target, isNew])

  const set = <K extends keyof FormState>(key: K) => (v: FormState[K]) => setForm((f) => ({ ...f, [key]: v }))

  const handleOk = () => {
    if (isNew && !/^[A-Z0-9_]+$/.test(form.item_code.trim())) {
      message.warning('아이템 코드는 영대문자·숫자·밑줄(_)만 허용됩니다.')
      return
    }
    if (!form.display_name.trim()) {
      message.warning('표시 이름은 필수입니다.')
      return
    }
    const body = toBody(form)
    const onSuccess = () => {
      message.success('저장되었습니다.')
      onClose()
    }
    const onError = (err: unknown) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.')
    if (isNew) {
      const createBody: ItemCreateBody = { ...body, item_code: form.item_code.trim() }
      createItem.mutate(createBody, { onSuccess, onError })
    } else {
      updateItem.mutate({ item_code: target.item_code, body }, { onSuccess, onError })
    }
  }

  return (
    <Modal
      title={isNew ? '새 아이템 등록' : `수정 — ${target.display_name}`}
      open
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={createItem.isPending || updateItem.isPending}
      okText="저장"
      cancelText="취소"
      destroyOnClose
      width={640}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>아이템 코드</div>
        {isNew ? (
          <Input
            placeholder="MOTORCYCLE_BODY_STREET_CLASSIC_C_01"
            value={form.item_code}
            onChange={(e) => set('item_code')(e.target.value)}
            style={{ fontFamily: 'monospace' }}
          />
        ) : (
          <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{form.item_code}</div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>표시 이름</div>
        <Input placeholder="Matte Street Helmet" value={form.display_name} onChange={(e) => set('display_name')(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>슬롯</div>
          <Select style={{ width: '100%' }} value={form.slot} onChange={set('slot')} options={ITEM_SLOTS.map((s) => ({ value: s, label: s }))} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>등급 (Rarity)</div>
          <Select
            style={{ width: '100%' }}
            value={form.rarity}
            onChange={set('rarity')}
            options={ITEM_RARITIES.map((r) => ({ value: r, label: `${RARITY_LABEL[r]} (${r})` }))}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>컬렉션 코드</div>
          <Input placeholder="STREET_CLASSICS" value={form.collection_code} onChange={(e) => set('collection_code')(e.target.value)} style={{ fontFamily: 'monospace' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>Asset URI</div>
          <Input placeholder="items/helmet_street_classic_c_01.svg" value={form.asset_uri} onChange={(e) => set('asset_uri')(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>GOLD 가격</div>
          <InputNumber style={{ width: '100%' }} placeholder="0" min={0} value={form.shop_price_gp} onChange={set('shop_price_gp')} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>XP 가격</div>
          <InputNumber style={{ width: '100%' }} placeholder="0" min={0} value={form.shop_price_gc} onChange={set('shop_price_gc')} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>상점 노출</div>
          <Select
            style={{ width: '100%' }}
            value={form.is_shop_visible ? '1' : '0'}
            onChange={(v) => set('is_shop_visible')(v === '1')}
            options={[
              { value: '1', label: '노출' },
              { value: '0', label: '숨김' },
            ]}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>시즌 잠금</div>
          <Select
            style={{ width: '100%' }}
            value={form.season_lock ? '1' : '0'}
            onChange={(v) => set('season_lock')(v === '1')}
            options={[
              { value: '0', label: '없음' },
              { value: '1', label: '시즌 잠금' },
            ]}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>시즌 코드 (시즌 잠금 시)</div>
        <Input placeholder="SEASON_2026_Q2" value={form.required_season_code} onChange={(e) => set('required_season_code')(e.target.value)} style={{ fontFamily: 'monospace' }} />
      </div>

      <div>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>착용효과 (수치는 등급별 고정 테이블에서 자동)</div>
        <Select style={{ width: '100%' }} value={form.effect_type} onChange={set('effect_type')} options={ITEM_EFFECTS.map((e) => ({ value: e.v, label: e.l }))} />
      </div>
    </Modal>
  )
}
