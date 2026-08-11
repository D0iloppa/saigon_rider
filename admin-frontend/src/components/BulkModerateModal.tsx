import { useState } from 'react'
import { Input, message, Modal } from 'antd'
import { useBulkModerateListings, type BulkModerateBody } from '../api/listings'

const ACTION_LABELS: Record<BulkModerateBody['action'], string> = { HIDE: '숨김', REMOVE: '반려(삭제)', RESTORE: '승인(복원)' }

interface Props {
  open: boolean
  listingIds: string[]
  action: BulkModerateBody['action']
  onClose: () => void
}

/** 검수 큐 일괄 승인/반려 모달. ModerateModal(단건)과 같은 API 를 listing_ids 배열로 호출한다. */
export default function BulkModerateModal({ open, listingIds, action, onClose }: Props) {
  const [reason, setReason] = useState('')
  const mutation = useBulkModerateListings()

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
      { listing_ids: listingIds, action, reason: reason.trim() },
      {
        onSuccess: (result) => {
          message.success(`${result.updated.length}건 처리되었습니다.`)
          handleClose()
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      }
    )
  }

  return (
    <Modal
      title={`선택 ${listingIds.length}건 ${ACTION_LABELS[action]}`}
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={mutation.isPending}
      okText="적용"
      cancelText="취소"
      destroyOnClose
    >
      <Input.TextArea rows={3} placeholder="사유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  )
}
