import { useState } from 'react'
import { Alert, Button, Card, Descriptions, Rate, Skeleton, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useReview, type ReviewReportBrief } from '../../api/reviews'
import ReviewModerateModal from '../../components/ReviewModerateModal'

/** 신고 상세(target_type=REVIEW)에 얹는 후기 조치 패널.
 *
 * `GET /admin/api/reports/{id}` 응답의 `review_id` 로 대상 후기를 자동 조회한다(대표 지적
 * 2026-08-18 핵심 갭 — backend/app/routers/admin_api/reports.py 의 `get_report` 가 이제
 * `review_id` 를 흘려보낸다). 후기 원문·신고내역 상세 객체는 만들지 않고 id 만 받아 이 컴포넌트가
 * `GET /admin/api/reviews/{id}` 로 직접 조회 — 중복 응답을 피한다. */
export default function ReviewReportPanel({ reportId, reviewId }: { reportId: string; reviewId: string | null | undefined }) {
  const [moderateOpen, setModerateOpen] = useState(false)
  const { data: review, isLoading, isError, error } = useReview(reviewId ?? undefined)

  if (!reviewId) {
    return (
      <Card title="신고 대상 후기">
        <Alert type="error" showIcon message="대상 후기를 찾을 수 없습니다." description="이 신고에 연결된 후기 ID가 없습니다(과거 데이터 등)." />
      </Card>
    )
  }

  return (
    <Card title="신고 대상 후기">
      {isLoading && <Skeleton active paragraph={{ rows: 4 }} />}
      {isError && (
        <Alert type="error" showIcon message="대상 후기를 찾을 수 없습니다." description={error instanceof Error ? error.message : undefined} />
      )}
      {review && (
        <>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="상태" span={2}>
              {review.hidden_at ? <Tag color="error">비공개 처리됨</Tag> : <Tag color="success">공개중</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="평점">
              <Rate disabled value={review.rating} />
            </Descriptions.Item>
            <Descriptions.Item label="작성일">{dayjs(review.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
            <Descriptions.Item label="후기 본문" span={2}>
              {review.body}
            </Descriptions.Item>
            {review.hidden_at && (
              <Descriptions.Item label="비공개 처리 사유" span={2}>
                {review.hidden_reason ?? '-'}
              </Descriptions.Item>
            )}
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 16 }}>
            이 후기에 대한 신고 내역
          </Typography.Title>
          <Table<ReviewReportBrief>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={review.reports}
            locale={{ emptyText: '신고 내역이 없습니다' }}
            rowClassName={(r) => (r.id === reportId ? 'ant-table-row-selected' : '')}
            columns={[
              { title: '신고자', key: 'reporter', render: (_: unknown, r: ReviewReportBrief) => r.reporter.nickname ?? '-' },
              { title: '사유', dataIndex: 'reason', key: 'reason' },
              { title: '코멘트', dataIndex: 'note', key: 'note', render: (v: string | null) => v ?? '-' },
              {
                title: '접수일',
                dataIndex: 'created_at',
                key: 'created_at',
                render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
              },
            ]}
          />

          <Button style={{ marginTop: 16 }} onClick={() => setModerateOpen(true)}>
            후기 조치 ({review.hidden_at ? '복원' : '숨김'})
          </Button>

          <ReviewModerateModal
            open={moderateOpen}
            reviewId={review.id}
            hidden={!!review.hidden_at}
            reportId={reportId}
            onClose={() => setModerateOpen(false)}
          />
        </>
      )}
    </Card>
  )
}
