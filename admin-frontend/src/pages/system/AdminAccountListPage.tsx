import { useEffect, useState } from 'react'
import { Button, Input, Modal, Select, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import {
  useAdminAccounts,
  useCreateAdminAccount,
  useDeleteAdminAccount,
  useUpdateAdminAccount,
  type AdminAccountRow,
  type AdminRole,
} from '../../api/accounts'

export default function AdminAccountListPage() {
  const { data, isLoading } = useAdminAccounts()
  const deleteAccount = useDeleteAdminAccount()
  const [editing, setEditing] = useState<AdminAccountRow | 'new' | null>(null)

  const columns = [
    { title: '아이디', dataIndex: 'username', key: 'username', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    { title: '권한', dataIndex: 'role', key: 'role', width: 120, render: (v: AdminRole) => <Tag color={v === 'admin' ? 'blue' : 'default'}>{v.toUpperCase()}</Tag> },
    { title: '메모', dataIndex: 'note', key: 'note', render: (v: string | null) => v ?? '-' },
    { title: '등록일', dataIndex: 'created_at', key: 'created_at', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    { title: '수정일', dataIndex: 'updated_at', key: 'updated_at', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_: unknown, r: AdminAccountRow) => (
        <>
          <Button size="small" onClick={() => setEditing(r)}>
            수정
          </Button>
          <Button
            size="small"
            danger
            style={{ marginLeft: 8 }}
            onClick={() =>
              Modal.confirm({
                title: `${r.username} 관리자를 삭제할까요?`,
                onOk: () => deleteAccount.mutate(r.id, { onSuccess: () => message.success('삭제되었습니다.') }),
              })
            }
          >
            삭제
          </Button>
        </>
      ),
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" onClick={() => setEditing('new')}>
          관리자 추가
        </Button>
      </div>
      <Table<AdminAccountRow> rowKey="id" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} />
      {editing && <AdminAccountModal target={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function AdminAccountModal({ target, onClose }: { target: AdminAccountRow | 'new'; onClose: () => void }) {
  const isNew = target === 'new'
  const [username, setUsername] = useState(isNew ? '' : target.username)
  const [role, setRole] = useState<AdminRole>(isNew ? 'manager' : target.role)
  const [note, setNote] = useState(isNew ? '' : target.note ?? '')
  const [password, setPassword] = useState('')
  const createAccount = useCreateAdminAccount()
  const updateAccount = useUpdateAdminAccount()

  useEffect(() => {
    setUsername(isNew ? '' : target.username)
    setRole(isNew ? 'manager' : target.role)
    setNote(isNew ? '' : target.note ?? '')
    setPassword('')
  }, [target, isNew])

  const handleOk = () => {
    if (isNew && !username.trim()) {
      message.warning('아이디를 입력하세요.')
      return
    }
    if (isNew && password.length < 6) {
      message.warning('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    if (!isNew && password && password.length < 6) {
      message.warning('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    const onSuccess = () => {
      message.success('저장되었습니다.')
      onClose()
    }
    const onError = (err: unknown) => message.error(err instanceof Error ? err.message : '저장에 실패했습니다.')
    if (isNew) {
      createAccount.mutate({ username: username.trim(), password, role, note: note.trim() || undefined }, { onSuccess, onError })
    } else {
      updateAccount.mutate({ id: target.id, body: { role, note: note.trim() || undefined, password: password || undefined } }, { onSuccess, onError })
    }
  }

  return (
    <Modal
      title={isNew ? '관리자 추가' : '관리자 수정'}
      open
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={createAccount.isPending || updateAccount.isPending}
      okText="저장"
      cancelText="취소"
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Input placeholder="아이디 (영문/숫자/._- 3~50자)" value={username} disabled={!isNew} onChange={(e) => setUsername(e.target.value)} />
        <Select
          value={role}
          onChange={setRole}
          options={[
            { value: 'manager', label: 'MANAGER — 계정관리·감사로그 제외 전체' },
            { value: 'admin', label: 'ADMIN — root 동등 (계정관리·감사로그 포함)' },
          ]}
        />
        <Input placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Input.Password
          placeholder={isNew ? '비밀번호 (6자 이상)' : '비밀번호 변경 시에만 입력 (6자 이상)'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
    </Modal>
  )
}
