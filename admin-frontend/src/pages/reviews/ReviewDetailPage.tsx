import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Button, Card, Descriptions, Rate, Skeleton, Space, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useReview, type ReviewReportBrief } from '../../api/reviews'
import ReviewModerateModal from '../../components/ReviewModerateModal'

/** 후기 조치 상세 — GET /admin/api/reviews/{id} (016 §8-2 P-BAD-REVIEW, 대표 지적 2026-08-18).
 *
 * 🔴 진입 경로 갭: 신고 큐(/reports/:id)의 target_type=REVIEW 신고는 review_id 를 응답에
 * 포함하지 않아(backend/app/routers/admin_api/reports.py `ReportRow`) 자동 연결이 안 된다.
 * ReportDetailPage 가 review_id 를 알 때 이 라우트로 링크하도록 만들어 두었고, 지금은
 * 운영자가 review_id 를 직접 입력해 진입한다. backend 수정 금지 지침으로 이번 범위에서
 * reports.py 는 건드리지 않았다 — 보고서에 갭으로 기록.
 */
export default function ReviewDetailPage() {
  const { id = '' } = useParams()
  const { data: review, isLoading, isError, error } = useReview(id)
  const [moderateOpen, setModerateOpen] = useState(false)

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="후기 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !review) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card
        title="후기 상세"
        extra={
          review.hidden_at ? (
            <Tag color="error">비공개 처리됨</Tag>
          ) : (
            <Tag color="success">공개중</Tag>
          )
        }
      >
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="평점">
            <Rate disabled value={review.rating} />
          </Descriptions.Item>
          <Descriptions.Item label="작성일">{dayjs(review.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="후기 본문" span={2}>
            {review.body}
          </Descriptions.Item>
          {review.owner_reply && (
            <Descriptions.Item label="사장님 답글" span={2}>
              {review.owner_reply}
              {review.owner_replied_at && (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  ({dayjs(review.owner_replied_at).format('YYYY-MM-DD HH:mm')})
                </Typography.Text>
              )}
            </Descriptions.Item>
          )}
          {review.hidden_at && (
            <>
              <Descriptions.Item label="비공개 처리 사유" span={2}>
                {review.hidden_reason ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="처리자">{review.hidden_by ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="처리일">{dayjs(review.hidden_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
            </>
          )}
        </Descriptions>
        <Space style={{ marginTop: 16 }}>
          <Button onClick={() => setModerateOpen(true)}>후기 조치 ({review.hidden_at ? '복원' : '숨김'})</Button>
        </Space>
      </Card>

      <Card title="신고 내역">
        <Table<ReviewReportBrief>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={review.reports}
          locale={{ emptyText: '신고 내역이 없습니다' }}
          columns={[
            { title: '신고자', key: 'reporter', render: (_: unknown, r: ReviewReportBrief) => r.reporter.nickname ?? '-' },
            { title: '사유', dataIndex: 'reason', key: 'reason' },
            { title: '코멘트', dataIndex: 'note', key: 'note', render: (v: string | null) => v ?? '-' },
            { title: '상태', dataIndex: 'status', key: 'status' },
            {
              title: '접수일',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
            },
          ]}
        />
      </Card>

      <ReviewModerateModal
        open={moderateOpen}
        reviewId={review.id}
        hidden={!!review.hidden_at}
        reportId={review.reports[0]?.id}
        onClose={() => setModerateOpen(false)}
      />
    </Space>
  )
}
