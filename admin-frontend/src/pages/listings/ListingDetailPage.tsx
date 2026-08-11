import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Descriptions, Image, Skeleton, Space, Table } from 'antd'
import dayjs from 'dayjs'
import { useListing } from '../../api/listings'
import ListingFlags from '../../components/ListingFlags'
import ModerateModal from '../../components/ModerateModal'
import StatusTag from '../../components/StatusTag'

export default function ListingDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: listing, isLoading, isError, error } = useListing(id)
  const [moderateOpen, setModerateOpen] = useState(false)

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="매물 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !listing) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card title="매물 정보">
        {listing.image_urls.length > 0 && (
          <Image.PreviewGroup>
            <Space style={{ marginBottom: 16 }} wrap>
              {listing.image_urls.map((url) => (
                <Image key={url} src={url} width={96} height={96} style={{ objectFit: 'cover' }} />
              ))}
            </Space>
          </Image.PreviewGroup>
        )}
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="제목" span={2}>
            {listing.title}
          </Descriptions.Item>
          {listing.flags.length > 0 && (
            <Descriptions.Item label="플래그" span={2}>
              <ListingFlags flags={listing.flags} />
            </Descriptions.Item>
          )}
          <Descriptions.Item label="가격">{listing.price_vnd.toLocaleString()}đ</Descriptions.Item>
          <Descriptions.Item label="상태">
            <StatusTag kind="listing" status={listing.status} />
          </Descriptions.Item>
          <Descriptions.Item label="판매자">
            <a onClick={() => navigate(`/users/${listing.seller.id}`)}>{listing.seller.nickname ?? '-'}</a>
          </Descriptions.Item>
          <Descriptions.Item label="등록일">{dayjs(listing.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          {listing.moderated_at && (
            <Descriptions.Item label="조치일" span={2}>
              {dayjs(listing.moderated_at).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="설명" span={2}>
            {listing.description ?? '-'}
          </Descriptions.Item>
        </Descriptions>
        <Space style={{ marginTop: 16 }}>
          <Button onClick={() => setModerateOpen(true)}>조치</Button>
        </Space>
      </Card>

      <Card title="이 매물에 대한 신고">
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={listing.reports}
          locale={{ emptyText: '신고 이력이 없습니다' }}
          onRow={(record) => ({ onClick: () => navigate(`/reports/${record.id}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: '신고자', key: 'reporter', render: (_: unknown, r) => r.reporter.nickname ?? '-' },
            { title: '사유', dataIndex: 'reason', key: 'reason' },
            { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <StatusTag kind="report" status={v} /> },
            {
              title: '접수일',
              dataIndex: 'created_at',
              key: 'created_at',
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
            },
          ]}
        />
      </Card>

      <ModerateModal open={moderateOpen} listingId={id} currentStatus={listing.status} onClose={() => setModerateOpen(false)} />
    </Space>
  )
}
