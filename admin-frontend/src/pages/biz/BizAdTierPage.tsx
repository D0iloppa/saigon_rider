import { useState } from 'react'
import { Alert, Button, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag, message } from 'antd'
import {
  useBizAdTiers,
  useCreateBizAdTier,
  useUpdateBizAdTier,
  type BizAdTier,
  type BizAdTierInput,
} from '../../api/biz'

const EMPTY_TIER: BizAdTierInput = {
  name: '',
  monthly_price_vnd: 0,
  exposure_weight: 1,
  is_active: true,
  display_order: 0,
}

export default function BizAdTierPage() {
  const [editing, setEditing] = useState<BizAdTier | null | 'new'>(null)
  const [form] = Form.useForm<BizAdTierInput>()
  const { data, isLoading, isError, error } = useBizAdTiers()
  const createMutation = useCreateBizAdTier()
  const updateMutation = useUpdateBizAdTier()

  const openCreate = () => {
    form.setFieldsValue(EMPTY_TIER)
    setEditing('new')
  }

  const openEdit = (tier: BizAdTier) => {
    form.setFieldsValue(tier)
    setEditing(tier)
  }

  const closeModal = () => {
    setEditing(null)
    form.resetFields()
  }

  const save = async () => {
    const input = await form.validateFields()
    const mutation = editing === 'new' ? createMutation : updateMutation
    const payload = editing === 'new' ? input : { ...input, id: editing!.id }
    mutation.mutate(payload as BizAdTier, {
      onSuccess: () => {
        message.success(editing === 'new' ? '광고 티어가 추가되었습니다.' : '광고 티어가 저장되었습니다.')
        closeModal()
      },
      onError: (err) => message.error(err instanceof Error ? err.message : '저장하지 못했습니다.'),
    })
  }

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="광고 티어 정책을 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    { title: '표시 순서', dataIndex: 'display_order', key: 'display_order', width: 100 },
    { title: '티어명', dataIndex: 'name', key: 'name' },
    {
      title: '월 가격 (VND)',
      dataIndex: 'monthly_price_vnd',
      key: 'monthly_price_vnd',
      align: 'right' as const,
      render: (value: number) => value.toLocaleString('en-US'),
    },
    {
      title: '노출 가중치',
      dataIndex: 'exposure_weight',
      key: 'exposure_weight',
      align: 'right' as const,
    },
    {
      title: '상태',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => <Tag color={active ? 'green' : 'default'}>{active ? '활성' : '비활성'}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, tier: BizAdTier) => <a onClick={() => openEdit(tier)}>수정</a>,
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={openCreate}>티어 추가</Button>
        <span style={{ color: '#64748b' }}>가중치 변경은 게시 중인 광고에도 즉시 적용됩니다.</span>
      </Space>
      <Table<BizAdTier>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        locale={{ emptyText: '등록된 광고 티어가 없습니다.' }}
        pagination={false}
      />
      <Modal
        title={editing === 'new' ? '광고 티어 추가' : '광고 티어 수정'}
        open={editing !== null}
        onOk={save}
        onCancel={closeModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText="저장"
        cancelText="취소"
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={EMPTY_TIER} style={{ marginTop: 20 }}>
          <Form.Item name="name" label="티어명" rules={[{ required: true, message: '티어명을 입력하세요.' }]}>
            <Input maxLength={80} placeholder="예: Gold" />
          </Form.Item>
          <Form.Item
            name="monthly_price_vnd"
            label="월 가격 (VND)"
            rules={[{ required: true, message: '월 가격을 입력하세요.' }]}
          >
            <InputNumber min={0} step={10000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="exposure_weight"
            label="노출 가중치"
            extra="값이 클수록 광고가 더 자주 노출됩니다."
            rules={[{ required: true, message: '노출 가중치를 입력하세요.' }]}
          >
            <InputNumber min={1} step={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="display_order"
            label="표시 순서"
            rules={[{ required: true, message: '표시 순서를 입력하세요.' }]}
          >
            <InputNumber min={0} step={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_active" label="신규 신청에 노출" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
