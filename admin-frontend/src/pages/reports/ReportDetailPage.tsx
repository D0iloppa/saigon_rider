import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Descriptions, Image, Input, Modal, Skeleton, Space, Table, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useReport, useUpdateReportStatus } from '../../api/reports'
import ModerateModal from '../../components/ModerateModal'
import SanctionModal from '../../components/SanctionModal'
import StatusTag from '../../components/StatusTag'
import DmViewer from './DmViewer'
import ReviewReportPanel from './ReviewReportPanel'

const TARGET_LABEL: Record<string, string> = { LISTING: '매물', USER: '유저', DM: 'DM', REVIEW: '후기' }

export default function ReportDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: report, isLoading, isError, error } = useReport(id)
  const updateStatus = useUpdateReportStatus(id)

  const [pendingAction, setPendingAction] = useState<'RESOLVED' | 'REJECTED' | null>(null)
  const [note, setNote] = useState('')
  const [publicSummary, setPublicSummary] = useState('')
  const [sanctionOpen, setSanctionOpen] = useState(false)
  const [moderateOpen, setModerateOpen] = useState(false)

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="신고 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !report) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  const closed = report.status === 'RESOLVED' || report.status === 'REJECTED'

  const handleReview = () => {
    updateStatus.mutate(
      { status: 'REVIEWING' },
      {
        onSuccess: () => message.success('검토를 시작했습니다.'),
        onError: (e) => message.error(e instanceof Error ? e.message : '처리에 실패했습니다.'),
      }
    )
  }

  const closeDecisionModal = () => {
    setPendingAction(null)
    setNote('')
    setPublicSummary('')
  }

  const submitDecision = () => {
    if (!pendingAction) return
    if (!note.trim()) {
      message.warning('처리 사유를 입력하세요.')
      return
    }
    updateStatus.mutate(
      {
        status: pendingAction,
        resolution_note: note.trim(),
        ...(publicSummary.trim() ? { public_resolution_summary: publicSummary.trim() } : {}),
      },
      {
        onSuccess: () => {
          message.success('처리되었습니다.')
          closeDecisionModal()
        },
        onError: (e) => message.error(e instanceof Error ? e.message : '처리에 실패했습니다.'),
      }
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card title="신고 정보">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="유형">{TARGET_LABEL[report.target_type] ?? report.target_type}</Descriptions.Item>
          <Descriptions.Item label="상태">
            <StatusTag kind="report" status={report.status} />
          </Descriptions.Item>
          <Descriptions.Item label="사유">{report.reason}</Descriptions.Item>
          <Descriptions.Item label="접수일">{dayjs(report.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="신고자">{report.reporter.nickname ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="처리자">{report.handled_by ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="비고" span={2}>
            {report.note ?? '-'}
          </Descriptions.Item>
          {closed && (
            <Descriptions.Item label="처리 사유 (내부)" span={2}>
              {report.resolution_note ?? '-'}
            </Descriptions.Item>
          )}
          {closed && (
            <Descriptions.Item label="신고자 공개 요약" span={2}>
              {report.public_resolution_summary ?? '(미입력 — 고정 문구로 통보됨)'}
            </Descriptions.Item>
          )}
        </Descriptions>
        <Space style={{ marginTop: 16 }}>
          {report.status === 'PENDING' && (
            <Button onClick={handleReview} loading={updateStatus.isPending}>
              검토 시작
            </Button>
          )}
          {!closed && (
            <>
              <Button type="primary" onClick={() => setPendingAction('RESOLVED')}>
                처리 완료
              </Button>
              <Button danger onClick={() => setPendingAction('REJECTED')}>
                기각
              </Button>
            </>
          )}
          <Button onClick={() => setSanctionOpen(true)}>유저 제재</Button>
          {report.target_type === 'LISTING' && report.listing_detail && (
            <Button onClick={() => setModerateOpen(true)}>매물 조치</Button>
          )}
        </Space>
      </Card>

      <Card title="피신고자">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="닉네임">{report.reported_user.nickname ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="상태">
            <StatusTag kind="user" status={report.reported_user.status} />
          </Descriptions.Item>
          <Descriptions.Item label="매너온도">
            {report.reported_user_summary.manner_temp !== null ? report.reported_user_summary.manner_temp.toFixed(1) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="폰인증">{report.reported_user_summary.phone_verified ? '완료' : '미완료'}</Descriptions.Item>
          <Descriptions.Item label="누적신고">{report.reported_user_summary.report_count}건</Descriptions.Item>
        </Descriptions>
        <Typography.Title level={5} style={{ marginTop: 16 }}>
          최근 제재 이력
        </Typography.Title>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={report.reported_user_summary.sanctions}
          locale={{ emptyText: '제재 이력이 없습니다' }}
          columns={[
            { title: '유형', dataIndex: 'type', key: 'type' },
            { title: '사유', dataIndex: 'reason', key: 'reason' },
            { title: '처리자', dataIndex: 'admin_username', key: 'admin_username' },
            {
              title: '일시',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
            },
          ]}
        />
        <Button style={{ marginTop: 12 }} onClick={() => navigate(`/users/${report.reported_user.id}`)}>
          유저 상세로 이동
        </Button>
      </Card>

      {report.listing_detail && (
        <Card title="신고 대상 매물">
          <Space align="start">
            {report.listing_detail.image_urls[0] && (
              <Image src={report.listing_detail.image_urls[0]} width={96} height={96} style={{ objectFit: 'cover' }} />
            )}
            <div>
              <Typography.Link onClick={() => navigate(`/listings/${report.listing_detail!.id}`)}>
                {report.listing_detail.title}
              </Typography.Link>
              <div>
                <StatusTag kind="listing" status={report.listing_detail.status} />
              </div>
            </div>
          </Space>
        </Card>
      )}

      {report.target_type === 'REVIEW' && <ReviewReportPanel reportId={report.id} reviewId={report.review_id} />}

      {report.report_images.length > 0 && (
        <Card title="신고자 첨부 사진">
          <Space wrap>
            {report.report_images.map((url) => (
              <Image key={url} src={url} width={96} height={96} style={{ objectFit: 'cover' }} />
            ))}
          </Space>
        </Card>
      )}

      {report.target_type === 'DM' && report.conversation_id && (
        <Card title="DM 대화 내역">
          <DmViewer reportId={report.id} reportedUserId={report.reported_user.id} />
        </Card>
      )}

      <Modal
        title={pendingAction === 'RESOLVED' ? '처리 완료' : '기각'}
        open={pendingAction !== null}
        onOk={submitDecision}
        onCancel={closeDecisionModal}
        confirmLoading={updateStatus.isPending}
        okText="확인"
        cancelText="취소"
      >
        <Typography.Paragraph>처리 사유를 입력하세요. (내부 메모, 신고자에게 노출되지 않음)</Typography.Paragraph>
        <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        <Typography.Paragraph style={{ marginTop: 16 }}>
          신고자 공개 요약 사유 (선택 — 비워두면 기본 안내 문구로 통보됩니다)
        </Typography.Paragraph>
        <Input.TextArea rows={2} value={publicSummary} onChange={(e) => setPublicSummary(e.target.value)} />
      </Modal>

      <SanctionModal open={sanctionOpen} userId={report.reported_user.id} reportId={report.id} onClose={() => setSanctionOpen(false)} />
      {report.listing_detail && (
        <ModerateModal
          open={moderateOpen}
          listingId={report.listing_detail.id}
          currentStatus={report.listing_detail.status}
          reportId={report.id}
          onClose={() => setModerateOpen(false)}
        />
      )}
    </Space>
  )
}
