import { useState } from 'react'
import { Alert, Input, message, Modal, Radio } from 'antd'
import { useModerateReview, type ReviewModerateBody } from '../api/reviews'

const ACTION_LABELS: Record<ReviewModerateBody['action'], string> = { HIDE: '숨김', RESTORE: '복원' }

/** 현재 상태에서 실제로 의미 있는 조치만 노출한다 (ModerateModal 과 동일 원리). */
function availableActions(hidden: boolean): ReviewModerateBody['action'][] {
  return hidden ? ['RESTORE'] : ['HIDE']
}

interface Props {
  open: boolean
  reviewId: string
  hidden: boolean
  reportId?: string
  onClose: () => void
}

/** 후기 모더레이션(숨김/복원) 모달. 신고 상세에서 열 때는 report_id 를 자동 연결한다.
 * 되돌리기 어려운 조치라 확인(Modal.onOk) 단계를 거치고, 사유는 작성자에게 그대로 통보되므로
 * 그 사실을 화면에 명시한다(대표 지적 2026-08-18). */
export default function ReviewModerateModal({ open, reviewId, hidden, reportId, onClose }: Props) {
  const actions = availableActions(hidden)
  const [action, setAction] = useState<ReviewModerateBody['action']>(actions[0])
  const [reason, setReason] = useState('')
  const mutation = useModerateReview(reviewId)

  const handleClose = () => {
    setReason('')
    onClose()
  }

  const handleOk = () => {
    if (!reason.trim()) {
      message.warning('사유를 입력하세요.')
      return
    }
    mutation.mutate(
      { action, reason: reason.trim(), report_id: reportId },
      {
        onSuccess: () => {
          message.success('후기가 처리되었습니다.')
          handleClose()
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      }
    )
  }

  return (
    <Modal
      title="후기 조치"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={mutation.isPending}
      okText="적용"
      cancelText="취소"
      okButtonProps={{ danger: action === 'HIDE' }}
      destroyOnClose
    >
      <Alert
        type="warning"
        showIcon
        message="사유는 후기 작성자에게 알림으로 그대로 전달됩니다."
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 16 }}>
        <Radio.Group value={action} onChange={(e) => setAction(e.target.value)}>
          {actions.map((a) => (
            <Radio key={a} value={a}>
              {ACTION_LABELS[a]}
            </Radio>
          ))}
        </Radio.Group>
      </div>
      <Input.TextArea rows={3} placeholder="사유 (필수, 작성자에게 전달됨)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  )
}
