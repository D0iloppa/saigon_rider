import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Switch, Table, message } from 'antd'
import dayjs from 'dayjs'
import { useNotices, useUpdateNotice, type NoticeRow } from '../../api/cms'

function PublishSwitch({ record }: { record: NoticeRow }) {
  const update = useUpdateNotice(String(record.id))
  return (
    <Switch
      checked={record.is_published}
      loading={update.isPending}
      onClick={(_checked, e) => e.stopPropagation()}
      onChange={(v) =>
        update.mutate(
          { is_published: v },
          { onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.') }
        )
      }
    />
  )
}

function PinnedSwitch({ record }: { record: NoticeRow }) {
  const update = useUpdateNotice(String(record.id))
  return (
    <Switch
      checked={record.is_pinned}
      loading={update.isPending}
      onClick={(_checked, e) => e.stopPropagation()}
      onChange={(v) =>
        update.mutate(
          { is_pinned: v },
          { onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.') }
        )
      }
    />
  )
}

export default function NoticeListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const size = 30

  const { data, isLoading } = useNotices({ page, size })

  const columns = [
    { title: '제목', dataIndex: 'title_vi', key: 'title_vi' },
    { title: '게시', key: 'is_published', width: 80, render: (_: unknown, r: NoticeRow) => <PublishSwitch record={r} /> },
    { title: '고정', key: 'is_pinned', width: 80, render: (_: unknown, r: NoticeRow) => <PinnedSwitch record={r} /> },
    {
      title: '게시일',
      dataIndex: 'published_at',
      key: 'published_at',
      render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" onClick={() => navigate('/cms/notices/new')}>
          신규 공지
        </Button>
      </div>
      <Table<NoticeRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        onRow={(record) => ({ onClick: () => navigate(`/cms/notices/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{
          current: page,
          pageSize: size,
          total: data?.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />
    </>
  )
}
