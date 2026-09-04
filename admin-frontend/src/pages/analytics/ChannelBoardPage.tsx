import { Alert, Card, Col, Row, Skeleton } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useChannelBoard } from '../../api/channelBoard'
import StatCard from '../../components/StatCard'

export default function ChannelBoardPage() {
  const navigate = useNavigate()
  const boardQ = useChannelBoard()

  return (
    <div className="analytics-page">
      {boardQ.isError && (
        <Alert
          type="error"
          showIcon
          message="채널 성과 보드를 불러오지 못했습니다."
          description={boardQ.error instanceof Error ? boardQ.error.message : undefined}
        />
      )}

      {boardQ.isLoading && (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      )}

      {boardQ.data && (
        <Row gutter={[16, 16]}>
          {boardQ.data.slots.map((slot) => (
            <Col key={slot.key} xs={24} sm={12} md={8} lg={6}>
              <StatCard
                title={slot.label}
                value={slot.headline ?? '—'}
                state={slot.status.state}
                coverage={slot.status.coverage}
                detail={slot.detail_path ? undefined : '연동 예정 — 계측 미배선'}
                onClick={slot.detail_path ? () => navigate(slot.detail_path as string) : undefined}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
