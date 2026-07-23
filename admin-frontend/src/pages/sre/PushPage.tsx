import { useState } from 'react'
import { Button, Input, Modal, Radio, Select, Table, message } from 'antd'
import { usePushHistory, usePushUsers, useSendPush, type PushHistoryRow } from '../../api/push'

const { TextArea } = Input

// legacy admin-legacy/push.html 과 동일 (parity) — 전체/개인 발송 모드
function formatSentAt(sentAt: string): string {
  if (sentAt && /^\d+$/.test(sentAt)) {
    return new Date(Number(sentAt) * 1000).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return sentAt
}

export default function PushPage() {
  const [mode, setMode] = useState<'broadcast' | 'individual'>('broadcast')
  const [userIds, setUserIds] = useState<number[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const { data: users, isLoading: usersLoading } = usePushUsers()
  const { data: history, isLoading: historyLoading } = usePushHistory()
  const sendPush = useSendPush()

  const userOptions = (users ?? []).map((u) => ({
    value: u.user_id,
    label: u.nickname ? `#${u.user_id} ${u.nickname}` : `#${u.user_id} (${u.external_user_uuid.slice(0, 8)}…)`,
  }))

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      message.warning('제목과 내용을 입력해주세요.')
      return
    }
    if (mode === 'individual' && !userIds.length) {
      message.warning('수신인을 선택해주세요.')
      return
    }

    const confirmMsg = mode === 'broadcast' ? '전체 사용자에게 푸시를 발송합니다. 계속할까요?' : `${userIds.length}명에게 푸시를 발송합니다. 계속할까요?`
    Modal.confirm({
      title: confirmMsg,
      okText: '발송',
      cancelText: '취소',
      onOk: () =>
        sendPush.mutate(
          { title: title.trim(), body: body.trim(), mode, ...(mode === 'individual' ? { user_ids: userIds } : {}) },
          {
            onSuccess: (result) => {
              message.success(`발송 완료 — 성공: ${result.sent_count ?? 0}, 실패: ${result.failed_count ?? 0}`)
              setTitle('')
              setBody('')
              setUserIds([])
            },
            onError: (err) => message.error(err instanceof Error ? err.message : '발송에 실패했습니다.'),
          },
        ),
    })
  }

  const columns = [
    { title: '시간', key: 'sent_at', render: (_: unknown, r: PushHistoryRow) => formatSentAt(r.sent_at) },
    { title: '제목', dataIndex: 'title', key: 'title' },
    { title: '모드', key: 'mode', render: (_: unknown, r: PushHistoryRow) => (r.mode === 'broadcast' ? '전체' : '개인') },
    { title: '성공', dataIndex: 'sent_count', key: 'sent_count' },
    { title: '실패', dataIndex: 'failed_count', key: 'failed_count' },
    { title: '발송자', dataIndex: 'sender', key: 'sender' },
  ]

  return (
    <>
      <div style={{ background: 'rgba(0,0,0,.02)', border: '1px solid rgba(0,0,0,.06)', borderRadius: 8, padding: 24, marginBottom: 16 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 8 }}>발송 모드</div>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
            <Radio value="broadcast">전체 발송</Radio>
            <Radio value="individual">개인 발송</Radio>
          </Radio.Group>
        </div>

        {mode === 'individual' && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 8 }}>수신인</div>
            <Select
              mode="multiple"
              placeholder="유저 검색 (닉네임 / ID)"
              style={{ width: '100%' }}
              loading={usersLoading}
              value={userIds}
              onChange={setUserIds}
              options={userOptions}
              optionFilterProp="label"
            />
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 8 }}>제목</div>
          <Input placeholder="푸시 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 8 }}>내용</div>
          <TextArea placeholder="푸시 내용" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <Button type="primary" onClick={handleSend} loading={sendPush.isPending}>
          발송
        </Button>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>최근 발송 이력</div>
      <Table<PushHistoryRow> rowKey={(r) => `${r.sent_at}-${r.title}`} loading={historyLoading} columns={columns} dataSource={history ?? []} pagination={false} />
    </>
  )
}
