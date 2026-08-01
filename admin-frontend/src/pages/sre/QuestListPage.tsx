import { useEffect, useState } from 'react'
import { Button, Image, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Tag, DatePicker, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import {
  useCreateQuest,
  useDeleteQuest,
  useQuestMeta,
  useQuests,
  useUpdateQuest,
  type QuestRow,
  type QuestWriteBody,
} from '../../api/quests'

interface FormState {
  title_ko: string
  title_vi: string
  title_en: string
  period: string
  district_id: number | null
  required_level: number
  target_distance_km: string
  badge: string | null
  is_active: boolean
  reward_exp: number
  reward_gold: number
  reward_item: string
  starts_at: Dayjs | null
  ends_at: Dayjs | null
  main_content_id: string
  thumbnail_content_id: string
  banner_content_id: string
}

const EMPTY_FORM: FormState = {
  title_ko: '',
  title_vi: '',
  title_en: '',
  period: 'DAILY',
  district_id: null,
  required_level: 1,
  target_distance_km: '5.0',
  badge: null,
  is_active: true,
  reward_exp: 100,
  reward_gold: 50,
  reward_item: '',
  starts_at: null,
  ends_at: null,
  main_content_id: '',
  thumbnail_content_id: '',
  banner_content_id: '',
}

function toForm(q: QuestRow): FormState {
  return {
    title_ko: q.title_ko ?? '',
    title_vi: q.title_vi ?? '',
    title_en: q.title_en ?? '',
    period: q.period,
    district_id: q.district_id,
    required_level: q.required_level,
    target_distance_km: q.target_distance_km,
    badge: q.badge,
    is_active: q.is_active,
    reward_exp: q.reward_exp,
    reward_gold: q.reward_gold,
    reward_item: q.reward_item ?? '',
    starts_at: q.starts_at ? dayjs(q.starts_at) : null,
    ends_at: q.ends_at ? dayjs(q.ends_at) : null,
    main_content_id: q.main_content_id ?? '',
    thumbnail_content_id: q.thumbnail_content_id ?? '',
    banner_content_id: q.banner_content_id ?? '',
  }
}

function toBody(form: FormState): QuestWriteBody {
  return {
    title_ko: form.title_ko.trim(),
    title_vi: form.title_vi.trim() || null,
    title_en: form.title_en.trim() || null,
    period: form.period,
    district_id: form.district_id,
    required_level: form.required_level,
    target_distance_km: form.target_distance_km,
    badge: form.badge,
    is_active: form.is_active,
    reward_exp: form.reward_exp,
    reward_gold: form.reward_gold,
    reward_item: form.reward_item.trim() || null,
    starts_at: form.starts_at ? form.starts_at.toISOString() : null,
    ends_at: form.ends_at ? form.ends_at.toISOString() : null,
    main_content_id: form.main_content_id.trim() || null,
    thumbnail_content_id: form.thumbnail_content_id.trim() || null,
    banner_content_id: form.banner_content_id.trim() || null,
  }
}

export default function QuestListPage() {
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('')
  const [active, setActive] = useState('')
  const [page, setPage] = useState(1)
  const size = 20

  const { data, isLoading } = useQuests({ q, period, active, page, size })
  const { data: meta } = useQuestMeta()
  const [editing, setEditing] = useState<QuestRow | 'new' | null>(null)
  const updateQuest = useUpdateQuest()
  const deleteQuest = useDeleteQuest()

  const toggleActive = (r: QuestRow) => {
    updateQuest.mutate(
      { id: r.id, body: toBody({ ...toForm(r), is_active: !r.is_active }) },
      { onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.') }
    )
  }

  const columns = [
    {
      title: '썸네일',
      key: 'thumb',
      width: 90,
      render: (_: unknown, r: QuestRow) =>
        r.thumbnail_image_url || r.main_image_url ? (
          <Image src={r.thumbnail_image_url ?? r.main_image_url ?? ''} width={70} height={46} style={{ objectFit: 'cover', borderRadius: 6 }} />
        ) : (
          '-'
        ),
    },
    { title: '제목', key: 'title', render: (_: unknown, r: QuestRow) => r.title_ko || '-' },
    { title: '기간', dataIndex: 'period', key: 'period', width: 90 },
    { title: '지역', key: 'district', width: 100, render: (_: unknown, r: QuestRow) => r.district_name ?? '-' },
    { title: '목표거리', key: 'distance', width: 90, render: (_: unknown, r: QuestRow) => `${r.target_distance_km} km` },
    { title: 'EXP', dataIndex: 'reward_exp', key: 'reward_exp', width: 70 },
    { title: 'Gold', dataIndex: 'reward_gold', key: 'reward_gold', width: 70 },
    { title: '아이템', key: 'reward_item', width: 100, render: (_: unknown, r: QuestRow) => r.reward_item ?? '-' },
    {
      title: '뱃지',
      key: 'badge',
      width: 90,
      render: (_: unknown, r: QuestRow) => (r.badge ? <Tag color="gold">{r.badge}</Tag> : '-'),
    },
    {
      title: '활성',
      key: 'is_active',
      width: 80,
      render: (_: unknown, r: QuestRow) => <Switch checked={r.is_active} loading={updateQuest.isPending} onChange={() => toggleActive(r)} />,
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_: unknown, r: QuestRow) => (
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
                title: `퀘스트 "${r.title_ko ?? r.id}"를 삭제하시겠습니까?`,
                onOk: () => deleteQuest.mutate(r.id, { onSuccess: () => message.success('삭제되었습니다.') }),
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
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="제목 검색"
          allowClear
          style={{ width: 220 }}
          onSearch={(v) => {
            setPage(1)
            setQ(v)
          }}
        />
        <Select
          placeholder="기간"
          allowClear
          style={{ width: 140 }}
          value={period || undefined}
          onChange={(v) => {
            setPage(1)
            setPeriod(v ?? '')
          }}
          options={(meta?.periods ?? []).map((p) => ({ value: p, label: p }))}
        />
        <Select
          placeholder="활성 상태"
          allowClear
          style={{ width: 140 }}
          value={active || undefined}
          onChange={(v) => {
            setPage(1)
            setActive(v ?? '')
          }}
          options={[
            { value: '1', label: '활성' },
            { value: '0', label: '비활성' },
          ]}
        />
        <Button type="primary" onClick={() => setEditing('new')}>
          + 신규 퀘스트
        </Button>
      </Space>
      <Table<QuestRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        locale={{ emptyText: '조건에 맞는 퀘스트가 없습니다.' }}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
      {editing && <QuestModal target={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function QuestModal({ target, onClose }: { target: QuestRow | 'new'; onClose: () => void }) {
  const isNew = target === 'new'
  const [form, setForm] = useState<FormState>(isNew ? EMPTY_FORM : toForm(target))
  const [lang, setLang] = useState('ko')
  const { data: meta } = useQuestMeta()
  const createQuest = useCreateQuest()
  const updateQuest = useUpdateQuest()

  useEffect(() => {
    setForm(isNew ? EMPTY_FORM : toForm(target))
  }, [target, isNew])

  const set = <K extends keyof FormState>(key: K) => (v: FormState[K]) => setForm((f) => ({ ...f, [key]: v }))

  const handleOk = () => {
    if (!form.title_ko.trim()) {
      message.warning('제목(한국어)은 필수입니다.')
      return
    }
    if (!form.target_distance_km.trim()) {
      message.warning('목표 거리는 필수입니다.')
      return
    }
    const body = toBody(form)
    const onSuccess = () => {
      message.success('저장되었습니다.')
      onClose()
    }
    const onError = (err: unknown) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.')
    if (isNew) createQuest.mutate(body, { onSuccess, onError })
    else updateQuest.mutate({ id: target.id, body }, { onSuccess, onError })
  }

  const titleContent = (langKey: 'ko' | 'vi' | 'en') => {
    const key = `title_${langKey}` as keyof FormState
    return (
      <Input
        placeholder={`제목 (${langKey.toUpperCase()})`}
        value={form[key] as string}
        onChange={(e) => set(key)(e.target.value as FormState[typeof key])}
      />
    )
  }

  const imageSlot = (label: string, key: 'main_content_id' | 'thumbnail_content_id' | 'banner_content_id', url: string | null | undefined) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
      {url ? (
        <Image src={url} width={70} height={46} style={{ objectFit: 'cover', borderRadius: 6 }} />
      ) : (
        <div style={{ width: 70, height: 46, borderRadius: 6, background: 'rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(0,0,0,.35)' }}>
          미설정
        </div>
      )}
      <Input placeholder={`${label} content_id (UUID, 선택)`} value={form[key]} onChange={(e) => set(key)(e.target.value)} style={{ flex: 1 }} />
    </div>
  )

  const previewUrl = (key: 'main_content_id' | 'thumbnail_content_id' | 'banner_content_id') => {
    if (!isNew && target[key] === form[key]) {
      const urlKey = key === 'main_content_id' ? 'main_image_url' : key === 'thumbnail_content_id' ? 'thumbnail_image_url' : 'banner_image_url'
      return target[urlKey]
    }
    return null
  }

  return (
    <Modal
      title={isNew ? '신규 퀘스트' : '퀘스트 수정'}
      open
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={createQuest.isPending || updateQuest.isPending}
      okText="저장"
      cancelText="취소"
      destroyOnClose
      width={680}
    >
      <Tabs
        activeKey={lang}
        onChange={setLang}
        items={[
          { key: 'ko', label: '한국어', children: titleContent('ko') },
          { key: 'vi', label: '베트남어', children: titleContent('vi') },
          { key: 'en', label: '영어', children: titleContent('en') },
        ]}
        style={{ marginBottom: 12 }}
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>기간</div>
          <Select style={{ width: '100%' }} value={form.period} onChange={set('period')} options={(meta?.periods ?? []).map((p) => ({ value: p, label: p }))} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>지역</div>
          <Select
            style={{ width: '100%' }}
            allowClear
            placeholder="지역 없음"
            value={form.district_id ?? undefined}
            onChange={(v) => set('district_id')(v ?? null)}
            options={(meta?.districts ?? []).map((d) => ({ value: d.id, label: d.name_ko }))}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>뱃지</div>
          <Select
            style={{ width: '100%' }}
            allowClear
            placeholder="없음"
            value={form.badge ?? undefined}
            onChange={(v) => set('badge')(v ?? null)}
            options={(meta?.badges ?? []).map((b) => ({ value: b, label: b }))}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>필요 레벨</div>
          <InputNumber style={{ width: '100%' }} min={1} value={form.required_level} onChange={(v) => set('required_level')(v ?? 1)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>목표 거리 (km)</div>
          <Input value={form.target_distance_km} onChange={(e) => set('target_distance_km')(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>보상 EXP</div>
          <InputNumber style={{ width: '100%' }} min={0} value={form.reward_exp} onChange={(v) => set('reward_exp')(v ?? 0)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>보상 Gold</div>
          <InputNumber style={{ width: '100%' }} min={0} value={form.reward_gold} onChange={(v) => set('reward_gold')(v ?? 0)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>보상 아이템</div>
          <Input value={form.reward_item} onChange={(e) => set('reward_item')(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>시작 일시</div>
          <DatePicker showTime style={{ width: '100%' }} value={form.starts_at} onChange={set('starts_at')} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.45)', marginBottom: 4 }}>종료 일시</div>
          <DatePicker showTime style={{ width: '100%' }} value={form.ends_at} onChange={set('ends_at')} />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Switch checked={form.is_active} onChange={set('is_active')} /> 활성 상태
      </label>

      <div style={{ borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: 12 }}>
        <div style={{ fontSize: 13, color: 'rgba(0,0,0,.65)', marginBottom: 8 }}>이미지 슬롯 (미설정 시 앱이 기본 카드아트로 대체)</div>
        {imageSlot('메인 (상세 화면)', 'main_content_id', previewUrl('main_content_id'))}
        {imageSlot('썸네일 (리스트 카드)', 'thumbnail_content_id', previewUrl('thumbnail_content_id'))}
        {imageSlot('배너 (홈/이벤트)', 'banner_content_id', previewUrl('banner_content_id'))}
      </div>
    </Modal>
  )
}
