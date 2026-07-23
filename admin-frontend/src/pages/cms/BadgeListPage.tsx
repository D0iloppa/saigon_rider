import { useEffect, useState } from 'react'
import { Button, Image, Input, InputNumber, Modal, Select, Switch, Table, Tabs, message } from 'antd'
import dayjs from 'dayjs'
import {
  useBadgeMeta,
  useBadges,
  useCreateBadge,
  useDeleteBadge,
  useUpdateBadge,
  type BadgeCondition,
  type BadgeRow,
  type BadgeWriteBody,
} from '../../api/badges'

interface FormState {
  name: string
  name_ko: string
  name_vi: string
  name_en: string
  description_ko: string
  description_vi: string
  description_en: string
  icon_url: string
  icon_content_id: string
  is_active: boolean
  operator: 'AND' | 'OR'
  conditions: BadgeCondition[]
}

const EMPTY_FORM: FormState = {
  name: '',
  name_ko: '',
  name_vi: '',
  name_en: '',
  description_ko: '',
  description_vi: '',
  description_en: '',
  icon_url: '',
  icon_content_id: '',
  is_active: true,
  operator: 'AND',
  conditions: [],
}

function toForm(badge: BadgeRow): FormState {
  return {
    name: badge.name,
    name_ko: badge.name_ko ?? '',
    name_vi: badge.name_vi ?? '',
    name_en: badge.name_en ?? '',
    description_ko: badge.description_ko ?? '',
    description_vi: badge.description_vi ?? '',
    description_en: badge.description_en ?? '',
    icon_url: badge.icon_url ?? '',
    icon_content_id: badge.icon_content_id ?? '',
    is_active: badge.is_active,
    operator: badge.condition_rule?.operator ?? 'AND',
    conditions: badge.condition_rule?.conditions ?? [],
  }
}

function toBody(form: FormState): BadgeWriteBody {
  return {
    name: form.name.trim(),
    name_ko: form.name_ko.trim() || null,
    name_vi: form.name_vi.trim() || null,
    name_en: form.name_en.trim() || null,
    description_ko: form.description_ko.trim() || null,
    description_vi: form.description_vi.trim() || null,
    description_en: form.description_en.trim() || null,
    icon_url: form.icon_url.trim() || null,
    icon_content_id: form.icon_content_id.trim() || null,
    is_active: form.is_active,
    condition_rule: form.conditions.length > 0 ? { operator: form.operator, conditions: form.conditions } : null,
  }
}

function conditionSummary(badge: BadgeRow): string {
  if (!badge.condition_rule || badge.condition_rule.conditions.length === 0) return '-'
  const sep = badge.condition_rule.operator === 'OR' ? ' OR ' : ' AND '
  return badge.condition_rule.conditions.map((c) => `${c.metric} ${c.op} ${c.value}`).join(sep)
}

function ActiveSwitch({ record }: { record: BadgeRow }) {
  const updateBadge = useUpdateBadge()
  return (
    <Switch
      checked={record.is_active}
      loading={updateBadge.isPending}
      onChange={(checked) =>
        updateBadge.mutate(
          { id: record.id, body: toBody({ ...toForm(record), is_active: checked }) },
          { onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.') }
        )
      }
    />
  )
}

export default function BadgeListPage() {
  const { data, isLoading } = useBadges()
  const [editing, setEditing] = useState<BadgeRow | 'new' | null>(null)
  const deleteBadge = useDeleteBadge()

  const columns = [
    {
      title: '아이콘',
      key: 'icon',
      width: 70,
      render: (_: unknown, r: BadgeRow) =>
        r.icon_display_url ? (
          <Image src={r.icon_display_url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 6 }} />
        ) : r.icon_url ? (
          <span style={{ fontSize: 22 }}>{r.icon_url}</span>
        ) : (
          '-'
        ),
    },
    { title: '이름', key: 'name', render: (_: unknown, r: BadgeRow) => r.name_ko || r.name },
    { title: '습득 조건', key: 'condition', render: (_: unknown, r: BadgeRow) => <span style={{ fontSize: 12, color: 'rgba(0,0,0,.45)' }}>{conditionSummary(r)}</span> },
    { title: '획득 수', dataIndex: 'earned_count', key: 'earned_count', width: 80 },
    { title: '활성', key: 'is_active', width: 80, render: (_: unknown, r: BadgeRow) => <ActiveSwitch record={r} /> },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_: unknown, r: BadgeRow) => (
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
                title: '배지를 삭제할까요?',
                onOk: () => deleteBadge.mutate(r.id, { onSuccess: () => message.success('삭제되었습니다.') }),
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
          신규 배지
        </Button>
      </div>
      <Table<BadgeRow> rowKey="id" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} />
      {editing && <BadgeModal target={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function BadgeModal({ target, onClose }: { target: BadgeRow | 'new'; onClose: () => void }) {
  const isNew = target === 'new'
  const [form, setForm] = useState<FormState>(isNew ? EMPTY_FORM : toForm(target))
  const [lang, setLang] = useState('ko')
  const { data: meta } = useBadgeMeta()
  const createBadge = useCreateBadge()
  const updateBadge = useUpdateBadge()

  useEffect(() => {
    setForm(isNew ? EMPTY_FORM : toForm(target))
  }, [target, isNew])

  const set = <K extends keyof FormState>(key: K) => (v: FormState[K]) => setForm((f) => ({ ...f, [key]: v }))

  const setCondition = (i: number, patch: Partial<BadgeCondition>) =>
    setForm((f) => ({ ...f, conditions: f.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }))

  const addCondition = () =>
    setForm((f) => ({
      ...f,
      conditions: [...f.conditions, { metric: meta?.metrics[0]?.code ?? '', op: '>=', value: 1 }],
    }))

  const removeCondition = (i: number) => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }))

  const handleOk = () => {
    if (!form.name.trim()) {
      message.warning('이름(기본)은 필수입니다.')
      return
    }
    const body = toBody(form)
    const onSuccess = () => {
      message.success('저장되었습니다.')
      onClose()
    }
    const onError = (err: unknown) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.')
    if (isNew) createBadge.mutate(body, { onSuccess, onError })
    else updateBadge.mutate({ id: target.id, body }, { onSuccess, onError })
  }

  const nameDescContent = (langKey: 'ko' | 'vi' | 'en') => {
    const nKey = `name_${langKey}` as keyof FormState
    const dKey = `description_${langKey}` as keyof FormState
    return (
      <>
        <Input
          placeholder={`이름 (${langKey.toUpperCase()})`}
          value={form[nKey] as string}
          onChange={(e) => set(nKey)(e.target.value as FormState[typeof nKey])}
          style={{ marginBottom: 12 }}
        />
        <Input.TextArea
          rows={3}
          placeholder={`설명 (${langKey.toUpperCase()})`}
          value={form[dKey] as string}
          onChange={(e) => set(dKey)(e.target.value as FormState[typeof dKey])}
        />
      </>
    )
  }

  return (
    <Modal
      title={isNew ? '신규 배지' : '배지 수정'}
      open
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={createBadge.isPending || updateBadge.isPending}
      okText="저장"
      cancelText="취소"
      destroyOnClose
      width={640}
    >
      <Input
        placeholder="이름 (기본, 필수)"
        value={form.name}
        onChange={(e) => set('name')(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <Tabs
        activeKey={lang}
        onChange={setLang}
        items={[
          { key: 'ko', label: '한국어', children: nameDescContent('ko') },
          { key: 'vi', label: '베트남어', children: nameDescContent('vi') },
          { key: 'en', label: '영어', children: nameDescContent('en') },
        ]}
      />

      <div style={{ display: 'flex', gap: 12, marginTop: 16, marginBottom: 4 }}>
        <Input
          placeholder="아이콘 (이모지 또는 URL)"
          value={form.icon_url}
          onChange={(e) => set('icon_url')(e.target.value)}
          style={{ flex: 1 }}
        />
        <Input
          placeholder="아이콘 content_id (UUID, 선택)"
          value={form.icon_content_id}
          onChange={(e) => set('icon_content_id')(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Switch checked={form.is_active} onChange={set('is_active')} /> 활성 상태
      </label>

      <div style={{ borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,.65)' }}>습득 조건 결합</span>
          <Select
            value={form.operator}
            onChange={set('operator')}
            style={{ width: 160 }}
            options={[
              { value: 'AND', label: 'AND (모두 충족)' },
              { value: 'OR', label: 'OR (하나라도 충족)' },
            ]}
          />
        </div>
        {form.conditions.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <Select
              value={c.metric}
              onChange={(v) => setCondition(i, { metric: v })}
              style={{ flex: 2 }}
              options={(meta?.metrics ?? []).map((m) => ({ value: m.code, label: m.label }))}
            />
            <Select
              value={c.op}
              onChange={(v) => setCondition(i, { op: v })}
              style={{ width: 80 }}
              options={(meta?.ops ?? []).map((o) => ({ value: o, label: o }))}
            />
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
    </Modal>
  )
}
