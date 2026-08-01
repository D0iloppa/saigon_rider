import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Button, Card, Descriptions, Input, List, Select, Skeleton, Space, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useCreateReply, useTicket, useUpdateTicketStatus } from '../../api/support'
import StatusTag from '../../components/StatusTag'

const STATUS_OPTIONS = [
  { value: 'OPEN', label: '접수' },
  { value: 'IN_PROGRESS', label: '처리중' },
  { value: 'RESOLVED', label: '해결' },
]

export default function SupportDetailPage() {
  const { id = '' } = useParams()
  const { data: ticket, isLoading, isError, error } = useTicket(id)
  const createReply = useCreateReply(id)
  const updateStatus = useUpdateTicketStatus(id)
  const [replyBody, setReplyBody] = useState('')

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="문의 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !ticket) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  const submitReply = () => {
    const body = replyBody.trim()
    if (!body) {
      message.warning('답변 내용을 입력하세요.')
      return
    }
    createReply.mutate(body, {
      onSuccess: () => {
        message.success('답변이 등록되었습니다.')
        setReplyBody('')
      },
      onError: (e) => message.error(e instanceof Error ? e.message : '답변 등록에 실패했습니다.'),
    })
  }

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card title="문의 정보">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="제목" span={2}>
            {ticket.title}
          </Descriptions.Item>
          <Descriptions.Item label="작성자">{ticket.user.nickname ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="접수일">{dayjs(ticket.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="상태" span={2}>
            <Space>
              <StatusTag kind="support" status={ticket.status} />
              <Select
                size="small"
                style={{ width: 100 }}
                value={ticket.status}
                options={STATUS_OPTIONS}
                loading={updateStatus.isPending}
                onChange={(v) =>
                  updateStatus.mutate(v, {
                    onSuccess: () => message.success('상태가 변경되었습니다.'),
                    onError: (e) => message.error(e instanceof Error ? e.message : '처리에 실패했습니다.'),
                  })
                }
              />
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="문의 내용" span={2}>
            {ticket.body}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="답변 내역">
        <List
          dataSource={ticket.replies}
          locale={{ emptyText: '아직 답변이 없습니다.' }}
          renderItem={(r) => {
            const isAdmin = r.author_type === 'admin'
            return (
              <List.Item style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start', border: 'none' }}>
                <div style={{ maxWidth: '70%', textAlign: isAdmin ? 'right' : 'left' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {isAdmin ? '관리자' : '유저'} · {dayjs(r.created_at).format('YYYY-MM-DD HH:mm')}
                  </Typography.Text>
                  <div
                    style={{
                      marginTop: 4,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: isAdmin ? '#e6f4ff' : '#f5f5f5',
                      display: 'inline-block',
                      whiteSpace: 'pre-wrap',
                      textAlign: 'left',
                    }}
                  >
                    {r.body}
                  </div>
                </div>
              </List.Item>
            )
          }}
        />
        <Input.TextArea
          rows={3}
          style={{ marginTop: 12 }}
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder="답변 내용을 입력하세요."
        />
        <Button
          type="primary"
          style={{ marginTop: 12 }}
          loading={createReply.isPending}
          onClick={submitReply}
        >
          답변 등록
        </Button>
      </Card>
    </Space>
  )
}
