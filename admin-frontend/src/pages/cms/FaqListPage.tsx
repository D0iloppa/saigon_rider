import { useEffect, useState } from 'react'
import { Button, Checkbox, Input, InputNumber, Modal, Select, Switch, Table, Tabs, message } from 'antd'
import {
  FAQ_CATEGORIES,
  useCreateFaq,
  useDeleteFaq,
  useFaqs,
  useUpdateFaq,
  type FaqCategory,
  type FaqRow,
} from '../../api/cms'

const CATEGORY_LABEL: Record<FaqCategory, string> = {
  GENERAL: '일반',
  ACCOUNT: '계정',
  MARKET: '마켓',
  RIDE: '라이딩',
  REWARD: '리워드',
}

const CATEGORY_OPTIONS = [{ value: '', label: '전체' }, ...FAQ_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]

interface FormState {
  category: FaqCategory
  question_vi: string
  question_ko: string
  question_en: string
  answer_vi: string
  answer_ko: string
  answer_en: string
  sort_order: number
  is_published: boolean
}

const EMPTY_FORM: FormState = {
  category: 'GENERAL',
  question_vi: '',
  question_ko: '',
  question_en: '',
  answer_vi: '',
  answer_ko: '',
  answer_en: '',
  sort_order: 0,
  is_published: false,
}

function toForm(faq: FaqRow): FormState {
  return {
    category: faq.category,
    question_vi: faq.question_vi,
    question_ko: faq.question_ko ?? '',
    question_en: faq.question_en ?? '',
    answer_vi: faq.answer_vi,
    answer_ko: faq.answer_ko ?? '',
    answer_en: faq.answer_en ?? '',
    sort_order: faq.sort_order,
    is_published: faq.is_published,
  }
}

export default function FaqListPage() {
  const [category, setCategory] = useState('')
  const { data, isLoading } = useFaqs(category || undefined)
  const [editing, setEditing] = useState<FaqRow | 'new' | null>(null)

  const deleteFaq = useDeleteFaq()
  const updateFaq = useUpdateFaq()

  const columns = [
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 90, render: (v: FaqCategory) => CATEGORY_LABEL[v] ?? v },
    { title: '질문', dataIndex: 'question_vi', key: 'question_vi' },
    { title: '정렬', dataIndex: 'sort_order', key: 'sort_order', width: 70 },
    {
      title: '게시',
      key: 'is_published',
      width: 80,
      render: (_: unknown, r: FaqRow) => (
        <Switch
          checked={r.is_published}
          loading={updateFaq.isPending}
          onChange={(v) =>
            updateFaq.mutate(
              { id: r.id, body: { is_published: v } },
              { onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.') }
            )
          }
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_: unknown, r: FaqRow) => (
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
                title: 'FAQ를 삭제할까요?',
                onOk: () => deleteFaq.mutate(r.id, { onSuccess: () => message.success('삭제되었습니다.') }),
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Select style={{ width: 140 }} value={category} options={CATEGORY_OPTIONS} onChange={setCategory} />
        <Button type="primary" onClick={() => setEditing('new')}>
          신규 FAQ
        </Button>
      </div>
      <Table<FaqRow> rowKey="id" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} />
      {editing && <FaqModal target={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function FaqModal({ target, onClose }: { target: FaqRow | 'new'; onClose: () => void }) {
  const isNew = target === 'new'
  const [form, setForm] = useState<FormState>(isNew ? EMPTY_FORM : toForm(target))
  const [lang, setLang] = useState('vi')
  const createFaq = useCreateFaq()
  const updateFaq = useUpdateFaq()

  useEffect(() => {
    setForm(isNew ? EMPTY_FORM : toForm(target))
  }, [target, isNew])

  const set = (key: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

  const handleOk = () => {
    if (!form.question_vi.trim() || !form.answer_vi.trim()) {
      message.warning('베트남어 질문/답변은 필수입니다.')
      return
    }
    const body = {
      category: form.category,
      question_vi: form.question_vi.trim(),
      question_ko: form.question_ko.trim() || null,
      question_en: form.question_en.trim() || null,
      answer_vi: form.answer_vi.trim(),
      answer_ko: form.answer_ko.trim() || null,
      answer_en: form.answer_en.trim() || null,
      sort_order: form.sort_order,
      is_published: form.is_published,
    }
    const onSuccess = () => {
      message.success('저장되었습니다.')
      onClose()
    }
    const onError = (err: unknown) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.')
    if (isNew) createFaq.mutate(body, { onSuccess, onError })
    else updateFaq.mutate({ id: target.id, body }, { onSuccess, onError })
  }

  const content = (langKey: 'vi' | 'ko' | 'en') => {
    const qKey = `question_${langKey}` as keyof FormState
    const aKey = `answer_${langKey}` as keyof FormState
    return (
      <>
        <Input placeholder="질문" value={form[qKey] as string} onChange={(e) => set(qKey)(e.target.value)} style={{ marginBottom: 12 }} />
        <Input.TextArea rows={6} placeholder="답변" value={form[aKey] as string} onChange={(e) => set(aKey)(e.target.value)} />
      </>
    )
  }

  return (
    <Modal
      title={isNew ? '신규 FAQ' : 'FAQ 수정'}
      open
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={createFaq.isPending || updateFaq.isPending}
      okText="저장"
      cancelText="취소"
      destroyOnClose
      width={600}
    >
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <Select
          style={{ width: 140 }}
          value={form.category}
          options={FAQ_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
          onChange={(v) => setForm((f) => ({ ...f, category: v }))}
        />
        <InputNumber
          value={form.sort_order}
          onChange={(v) => setForm((f) => ({ ...f, sort_order: v ?? 0 }))}
          addonBefore="정렬순서"
        />
        <Checkbox checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}>
          게시
        </Checkbox>
      </div>
      <Tabs
        activeKey={lang}
        onChange={setLang}
        items={[
          { key: 'vi', label: '베트남어 (필수)', children: content('vi') },
          { key: 'ko', label: '한국어', children: content('ko') },
          { key: 'en', label: '영어', children: content('en') },
        ]}
      />
    </Modal>
  )
}
