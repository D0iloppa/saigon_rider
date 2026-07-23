import { useEffect, useState } from 'react'
import { Button, Input, InputNumber, Modal, Select, Switch, Table, Tag, message } from 'antd'
import {
  useGachaDefinitions,
  useUpdateGachaDefinition,
  type GachaDefinition,
  type GachaWriteBody,
} from '../../api/gacha'

// legacy sre_gacha_edit.html 의 status select(ACTIVE/INACTIVE/SCHEDULED)와 동일 (parity)
const STATUSES = ['ACTIVE', 'INACTIVE', 'SCHEDULED']

interface FormState {
  display_name: string
  description: string
  cost_per_pull: number
  cost_per_10_pull: number
  pity_threshold: number | null
  drop_table_json: string
  status: string
  is_listed: boolean
  sort_order: number | null
}

function toForm(g: GachaDefinition): FormState {
  return {
    display_name: g.display_name,
    description: g.description ?? '',
    cost_per_pull: g.cost_per_pull,
    cost_per_10_pull: g.cost_per_10_pull,
    pity_threshold: g.pity_threshold,
    drop_table_json: JSON.stringify(g.drop_table ?? {}, null, 2),
    status: g.status,
    is_listed: g.is_listed,
    sort_order: g.sort_order,
  }
}

export default function GachaListPage() {
  const { data, isLoading } = useGachaDefinitions()
  const [editing, setEditing] = useState<GachaDefinition | null>(null)

  const columns = [
    { title: '코드', dataIndex: 'gacha_code', key: 'gacha_code', render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
    { title: '표시 이름', dataIndex: 'display_name', key: 'display_name' },
    {
      title: '비용',
      key: 'cost',
      render: (_: unknown, r: GachaDefinition) => `${r.cost_currency} ${r.cost_per_pull.toLocaleString()} / ${r.cost_per_10_pull.toLocaleString()}`,
    },
    { title: '천장', key: 'pity_threshold', render: (_: unknown, r: GachaDefinition) => r.pity_threshold ?? '—' },
    {
      title: '노출',
      key: 'is_listed',
      width: 90,
      render: (_: unknown, r: GachaDefinition) => (r.is_listed ? <Tag color="green">노출</Tag> : <Tag>숨김</Tag>),
    },
    { title: '상태', dataIndex: 'status', key: 'status', width: 110 },
    {
      title: '',
      key: 'row_actions',
      width: 90,
      render: (_: unknown, r: GachaDefinition) => (
        <Button size="small" onClick={() => setEditing(r)}>
          수정
        </Button>
      ),
    },
  ]

  return (
    <>
      <Table<GachaDefinition> rowKey="gacha_code" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} />
      {editing && <GachaEditModal target={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function GachaEditModal({ target, onClose }: { target: GachaDefinition; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(toForm(target))
  const updateGacha = useUpdateGachaDefinition()

  useEffect(() => {
    setForm(toForm(target))
  }, [target])

  const set = <K extends keyof FormState>(key: K) => (v: FormState[K]) => setForm((f) => ({ ...f, [key]: v }))

  const handleOk = () => {
    let dropTable: Record<string, unknown>
    try {
      dropTable = JSON.parse(form.drop_table_json)
    } catch {
      message.warning('drop_table JSON이 올바르지 않습니다.')
      return
    }
    const body: GachaWriteBody = {
      display_name: form.display_name.trim(),
      description: form.description.trim() || null,
      cost_per_pull: form.cost_per_pull,
      cost_per_10_pull: form.cost_per_10_pull,
      drop_table: dropTable,
      pity_threshold: form.pity_threshold,
      status: form.status,
      is_listed: form.is_listed,
      sort_order: form.sort_order,
    }
    updateGacha.mutate(
      { gacha_code: target.gacha_code, body },
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
      title={`가챠 수정 — ${target.gacha_code}`}
      open
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={updateGacha.isPending}
      okText="저장"
      cancelText="취소"
      destroyOnClose
      width={640}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>표시 이름</div>
        <Input value={form.display_name} onChange={(e) => set('display_name')(e.target.value)} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>설명</div>
        <Input.TextArea value={form.description} onChange={(e) => set('description')(e.target.value)} rows={2} />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>1회 비용</div>
          <InputNumber style={{ width: '100%' }} min={0} value={form.cost_per_pull} onChange={(v) => set('cost_per_pull')(v ?? 0)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>10회 비용</div>
          <InputNumber style={{ width: '100%' }} min={0} value={form.cost_per_10_pull} onChange={(v) => set('cost_per_10_pull')(v ?? 0)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>천장 (pity)</div>
          <InputNumber style={{ width: '100%' }} placeholder="없음" value={form.pity_threshold} onChange={(v) => set('pity_threshold')(v ?? null)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>상태</div>
          <Select style={{ width: '100%' }} value={form.status} onChange={set('status')} options={STATUSES.map((s) => ({ value: s, label: s }))} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>정렬 순서</div>
          <InputNumber style={{ width: '100%' }} placeholder="없음" value={form.sort_order} onChange={(v) => set('sort_order')(v ?? null)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>노출</div>
          <div style={{ paddingTop: 4 }}>
            <Switch checked={form.is_listed} onChange={set('is_listed')} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>drop_table (JSON)</div>
        <Input.TextArea
          value={form.drop_table_json}
          onChange={(e) => set('drop_table_json')(e.target.value)}
          rows={8}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </div>
    </Modal>
  )
}
