import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Empty,
  Form,
  Grid,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message,
  type UploadFile,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ForwardOutlined,
  InboxOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  RetweetOutlined,
  RollbackOutlined,
  SendOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  attachmentUrl,
  emptyTrash,
  moveToTrash,
  purgeMessages,
  restoreFromTrash,
  sendMail,
  setSeen,
  useMailFolders,
  useMailMessage,
  useMailMessages,
  useMailboxes,
  useReadReceipts,
  type ComposeMode,
  type MailFolder,
  type MailMessageDetail,
  type MailMessagePage,
  type MailMessageRow,
} from '../../api/mailbox'

const formatDate = (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-')
const PAGE_SIZE = 30
const BORDER = '1px solid var(--ant-color-border-secondary)'

type View = MailFolder | 'receipts'

// 그룹웨어 사이드바와 같은 순서 — 수신확인은 IMAP 폴더가 아니라 콘솔 전용 뷰지만 "보낸메일함 다음" 자리.
const NAV: { key: View; label: string; icon: ReactNode }[] = [
  { key: 'inbox', label: '받은메일함', icon: <InboxOutlined /> },
  { key: 'sent', label: '보낸메일함', icon: <SendOutlined /> },
  { key: 'receipts', label: '수신확인', icon: <EyeOutlined /> },
  { key: 'trash', label: '휴지통', icon: <DeleteOutlined /> },
]

interface ComposeState {
  mode: ComposeMode
  orig?: MailMessageDetail
  origFolder?: MailFolder
}

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
      style={{ width: '100%', height: 520, border: BORDER, background: '#fff' }}
    />
  )
}

/** 보낸메일함 상세의 수신확인 배지 (R2 부가) — 수신자별 열람 여부. 행이 없으면(수신확인 없는 메일) 그리지 않는다. */
function ReceiptBadges({ address, messageId }: { address: string; messageId: string }) {
  const { data } = useReadReceipts(address, messageId, !!messageId)
  if (!data?.length) return null
  return (
    <Space wrap size={4}>
      <EyeOutlined />
      {data.map((r) => (
        <Tag key={r.id} color={r.first_opened_at ? 'green' : 'default'}>
          {r.recipient_email} · {r.first_opened_at ? `읽음 ${formatDate(r.first_opened_at)} (${r.open_count}회)` : '읽지않음'}
        </Tag>
      ))}
    </Space>
  )
}

function ReaderPane({
  address,
  folder,
  uid,
  onCompose,
  onTrash,
  onRestore,
}: {
  address: string
  folder: MailFolder
  uid: number | null
  onCompose: (mode: ComposeMode, orig: MailMessageDetail) => void
  onTrash: (uids: number[]) => void
  onRestore: (uids: number[]) => void
}) {
  const detail = useMailMessage(address, folder, uid)
  const [allowRemoteImages, setAllowRemoteImages] = useState(false)
  useEffect(() => setAllowRemoteImages(false), [uid])

  if (uid === null) {
    return (
      <div style={{ padding: 48 }}>
        <Empty description="목록에서 메일을 선택하세요." />
      </div>
    )
  }
  if (detail.isError) {
    return (
      <Alert
        type="error"
        showIcon
        style={{ margin: 16 }}
        message="메일을 불러오지 못했습니다."
        description={detail.error instanceof Error ? detail.error.message : undefined}
      />
    )
  }
  const m = detail.data
  if (!m || m.uid !== uid) return <Skeleton active paragraph={{ rows: 8 }} style={{ padding: 16 }} />

  return (
    <div style={{ padding: 16 }}>
      <Space direction="vertical" size={12} style={{ display: 'flex' }}>
        <Space wrap size={6}>
          <Button size="small" icon={<RollbackOutlined />} onClick={() => onCompose('reply', m)}>
            답장
          </Button>
          <Button size="small" icon={<RetweetOutlined />} onClick={() => onCompose('reply_all', m)}>
            전체답장
          </Button>
          <Button size="small" icon={<ForwardOutlined />} onClick={() => onCompose('forward', m)}>
            전달
          </Button>
          {folder === 'trash' ? (
            <Button size="small" icon={<UndoOutlined />} onClick={() => onRestore([m.uid])}>
              복구
            </Button>
          ) : (
            <Popconfirm title="휴지통으로 옮길까요?" onConfirm={() => onTrash([m.uid])}>
              <Button size="small" danger icon={<DeleteOutlined />}>
                삭제
              </Button>
            </Popconfirm>
          )}
        </Space>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {m.subject || '(제목 없음)'}
        </Typography.Title>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="보낸사람">{m.from || '-'}</Descriptions.Item>
          <Descriptions.Item label="받는사람">{m.to || '-'}</Descriptions.Item>
          {m.cc && <Descriptions.Item label="참조">{m.cc}</Descriptions.Item>}
          <Descriptions.Item label="날짜">{formatDate(m.date)}</Descriptions.Item>
        </Descriptions>
        {folder === 'sent' && <ReceiptBadges address={address} messageId={m.message_id} />}
        {m.attachments.length > 0 && (
          <Space wrap>
            <PaperClipOutlined />
            {m.attachments.map((a) => (
              <a key={a.index} href={attachmentUrl(address, folder, m.uid, a.index)} download={a.filename}>
                {a.filename} ({Math.ceil(a.size / 1024)} KB)
              </a>
            ))}
          </Space>
        )}
        {m.html ? (
          <>
            <Space>
              <Switch size="small" checked={allowRemoteImages} onChange={setAllowRemoteImages} />
              <Typography.Text type="secondary">외부 이미지 표시</Typography.Text>
            </Space>
            <HtmlBody html={m.html} allowRemoteImages={allowRemoteImages} />
          </>
        ) : m.text ? (
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{m.text}</pre>
        ) : (
          <Empty description="본문이 없습니다." />
        )}
      </Space>
    </div>
  )
}

/** 수신확인 전용 뷰 (R2) — 메일함 단위 전체 목록. 열람은 추적 픽셀 기반이라 추정치(R5). */
function ReadReceiptsPane({ address }: { address: string }) {
  const { data, isLoading } = useReadReceipts(address, null)
  return (
    <div style={{ padding: 16 }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="열람 추정(best-effort)"
        description="수신자가 메일의 이미지를 표시해야 열람이 기록됩니다. 이미지 차단으로 누락되거나 보안 게이트웨이의 사전 스캔으로 오탐될 수 있습니다. 발송 후 10초 이내 요청은 사전 스캔으로 보고 기록하지 않습니다."
      />
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        pagination={{ pageSize: 20, size: 'small', showSizeChanger: false }}
        locale={{ emptyText: <Empty description="보낸 메일이 없습니다." /> }}
        columns={[
          { title: '수신자', dataIndex: 'recipient_email', key: 'recipient', ellipsis: true },
          { title: '제목', dataIndex: 'subject', key: 'subject', ellipsis: true, render: (v: string | null) => v || '(제목 없음)' },
          { title: '보낸 시각', dataIndex: 'sent_at', key: 'sent_at', width: 150, render: formatDate },
          {
            title: '열람',
            key: 'opened',
            width: 100,
            render: (_: unknown, r) => (r.first_opened_at ? <Tag color="green">읽음</Tag> : <Tag>읽지않음</Tag>),
          },
          { title: '최초 열람', dataIndex: 'first_opened_at', key: 'first', width: 150, render: formatDate },
          { title: '횟수', dataIndex: 'open_count', key: 'count', width: 70, align: 'right' as const, render: (v: number) => `${v}회` },
        ]}
      />
    </div>
  )
}

const withPrefix = (prefix: 'Re:' | 'Fwd:', subject: string) =>
  (prefix === 'Re:' ? /^re:/i : /^fwd?:/i).test(subject.trim()) ? subject : `${prefix} ${subject}`.trim()

function ComposeModal({
  address,
  compose,
  onClose,
  onSent,
}: {
  address: string
  compose: ComposeState
  onClose: () => void
  onSent: () => void
}) {
  const [form] = Form.useForm<{ to: string[]; cc: string[]; subject: string; body: string; includeOriginal: boolean }>()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [sending, setSending] = useState(false)
  const { mode, orig, origFolder } = compose
  const isSelf = (a: string) => a.toLowerCase().includes(address.toLowerCase())
  const uniq = (list: string[]) => {
    const seen = new Set<string>()
    return list.filter((a) => {
      const k = a.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  const to =
    mode === 'reply' ? orig?.reply_to ?? [] : mode === 'reply_all' ? uniq([...(orig?.reply_to ?? []), ...(orig?.to_addrs ?? [])]).filter((a) => !isSelf(a)) : []
  const cc = mode === 'reply_all' ? (orig?.cc_addrs ?? []).filter((a) => !isSelf(a) && !to.some((t) => t.toLowerCase() === a.toLowerCase())) : []
  const subject = orig ? withPrefix(mode === 'forward' ? 'Fwd:' : 'Re:', orig.subject) : ''
  const originalAttachments = mode === 'forward' ? orig?.attachments.length ?? 0 : 0
  const title = { new: '새 메일', reply: '답장', reply_all: '전체답장', forward: '전달' }[mode]

  const submit = async (v: { to: string[]; cc: string[]; subject: string; body: string; includeOriginal: boolean }) => {
    setSending(true)
    try {
      await sendMail(address, {
        mode,
        to: v.to,
        cc: v.cc ?? [],
        subject: v.subject ?? '',
        body: v.body ?? '',
        orig_folder: origFolder,
        orig_uid: orig?.uid,
        include_original_attachments: v.includeOriginal,
        files: fileList.map((f) => f.originFileObj).filter((f): f is NonNullable<typeof f> => !!f),
      })
      message.success('발송했습니다.')
      onSent()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '발송에 실패했습니다.')
    } finally {
      setSending(false)
    }
  }

  const emailRule = {
    validator: (_: unknown, v: string[] | undefined) =>
      (v ?? []).every((a) => /@/.test(a)) ? Promise.resolve() : Promise.reject(new Error('메일 주소 형식이 아닙니다.')),
  }

  return (
    <Modal
      open
      width={760}
      title={`${title} — 보내는 사람: ${address}`}
      onCancel={onClose}
      okText="보내기"
      okButtonProps={{ icon: <SendOutlined />, loading: sending }}
      onOk={() => form.submit()}
      destroyOnClose
      maskClosable={false}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ to, cc, subject, body: '', includeOriginal: originalAttachments > 0 }}
        onFinish={submit}
      >
        <Form.Item name="to" label="받는사람" rules={[{ required: true, message: '받는사람을 입력하세요.' }, emailRule]}>
          <Select mode="tags" tokenSeparators={[',', ';', ' ']} open={false} placeholder="주소 입력 후 Enter" />
        </Form.Item>
        <Form.Item name="cc" label="참조" rules={[emailRule]}>
          <Select mode="tags" tokenSeparators={[',', ';', ' ']} open={false} placeholder="(선택)" />
        </Form.Item>
        <Form.Item name="subject" label="제목">
          <Input />
        </Form.Item>
        <Form.Item name="body" label="본문" extra={orig ? '원문은 본문 아래에 자동으로 인용되어 함께 발송됩니다.' : undefined}>
          <Input.TextArea rows={10} />
        </Form.Item>
        <Form.Item label="첨부">
          <Upload multiple fileList={fileList} beforeUpload={() => false} onChange={({ fileList: l }) => setFileList(l)}>
            <Button icon={<UploadOutlined />}>파일 선택</Button>
          </Upload>
        </Form.Item>
        {originalAttachments > 0 && (
          <Form.Item name="includeOriginal" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>원본 첨부 {originalAttachments}개 포함</Checkbox>
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

export default function MailboxPage() {
  const screens = Grid.useBreakpoint()
  const wide = !!screens.xl // 목록과 읽기 패널을 나란히
  const stackedNav = !screens.md // 메일함 패널을 상단 가로 바로
  const queryClient = useQueryClient()
  const { data: mailboxes, isLoading: mailboxesLoading } = useMailboxes()
  const [address, setAddress] = useState('')
  const [view, setView] = useState<View>('inbox')
  const [page, setPage] = useState(1)
  const [selectedUid, setSelectedUid] = useState<number | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<number[]>([])
  const [compose, setCompose] = useState<ComposeState | null>(null)
  const folder: MailFolder = view === 'receipts' ? 'sent' : view

  useEffect(() => {
    if (!address && mailboxes?.length) setAddress(mailboxes[0].address)
  }, [address, mailboxes])

  const folders = useMailFolders(address)
  const list = useMailMessages(address, folder, page, PAGE_SIZE, view !== 'receipts')
  const detail = useMailMessage(address, folder, selectedUid)

  // 상세 열람 시 서버가 \Seen 을 붙인다 → 목록의 굵기와 폴더 배지를 즉시 맞춘다(목록 재조회 없이).
  const openedUid = detail.data?.uid
  useEffect(() => {
    if (openedUid === undefined) return
    queryClient.setQueriesData<MailMessagePage>({ queryKey: ['mailbox-messages', address, folder] }, (prev) =>
      prev ? { ...prev, items: prev.items.map((m) => (m.uid === openedUid && !m.seen ? { ...m, seen: true } : m)) } : prev,
    )
    queryClient.invalidateQueries({ queryKey: ['mailbox-folders', address] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedUid])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['mailbox-messages', address] })
    queryClient.invalidateQueries({ queryKey: ['mailbox-folders', address] })
    queryClient.invalidateQueries({ queryKey: ['mailbox-receipts', address] })
  }
  const reset = () => {
    setPage(1)
    setSelectedUid(null)
    setSelectedKeys([])
  }
  const switchView = (v: View) => {
    setView(v)
    reset()
  }

  const run = async (fn: () => Promise<unknown>, ok: string, uids: number[] = []) => {
    try {
      await fn()
      message.success(ok)
      setSelectedKeys([])
      if (selectedUid !== null && uids.includes(selectedUid)) setSelectedUid(null)
      refresh()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '처리에 실패했습니다.')
    }
  }
  const markSeen = (seen: boolean) =>
    run(() => setSeen(address, folder, selectedKeys, seen), seen ? '읽음으로 표시했습니다.' : '안읽음으로 표시했습니다.')
  const trash = (uids: number[]) => run(() => moveToTrash(address, folder, uids), `${uids.length}통을 휴지통으로 옮겼습니다.`, uids)
  const restore = (uids: number[]) => run(() => restoreFromTrash(address, uids), `${uids.length}통을 받은메일함으로 복구했습니다.`, uids)
  const purge = (uids: number[]) => run(() => purgeMessages(address, uids), `${uids.length}통을 영구 삭제했습니다.`, uids)
  const confirmEmptyTrash = () =>
    Modal.confirm({
      title: '휴지통을 비울까요?',
      content: '휴지통의 모든 메일이 영구 삭제되며 되돌릴 수 없습니다.',
      okText: '비우기',
      okButtonProps: { danger: true },
      onOk: () => run(async () => emptyTrash(address), '휴지통을 비웠습니다.', selectedUid !== null ? [selectedUid] : []),
    })

  if (!mailboxesLoading && !mailboxes?.length) {
    return <Alert type="warning" showIcon message="설정된 메일함이 없습니다. (ADMIN_MAILBOXES)" />
  }

  const total = list.data?.total ?? 0
  const unseenOf = (key: View) => folders.data?.find((f) => f.key === key)?.unseen ?? 0
  const n = selectedKeys.length

  const nav = (
    <div
      style={{
        display: 'flex',
        flexDirection: stackedNav ? 'row' : 'column',
        flexWrap: 'wrap',
        alignItems: stackedNav ? 'center' : 'stretch',
        gap: stackedNav ? 6 : 4,
      }}
    >
      <Select
        style={{ width: stackedNav ? 240 : '100%', marginBottom: stackedNav ? 0 : 8 }}
        value={address || undefined}
        loading={mailboxesLoading}
        options={(mailboxes ?? []).map((m) => ({ value: m.address, label: m.address }))}
        onChange={(v) => {
          setAddress(v)
          reset()
        }}
      />
      <Button
        type="primary"
        icon={<EditOutlined />}
        block={!stackedNav}
        style={{ marginBottom: stackedNav ? 0 : 12 }}
        onClick={() => setCompose({ mode: 'new' })}
      >
        메일 쓰기
      </Button>
      {NAV.map((f) => {
        const active = view === f.key
        const badge = f.key === 'inbox' ? unseenOf('inbox') : 0
        return (
          <div
            key={f.key}
            onClick={() => switchView(f.key)}
            style={{
              padding: stackedNav ? '6px 10px' : '8px 12px',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              background: active ? 'var(--ant-color-primary-bg)' : 'transparent',
              color: active ? 'var(--ant-color-primary)' : 'var(--ant-color-text-secondary)',
              fontWeight: active ? 600 : 400,
            }}
          >
            {f.icon}
            <span style={{ flex: 1 }}>{f.label}</span>
            {badge > 0 && (
              <Tag color="blue" style={{ margin: 0 }}>
                {badge}
              </Tag>
            )}
          </div>
        )
      })}
    </div>
  )

  const toolbar = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        padding: '8px 12px',
        borderBottom: BORDER,
      }}
    >
      <Space wrap size={6}>
        <Button size="small" icon={<ReloadOutlined />} loading={list.isFetching} onClick={refresh}>
          새로고침
        </Button>
        {view !== 'trash' ? (
          <>
            <Button size="small" disabled={!n} onClick={() => markSeen(true)}>
              읽음
            </Button>
            <Button size="small" disabled={!n} onClick={() => markSeen(false)}>
              안읽음
            </Button>
            <Popconfirm title={`선택한 ${n}통을 휴지통으로 옮길까요?`} onConfirm={() => trash(selectedKeys)} disabled={!n}>
              <Button size="small" danger icon={<DeleteOutlined />} disabled={!n}>
                삭제
              </Button>
            </Popconfirm>
          </>
        ) : (
          <>
            <Button size="small" icon={<UndoOutlined />} disabled={!n} onClick={() => restore(selectedKeys)}>
              복구
            </Button>
            <Popconfirm
              title={`선택한 ${n}통을 영구 삭제할까요? 되돌릴 수 없습니다.`}
              okText="영구 삭제"
              okButtonProps={{ danger: true }}
              onConfirm={() => purge(selectedKeys)}
              disabled={!n}
            >
              <Button size="small" danger disabled={!n}>
                영구 삭제
              </Button>
            </Popconfirm>
            <Button size="small" danger disabled={!total} onClick={confirmEmptyTrash}>
              휴지통 비우기
            </Button>
          </>
        )}
        {n > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {n}통 선택
          </Typography.Text>
        )}
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        총 {total}통{view === 'inbox' && unseenOf('inbox') > 0 ? ` · 안읽음 ${unseenOf('inbox')}` : ''}
      </Typography.Text>
    </div>
  )

  const columns = [
    {
      title: view === 'sent' ? '받는사람' : '보낸사람',
      key: 'party',
      width: 200,
      ellipsis: true,
      render: (_: unknown, r: MailMessageRow) =>
        view === 'sent' ? <span title={r.to}>{r.to || '-'}</span> : <span title={r.from_addr}>{r.from_name || r.from_addr || '-'}</span>,
    },
    {
      title: '제목',
      key: 'subject',
      ellipsis: true,
      render: (_: unknown, r: MailMessageRow) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {r.has_attachments && <PaperClipOutlined style={{ flexShrink: 0 }} />}
          {r.answered && <RollbackOutlined title="답장함" style={{ flexShrink: 0, color: 'var(--ant-color-text-tertiary)' }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.subject || '(제목 없음)'}</span>
        </span>
      ),
    },
    { title: '날짜', dataIndex: 'date', key: 'date', width: 140, render: formatDate },
  ]

  return (
    <>
      {list.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="메일을 불러오지 못했습니다."
          description={list.error instanceof Error ? list.error.message : undefined}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: stackedNav ? 'column' : 'row',
          border: '1px solid var(--ant-color-border)',
          borderRadius: 12,
          background: 'var(--ant-color-bg-container)',
          overflow: 'hidden',
          height: stackedNav ? undefined : 'calc(100dvh - 200px)',
          minHeight: stackedNav ? undefined : 560,
        }}
      >
        <aside
          style={{
            width: stackedNav ? '100%' : 220,
            flexShrink: 0,
            padding: 12,
            borderRight: stackedNav ? undefined : BORDER,
            borderBottom: stackedNav ? BORDER : undefined,
            overflowY: 'auto',
          }}
        >
          {nav}
        </aside>
        <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {view === 'receipts' ? (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <ReadReceiptsPane address={address} />
            </div>
          ) : (
            <>
              {toolbar}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: wide ? 'row' : 'column' }}>
                <div
                  style={{
                    flex: wide ? '0 0 46%' : undefined,
                    minWidth: 0,
                    overflowY: 'auto',
                    borderRight: wide ? BORDER : undefined,
                    borderBottom: wide ? undefined : BORDER,
                  }}
                >
                  <Table<MailMessageRow>
                    rowKey="uid"
                    size="small"
                    style={{ border: 0, borderRadius: 0 }}
                    loading={list.isLoading}
                    columns={columns}
                    dataSource={list.data?.items ?? []}
                    rowSelection={{ selectedRowKeys: selectedKeys, onChange: (keys) => setSelectedKeys(keys as number[]) }}
                    onRow={(r) => ({
                      onClick: () => setSelectedUid(r.uid),
                      style: {
                        cursor: 'pointer',
                        fontWeight: r.seen ? undefined : 600,
                        background: r.uid === selectedUid ? 'var(--ant-color-primary-bg)' : undefined,
                      },
                    })}
                    locale={{ emptyText: <Empty description="메일이 없습니다." /> }}
                    pagination={{
                      current: page,
                      pageSize: PAGE_SIZE,
                      total,
                      size: 'small',
                      showSizeChanger: false,
                      onChange: (p) => {
                        setPage(p)
                        setSelectedKeys([])
                      },
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0, minHeight: wide ? undefined : 360, overflowY: 'auto' }}>
                  <ReaderPane
                    address={address}
                    folder={folder}
                    uid={selectedUid}
                    onCompose={(mode, orig) => setCompose({ mode, orig, origFolder: folder })}
                    onTrash={trash}
                    onRestore={restore}
                  />
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      {compose && (
        <ComposeModal
          address={address}
          compose={compose}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null)
            refresh()
          }}
        />
      )}
    </>
  )
}
