import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Descriptions, Empty, Input, List, Skeleton, Space, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useAddTransactionMemo, useTransaction } from '../../api/transactions'
import StatusTag from '../../components/StatusTag'

/** F033 — 수동 QR 거래 상세. 조회 + 운영자 메모만 가능하다.
 *  payment_status 를 바꾸는 버튼은 의도적으로 없다(설계: 플랫폼은 결제를 보증하지 않는다).
 *  QR 이미지는 노출하지 않는다 — 등록 여부만 표시(qr_registered). */
export default function TransactionDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: tx, isLoading, isError, error } = useTransaction(id)
  const addMemo = useAddTransactionMemo(id)
  const [note, setNote] = useState('')

  const submitMemo = () => {
    if (!note.trim()) return
    addMemo.mutate(note.trim(), {
      onSuccess: () => {
        message.success('메모를 저장했습니다.')
        setNote('')
      },
      onError: (err) => message.error(err instanceof Error ? err.message : '메모 저장에 실패했습니다.'),
    })
  }

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="거래 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !tx) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card title="거래 정보">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="매물" span={2}>
            <a onClick={() => navigate(`/listings/${tx.listing_id}`)}>{tx.listing_title}</a>
          </Descriptions.Item>
          <Descriptions.Item label="상태">
            <StatusTag kind="transaction" status={tx.payment_status} />
          </Descriptions.Item>
          <Descriptions.Item label="약속 상태">{tx.appointment_status}</Descriptions.Item>
          <Descriptions.Item label="금액">{tx.amount_vnd.toLocaleString()}đ</Descriptions.Item>
          <Descriptions.Item label="결제 수단">{tx.payment_method}</Descriptions.Item>
          <Descriptions.Item label="판매자">
            <a onClick={() => navigate(`/users/${tx.seller.id}`)}>{tx.seller.nickname ?? '-'}</a>
          </Descriptions.Item>
          <Descriptions.Item label="구매자">
            <a onClick={() => navigate(`/users/${tx.buyer.id}`)}>{tx.buyer.nickname ?? '-'}</a>
          </Descriptions.Item>
          <Descriptions.Item label="결제 QR 등록">
            <Tag color={tx.qr_registered ? 'blue' : 'default'}>{tx.qr_registered ? '등록됨' : '미등록'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="약속일시">{dayjs(tx.when_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="구매자 입금신고">
            {tx.buyer_reported_at ? dayjs(tx.buyer_reported_at).format('YYYY-MM-DD HH:mm') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="판매자 수령확인">
            {tx.seller_confirmed_at ? dayjs(tx.seller_confirmed_at).format('YYYY-MM-DD HH:mm') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="생성일">{dayjs(tx.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="운영자 메모">
        <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
          조회 참고용 메모입니다. 여기서는 입금 상태를 변경하지 않습니다.
        </Typography.Paragraph>
        <List
          size="small"
          dataSource={tx.memos}
          locale={{ emptyText: <Empty description="메모가 없습니다" /> }}
          renderItem={(memo) => (
            <List.Item>
              <List.Item.Meta
                title={memo.admin_username}
                description={dayjs(memo.created_at).format('YYYY-MM-DD HH:mm')}
              />
              <div>{memo.note}</div>
            </List.Item>
          )}
        />
        <Space.Compact style={{ width: '100%', marginTop: 16 }}>
          <Input.TextArea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모를 입력하세요"
          />
        </Space.Compact>
        <Button
          type="primary"
          style={{ marginTop: 8 }}
          disabled={!note.trim()}
          loading={addMemo.isPending}
          onClick={submitMemo}
        >
          메모 저장
        </Button>
      </Card>
    </Space>
  )
}
