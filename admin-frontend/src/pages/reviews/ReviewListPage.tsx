import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Input, Select, Space, Table, Tabs, Tag } from 'antd'
import dayjs from 'dayjs'
import { useReviewList, type ReviewListRow } from '../../api/reviews'

const RATING_OPTIONS = [
  { value: '', label: '별점 전체' },
  { value: '1', label: '1점 이하' },
  { value: '2', label: '2점 이하' },
  { value: '3', label: '3점 이하' },
]

const HIDDEN_OPTIONS = [
  { value: '', label: '숨김 상태 전체' },
  { value: 'true', label: '숨김' },
  { value: 'false', label: '노출' },
]

export default function ReviewListPage() {
  const navigate = useNavigate()
  // 필터는 URL query 에 둔다 — 상세에서 '목록으로' 시 그대로 복원된다.
  const [searchParams, setSearchParams] = useSearchParams()
  const kind = searchParams.get('kind') === 'biz' ? 'biz' : 'market'
  const maxRating = searchParams.get('max_rating') ?? ''
  const hidden = searchParams.get('hidden') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page')) || 1
  const size = 20

  const update = (patch: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(searchParams)
    if (resetPage) next.delete('page')
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setSearchParams(next)
  }

  const isBiz = kind === 'biz'
  const { data, isLoading } = useReviewList({
    kind,
    max_rating: maxRating ? Number(maxRating) : undefined,
    hidden: isBiz && hidden ? (hidden as 'true' | 'false') : undefined,
    q: q || undefined,
    page,
    size,
  })

  const userLink = (u?: { id: string; nickname: string | null }) =>
    u ? (
      <Link to={`/users/${u.id}`} onClick={(e) => e.stopPropagation()}>
        {u.nickname ?? '-'}
      </Link>
    ) : (
      '-'
    )

  const columns = [
    { title: '별점', dataIndex: 'rating', key: 'rating', width: 70, render: (v: number) => `★${v}` },
    { title: '내용', dataIndex: 'text', key: 'text', ellipsis: true, render: (v: string | null) => v ?? '-' },
    { title: '작성자', key: 'reviewer', render: (_: unknown, r: ReviewListRow) => userLink(r.reviewer) },
    ...(isBiz
      ? [
          { title: '업체', key: 'business', render: (_: unknown, r: ReviewListRow) => r.business?.name ?? '-' },
          {
            title: '숨김',
            key: 'hidden',
            width: 80,
            render: (_: unknown, r: ReviewListRow) => (r.hidden_at ? <Tag color="red">숨김</Tag> : <Tag>노출</Tag>),
          },
        ]
      : [
          { title: '받는 사람', key: 'target', render: (_: unknown, r: ReviewListRow) => userLink(r.target) },
          {
            title: '매물',
            key: 'listing',
            render: (_: unknown, r: ReviewListRow) =>
              r.listing ? <Link to={`/listings/${r.listing.id}`}>{r.listing.title}</Link> : '-',
          },
        ]),
    {
      title: kind === 'biz' ? '최종 수정일' : '작성일',
      key: 'created_at',
      width: 150,
      render: (_: unknown, r: ReviewListRow) => dayjs(r.updated_at ?? r.created_at).format('YYYY-MM-DD HH:mm'),
    },
  ]

  return (
    <>
      <Tabs
        activeKey={kind}
        onChange={(k) => update({ kind: k === 'biz' ? 'biz' : '', hidden: '' })}
        items={[
          { key: 'market', label: '거래 후기' },
          { key: 'biz', label: '업체 후기' },
        ]}
      />
      <Space style={{ marginBottom: 16 }} wrap>
        <Select style={{ width: 130 }} value={maxRating} options={RATING_OPTIONS} onChange={(v) => update({ max_rating: v })} />
        {isBiz && <Select style={{ width: 160 }} value={hidden} options={HIDDEN_OPTIONS} onChange={(v) => update({ hidden: v })} />}
        <Input.Search
          key={`${kind}-${q}`}
          allowClear
          style={{ width: 260 }}
          placeholder="내용 검색"
          defaultValue={q}
          onSearch={(v) => update({ q: v.trim() })}
        />
      </Space>
      <Table<ReviewListRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        onRow={(record) =>
          isBiz ? { onClick: () => navigate(`/reviews/${record.id}`), style: { cursor: 'pointer' } } : {}
        }
        pagination={{
          current: page,
          pageSize: size,
          total: data?.total ?? 0,
          onChange: (p) => update({ page: String(p) }, false),
          showSizeChanger: false,
        }}
      />
    </>
  )
}
