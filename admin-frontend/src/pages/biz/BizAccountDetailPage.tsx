import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Descriptions, Image, Input, Modal, Popconfirm, Select, Skeleton, Space, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import {
  useAssignBizAccountGroup,
  useApproveBizAccount,
  useBizAccount,
  useRejectBizAccount,
  useRejectBizAccountVerification,
  useSuspendBizAccount,
  useVerifyBizAccount,
  type BizAccountAdBrief,
} from '../../api/biz'

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '대기' },
  APPROVED: { color: 'green', label: '승인됨' },
  REJECTED: { color: 'default', label: '반려됨' },
  SUSPENDED: { color: 'red', label: '정지됨' },
}

const VERIFICATION_TAG: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '미제출' },
  docs_submitted: { color: 'gold', label: '서류제출' },
  verified: { color: 'green', label: '검증됨' },
  rejected: { color: 'red', label: '반려됨' },
}

export default function BizAccountDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: bp, isLoading, isError, error } = useBizAccount(id)
  const approveMutation = useApproveBizAccount()
  const rejectMutation = useRejectBizAccount()
  const suspendMutation = useSuspendBizAccount()
  const groupMutation = useAssignBizAccountGroup()
  const verifyMutation = useVerifyBizAccount()
  const rejectVerificationMutation = useRejectBizAccountVerification()

  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [groupId, setGroupId] = useState<string | undefined>(undefined)
  const [newGroupName, setNewGroupName] = useState('')
  const [verificationRejectOpen, setVerificationRejectOpen] = useState(false)
  const [verificationRejectReason, setVerificationRejectReason] = useState('')

  useEffect(() => {
    setGroupId(bp?.group_id ?? undefined)
  }, [bp?.group_id])

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="비즈니스 계정 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !bp) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  const submitReject = () => {
    if (!reason.trim()) {
      message.warning('반려 사유를 입력하세요.')
      return
    }
    rejectMutation.mutate(
      { id: bp.id, reason: reason.trim() },
      {
        onSuccess: () => {
          message.success('반려 처리되었습니다.')
          setRejectOpen(false)
          setReason('')
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      }
    )
  }

  const submitVerificationReject = () => {
    if (!verificationRejectReason.trim()) {
      message.warning('반려 사유를 입력하세요.')
      return
    }
    rejectVerificationMutation.mutate(
      { id: bp.id, reason: verificationRejectReason.trim() },
      {
        onSuccess: () => {
          message.success('검증을 반려했습니다.')
          setVerificationRejectOpen(false)
          setVerificationRejectReason('')
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      }
    )
  }

  const submitGroup = () => {
    groupMutation.mutate(
      { id: bp.id, group_id: newGroupName.trim() ? null : groupId ?? null, new_group_name: newGroupName.trim() || undefined },
      {
        onSuccess: () => {
          message.success('그룹을 지정했습니다.')
          setNewGroupName('')
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
      }
    )
  }

  const adColumns = [
    { title: '제목', dataIndex: 'title', key: 'title' },
    { title: '심사 상태', dataIndex: 'review_status', key: 'review_status' },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card title="비즈니스 프로필 정보">
        <Space align="start" size={16}>
          {bp.photo_url && <Image src={bp.photo_url} width={120} height={120} style={{ objectFit: 'cover', borderRadius: 8 }} />}
          <Descriptions column={2} bordered size="small" style={{ flex: 1 }}>
            <Descriptions.Item label="상호명">{bp.name}</Descriptions.Item>
            <Descriptions.Item label="상태">
              <Tag color={STATUS_TAG[bp.status]?.color ?? 'default'}>{STATUS_TAG[bp.status]?.label ?? bp.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="업종">{bp.category ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="연락처">{bp.phone ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="주소" span={2}>{bp.address ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="좌표">
              {bp.latitude !== null && bp.longitude !== null ? `${Number(bp.latitude).toFixed(6)}, ${Number(bp.longitude).toFixed(6)}` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="신청자">{bp.applicant_nickname ?? bp.applicant_id}</Descriptions.Item>
            <Descriptions.Item label="신청일">{dayjs(bp.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
            <Descriptions.Item label="심사일">{bp.reviewed_at ? dayjs(bp.reviewed_at).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
            <Descriptions.Item label="반려 사유" span={2}>{bp.reject_reason ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="그룹" span={2}>{bp.group_name ?? '그룹 없음'}</Descriptions.Item>
          </Descriptions>
        </Space>
        {bp.status === 'PENDING' && (
          <Space style={{ marginTop: 16 }}>
            <Button
              type="primary"
              loading={approveMutation.isPending}
              onClick={() =>
                approveMutation.mutate(bp.id, {
                  onSuccess: () => message.success('승인되었습니다.'),
                  onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
                })
              }
            >
              승인
            </Button>
            <Button danger onClick={() => setRejectOpen(true)}>
              반려
            </Button>
          </Space>
        )}
      </Card>

      <Card title="파트너 검증 (init/151 — 계정 승인축과 별개)">
        <Space align="start" size={16} wrap>
          {bp.biz_license_url && (
            <Space direction="vertical" size={4} align="center">
              <Typography.Text type="secondary">사업자등록증</Typography.Text>
              <Image src={bp.biz_license_url} width={140} height={100} style={{ objectFit: 'cover', borderRadius: 8 }} />
            </Space>
          )}
          {bp.signboard_url && (
            <Space direction="vertical" size={4} align="center">
              <Typography.Text type="secondary">간판</Typography.Text>
              <Image src={bp.signboard_url} width={140} height={100} style={{ objectFit: 'cover', borderRadius: 8 }} />
            </Space>
          )}
          <Descriptions column={1} bordered size="small" style={{ minWidth: 320 }}>
            <Descriptions.Item label="검증 상태">
              <Tag color={VERIFICATION_TAG[bp.verification_status]?.color ?? 'default'}>
                {VERIFICATION_TAG[bp.verification_status]?.label ?? bp.verification_status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="대표자명">{bp.rep_name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="검증일">{bp.verified_at ? dayjs(bp.verified_at).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
            <Descriptions.Item label="검증 반려 사유">{bp.verification_reject_reason ?? '-'}</Descriptions.Item>
          </Descriptions>
        </Space>
        {bp.verification_status !== 'verified' && (
          <Space style={{ marginTop: 16 }}>
            <Button
              type="primary"
              loading={verifyMutation.isPending}
              onClick={() =>
                verifyMutation.mutate(bp.id, {
                  onSuccess: () => message.success('검증 승인되었습니다.'),
                  onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
                })
              }
            >
              검증 승인
            </Button>
            <Button danger onClick={() => setVerificationRejectOpen(true)}>
              검증 반려
            </Button>
          </Space>
        )}
      </Card>

      {bp.status === 'APPROVED' && (
        <Card title="계정 정지">
          <Typography.Paragraph type="secondary">정지 시 게시중이던 보유 광고가 일괄 중단(STOPPED)됩니다.</Typography.Paragraph>
          <Popconfirm
            title="이 계정을 정지하시겠습니까?"
            description="게시중인 광고가 일괄 중단(STOPPED)됩니다."
            okText="정지"
            okButtonProps={{ danger: true }}
            cancelText="취소"
            onConfirm={() =>
              suspendMutation.mutate(bp.id, {
                onSuccess: () => message.success('계정을 정지했습니다.'),
                onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
              })
            }
          >
            <Button danger loading={suspendMutation.isPending}>
              계정 정지
            </Button>
          </Popconfirm>
        </Card>
      )}

      <Card title="그룹 지정 (D4 — 브랜드/체인 그룹, admin 전용)">
        <Space wrap>
          <Select
            style={{ width: 220 }}
            placeholder="그룹 없음"
            allowClear
            value={newGroupName.trim() ? undefined : groupId}
            disabled={!!newGroupName.trim()}
            options={bp.groups.map((g) => ({ value: g.id, label: g.name }))}
            onChange={(v) => setGroupId(v)}
          />
          <Input
            style={{ width: 200 }}
            placeholder="새 그룹 이름 (신규 생성)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <Button type="primary" loading={groupMutation.isPending} onClick={submitGroup}>
            저장
          </Button>
        </Space>
      </Card>

      <Card
        title="광고 이력"
        extra={<a onClick={() => navigate(`/biz/accounts/${bp.id}/ads`)}>론칭중 광고 전체보기</a>}
      >
        <Table<BizAccountAdBrief>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={bp.ads}
          locale={{ emptyText: '등록된 광고가 없습니다.' }}
          columns={adColumns}
          onRow={(r) => ({ onClick: () => navigate(`/biz/ads/${r.id}`), style: { cursor: 'pointer' } })}
        />
      </Card>

      <Modal
        title="비즈니스 계정 반려"
        open={rejectOpen}
        onOk={submitReject}
        onCancel={() => {
          setRejectOpen(false)
          setReason('')
        }}
        confirmLoading={rejectMutation.isPending}
        okText="반려"
        cancelText="취소"
      >
        <Input.TextArea rows={3} placeholder="반려 사유 (필수)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>

      <Modal
        title="파트너 검증 반려"
        open={verificationRejectOpen}
        onOk={submitVerificationReject}
        onCancel={() => {
          setVerificationRejectOpen(false)
          setVerificationRejectReason('')
        }}
        confirmLoading={rejectVerificationMutation.isPending}
        okText="반려"
        cancelText="취소"
      >
        <Input.TextArea
          rows={3}
          placeholder="반려 사유 (필수)"
          value={verificationRejectReason}
          onChange={(e) => setVerificationRejectReason(e.target.value)}
        />
      </Modal>
    </Space>
  )
}
