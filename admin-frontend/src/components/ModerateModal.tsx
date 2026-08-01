import { useState } from 'react'
import { Input, message, Modal, Radio } from 'antd'
import { useModerateListing, type ModerateBody } from '../api/listings'

const ACTION_LABELS: Record<ModerateBody['action'], string> = { HIDE: '숨김', REMOVE: '삭제', RESTORE: '복원' }

/** 현재 상태에서 실제로 의미 있는 조치만 노출한다 (숨김 상태를 다시 숨길 수는 없음 등). */
function availableActions(status: string): ModerateBody['action'][] {
  if (status === 'REMOVED') return ['RESTORE']
  if (status === 'HIDDEN') return ['RESTORE', 'REMOVE']
  return ['HIDE', 'REMOVE']
}

interface Props {
  open: boolean
  listingId: string
  currentStatus: string
  reportId?: string
  onClose: () => void
}

/** 매물 모더레이션(숨김/삭제/복원) 모달. 신고 상세에서 열 때는 report_id 를 자동 연결한다. */
export default function ModerateModal({ open, listingId, currentStatus, reportId, onClose }: Props) {
  const actions = availableActions(currentStatus)
  const [action, setAction] = useState<ModerateBody['action']>(actions[0])
  const [reason, setReason] = useState('')
  const mutation = useModerateListing()

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
      { listingId, body: { action, reason: reason.trim(), report_id: reportId } },
      {
        onSuccess: () => {
          message.success('매물이 처리되었습니다.')
          handleClose()
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      }
    )
  }

  return (
    <Modal
      title="매물 조치"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={mutation.isPending}
      okText="적용"
      cancelText="취소"
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <Radio.Group value={action} onChange={(e) => setAction(e.target.value)}>
          {actions.map((a) => (
            <Radio key={a} value={a}>
              {ACTION_LABELS[a]}
            </Radio>
          ))}
        </Radio.Group>
      </div>
      <Input.TextArea rows={3} placeholder="사유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  )
}
