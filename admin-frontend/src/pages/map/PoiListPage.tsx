import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { usePoiCategories, usePoiList, useUnpublishPoi, type PoiRow } from '../../api/map'

export default function PoiListPage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const size = 20

  const { data: categories } = usePoiCategories()
  const { data, isLoading } = usePoiList({ category: category || undefined, q: q || undefined, page, size })
  const unpublish = useUnpublishPoi()

  const categoryLabel = (code: string) => categories?.find((c) => c.code === code)?.label_ko ?? code

  const columns = [
    {
      title: '사진',
      dataIndex: 'photo_url',
      key: 'photo_url',
      width: 64,
      render: (v: string | null) =>
        v ? <img src={v} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : '-',
    },
    {
      title: '명칭',
      key: 'name',
      render: (_: unknown, r: PoiRow) => (
        <div>
          <div>{r.name_ko}</div>
          {(r.name_vi || r.name_en) && (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{[r.name_vi, r.name_en].filter(Boolean).join(' / ')}</div>
          )}
        </div>
      ),
    },
    { title: '카테고리', dataIndex: 'category', key: 'category', render: categoryLabel },
    {
      title: '좌표',
      key: 'coords',
      render: (_: unknown, r: PoiRow) => `${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}`,
    },
    {
      title: '게시상태',
      dataIndex: 'published',
      key: 'published',
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '게시중' : '게시해제'}</Tag>,
    },
    {
      title: '등록일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_: unknown, r: PoiRow) => (
        <Space onClick={(e) => e.stopPropagation()}>
          <a onClick={() => navigate(`/map/poi/${r.id}`)}>수정</a>
          {r.published && (
            <Popconfirm
              title="게시를 해제하시겠습니까?"
              onConfirm={() =>
                unpublish.mutate(r.id, {
                  onSuccess: () => message.success('게시가 해제되었습니다.'),
                  onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
                })
              }
              okText="해제"
              cancelText="취소"
            >
              <a>게시해제</a>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="명칭 검색"
          allowClear
          style={{ width: 280 }}
          onSearch={(v) => {
            setQ(v)
            setPage(1)
          }}
        />
        <Select
          style={{ width: 180 }}
          value={category}
          options={[{ value: '', label: '전체 카테고리' }, ...(categories ?? []).map((c) => ({ value: c.code, label: c.label_ko }))]}
          onChange={(v) => {
            setCategory(v)
            setPage(1)
          }}
        />
        <Button type="primary" onClick={() => navigate('/map/poi/new')}>
          신규 등록
        </Button>
      </Space>
      <Table<PoiRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        locale={{ emptyText: '등록된 POI가 없습니다' }}
        onRow={(record) => ({ onClick: () => navigate(`/map/poi/${record.id}`), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: size, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
      />
    </>
  )
}
