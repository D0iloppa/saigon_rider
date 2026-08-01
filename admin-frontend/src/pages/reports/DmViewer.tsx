import { useState } from 'react'
import { Alert, List, Pagination, Typography } from 'antd'
import dayjs from 'dayjs'
import { useReportDmMessages } from '../../api/reports'

const DM_PAGE_SIZE = 50

/** 신고된 DM 대화 열람 — 조회마다 서버에서 감사로그를 남긴다. */
export default function DmViewer({ reportId, reportedUserId }: { reportId: string; reportedUserId: string }) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useReportDmMessages(reportId, page)

  return (
    <div>
      <Alert type="warning" showIcon message="열람은 감사로그에 기록됩니다." style={{ marginBottom: 12 }} />
      <List
        loading={isLoading}
        dataSource={data?.items ?? []}
        locale={{ emptyText: '메시지가 없습니다' }}
        renderItem={(m) => {
          const isReported = m.sender_id === reportedUserId
          return (
            <List.Item style={{ display: 'flex', justifyContent: isReported ? 'flex-end' : 'flex-start', border: 'none' }}>
              <div style={{ maxWidth: '70%', textAlign: isReported ? 'right' : 'left' }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {m.sender_nickname ?? '(알 수 없음)'} · {dayjs(m.created_at).format('YYYY-MM-DD HH:mm')}
                </Typography.Text>
                <div
                  style={{
                    marginTop: 4,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isReported ? '#fff1f0' : '#f5f5f5',
                    display: 'inline-block',
                  }}
                >
                  {m.image_url ? (
                    <img src={m.image_url} alt="첨부 이미지" style={{ maxWidth: 240, borderRadius: 4, display: 'block' }} />
                  ) : (
                    (m.content ?? <Typography.Text type="secondary">[{m.message_type}]</Typography.Text>)
                  )}
                </div>
              </div>
            </List.Item>
          )
        }}
      />
      <Pagination
        current={page}
        pageSize={DM_PAGE_SIZE}
        total={data?.total ?? 0}
        onChange={setPage}
        showSizeChanger={false}
        style={{ textAlign: 'right', marginTop: 12 }}
      />
    </div>
  )
}
