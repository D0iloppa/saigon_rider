import { useEffect, useState } from 'react'
import { Button, Input, InputNumber, Modal, Select, Switch, Table, Tag, message } from 'antd'
import {
  useCreateRewardPolicy,
  useDeleteRewardPolicy,
  useRewardPolicies,
  useUpdateRewardPolicy,
  type PolicyAction,
  type PolicyCondition,
  type RewardPolicy,
  type RewardPolicyWriteBody,
} from '../../api/rewardPolicy'

// legacy policies.html 의 METRICS / OPS / ACTION_TYPES 와 동일 (parity)
const METRICS = ['total_distance_m', 'total_exp_granted', 'level']
const OPS = ['>=', '>', '==', '<=', '<', 'in']
const ACTION_TYPES: { v: string; l: string }[] = [
  { v: 'GRANT_XP', l: 'XP 지급' },
  { v: 'GRANT_EXP', l: 'EXP 지급' },
  { v: 'GRANT_GOLD', l: 'Gold 지급' },
  { v: 'GRANT_BADGE', l: '배지 지급' },
]

interface FormState {
  policy_code: string
  name: string
  description: string
  priority: number
  is_repeatable: boolean
  repeat_interval: number | null
  repeat_metric: string
  repeat_metric_interval: number | null
  is_active: boolean
  conditions: PolicyCondition[]
  actions: PolicyAction[]
}

const EMPTY_FORM: FormState = {
  policy_code: '',
  name: '',
  description: '',
  priority: 10,
  is_repeatable: false,
  repeat_interval: null,
  repeat_metric: '',
  repeat_metric_interval: null,
  is_active: true,
  conditions: [],
  actions: [],
}

function toForm(p: RewardPolicy): FormState {
  return {
    policy_code: p.policy_code,
    name: p.name,
    description: p.description ?? '',
    priority: p.priority,
    is_repeatable: p.is_repeatable,
    repeat_interval: p.repeat_interval,
    repeat_metric: p.repeat_metric ?? '',
    repeat_metric_interval: p.repeat_metric_interval,
    is_active: p.is_active,
    conditions: p.conditions ?? [],
    actions: (p.actions ?? []).map((a) => ({ action_type: a.action_type, value: a.value, ref_id: a.ref_id ?? '', sort_order: a.sort_order ?? 0 })),
  }
}

function toBody(form: FormState): RewardPolicyWriteBody {
  return {
    policy_code: form.policy_code.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    conditions: form.conditions,
    is_repeatable: form.is_repeatable,
    repeat_interval: form.repeat_interval,
    repeat_metric: form.repeat_metric || null,
    repeat_metric_interval: form.repeat_metric_interval,
    is_active: form.is_active,
    priority: form.priority || 10,
    actions: form.actions.map((a) => ({
      action_type: a.action_type,
      value: a.action_type === 'GRANT_BADGE' ? 0 : a.value || 0,
      ref_id: a.ref_id || null,
      sort_order: a.sort_order || 0,
    })),
  }
}

function conditionSummary(p: RewardPolicy): string {
  return (p.conditions ?? []).map((c) => `${c.metric} ${c.op} ${c.value}`).join(' AND ')
}

function repeatLabel(p: RewardPolicy): string {
  if (!p.is_repeatable) return ''
  if (p.repeat_metric) return `${p.repeat_metric} ×${p.repeat_metric_interval}`
  if (p.repeat_interval) return `${p.repeat_interval}s`
  return ''
}

export default function RewardPolicyPage() {
  const { data, isLoading } = useRewardPolicies()
  const [editing, setEditing] = useState<RewardPolicy | 'new' | null>(null)
  const updatePolicy = useUpdateRewardPolicy()
  const deletePolicy = useDeleteRewardPolicy()

  const toggleActive = (p: RewardPolicy) => {
    updatePolicy.mutate(
      { id: p.id, body: toBody({ ...toForm(p), is_active: !p.is_active }) },
      { onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.') }
    )
  }

  const columns = [
    { title: '코드', dataIndex: 'policy_code', key: 'policy_code', render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
    { title: '이름', dataIndex: 'name', key: 'name' },
    {
      title: '조건 요약',
      key: 'conditions',
      render: (_: unknown, r: RewardPolicy) => <span style={{ fontSize: 11, color: 'rgba(0,0,0,.45)' }}>{conditionSummary(r)}</span>,
    },
    { title: '액션', key: 'actions_count', render: (_: unknown, r: RewardPolicy) => `${(r.actions ?? []).length}개` },
    { title: '우선순위', dataIndex: 'priority', key: 'priority', width: 90 },
    {
      title: '반복',
      key: 'repeat',
      render: (_: unknown, r: RewardPolicy) =>
        r.is_repeatable ? <Tag color="orange">{`반복${repeatLabel(r) ? ` ${repeatLabel(r)}` : ''}`}</Tag> : <Tag>1회</Tag>,
    },
    {
      title: '상태',
      key: 'is_active',
      width: 90,
      render: (_: unknown, r: RewardPolicy) => (r.is_active ? <Tag color="green">ON</Tag> : <Tag>OFF</Tag>),
    },
    {
      title: '',
      key: 'row_actions',
      width: 200,
      render: (_: unknown, r: RewardPolicy) => (
        <>
          <Button size="small" onClick={() => setEditing(r)}>
            수정
          </Button>
          <Button size="small" style={{ marginLeft: 8 }} loading={updatePolicy.isPending} onClick={() => toggleActive(r)}>
            {r.is_active ? 'OFF' : 'ON'}
          </Button>
          <Button
            size="small"
            danger
            style={{ marginLeft: 8 }}
            onClick={() =>
              Modal.confirm({
                title: `정책 "${r.policy_code}"을(를) 삭제하시겠습니까?`,
                onOk: () => deletePolicy.mutate(r.id, { onSuccess: () => message.success('삭제되었습니다.') }),
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" onClick={() => setEditing('new')}>
          + 새 정책
        </Button>
      </div>
      <Table<RewardPolicy> rowKey="id" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} />
      {editing && <RewardPolicyModal target={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function RewardPolicyModal({ target, onClose }: { target: RewardPolicy | 'new'; onClose: () => void }) {
  const isNew = target === 'new'
  const [form, setForm] = useState<FormState>(isNew ? EMPTY_FORM : toForm(target))
  const createPolicy = useCreateRewardPolicy()
  const updatePolicy = useUpdateRewardPolicy()

  useEffect(() => {
    setForm(isNew ? EMPTY_FORM : toForm(target))
  }, [target, isNew])

  const set = <K extends keyof FormState>(key: K) => (v: FormState[K]) => setForm((f) => ({ ...f, [key]: v }))

  const setCondition = (i: number, patch: Partial<PolicyCondition>) =>
    setForm((f) => ({ ...f, conditions: f.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }))
  const addCondition = () => setForm((f) => ({ ...f, conditions: [...f.conditions, { metric: METRICS[0], op: '>=', value: 0 }] }))
  const removeCondition = (i: number) => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }))

  const setAction = (i: number, patch: Partial<PolicyAction>) =>
    setForm((f) => ({ ...f, actions: f.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }))
  const addAction = () =>
    setForm((f) => ({ ...f, actions: [...f.actions, { action_type: 'GRANT_XP', value: 0, ref_id: '', sort_order: f.actions.length }] }))
  const removeAction = (i: number) => setForm((f) => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }))

  const handleOk = () => {
    if (!form.policy_code.trim() || !form.name.trim()) {
      message.warning('정책 코드와 이름은 필수입니다.')
      return
    }
    const body = toBody(form)
    const onSuccess = () => {
      message.success('저장되었습니다.')
      onClose()
    }
    const onError = (err: unknown) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.')
    if (isNew) createPolicy.mutate(body, { onSuccess, onError })
    else updatePolicy.mutate({ id: target.id, body }, { onSuccess, onError })
  }

  return (
    <Modal
      title={isNew ? '새 정책 등록' : '정책 수정'}
      open
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={createPolicy.isPending || updatePolicy.isPending}
      okText="저장"
      cancelText="취소"
      destroyOnClose
      width={680}
    >
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <Input placeholder="MILEAGE_100KM" value={form.policy_code} onChange={(e) => set('policy_code')(e.target.value)} style={{ flex: 1 }} />
        <Input placeholder="100km 달성 보상" value={form.name} onChange={(e) => set('name')(e.target.value)} style={{ flex: 1 }} />
      </div>
      <Input.TextArea
        placeholder="누적 100km 달성 시 XP 지급"
        value={form.description}
        onChange={(e) => set('description')(e.target.value)}
        rows={2}
        style={{ marginBottom: 12 }}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>우선순위</div>
          <InputNumber style={{ width: '100%' }} value={form.priority} onChange={(v) => set('priority')(v ?? 10)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>반복 가능</div>
          <Select
            style={{ width: '100%' }}
            value={form.is_repeatable ? '1' : '0'}
            onChange={(v) => set('is_repeatable')(v === '1')}
            options={[
              { value: '0', label: '1회성' },
              { value: '1', label: '반복' },
            ]}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>반복 주기 (초)</div>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="null"
            value={form.repeat_interval}
            onChange={(v) => set('repeat_interval')(v ?? null)}
          />
        </div>
      </div>

      {form.is_repeatable && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>반복 메트릭</div>
            <Select
              style={{ width: '100%' }}
              value={form.repeat_metric}
              onChange={(v) => set('repeat_metric')(v)}
              options={[{ value: '', label: '없음 (시간 기반)' }, ...METRICS.map((m) => ({ value: m, label: m }))]}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>메트릭 간격</div>
            <InputNumber
              style={{ width: '100%' }}
              placeholder="예: 1000 (1km)"
              value={form.repeat_metric_interval}
              onChange={(v) => set('repeat_metric_interval')(v ?? null)}
            />
          </div>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Switch checked={form.is_active} onChange={set('is_active')} /> 활성 상태
      </label>

      <div style={{ borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'rgba(0,0,0,.65)', marginBottom: 8 }}>조건 (AND 결합)</div>
        {form.conditions.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <Select value={c.metric} onChange={(v) => setCondition(i, { metric: v })} style={{ flex: 2 }} options={METRICS.map((m) => ({ value: m, label: m }))} />
            <Select value={c.op} onChange={(v) => setCondition(i, { op: v })} style={{ width: 80 }} options={OPS.map((o) => ({ value: o, label: o }))} />
            <InputNumber value={c.value} onChange={(v) => setCondition(i, { value: v ?? 0 })} style={{ width: 100 }} />
            <Button danger size="small" onClick={() => removeCondition(i)}>
              삭제
            </Button>
          </div>
        ))}
        <Button size="small" onClick={addCondition}>
          + 조건 추가
        </Button>
      </div>

      <div style={{ borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: 12 }}>
        <div style={{ fontSize: 13, color: 'rgba(0,0,0,.65)', marginBottom: 8 }}>액션</div>
        {form.actions.map((a, i) => {
          const isBadge = a.action_type === 'GRANT_BADGE'
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <Select value={a.action_type} onChange={(v) => setAction(i, { action_type: v })} style={{ flex: 2 }} options={ACTION_TYPES.map((t) => ({ value: t.v, label: t.l }))} />
              <InputNumber value={a.value} disabled={isBadge} onChange={(v) => setAction(i, { value: v ?? 0 })} style={{ width: 80 }} placeholder="value" />
              <Input value={a.ref_id ?? ''} onChange={(e) => setAction(i, { ref_id: e.target.value || null })} style={{ width: 220, fontSize: 11 }} placeholder={isBadge ? 'badge UUID' : 'ref_id (optional)'} />
              <InputNumber value={a.sort_order} onChange={(v) => setAction(i, { sort_order: v ?? 0 })} style={{ width: 70 }} placeholder="순서" title="sort_order" />
              <Button danger size="small" onClick={() => removeAction(i)}>
                삭제
              </Button>
            </div>
          )
        })}
        <Button size="small" onClick={addAction}>
          + 액션 추가
        </Button>
      </div>
    </Modal>
  )
}
