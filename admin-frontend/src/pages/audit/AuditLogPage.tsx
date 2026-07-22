import { useState } from 'react'
import { Card, Input, Select, Space, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useAuditLogs, type AdminAuditLogRow } from '../../api/auditLogs'

// 실물 grep(`backend/app/routers/admin_api/*.py` 의 `audit(...)` 호출) 으로 확인한 전수 액션 목록.
const ACTION_LABELS: Record<string, string> = {
  LOGIN: '로그인',
  REPORT_STATUS: '신고 상태변경',
  USER_WARN: '유저 경고',
  USER_SUSPEND: '유저 정지',
  USER_BAN: '유저 영구정지',
  USER_LIFT: '유저 제재해제',
  USER_PHONE_RESET: '유저 전화인증 초기화',
  LISTING_HIDE: '매물 비공개',
  LISTING_REMOVE: '매물 삭제',
  LISTING_RESTORE: '매물 복원',
  DM_VIEW: 'DM 열람',
  SUPPORT_REPLY: '고객센터 답변',
  SUPPORT_STATUS: '고객센터 상태변경',
  NOTICE_CREATE: '공지 생성',
  NOTICE_UPDATE: '공지 수정',
  NOTICE_DELETE: '공지 삭제',
  NOTICE_PUBLISH: '공지 게시',
  NOTICE_UNPUBLISH: '공지 게시중단',
  FAQ_CREATE: 'FAQ 생성',
  FAQ_UPDATE: 'FAQ 수정',
  FAQ_DELETE: 'FAQ 삭제',
  FAQ_PUBLISH: 'FAQ 게시',
  FAQ_UNPUBLISH: 'FAQ 게시중단',
  BANNED_KEYWORD_ADD: '금칙어 추가',
  BANNED_KEYWORD_DELETE: '금칙어 삭제',
  ADMIN_ACCOUNT_CREATE: '관리자 계정 생성',
  ADMIN_ACCOUNT_UPDATE: '관리자 계정 수정',
  ADMIN_ACCOUNT_DELETE: '관리자 계정 삭제',
}

const ACTION_OPTIONS = [{ value: '', label: '전체' }, ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))]

export default function AuditLogPage() {
  const [admin, setAdmin] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const size = 30

  const { data, isLoading } = useAuditLogs({ admin: admin || undefined, action: action || undefined, page, size })

  const columns = [
    {
      title: '시각',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '관리자',
      dataIndex: 'admin_username',
      key: 'admin_username',
      render: (v: string, row: AdminAuditLogRow) => (
        <Space>
          {v}
          <Tag color={row.admin_role === 'root' ? 'red' : 'blue'}>{row.admin_role.toUpperCase()}</Tag>
        </Space>
      ),
    },
    {
      title: '액션',
      dataIndex: 'action',
      key: 'action',
      render: (v: string) => <Tag>{ACTION_LABELS[v] ?? v}</Tag>,
    },
    {
      title: '대상',
      key: 'target',
      render: (_: unknown, row: AdminAuditLogRow) =>
        row.target_type ? (
          <Typography.Text>
            {row.target_type}
            {row.target_id ? ` · ${row.target_id}` : ''}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    { title: 'IP', dataIndex: 'ip', key: 'ip', width: 140, render: (v: string | null) => v ?? '-' },
  ]

  return (
    <Card>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="관리자 아이디 검색"
          allowClear
          style={{ width: 220 }}
          onSearch={(v) => {
            setAdmin(v)
            setPage(1)
          }}
        />
        <Select
          style={{ width: 220 }}
          value={action}
          options={ACTION_OPTIONS}
          onChange={(v) => {
            setAction(v)
            setPage(1)
          }}
        />
      </Space>
      <Table<AdminAuditLogRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        expandable={{
          expandedRowRender: (row) => (
            <Typography.Text code style={{ whiteSpace: 'pre-wrap' }}>
              {row.detail ? JSON.stringify(row.detail, null, 2) : '(상세 없음)'}
            </Typography.Text>
          ),
        }}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
    </Card>
  )
}
