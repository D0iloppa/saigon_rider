import { useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Upload, message } from 'antd'
import dayjs from 'dayjs'
import {
  useCreateGroup,
  useGroupList,
  useGroupTopics,
  useUpdateGroup,
  type AdminGroupRow,
  type GroupCreateBody,
} from '../../api/communityGroups'
import { useUploadImage } from '../../api/contents'

const JOIN_POLICY_OPTIONS = [
  { value: 'open', label: '자유가입' },
  { value: 'approval', label: '승인제' },
  { value: 'invite', label: '초대전용' },
]
const VISIBILITY_OPTIONS = [
  { value: 'public', label: '공개' },
  { value: 'private', label: '비공개' },
]
const JOIN_POLICY_LABEL: Record<string, string> = Object.fromEntries(JOIN_POLICY_OPTIONS.map((o) => [o.value, o.label]))
const VISIBILITY_LABEL: Record<string, string> = Object.fromEntries(VISIBILITY_OPTIONS.map((o) => [o.value, o.label]))

export default function OfficialGroupPage() {
  const [page, setPage] = useState(1)
  const size = 20
  const { data, isLoading } = useGroupList({ page, size })
  const { data: topics } = useGroupTopics()
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const upload = useUploadImage()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AdminGroupRow | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [form] = Form.useForm<GroupCreateBody>()

  const openCreate = () => {
    setEditing(null)
    setCoverUrl(null)
    form.resetFields()
    form.setFieldsValue({ join_policy: 'open', visibility: 'public', cover_content_id: null })
    setOpen(true)
  }

  const openEdit = (g: AdminGroupRow) => {
    setEditing(g)
    setCoverUrl(g.cover_url)
    form.setFieldsValue({
      name: g.name,
      description: g.description,
      topic: g.topic,
      join_policy: g.join_policy,
      visibility: g.visibility,
      cover_content_id: g.cover_content_id,
    })
    setOpen(true)
  }

  const submit = async () => {
    const values = await form.validateFields()
    const onError = (err: unknown) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.')
    const onSuccess = () => {
      message.success('저장되었습니다.')
      setOpen(false)
    }
    if (editing) {
      updateGroup.mutate({ id: editing.id, body: values }, { onSuccess, onError })
    } else {
      createGroup.mutate(values, { onSuccess, onError })
    }
  }

  const toggleStatus = (g: AdminGroupRow) =>
    updateGroup.mutate(
      { id: g.id, body: { status: g.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' } },
      {
        onSuccess: () => message.success(g.status === 'ACTIVE' ? '정지되었습니다.' : '정지가 해제되었습니다.'),
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      },
    )

  const columns = [
    {
      title: '커버',
      dataIndex: 'cover_url',
      key: 'cover_url',
      width: 64,
      render: (v: string | null) =>
        v ? <img src={v} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : '-',
    },
    { title: '그룹명', dataIndex: 'name', key: 'name' },
    {
      title: '주제',
      dataIndex: 'topic_label_ko',
      key: 'topic',
      render: (v: string | null, r: AdminGroupRow) => v ?? r.topic,
    },
    { title: '가입방식', dataIndex: 'join_policy', key: 'join_policy', render: (v: string) => JOIN_POLICY_LABEL[v] ?? v },
    { title: '공개', dataIndex: 'visibility', key: 'visibility', render: (v: string) => VISIBILITY_LABEL[v] ?? v },
    { title: '멤버', dataIndex: 'member_count', key: 'member_count', width: 70 },
    { title: '글', dataIndex: 'post_count', key: 'post_count', width: 60 },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) =>
        v === 'ACTIVE' ? <Tag color="green">활성</Tag> : <Tag color="red">{v === 'SUSPENDED' ? '정지' : v}</Tag>,
    },
    {
      title: '개설일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, g: AdminGroupRow) => (
        <Space>
          <Button size="small" onClick={() => openEdit(g)}>
            수정
          </Button>
          {g.status !== 'ARCHIVED' && (
            <Popconfirm
              title={g.status === 'ACTIVE' ? '이 그룹을 정지하시겠습니까?' : '정지를 해제하시겠습니까?'}
              okText="확인"
              cancelText="취소"
              onConfirm={() => toggleStatus(g)}
            >
              <Button size="small" danger={g.status === 'ACTIVE'}>
                {g.status === 'ACTIVE' ? '정지' : '정지 해제'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>
          공식 그룹 만들기
        </Button>
      </Space>
      <Table<AdminGroupRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        locale={{ emptyText: '공식 그룹이 없습니다' }}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
      <Modal
        title={editing ? '공식 그룹 수정' : '공식 그룹 만들기'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="저장"
        cancelText="취소"
        confirmLoading={createGroup.isPending || updateGroup.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="그룹명" rules={[{ required: true, message: '그룹명을 입력하세요.' }]}>
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="topic" label="주제" rules={[{ required: true, message: '주제를 선택하세요.' }]}>
            <Select options={(topics ?? []).map((t) => ({ value: t.code, label: t.label_ko }))} />
          </Form.Item>
          <Form.Item name="join_policy" label="가입방식">
            <Select options={JOIN_POLICY_OPTIONS} />
          </Form.Item>
          <Form.Item name="visibility" label="공개 범위">
            <Select options={VISIBILITY_OPTIONS} />
          </Form.Item>
          <Form.Item name="cover_content_id" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="커버 이미지">
            <Space direction="vertical">
              {coverUrl && (
                <img src={coverUrl} alt="" style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 4 }} />
              )}
              <Space>
                <Upload
                  showUploadList={false}
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  customRequest={(options) =>
                    upload.mutate(options.file as File, {
                      onSuccess: (res) => {
                        form.setFieldValue('cover_content_id', res.id)
                        setCoverUrl(res.imgproxy_url)
                        options.onSuccess?.(res)
                      },
                      onError: (err) => {
                        message.error(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.')
                        options.onError?.(err as Error)
                      },
                    })
                  }
                >
                  <Button loading={upload.isPending}>{coverUrl ? '이미지 변경' : '이미지 업로드'}</Button>
                </Upload>
                {coverUrl && (
                  <Button
                    onClick={() => {
                      form.setFieldValue('cover_content_id', null)
                      setCoverUrl(null)
                    }}
                  >
                    제거
                  </Button>
                )}
              </Space>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
