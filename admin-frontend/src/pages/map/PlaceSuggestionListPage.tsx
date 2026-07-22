import { useState } from 'react'
import { Alert, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { usePlaceSuggestions, useConfirmPlaceSuggestion, useRejectPlaceSuggestion, type PlaceSuggestionRow } from '../../api/map'

const STATUS_OPTIONS = [
  { value: 'PENDING', label: '대기' },
  { value: '', label: '전체' },
  { value: 'CONFIRMED', label: '승인됨' },
  { value: 'REJECTED', label: '반려됨' },
]

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '대기' },
  CONFIRMED: { color: 'green', label: '승인됨' },
  REJECTED: { color: 'red', label: '반려됨' },
}

export default function PlaceSuggestionListPage() {
  const [status, setStatus] = useState('PENDING')
  const [rejectTarget, setRejectTarget] = useState<PlaceSuggestionRow | null>(null)
  const [reviewNote, setReviewNote] = useState('')

  const { data, isLoading, isError, error } = usePlaceSuggestions(status || undefined)
  const confirmMutation = useConfirmPlaceSuggestion()
  const rejectMutation = useRejectPlaceSuggestion()

  const closeRejectModal = () => {
    setRejectTarget(null)
    setReviewNote('')
  }

  const submitReject = () => {
    if (!rejectTarget) return
    if (!reviewNote.trim()) {
      message.warning('반려 사유를 입력하세요.')
      return
    }
    rejectMutation.mutate(
      { id: rejectTarget.id, review_note: reviewNote.trim() },
      {
        onSuccess: () => {
          message.success('반려 처리되었습니다.')
          closeRejectModal()
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      }
    )
  }

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="장소 제보 목록을 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    { title: '명칭', dataIndex: 'name', key: 'name' },
    { title: '카테고리', dataIndex: 'category', key: 'category', render: (v: string | null) => v ?? '-' },
    { title: '주소', dataIndex: 'address', key: 'address', render: (v: string | null) => v ?? '-' },
    {
      title: '좌표',
      key: 'coords',
      render: (_: unknown, r: PlaceSuggestionRow) => `${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}`,
    },
    { title: '메모', dataIndex: 'note', key: 'note', render: (v: string | null) => v ?? '-' },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={STATUS_TAG[v]?.color ?? 'default'}>{STATUS_TAG[v]?.label ?? v}</Tag>,
    },
    {
      title: '제출일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_: unknown, r: PlaceSuggestionRow) =>
        r.status === 'PENDING' ? (
          <Space>
            <Popconfirm
              title="이 장소 제보를 승인하시겠습니까?"
              onConfirm={() =>
                confirmMutation.mutate(r.id, {
                  onSuccess: () => message.success('승인되었습니다.'),
                  onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
                })
              }
              okText="승인"
              cancelText="취소"
            >
              <a>승인</a>
            </Popconfirm>
            <a onClick={() => setRejectTarget(r)}>반려</a>
          </Space>
        ) : (
          <span style={{ color: '#94a3b8' }}>{r.review_note ?? '-'}</span>
        ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select style={{ width: 160 }} value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      </Space>
      <Table<PlaceSuggestionRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        locale={{ emptyText: '등록된 장소 제보가 없습니다' }}
        pagination={false}
      />
      <Modal
        title="장소 제보 반려"
        open={rejectTarget !== null}
        onOk={submitReject}
        onCancel={closeRejectModal}
        confirmLoading={rejectMutation.isPending}
        okText="반려"
        cancelText="취소"
      >
        <Input.TextArea rows={3} placeholder="반려 사유 (필수)" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
      </Modal>
    </>
  )
}
