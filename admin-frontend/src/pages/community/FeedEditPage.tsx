import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Checkbox, Input, Select, Skeleton, Space, Upload, message } from 'antd'
import { useCreateFeedPost, useFeedPost, useUpdateFeedPost, type FeedWriteBody } from '../../api/feed'
import { useGroupList } from '../../api/communityGroups'
import { useUploadImage } from '../../api/contents'

interface ImageItem {
  id: string
  url: string
}

interface FormState {
  content: string
  is_story: boolean
  group_id: string | null
  images: ImageItem[]
}

const EMPTY_FORM: FormState = { content: '', is_story: false, group_id: null, images: [] }

export default function FeedEditPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { data: post, isLoading, isError, error } = useFeedPost(isNew ? '' : id!)
  const createPost = useCreateFeedPost()
  const updatePost = useUpdateFeedPost(isNew ? '' : id!)
  const { data: groups } = useGroupList({ size: 100 })
  const upload = useUploadImage()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    if (post) {
      setForm({
        content: post.content ?? '',
        is_story: post.is_story,
        group_id: post.group_id,
        images: post.image_content_ids.map((cid, i) => ({ id: cid, url: post.image_urls[i] ?? '' })),
      })
    }
  }, [post])

  const set =
    <K extends keyof FormState>(key: K) =>
    (v: FormState[K]) =>
      setForm((f) => ({ ...f, [key]: v }))

  if (!isNew && isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="피드 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (!isNew && (isLoading || !post)) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  const handleSave = () => {
    const content = form.content.trim() || null
    if (!content && form.images.length === 0) {
      message.warning('내용 또는 이미지 중 하나는 반드시 입력해야 합니다.')
      return
    }

    const body: FeedWriteBody = {
      content,
      is_story: form.is_story,
      image_content_ids: form.images.map((img) => img.id),
      group_id: form.group_id,
    }
    const mutation = isNew ? createPost : updatePost
    mutation.mutate(body, {
      onSuccess: (saved) => {
        message.success('저장되었습니다.')
        navigate(`/community/feed/${saved.id}`)
      },
      onError: (err) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.'),
    })
  }

  const groupOptions = [
    { value: '', label: '그룹 없음 (전체 피드)' },
    ...(groups?.items ?? []).map((g) => ({
      value: g.id,
      label: g.status === 'ACTIVE' ? g.name : `${g.name} (정지)`,
    })),
  ]

  return (
    <Card title={isNew ? '새 글 작성 (SaigonRider 공식계정)' : '글 수정'}>
      <Space direction="vertical" size={12} style={{ display: 'flex', maxWidth: 560 }}>
        <Select
          value={form.group_id ?? ''}
          options={groupOptions}
          onChange={(v) => set('group_id')(v || null)}
        />
        <Input.TextArea rows={6} placeholder="내용" value={form.content} onChange={(e) => set('content')(e.target.value)} />
        <Space wrap size={8}>
          {form.images.map((img, i) => (
            <div key={img.id} style={{ position: 'relative' }}>
              <img src={img.url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 4 }} />
              {i === 0 && (
                <span style={{ position: 'absolute', left: 4, top: 4, background: '#0008', color: '#fff', fontSize: 11, padding: '0 4px', borderRadius: 2 }}>
                  대표
                </span>
              )}
              <Button
                size="small"
                danger
                style={{ position: 'absolute', right: 2, top: 2 }}
                onClick={() => set('images')(form.images.filter((x) => x.id !== img.id))}
              >
                삭제
              </Button>
            </div>
          ))}
          <Upload
            showUploadList={false}
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp"
            customRequest={(options) =>
              upload.mutate(options.file as File, {
                onSuccess: (res) => {
                  setForm((f) => ({ ...f, images: [...f.images, { id: res.id, url: res.imgproxy_url }] }))
                  options.onSuccess?.(res)
                },
                onError: (err) => {
                  message.error(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.')
                  options.onError?.(err as Error)
                },
              })
            }
          >
            <Button loading={upload.isPending}>이미지 추가</Button>
          </Upload>
        </Space>
        <Checkbox checked={form.is_story} onChange={(e) => set('is_story')(e.target.checked)}>
          스토리로 게시
        </Checkbox>
      </Space>
      <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
        <Button type="primary" loading={createPost.isPending || updatePost.isPending} onClick={handleSave}>
          저장
        </Button>
        <Button onClick={() => navigate(isNew ? '/community/feed' : `/community/feed/${id}`)}>취소</Button>
      </div>
    </Card>
  )
}
