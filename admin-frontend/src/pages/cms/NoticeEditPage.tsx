import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Checkbox, Input, Tabs, message } from 'antd'
import { useCreateNotice, useNotice, useUpdateNotice } from '../../api/cms'

const LANG_TABS = [
  { key: 'vi', label: '베트남어 (필수)' },
  { key: 'ko', label: '한국어' },
  { key: 'en', label: '영어' },
]

interface FormState {
  title_vi: string
  title_ko: string
  title_en: string
  body_vi: string
  body_ko: string
  body_en: string
  is_pinned: boolean
}

const EMPTY_FORM: FormState = { title_vi: '', title_ko: '', title_en: '', body_vi: '', body_ko: '', body_en: '', is_pinned: false }

export default function NoticeEditPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { data: notice } = useNotice(id ?? '')
  const createNotice = useCreateNotice()
  const updateNotice = useUpdateNotice(id ?? '')

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [lang, setLang] = useState('vi')

  useEffect(() => {
    if (notice) {
      setForm({
        title_vi: notice.title_vi,
        title_ko: notice.title_ko ?? '',
        title_en: notice.title_en ?? '',
        body_vi: notice.body_vi,
        body_ko: notice.body_ko ?? '',
        body_en: notice.body_en ?? '',
        is_pinned: notice.is_pinned,
      })
    }
  }, [notice])

  const set = (key: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

  const handleSave = () => {
    if (!form.title_vi.trim() || !form.body_vi.trim()) {
      message.warning('베트남어 제목/본문은 필수입니다.')
      return
    }
    const body = {
      title_vi: form.title_vi.trim(),
      title_ko: form.title_ko.trim() || null,
      title_en: form.title_en.trim() || null,
      body_vi: form.body_vi.trim(),
      body_ko: form.body_ko.trim() || null,
      body_en: form.body_en.trim() || null,
      is_pinned: form.is_pinned,
    }
    const mutation = isNew ? createNotice : updateNotice
    mutation.mutate(body, {
      onSuccess: () => {
        message.success('저장되었습니다.')
        navigate('/cms/notices')
      },
      onError: (err) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.'),
    })
  }

  const content = (langKey: string) => {
    if (langKey === 'vi') {
      return (
        <>
          <Input placeholder="제목 (베트남어)" value={form.title_vi} onChange={(e) => set('title_vi')(e.target.value)} style={{ marginBottom: 12 }} />
          <Input.TextArea rows={10} placeholder="본문 (베트남어)" value={form.body_vi} onChange={(e) => set('body_vi')(e.target.value)} />
        </>
      )
    }
    if (langKey === 'ko') {
      return (
        <>
          <Input placeholder="제목 (한국어)" value={form.title_ko} onChange={(e) => set('title_ko')(e.target.value)} style={{ marginBottom: 12 }} />
          <Input.TextArea rows={10} placeholder="본문 (한국어)" value={form.body_ko} onChange={(e) => set('body_ko')(e.target.value)} />
        </>
      )
    }
    return (
      <>
        <Input placeholder="제목 (영어)" value={form.title_en} onChange={(e) => set('title_en')(e.target.value)} style={{ marginBottom: 12 }} />
        <Input.TextArea rows={10} placeholder="본문 (영어)" value={form.body_en} onChange={(e) => set('body_en')(e.target.value)} />
      </>
    )
  }

  return (
    <Card title={isNew ? '신규 공지' : '공지 수정'}>
      <Tabs activeKey={lang} onChange={setLang} items={LANG_TABS.map((t) => ({ key: t.key, label: t.label, children: content(t.key) }))} />
      <Checkbox checked={form.is_pinned} onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))} style={{ marginTop: 16 }}>
        상단 고정
      </Checkbox>
      <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
        <Button type="primary" loading={createNotice.isPending || updateNotice.isPending} onClick={handleSave}>
          저장
        </Button>
        <Button onClick={() => navigate('/cms/notices')}>취소</Button>
      </div>
    </Card>
  )
}
