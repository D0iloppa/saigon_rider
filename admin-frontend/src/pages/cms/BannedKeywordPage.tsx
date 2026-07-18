import { useState } from 'react'
import { Alert, Button, Input, Modal, Table, message } from 'antd'
import dayjs from 'dayjs'
import { useAddBannedKeyword, useBannedKeywords, useDeleteBannedKeyword, type BannedKeywordRow } from '../../api/cms'

export default function BannedKeywordPage() {
  const { data, isLoading } = useBannedKeywords()
  const addKeyword = useAddBannedKeyword()
  const deleteKeyword = useDeleteBannedKeyword()
  const [keyword, setKeyword] = useState('')
  const [note, setNote] = useState('')

  const handleAdd = () => {
    if (!keyword.trim()) {
      message.warning('금칙어를 입력하세요.')
      return
    }
    addKeyword.mutate(
      { keyword: keyword.trim(), note: note.trim() || undefined },
      {
        onSuccess: () => {
          message.success('추가되었습니다.')
          setKeyword('')
          setNote('')
        },
        onError: (err) => message.error(err instanceof Error ? err.message : '추가에 실패했습니다.'),
      }
    )
  }

  const columns = [
    { title: '키워드', dataIndex: 'keyword', key: 'keyword' },
    { title: '메모', dataIndex: 'note', key: 'note', render: (v: string | null) => v ?? '-' },
    { title: '등록일', dataIndex: 'created_at', key: 'created_at', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, r: BannedKeywordRow) => (
        <Button
          size="small"
          danger
          onClick={() =>
            Modal.confirm({
              title: '금칙어를 삭제할까요?',
              onOk: () => deleteKeyword.mutate(r.id, { onSuccess: () => message.success('삭제되었습니다.') }),
            })
          }
        >
          삭제
        </Button>
      ),
    },
  ]

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="DM 필터에는 최대 60초 지연 후 반영됩니다 (캐시 TTL)."
        style={{ marginBottom: 16 }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input style={{ width: 200 }} placeholder="금칙어" value={keyword} onChange={(e) => setKeyword(e.target.value)} onPressEnter={handleAdd} />
        <Input style={{ width: 260 }} placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} onPressEnter={handleAdd} />
        <Button type="primary" loading={addKeyword.isPending} onClick={handleAdd}>
          추가
        </Button>
      </div>
      <Table<BannedKeywordRow> rowKey="id" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} />
    </>
  )
}
