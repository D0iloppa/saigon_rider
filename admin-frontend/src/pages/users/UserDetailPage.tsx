import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Descriptions, Input, Modal, Popconfirm, Skeleton, Space, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useLiftSanction, useResetPhoneVerification, useUser, useUserActionEvents, useUserDevice } from '../../api/users'
import SanctionModal from '../../components/SanctionModal'
import StatusTag from '../../components/StatusTag'

export default function UserDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  // PII(전화번호 등) 열람은 사유 입력을 강제한다 — 확정된 사유가 있을 때만 상세 조회 API 를 호출한다.
  const [viewReason, setViewReason] = useState('')
  const [reasonDraft, setReasonDraft] = useState('')
  const [reasonError, setReasonError] = useState('')

  const { data: user, isLoading, isError, error } = useUser(id, viewReason)
  const { data: device, isLoading: isDeviceLoading } = useUserDevice(id)
  const { data: actionEvents, isLoading: isActionEventsLoading } = useUserActionEvents(id)
  const liftMutation = useLiftSanction()
  const resetPhoneMutation = useResetPhoneVerification()

  const [sanctionOpen, setSanctionOpen] = useState(false)
  const [liftOpen, setLiftOpen] = useState(false)
  const [liftReason, setLiftReason] = useState('')

  const submitReason = () => {
    if (!reasonDraft.trim()) {
      setReasonError('열람 사유를 입력하세요.')
      return
    }
    setViewReason(reasonDraft.trim())
  }

  if (!viewReason) {
    return (
      <Modal
        title="유저 상세정보 열람 사유"
        open
        closable={false}
        maskClosable={false}
        keyboard={false}
        onOk={submitReason}
        onCancel={() => navigate('/users')}
        okText="열람"
        cancelText="취소"
      >
        <Typography.Paragraph>
          이 화면에는 전화번호 등 개인정보가 포함됩니다. 열람 사유를 입력하면 감사로그에 기록됩니다.
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          value={reasonDraft}
          onChange={(e) => {
            setReasonDraft(e.target.value)
            if (reasonError) setReasonError('')
          }}
          placeholder="예: 고객 문의 대응, 신고 처리 확인 등"
        />
        {reasonError && <Typography.Text type="danger">{reasonError}</Typography.Text>}
      </Modal>
    )
  }

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="유저 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !user) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  const canLift = user.status === 'SUSPENDED' || user.status === 'BANNED'

  const closeLiftModal = () => {
    setLiftOpen(false)
    setLiftReason('')
  }

  const submitLift = () => {
    if (!liftReason.trim()) {
      message.warning('해제 사유를 입력하세요.')
      return
    }
    liftMutation.mutate(
      { userId: id, reason: liftReason.trim() },
      {
        onSuccess: () => {
          message.success('제재가 해제되었습니다.')
          closeLiftModal()
        },
        onError: (e) => message.error(e instanceof Error ? e.message : '해제에 실패했습니다.'),
      }
    )
  }

  const handleResetPhone = () => {
    resetPhoneMutation.mutate(id, {
      onSuccess: () => message.success('폰인증이 초기화되었습니다.'),
      onError: (e) => message.error(e instanceof Error ? e.message : '초기화에 실패했습니다.'),
    })
  }

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card title="프로필">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="닉네임">{user.nickname ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="전화">{user.phone ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="레벨">{user.level}</Descriptions.Item>
          <Descriptions.Item label="매너온도">{user.manner_temp.toFixed(1)}</Descriptions.Item>
          <Descriptions.Item label="상태">
            <StatusTag kind="user" status={user.status} />
          </Descriptions.Item>
          <Descriptions.Item label="정지만료">
            {user.suspended_until ? dayjs(user.suspended_until).format('YYYY-MM-DD HH:mm') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="폰인증">{user.phone_verified ? '완료' : '미완료'}</Descriptions.Item>
          <Descriptions.Item label="가입일">{dayjs(user.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="최근접속">
            {user.last_seen_at ? dayjs(user.last_seen_at).format('YYYY-MM-DD HH:mm') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="누적신고">{user.report_count}건</Descriptions.Item>
          <Descriptions.Item label="매물수">{user.listing_count}건</Descriptions.Item>
          <Descriptions.Item label="OAuth 연동" span={2}>
            {user.oauth_providers.length > 0
              ? user.oauth_providers.map((p) => <Tag key={p}>{p}</Tag>)
              : '-'}
          </Descriptions.Item>
        </Descriptions>
        <Space style={{ marginTop: 16 }}>
          <Button onClick={() => setSanctionOpen(true)}>경고/정지/영구정지</Button>
          {canLift && <Button onClick={() => setLiftOpen(true)}>제재 해제</Button>}
          <Popconfirm title="폰인증을 초기화하시겠습니까?" onConfirm={handleResetPhone} okText="초기화" cancelText="취소">
            <Button loading={resetPhoneMutation.isPending}>폰인증 초기화</Button>
          </Popconfirm>
        </Space>
      </Card>

      <Card title="디바이스 연동 정보">
        {isDeviceLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Device UUID">{device?.device_uuid ?? 'unlinked'}</Descriptions.Item>
            <Descriptions.Item label="FCM Token">{device?.fcm_token ?? 'unlinked'}</Descriptions.Item>
            <Descriptions.Item label="마지막 연동">
              {device?.logged_in_at ? dayjs(device.logged_in_at).format('YYYY-MM-DD HH:mm') : 'unlinked'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title="제재 이력">
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={user.sanctions}
          locale={{ emptyText: '제재 이력이 없습니다' }}
          columns={[
            { title: '유형', dataIndex: 'type', key: 'type' },
            { title: '사유', dataIndex: 'reason', key: 'reason' },
            { title: '처리자', dataIndex: 'admin_username', key: 'admin_username' },
            {
              title: '만료',
              dataIndex: 'ends_at',
              key: 'ends_at',
              render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
            },
            {
              title: '일시',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
            },
          ]}
        />
      </Card>

      <Card title="당한 신고 (최근 10건)">
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={user.recent_reports}
          locale={{ emptyText: '신고 이력이 없습니다' }}
          onRow={(record) => ({ onClick: () => navigate(`/reports/${record.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: '유형', dataIndex: 'target_type', key: 'target_type' },
            { title: '사유', dataIndex: 'reason', key: 'reason' },
            { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <StatusTag kind="report" status={v} /> },
            {
              title: '접수일',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
            },
          ]}
        />
      </Card>

      <Card title="행동 타임라인">
        {isActionEventsLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : !actionEvents?.engine_reachable ? (
          <Alert type="warning" showIcon message="Engine 응답 없음" description="행동 이벤트를 조회할 수 없습니다 (Engine 미연결) — 이력이 없다는 뜻이 아닙니다." />
        ) : (
          <Table
            size="small"
            rowKey={(_, idx) => idx ?? 0}
            pagination={false}
            dataSource={actionEvents.events}
            locale={{ emptyText: '행동 이력이 없습니다' }}
            columns={[
              {
                title: '시각',
                key: 'occurred_at',
                render: (_: unknown, ev: Record<string, unknown>) => {
                  const t = (ev.occurred_at ?? ev.created_at) as string | undefined
                  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'
                },
              },
              {
                title: '액션',
                key: 'action_code',
                render: (_: unknown, ev: Record<string, unknown>) => String(ev.action_code ?? ev.event_type ?? '-'),
              },
              {
                title: '상세',
                key: 'payload',
                render: (_: unknown, ev: Record<string, unknown>) => {
                  const payload = ev.payload
                  return payload !== undefined && payload !== null ? (
                    <Typography.Text code style={{ whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(payload)}
                    </Typography.Text>
                  ) : (
                    '-'
                  )
                },
              },
            ]}
          />
        )}
      </Card>

      <SanctionModal open={sanctionOpen} userId={id} onClose={() => setSanctionOpen(false)} />

      <Modal
        title="제재 해제"
        open={liftOpen}
        onOk={submitLift}
        onCancel={closeLiftModal}
        confirmLoading={liftMutation.isPending}
        okText="해제"
        cancelText="취소"
      >
        <Typography.Paragraph>해제 사유를 입력하세요.</Typography.Paragraph>
        <Input.TextArea rows={3} value={liftReason} onChange={(e) => setLiftReason(e.target.value)} />
      </Modal>
    </Space>
  )
}
