import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Checkbox, Input, InputNumber, Select, Skeleton, Space, message } from 'antd'
import { usePoi, usePoiCategories, useCreatePoi, useUpdatePoi, type PoiWriteBody } from '../../api/map'

interface FormState {
  category: string
  name_ko: string
  name_vi: string
  name_en: string
  description: string
  address: string
  lat: string
  lng: string
  photo_content_id: string | null
  published: boolean
  sort_order: number
}

const EMPTY_FORM: FormState = {
  category: '',
  name_ko: '',
  name_vi: '',
  name_en: '',
  description: '',
  address: '',
  lat: '',
  lng: '',
  photo_content_id: null,
  published: true,
  sort_order: 0,
}

export default function PoiEditPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { data: poi, isLoading, isError, error } = usePoi(isNew ? '' : id!)
  const { data: categories } = usePoiCategories()
  const createPoi = useCreatePoi()
  const updatePoi = useUpdatePoi(isNew ? '' : id!)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    if (poi) {
      setForm({
        category: poi.category,
        name_ko: poi.name_ko,
        name_vi: poi.name_vi ?? '',
        name_en: poi.name_en ?? '',
        description: poi.description ?? '',
        address: poi.address ?? '',
        lat: String(poi.lat),
        lng: String(poi.lng),
        photo_content_id: poi.photo_content_id,
        published: poi.published,
        sort_order: poi.sort_order,
      })
    }
  }, [poi])

  const set =
    <K extends keyof FormState>(key: K) =>
    (v: FormState[K]) =>
      setForm((f) => ({ ...f, [key]: v }))

  if (!isNew && isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="POI 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (!isNew && (isLoading || !poi)) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  const handleSave = () => {
    if (!form.category) {
      message.warning('카테고리를 선택하세요.')
      return
    }
    if (!form.name_ko.trim()) {
      message.warning('한국어 명칭은 필수입니다.')
      return
    }
    const lat = Number(form.lat)
    const lng = Number(form.lng)
    if (form.lat.trim() === '' || form.lng.trim() === '' || Number.isNaN(lat) || Number.isNaN(lng)) {
      message.warning('좌표(위도/경도)를 숫자로 올바르게 입력하세요.')
      return
    }

    const body: PoiWriteBody = {
      category: form.category,
      name_ko: form.name_ko.trim(),
      name_vi: form.name_vi.trim() || null,
      name_en: form.name_en.trim() || null,
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      lat,
      lng,
      photo_content_id: form.photo_content_id,
      published: form.published,
      sort_order: form.sort_order,
    }
    const mutation = isNew ? createPoi : updatePoi
    mutation.mutate(body, {
      onSuccess: () => {
        message.success('저장되었습니다.')
        navigate('/map/poi')
      },
      onError: (err) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.'),
    })
  }

  return (
    <Card title={isNew ? 'POI 신규 등록' : 'POI 수정'}>
      <Space direction="vertical" size={12} style={{ display: 'flex', maxWidth: 480 }}>
        <Select
          placeholder="카테고리 선택 (필수)"
          value={form.category || undefined}
          options={(categories ?? []).map((c) => ({ value: c.code, label: c.label_ko }))}
          onChange={set('category')}
        />
        <Input placeholder="명칭 (한국어, 필수)" value={form.name_ko} onChange={(e) => set('name_ko')(e.target.value)} />
        <Input placeholder="명칭 (베트남어)" value={form.name_vi} onChange={(e) => set('name_vi')(e.target.value)} />
        <Input placeholder="명칭 (영어)" value={form.name_en} onChange={(e) => set('name_en')(e.target.value)} />
        <Input placeholder="주소" value={form.address} onChange={(e) => set('address')(e.target.value)} />
        <Input.TextArea rows={3} placeholder="설명" value={form.description} onChange={(e) => set('description')(e.target.value)} />
        <Space>
          <Input placeholder="위도 (lat, 필수)" value={form.lat} onChange={(e) => set('lat')(e.target.value)} style={{ width: 180 }} />
          <Input placeholder="경도 (lng, 필수)" value={form.lng} onChange={(e) => set('lng')(e.target.value)} style={{ width: 180 }} />
        </Space>
        <InputNumber
          placeholder="정렬순서"
          value={form.sort_order}
          onChange={(v) => set('sort_order')(v ?? 0)}
          style={{ width: 180 }}
        />
        <Checkbox checked={form.published} onChange={(e) => set('published')(e.target.checked)}>
          게시함
        </Checkbox>
      </Space>
      <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
        <Button type="primary" loading={createPoi.isPending || updatePoi.isPending} onClick={handleSave}>
          저장
        </Button>
        <Button onClick={() => navigate('/map/poi')}>취소</Button>
      </div>
    </Card>
  )
}
