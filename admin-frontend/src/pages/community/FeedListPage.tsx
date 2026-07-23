import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Button, Space, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import { useFeedList, type AdminFeedRow } from '../../api/feed'

export default function FeedListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const size = 20

  const { data, isLoading } = useFeedList({ page, size })

  const columns = [
    {
      title: '이미지',
      dataIndex: 'thumbnail_url',
      key: 'thumbnail_url',
      width: 64,
      render: (v: string | null) =>
        v ? <img src={v} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : '-',
    },
    {
      title: '작성자',
      key: 'author',
      render: (_: unknown, r: AdminFeedRow) => (
        <a
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/users/${r.author.id}`)
          }}
        >
          <Space size={6}>
            <Avatar src={r.author.avatar_url} size={24} />
            {r.author.nickname ?? '-'}
          </Space>
        </a>
      ),
    },
    {
      title: '내용',
      dataIndex: 'content',
      key: 'content',
      render: (v: string | null) => (v ? <span style={{ whiteSpace: 'pre-line' }}>{v.slice(0, 60)}</span> : '-'),
    },
    { title: '이미지수', dataIndex: 'image_count', key: 'image_count', width: 80 },
    { title: '좋아요', dataIndex: 'like_count', key: 'like_count', width: 80 },
    { title: '댓글', dataIndex: 'comment_count', key: 'comment_count', width: 80 },
    {
      title: '스토리',
      dataIndex: 'is_story',
      key: 'is_story',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="gold">STORY</Tag> : null),
    },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => navigate('/community/feed/new')}>
          새 피드 작성
        </Button>
      </Space>
      <Table<AdminFeedRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        locale={{ emptyText: '등록된 피드가 없습니다' }}
        onRow={(record) => ({ onClick: () => navigate(`/community/feed/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
    </>
  )
}
