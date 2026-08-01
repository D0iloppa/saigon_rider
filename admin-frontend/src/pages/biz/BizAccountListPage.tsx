import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Avatar, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { useApproveBizAccount, useBizAccounts, useRejectBizAccount, type BizAccountRow } from '../../api/biz'

const STATUS_OPTIONS = [
  { value: 'PENDING', label: '대기' },
  { value: '', label: '전체' },
  { value: 'APPROVED', label: '승인됨' },
  { value: 'REJECTED', label: '반려됨' },
  { value: 'SUSPENDED', label: '정지됨' },
]

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '대기' },
  APPROVED: { color: 'green', label: '승인됨' },
  REJECTED: { color: 'default', label: '반려됨' },
  SUSPENDED: { color: 'red', label: '정지됨' },
}

const VERIFICATION_OPTIONS = [
  { value: '', label: '검증 전체' },
  { value: 'pending', label: '미제출' },
  { value: 'docs_submitted', label: '서류제출' },
  { value: 'verified', label: '검증됨' },
  { value: 'rejected', label: '반려됨' },
]

const VERIFICATION_TAG: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '미제출' },
  docs_submitted: { color: 'gold', label: '서류제출' },
  verified: { color: 'green', label: '검증됨' },
  rejected: { color: 'red', label: '반려됨' },
}

export default function BizAccountListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // 대시보드 "파트너 심사대기" 카드는 ?status=PENDING 으로 이동한다. 미지원 값이면 PENDING 기본 선택으로 해석한다.
  const initialStatus = useMemo(() => {
    const raw = searchParams.get('status')
    if (!raw) return 'PENDING'
    return STATUS_OPTIONS.some((o) => o.value === raw) ? raw : 'PENDING'
  }, [searchParams])

  const [status, setStatus] = useState(initialStatus)
  const [verificationFilter, setVerificationFilter] = useState('')
  const [rejectTarget, setRejectTarget] = useState<BizAccountRow | null>(null)
  const [reason, setReason] = useState('')

  const { data, isLoading, isError, error } = useBizAccounts(status || undefined)
  const filteredData = useMemo(
    () => (verificationFilter ? (data ?? []).filter((r) => r.verification_status === verificationFilter) : data),
    [data, verificationFilter]
  )
  const approveMutation = useApproveBizAccount()
  const rejectMutation = useRejectBizAccount()

  const closeRejectModal = () => {
    setRejectTarget(null)
    setReason('')
  }

  const submitReject = () => {
    if (!rejectTarget) return
    if (!reason.trim()) {
      message.warning('반려 사유를 입력하세요.')
      return
    }
    rejectMutation.mutate(
      { id: rejectTarget.id, reason: reason.trim() },
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
        message="비즈니스 계정 목록을 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    {
      title: '',
      key: 'photo',
      width: 56,
      render: (_: unknown, r: BizAccountRow) => <Avatar src={r.photo_url ?? undefined} shape="square">{r.name.slice(0, 1)}</Avatar>,
    },
    {
      title: '상호명',
      key: 'name',
      render: (_: unknown, r: BizAccountRow) => <a onClick={() => navigate(`/biz/accounts/${r.id}`)}>{r.name}</a>,
    },
    { title: '업종', dataIndex: 'category', key: 'category', render: (v: string | null) => v ?? '-' },
    { title: '주소', dataIndex: 'address', key: 'address', render: (v: string | null) => v ?? '-' },
    { title: '연락처', dataIndex: 'phone', key: 'phone', render: (v: string | null) => v ?? '-' },
    { title: '신청자', dataIndex: 'applicant_nickname', key: 'applicant_nickname', render: (v: string | null) => v ?? '-' },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => <Tag color={STATUS_TAG[v]?.color ?? 'default'}>{STATUS_TAG[v]?.label ?? v}</Tag>,
    },
    {
      title: '검증 상태',
      dataIndex: 'verification_status',
      key: 'verification_status',
      render: (v: string) => <Tag color={VERIFICATION_TAG[v]?.color ?? 'default'}>{VERIFICATION_TAG[v]?.label ?? v}</Tag>,
    },
    {
      title: '신청일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_: unknown, r: BizAccountRow) =>
        r.status === 'PENDING' ? (
          <Space>
            <Popconfirm
              title="이 비즈니스 계정을 승인하시겠습니까?"
              onConfirm={() =>
                approveMutation.mutate(r.id, {
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
          <span style={{ color: '#94a3b8' }}>{r.reject_reason ?? '-'}</span>
        ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select style={{ width: 160 }} value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <Select style={{ width: 160 }} value={verificationFilter} options={VERIFICATION_OPTIONS} onChange={setVerificationFilter} />
      </Space>
      <Table<BizAccountRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={filteredData ?? []}
        locale={{ emptyText: '신청이 없습니다' }}
        pagination={false}
      />
      <Modal
        title="비즈니스 계정 반려"
        open={rejectTarget !== null}
        onOk={submitReject}
        onCancel={closeRejectModal}
        confirmLoading={rejectMutation.isPending}
        okText="반려"
        cancelText="취소"
      >
        <Input.TextArea rows={3} placeholder="반려 사유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  )
}
