import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Avatar, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { useApproveBizAd, useBizAds, useRejectBizAd, useUpdateBizAdExposure, type BizAdRow } from '../../api/biz'

const STATUS_OPTIONS = [
  { value: 'PENDING', label: '대기' },
  { value: '', label: '전체' },
  { value: 'APPROVED', label: '승인됨' },
  { value: 'REJECTED', label: '반려됨' },
  { value: 'STOPPED', label: '중단됨' },
]

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '대기' },
  APPROVED: { color: 'green', label: '승인됨' },
  REJECTED: { color: 'default', label: '반려됨' },
  STOPPED: { color: 'red', label: '중단됨' },
}

const TIER_OPTIONS = [
  { value: 'GOLD', label: 'GOLD' },
  { value: 'SILVER', label: 'SILVER' },
  { value: 'BRONZE', label: 'BRONZE' },
]

const TIER_TAG: Record<string, string> = {
  GOLD: 'gold',
  SILVER: 'blue',
  BRONZE: 'volcano',
}

const PROFILE_STATUS_TAG: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '대기' },
  APPROVED: { color: 'green', label: '승인됨' },
  REJECTED: { color: 'default', label: '반려됨' },
  SUSPENDED: { color: 'red', label: '정지됨' },
}

function adPeriod(r: BizAdRow): string {
  if (!r.starts_at && !r.ends_at) return '상시'
  const fmt = (v: string | null) => (v ? dayjs(v).format('YY-MM-DD') : '—')
  return `${fmt(r.starts_at)} ~ ${fmt(r.ends_at)}`
}

export default function BizAdListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // 대시보드 "광고 심사대기" 카드는 ?status=PENDING 으로 이동한다. 미지원 값이면 PENDING 기본 선택으로 해석한다.
  const initialStatus = useMemo(() => {
    const raw = searchParams.get('status')
    if (!raw) return 'PENDING'
    return STATUS_OPTIONS.some((o) => o.value === raw) ? raw : 'PENDING'
  }, [searchParams])

  const [status, setStatus] = useState(initialStatus)
  const [rejectTarget, setRejectTarget] = useState<BizAdRow | null>(null)
  const [reason, setReason] = useState('')
  const [exposureTarget, setExposureTarget] = useState<BizAdRow | null>(null)
  const [tier, setTier] = useState<string>('BRONZE')
  const [fee, setFee] = useState<number | null>(0)

  const { data, isLoading, isError, error } = useBizAds(status || undefined)
  const approveMutation = useApproveBizAd()
  const rejectMutation = useRejectBizAd()
  const exposureMutation = useUpdateBizAdExposure()

  const closeRejectModal = () => {
    setRejectTarget(null)
    setReason('')
  }

  const openExposureModal = (r: BizAdRow) => {
    setExposureTarget(r)
    setTier(r.exposure_tier)
    setFee(r.ad_fee)
  }

  const closeExposureModal = () => {
    setExposureTarget(null)
  }

  const submitExposure = () => {
    if (!exposureTarget) return
    exposureMutation.mutate(
      { id: exposureTarget.id, exposure_tier: tier, ad_fee: fee ?? 0 },
      {
        onSuccess: () => {
          message.success('노출 설정이 저장되었습니다.')
          closeExposureModal()
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      }
    )
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
        message="광고 소재 목록을 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    {
      title: '',
      key: 'image',
      width: 56,
      render: (_: unknown, r: BizAdRow) => <Avatar src={r.image_url ?? undefined} shape="square">{r.title.slice(0, 1)}</Avatar>,
    },
    {
      title: '제목',
      key: 'title',
      render: (_: unknown, r: BizAdRow) => <a onClick={() => navigate(`/biz/ads/${r.id}`)}>{r.title}</a>,
    },
    { title: '내용', dataIndex: 'body', key: 'body', render: (v: string | null) => v ?? '-' },
    { title: '게시기간', key: 'period', render: (_: unknown, r: BizAdRow) => adPeriod(r) },
    {
      title: '파트너',
      key: 'partner_name',
      render: (_: unknown, r: BizAdRow) =>
        r.profile_id ? <a onClick={() => navigate(`/biz/accounts/${r.profile_id}`)}>{r.partner_name}</a> : r.partner_name,
    },
    {
      title: '파트너 상태',
      dataIndex: 'profile_status',
      key: 'profile_status',
      render: (v: string | null) =>
        v ? <Tag color={PROFILE_STATUS_TAG[v]?.color ?? 'default'}>{PROFILE_STATUS_TAG[v]?.label ?? v}</Tag> : '-',
    },
    {
      title: '심사 상태',
      dataIndex: 'review_status',
      key: 'review_status',
      render: (v: string) => <Tag color={STATUS_TAG[v]?.color ?? 'default'}>{STATUS_TAG[v]?.label ?? v}</Tag>,
    },
    {
      title: '노출 등급',
      dataIndex: 'exposure_tier',
      key: 'exposure_tier',
      render: (v: string) => <Tag color={TIER_TAG[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: '과금액 (VND)',
      dataIndex: 'ad_fee',
      key: 'ad_fee',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString('en-US'),
    },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_: unknown, r: BizAdRow) => (
        <Space>
          {r.review_status === 'PENDING' ? (
            <>
              <Popconfirm
                title="이 광고를 승인하시겠습니까? (즉시 게시됩니다)"
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
            </>
          ) : (
            <span style={{ color: '#94a3b8' }}>{r.reject_reason ?? '-'}</span>
          )}
          <a onClick={() => openExposureModal(r)}>노출설정</a>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select style={{ width: 160 }} value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      </Space>
      <Table<BizAdRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        locale={{ emptyText: '등록된 광고가 없습니다.' }}
        pagination={false}
      />
      <Modal
        title="광고 소재 반려"
        open={rejectTarget !== null}
        onOk={submitReject}
        onCancel={closeRejectModal}
        confirmLoading={rejectMutation.isPending}
        okText="반려"
        cancelText="취소"
      >
        <Input.TextArea rows={3} placeholder="반려 사유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
      <Modal
        title="노출 등급 / 과금액 설정"
        open={exposureTarget !== null}
        onOk={submitExposure}
        onCancel={closeExposureModal}
        confirmLoading={exposureMutation.isPending}
        okText="저장"
        cancelText="취소"
      >
        <p style={{ color: '#94a3b8', marginTop: 0 }}>등급이 높고 과금액이 클수록 더 자주 노출됩니다.</p>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select style={{ width: '100%' }} value={tier} options={TIER_OPTIONS} onChange={setTier} />
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            step={10000}
            value={fee}
            onChange={setFee}
            placeholder="과금액 (VND)"
          />
        </Space>
      </Modal>
    </>
  )
}
