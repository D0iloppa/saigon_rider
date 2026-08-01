import { Form, Input, InputNumber, message, Modal, Radio } from 'antd'
import { useCreateSanction } from '../api/users'

interface Props {
  open: boolean
  userId: string
  reportId?: string
  onClose: () => void
}

interface FormValues {
  type: 'WARN' | 'SUSPEND' | 'BAN'
  days?: number
  reason: string
}

/** 유저 제재(경고/정지/영구정지) 등록 모달. 신고 상세에서 열 때는 report_id 를 자동 연결한다. */
export default function SanctionModal({ open, userId, reportId, onClose }: Props) {
  const [form] = Form.useForm<FormValues>()
  const mutation = useCreateSanction()
  const type = Form.useWatch('type', form)

  const handleClose = () => {
    form.resetFields()
    onClose()
  }

  const handleOk = () => {
    form.validateFields().then((values) => {
      mutation.mutate(
        {
          userId,
          body: {
            type: values.type,
            reason: values.reason.trim(),
            days: values.type === 'SUSPEND' ? values.days : undefined,
            report_id: reportId,
          },
        },
        {
          onSuccess: () => {
            message.success('제재가 적용되었습니다.')
            handleClose()
          },
          onError: (err) => message.error(err instanceof Error ? err.message : '제재 적용에 실패했습니다.'),
        }
      )
    })
  }

  return (
    <Modal
      title="유저 제재"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={mutation.isPending}
      okText="적용"
      cancelText="취소"
      destroyOnClose
    >
      <Form<FormValues> form={form} layout="vertical" initialValues={{ type: 'WARN' }}>
        <Form.Item name="type" label="제재 유형" rules={[{ required: true }]}>
          <Radio.Group>
            <Radio value="WARN">경고</Radio>
            <Radio value="SUSPEND">정지</Radio>
            <Radio value="BAN">영구정지</Radio>
          </Radio.Group>
        </Form.Item>
        {type === 'SUSPEND' && (
          <Form.Item name="days" label="정지 기간(일)" rules={[{ required: true, message: '정지 기간을 입력하세요' }]}>
            <InputNumber min={1} max={365} style={{ width: '100%' }} />
          </Form.Item>
        )}
        <Form.Item name="reason" label="사유" rules={[{ required: true, message: '사유를 입력하세요' }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
