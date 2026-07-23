import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Checkbox, Input, Skeleton, Space, message } from 'antd'
import { useCreateFeedPost, useFeedPost, useUpdateFeedPost, type FeedWriteBody } from '../../api/feed'

interface FormState {
  content: string
  is_story: boolean
  image_content_ids: string
}

const EMPTY_FORM: FormState = { content: '', is_story: false, image_content_ids: '' }

export default function FeedEditPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const { data: post, isLoading, isError, error } = useFeedPost(isNew ? '' : id!)
  const createPost = useCreateFeedPost()
  const updatePost = useUpdateFeedPost(isNew ? '' : id!)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    if (post) {
      setForm({
        content: post.content ?? '',
        is_story: post.is_story,
        image_content_ids: post.image_content_ids.join('\n'),
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
    const imageContentIds = form.image_content_ids
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean)
    const content = form.content.trim() || null
    if (!content && imageContentIds.length === 0) {
      message.warning('내용 또는 이미지 중 하나는 반드시 입력해야 합니다.')
      return
    }

    const body: FeedWriteBody = {
      content,
      is_story: form.is_story,
      image_content_ids: imageContentIds,
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

  return (
    <Card title={isNew ? '새 피드 작성 (SaigonRider 공식계정)' : '피드 수정'}>
      <Space direction="vertical" size={12} style={{ display: 'flex', maxWidth: 560 }}>
        <Input.TextArea rows={6} placeholder="내용" value={form.content} onChange={(e) => set('content')(e.target.value)} />
        <Input.TextArea
          rows={3}
          placeholder="이미지 content_id (UUID, 줄바꿈으로 여러 장 — 첫 줄이 대표 이미지)"
          value={form.image_content_ids}
          onChange={(e) => set('image_content_ids')(e.target.value)}
        />
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
