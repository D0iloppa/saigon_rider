import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  message,
} from 'antd'
import dayjs from 'dayjs'
import {
  useApproveContract,
  useBizContract,
  useBizPaymentWiring,
  useCancelContract,
  useCloseRefundedContract,
  useCreateContractDeposit,
  useRailRefundContract,
  useRailSyncContract,
  type BizDepositRow,
} from '../../api/biz'

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '초안' },
  accepted: { color: 'default', label: '입금안내 미발급' },
  awaiting_payment: { color: 'gold', label: '입금대기' },
  partially_paid: { color: 'orange', label: '부분입금' },
  paid: { color: 'blue', label: '완납대기' },
  active: { color: 'green', label: '활성' },
  cancelled: { color: 'default', label: '취소' },
  refunded: { color: 'red', label: '환불' },
}

const SOURCE_TAG: Record<string, { color: string; label: string }> = {
  manual: { color: 'default', label: '수동' },
  toss: { color: 'blue', label: '토스' },
  csv: { color: 'default', label: 'CSV' },
  bank_feed: { color: 'default', label: '은행연동' },
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : '처리에 실패했습니다.'
}

export default function BizContractDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: contract, isLoading, isError, error } = useBizContract(id)
  const { data: wiring } = useBizPaymentWiring()

  const createDepositMutation = useCreateContractDeposit()
  const approveMutation = useApproveContract()
  const cancelMutation = useCancelContract()
  const closeRefundedMutation = useCloseRefundedContract()
  const railSyncMutation = useRailSyncContract()
  const railRefundMutation = useRailRefundContract()

  const [depositForm] = Form.useForm()
  const [approveReason, setApproveReason] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [refundCloseOpen, setRefundCloseOpen] = useState(false)
  const [refundCloseReason, setRefundCloseReason] = useState('')
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncRef, setSyncRef] = useState('')
  const [refundTarget, setRefundTarget] = useState<BizDepositRow | null>(null)
  const [refundAmount, setRefundAmount] = useState<number | null>(null)
  const [refundReason, setRefundReason] = useState('')

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="계약 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !contract) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    )
  }

  const canApprove = contract.status === 'paid' || contract.status === 'partially_paid'
  const canCancel = contract.status !== 'active' && contract.status !== 'refunded'
  const canCloseRefunded = contract.status === 'active'
  const canRailSync = !!wiring?.toss.ready && contract.status !== 'cancelled' && contract.status !== 'refunded'

  const submitDeposit = () => {
    depositForm.validateFields().then((values) => {
      createDepositMutation.mutate(
        {
          contractId: contract.id,
          input: {
            kind: values.kind,
            amount_vnd: values.amount_vnd,
            paid_at: (values.paid_at as dayjs.Dayjs).toISOString(),
            payer_name: values.payer_name || null,
            bank_ref: values.bank_ref || null,
            note: values.note || null,
          },
        },
        {
          onSuccess: () => {
            message.success('입금건을 등록했습니다.')
            depositForm.resetFields()
          },
          onError: (err) => message.error(errMsg(err)),
        }
      )
    })
  }

  const depositColumns = [
    { title: '구분', dataIndex: 'kind', key: 'kind', render: (v: string) => (v === 'refund' ? <Tag color="red">환불</Tag> : <Tag color="green">입금</Tag>) },
    {
      title: '경로',
      dataIndex: 'source',
      key: 'source',
      render: (v: string) => <Tag color={SOURCE_TAG[v]?.color ?? 'default'}>{SOURCE_TAG[v]?.label ?? v}</Tag>,
    },
    {
      title: '금액(VND)',
      dataIndex: 'amount_vnd',
      key: 'amount_vnd',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString('en-US'),
    },
    {
      title: '청구 스냅샷',
      key: 'charge_snapshot',
      render: (_: unknown, r: BizDepositRow) =>
        r.source === 'toss' && r.charge_snapshot ? (
          <span>
            {String(r.charge_snapshot.currency ?? 'KRW')} {Number(r.charge_snapshot.value ?? 0).toLocaleString('en-US')}
          </span>
        ) : (
          '-'
        ),
    },
    { title: '입금일', dataIndex: 'paid_at', key: 'paid_at', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    { title: '입금자명', dataIndex: 'payer_name', key: 'payer_name', render: (v: string | null) => v ?? '-' },
    { title: '참조', dataIndex: 'bank_ref', key: 'bank_ref', render: (v: string | null) => v ?? '-' },
    { title: '메모', dataIndex: 'note', key: 'note', render: (v: string | null) => v ?? '-' },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, r: BizDepositRow) =>
        r.source === 'toss' && r.kind === 'deposit' ? (
          <a
            onClick={() => {
              setRefundTarget(r)
              setRefundAmount(null)
              setRefundReason('')
            }}
          >
            카드환불
          </a>
        ) : null,
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ display: 'flex' }}>
      <Card title="계약 정보">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="결제코드" span={2}>{contract.payment_code}</Descriptions.Item>
          <Descriptions.Item label="광고">
            <a onClick={() => navigate(`/biz/ads/${contract.ad_id}`)}>{contract.ad_title}</a>
          </Descriptions.Item>
          <Descriptions.Item label="파트너">{contract.partner_name}</Descriptions.Item>
          <Descriptions.Item label="상태">
            <Tag color={STATUS_TAG[contract.status]?.color ?? 'default'}>{STATUS_TAG[contract.status]?.label ?? contract.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="기간(월)">{contract.months}</Descriptions.Item>
          <Descriptions.Item label="청구액(VND)">{contract.amount_vnd.toLocaleString('en-US')}</Descriptions.Item>
          <Descriptions.Item label="입금기한">
            {contract.due_at ? (
              <span style={{ color: contract.overdue ? '#dc2626' : undefined }}>
                {dayjs(contract.due_at).format('YYYY-MM-DD')}
                {contract.overdue ? ' (초과)' : ''}
              </span>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="서명자">{contract.signer_name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="계약 확정일">{contract.accepted_at ? dayjs(contract.accepted_at).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="승인 정보">
            {contract.approved_at ? `${dayjs(contract.approved_at).format('YYYY-MM-DD HH:mm')} (${contract.approved_by ?? '-'})` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="확정 이용기간">
            {contract.period_start && contract.period_end
              ? `${dayjs(contract.period_start).format('YYYY-MM-DD')} ~ ${dayjs(contract.period_end).format('YYYY-MM-DD')}`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="예상 이용기간">
            {contract.projected_period_start && contract.projected_period_end
              ? `${dayjs(contract.projected_period_start).format('YYYY-MM-DD')} ~ ${dayjs(contract.projected_period_end).format('YYYY-MM-DD')}`
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="종결 사유" span={2}>{contract.closed_reason ?? '-'}</Descriptions.Item>
        </Descriptions>

        <Space style={{ marginTop: 16 }} wrap>
          <Button onClick={() => navigate('/biz/contracts')}>목록으로</Button>
          {canApprove && (
            <Popconfirm
              title="이 계약을 승인하시겠습니까?"
              description={contract.status === 'partially_paid' ? '부분 승인이며 사유가 필요합니다.' : undefined}
              okText="승인"
              cancelText="취소"
              onConfirm={() =>
                approveMutation.mutate(
                  { contractId: contract.id, reason: approveReason || undefined },
                  {
                    onSuccess: () => message.success('승인되었습니다.'),
                    onError: (err) => message.error(errMsg(err)),
                  }
                )
              }
            >
              <Button type="primary" loading={approveMutation.isPending}>
                승인
              </Button>
            </Popconfirm>
          )}
          {contract.status === 'partially_paid' && (
            <Input
              style={{ width: 220 }}
              placeholder="부분 승인 사유 (필수)"
              value={approveReason}
              onChange={(e) => setApproveReason(e.target.value)}
            />
          )}
          {canCancel && (
            <Button danger onClick={() => setCancelOpen(true)}>
              취소
            </Button>
          )}
          {canCloseRefunded && (
            <Button danger onClick={() => setRefundCloseOpen(true)}>
              환불 종결
            </Button>
          )}
          {canRailSync && <Button onClick={() => setSyncOpen(true)}>카드 결제 재동기화</Button>}
        </Space>
      </Card>

      <Card title={`대조 결과 (${contract.reconcile.status})`}>
        <Descriptions column={3} bordered size="small">
          <Descriptions.Item label="입금액(VND)">{contract.reconcile.received_vnd.toLocaleString('en-US')}</Descriptions.Item>
          <Descriptions.Item label="청구액(VND)">{contract.reconcile.expected_vnd.toLocaleString('en-US')}</Descriptions.Item>
          <Descriptions.Item label="부족액(VND)">{contract.reconcile.shortfall_vnd.toLocaleString('en-US')}</Descriptions.Item>
          <Descriptions.Item label="초과액(VND)">{contract.reconcile.overpaid_vnd.toLocaleString('en-US')}</Descriptions.Item>
          <Descriptions.Item label="플래그" span={2}>
            {contract.reconcile.flags.length ? contract.reconcile.flags.map((f) => <Tag key={f}>{f}</Tag>) : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="입금건">
        <Table<BizDepositRow>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={contract.deposits}
          columns={depositColumns}
          locale={{ emptyText: '등록된 입금건이 없습니다.' }}
        />

        <Divider />

        <Form form={depositForm} layout="inline" initialValues={{ kind: 'deposit', paid_at: dayjs() }}>
          <Form.Item name="kind" rules={[{ required: true }]}>
            <Select
              style={{ width: 100 }}
              options={[
                { value: 'deposit', label: '입금' },
                { value: 'refund', label: '환불' },
              ]}
            />
          </Form.Item>
          <Form.Item name="amount_vnd" rules={[{ required: true, message: '금액을 입력하세요' }]}>
            <InputNumber style={{ width: 160 }} placeholder="금액(VND)" min={1} />
          </Form.Item>
          <Form.Item name="paid_at" rules={[{ required: true, message: '입금일을 선택하세요' }]}>
            <DatePicker showTime placeholder="입금일시" />
          </Form.Item>
          <Form.Item name="payer_name">
            <Input placeholder="입금자명" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="bank_ref">
            <Input placeholder="참조번호" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="메모" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" loading={createDepositMutation.isPending} onClick={submitDeposit}>
              입금건 등록
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Modal
        title="계약 취소"
        open={cancelOpen}
        onOk={() => {
          if (!cancelReason.trim()) {
            message.warning('취소 사유를 입력하세요.')
            return
          }
          cancelMutation.mutate(
            { contractId: contract.id, reason: cancelReason.trim() },
            {
              onSuccess: () => {
                message.success('취소되었습니다.')
                setCancelOpen(false)
                setCancelReason('')
              },
              onError: (err) => message.error(errMsg(err)),
            }
          )
        }}
        onCancel={() => setCancelOpen(false)}
        confirmLoading={cancelMutation.isPending}
        okText="취소 처리"
        cancelText="닫기"
      >
        <Input.TextArea rows={3} placeholder="취소 사유 (필수)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
      </Modal>

      <Modal
        title="환불 종결"
        open={refundCloseOpen}
        onOk={() => {
          if (!refundCloseReason.trim()) {
            message.warning('환불 종결 사유를 입력하세요.')
            return
          }
          closeRefundedMutation.mutate(
            { contractId: contract.id, reason: refundCloseReason.trim() },
            {
              onSuccess: () => {
                message.success('환불 종결되었습니다.')
                setRefundCloseOpen(false)
                setRefundCloseReason('')
              },
              onError: (err) => message.error(errMsg(err)),
            }
          )
        }}
        onCancel={() => setRefundCloseOpen(false)}
        confirmLoading={closeRefundedMutation.isPending}
        okText="환불 종결"
        cancelText="닫기"
      >
        <Input.TextArea
          rows={3}
          placeholder="환불 종결 사유 (필수, 환불액=입금액 이어야 합니다)"
          value={refundCloseReason}
          onChange={(e) => setRefundCloseReason(e.target.value)}
        />
      </Modal>

      <Modal
        title="카드 결제 재동기화"
        open={syncOpen}
        onOk={() => {
          if (!syncRef.trim()) {
            message.warning('토스 paymentKey 를 입력하세요.')
            return
          }
          railSyncMutation.mutate(
            { contractId: contract.id, ref: syncRef.trim() },
            {
              onSuccess: () => {
                message.success('결제 정보를 복구했습니다.')
                setSyncOpen(false)
                setSyncRef('')
              },
              onError: (err) => message.error(errMsg(err)),
            }
          )
        }}
        onCancel={() => setSyncOpen(false)}
        confirmLoading={railSyncMutation.isPending}
        okText="재동기화"
        cancelText="닫기"
      >
        <Input placeholder="토스 paymentKey" value={syncRef} onChange={(e) => setSyncRef(e.target.value)} />
      </Modal>

      <Modal
        title="카드 결제 환불"
        open={refundTarget !== null}
        onOk={() => {
          if (!refundTarget) return
          if (!refundReason.trim()) {
            message.warning('환불 사유를 입력하세요.')
            return
          }
          railRefundMutation.mutate(
            { contractId: contract.id, depositId: refundTarget.id, amountVnd: refundAmount, reason: refundReason.trim() },
            {
              onSuccess: () => {
                message.success('환불 처리되었습니다.')
                setRefundTarget(null)
                setRefundAmount(null)
                setRefundReason('')
              },
              onError: (err) => message.error(errMsg(err)),
            }
          )
        }}
        onCancel={() => setRefundTarget(null)}
        confirmLoading={railRefundMutation.isPending}
        okText="환불"
        cancelText="닫기"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <InputNumber
            style={{ width: '100%' }}
            placeholder={`환불액(VND, 비워두면 전액 ${refundTarget?.amount_vnd.toLocaleString('en-US') ?? ''})`}
            min={1}
            max={refundTarget?.amount_vnd}
            value={refundAmount ?? undefined}
            onChange={(v) => setRefundAmount(v)}
          />
          <Input.TextArea rows={3} placeholder="환불 사유 (필수)" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
        </Space>
      </Modal>
    </Space>
  )
}
