import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Descriptions, Image, Skeleton, Space, Tag } from 'antd'
import dayjs from 'dayjs'
import { useBizAd } from '../../api/biz'

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '대기' },
  APPROVED: { color: 'green', label: '승인됨' },
  REJECTED: { color: 'default', label: '반려됨' },
  STOPPED: { color: 'red', label: '중단됨' },
}

const PROFILE_STATUS_TAG: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: '대기' },
  APPROVED: { color: 'green', label: '승인됨' },
  REJECTED: { color: 'default', label: '반려됨' },
  SUSPENDED: { color: 'red', label: '정지됨' },
}

const TIER_TAG: Record<string, string> = {
  GOLD: 'gold',
  SILVER: 'blue',
  BRONZE: 'volcano',
}

function adPeriod(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return '상시'
  const fmt = (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '—')
  return `${fmt(startsAt)} ~ ${fmt(endsAt)}`
}

export default function BizAdDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: ad, isLoading, isError, error } = useBizAd(id)

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="광고 소재 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !ad) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card title="광고 소재 정보">
        <Space align="start" size={16}>
          {ad.image_url && (
            <Image src={ad.image_url} width={160} height={120} style={{ objectFit: 'cover', borderRadius: 8 }} />
          )}
          <Descriptions column={2} bordered size="small" style={{ flex: 1 }}>
            <Descriptions.Item label="제목" span={2}>{ad.title}</Descriptions.Item>
            <Descriptions.Item label="내용" span={2}>{ad.body ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="게시기간" span={2}>{adPeriod(ad.starts_at, ad.ends_at)}</Descriptions.Item>
            <Descriptions.Item label="파트너">
              {ad.profile_id ? (
                <a onClick={() => navigate(`/biz/accounts/${ad.profile_id}`)}>{ad.partner_name}</a>
              ) : (
                ad.partner_name
              )}
            </Descriptions.Item>
            <Descriptions.Item label="파트너 상태">
              {ad.profile_status ? (
                <Tag color={PROFILE_STATUS_TAG[ad.profile_status]?.color ?? 'default'}>
                  {PROFILE_STATUS_TAG[ad.profile_status]?.label ?? ad.profile_status}
                </Tag>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="심사 상태">
              <Tag color={STATUS_TAG[ad.review_status]?.color ?? 'default'}>
                {STATUS_TAG[ad.review_status]?.label ?? ad.review_status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="반려 사유">{ad.reject_reason ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="노출 등급">
              <Tag color={TIER_TAG[ad.exposure_tier] ?? 'default'}>{ad.exposure_tier}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="과금액 (VND)">{ad.ad_fee.toLocaleString('en-US')}</Descriptions.Item>
            <Descriptions.Item label="등록일" span={2}>{dayjs(ad.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          </Descriptions>
        </Space>
        <Space style={{ marginTop: 16 }}>
          <Button onClick={() => navigate('/biz/ads')}>목록으로</Button>
        </Space>
      </Card>
    </Space>
  )
}
