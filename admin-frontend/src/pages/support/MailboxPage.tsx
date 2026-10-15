import { useEffect, useState } from 'react'
import { Alert, Descriptions, Drawer, Empty, Select, Skeleton, Space, Switch, Table, Typography } from 'antd'
import { PaperClipOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  attachmentUrl,
  useMailMessage,
  useMailMessages,
  useMailboxes,
  type MailMessageDetail,
  type MailMessageRow,
} from '../../api/mailbox'

const formatDate = (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-')

/** HTML 본문은 sandbox iframe + CSP meta 로만 렌더 — 스크립트·same-origin 불허, 외부 이미지는 토글로만. */
function HtmlBody({ html, allowRemoteImages }: { html: string; allowRemoteImages: boolean }) {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data:${allowRemoteImages ? ' https:' : ''}`
  const srcDoc =
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<base target="_blank"></head><body>${html}</body></html>`
  return (
    <iframe
      // allow-popups 만 — 링크가 새 탭으로 열리게 한다. allow-scripts·allow-same-origin 은 절대 추가 금지.
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      title="메일 본문"
      style={{ width: '100%', height: 520, border: '1px solid #f0f0f0', background: '#fff' }}
    />
  )
}

function MessageBody({ address, message }: { address: string; message: MailMessageDetail }) {
  const [allowRemoteImages, setAllowRemoteImages] = useState(false)

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="보낸사람">{message.from || '-'}</Descriptions.Item>
        <Descriptions.Item label="받는사람">{message.to || '-'}</Descriptions.Item>
        {message.cc && <Descriptions.Item label="참조">{message.cc}</Descriptions.Item>}
        <Descriptions.Item label="날짜">{formatDate(message.date)}</Descriptions.Item>
        <Descriptions.Item label="제목">{message.subject || '(제목 없음)'}</Descriptions.Item>
      </Descriptions>

      {message.attachments.length > 0 && (
        <Space wrap>
          <PaperClipOutlined />
          {message.attachments.map((a) => (
            <a key={a.index} href={attachmentUrl(address, message.uid, a.index)} download={a.filename}>
              {a.filename} ({Math.ceil(a.size / 1024)} KB)
            </a>
          ))}
        </Space>
      )}

      {message.html ? (
        <>
          <Space>
            <Switch size="small" checked={allowRemoteImages} onChange={setAllowRemoteImages} />
            <Typography.Text type="secondary">외부 이미지 표시</Typography.Text>
          </Space>
          <HtmlBody html={message.html} allowRemoteImages={allowRemoteImages} />
        </>
      ) : message.text ? (
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{message.text}</pre>
      ) : (
        <Empty description="본문이 없습니다." />
      )}
    </Space>
  )
}

export default function MailboxPage() {
  const { data: mailboxes, isLoading: mailboxesLoading } = useMailboxes()
  const [address, setAddress] = useState('')
  const [page, setPage] = useState(1)
  const [selectedUid, setSelectedUid] = useState<number | null>(null)
  const size = 30

  useEffect(() => {
    if (!address && mailboxes?.length) setAddress(mailboxes[0].address)
  }, [address, mailboxes])

  const { data, isLoading, isError, error } = useMailMessages(address, page, size)
  const detail = useMailMessage(address, selectedUid)

  if (!mailboxesLoading && !mailboxes?.length) {
    return <Alert type="warning" showIcon message="설정된 메일함이 없습니다. (ADMIN_MAILBOXES)" />
  }

  const columns = [
    {
      title: '보낸사람',
      key: 'from',
      width: 220,
      render: (_: unknown, r: MailMessageRow) => <span title={r.from_addr}>{r.from_name || r.from_addr || '-'}</span>,
    },
    { title: '제목', key: 'subject', render: (_: unknown, r: MailMessageRow) => r.subject || '(제목 없음)' },
    {
      title: '첨부',
      key: 'attachments',
      width: 60,
      align: 'center' as const,
      render: (_: unknown, r: MailMessageRow) => (r.has_attachments ? <PaperClipOutlined /> : null),
    },
    { title: '받은 시각', dataIndex: 'date', key: 'date', width: 160, render: formatDate },
  ]

  return (
    <>
      <Select
        style={{ width: 320, marginBottom: 16 }}
        value={address || undefined}
        loading={mailboxesLoading}
        options={(mailboxes ?? []).map((m) => ({ value: m.address, label: m.address }))}
        onChange={(v) => {
          setAddress(v)
          setPage(1)
        }}
      />
      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="메일을 불러오지 못했습니다."
          description={error instanceof Error ? error.message : undefined}
        />
      )}
      <Table<MailMessageRow>
        rowKey="uid"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        onRow={(record) => ({
          onClick: () => setSelectedUid(record.uid),
          style: { cursor: 'pointer', fontWeight: record.seen ? undefined : 600 },
        })}
        pagination={{
          current: page,
          pageSize: size,
          total: data?.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />
      <Drawer
        width={760}
        open={selectedUid !== null}
        onClose={() => setSelectedUid(null)}
        title={detail.data?.subject || '메일'}
        destroyOnClose
      >
        {detail.isError ? (
          <Alert
            type="error"
            showIcon
            message="메일을 불러오지 못했습니다."
            description={detail.error instanceof Error ? detail.error.message : undefined}
          />
        ) : detail.data ? (
          <MessageBody address={address} message={detail.data} />
        ) : (
          <Skeleton active paragraph={{ rows: 8 }} />
        )}
      </Drawer>
    </>
  )
}
