import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Popconfirm, Space, Table, Tag, Tooltip, message } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import {
  useDealerCandidates,
  useNudgeDealerCandidate,
  type DealerCandidateRow,
  type DealerCandidateSignals,
} from '../../api/listings'

// 016 §4-5 #40, D-33=(a) — 업자 후보는 제재 대상이 아니라 비즈 프로필 전환 유도 대상이다.
// 이 화면에는 숨김/정지/삭제 등 제재 액션이 없다 — "안내 발송(nudge)"이 유일한 액션이다.
const SIGNAL_LABELS: Record<keyof DealerCandidateSignals, string> = {
  registration_velocity: '등록 속도',
  same_category_repeat: '동일 카테고리 반복',
  multi_district: '다지역 게재',
}

const SIGNAL_TOOLTIP =
  '등록 속도: 최근 7일 내 신규 등록 5건 이상 · 동일 카테고리 반복: 같은 카테고리 매물 3건 이상 동시 보유 ' +
  '· 다지역 게재: 서로 다른 구에 2건 이상 게재. 2개 이상 신호가 충족될 때만 후보로 표시합니다(단일 신호는 오탐 위험).'

export default function DealerCandidatesPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useDealerCandidates()
  const nudgeMutation = useNudgeDealerCandidate()
  // 백엔드가 nudge 중복 발송 여부를 추적/응답하지 않아(갭) 세션 내 발송 여부만 화면에서 표시한다.
  const [nudgedIds, setNudgedIds] = useState<Set<string>>(new Set())

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="업자 후보 목록을 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    {
      title: '판매자',
      key: 'seller',
      render: (_: unknown, r: DealerCandidateRow) => (
        <a onClick={() => navigate(`/users/${r.seller_id}`)}>{r.seller_nickname ?? '-'}</a>
      ),
    },
    { title: '활성 매물 수', dataIndex: 'active_listing_count', key: 'active_listing_count', width: 110 },
    {
      title: (
        <>
          판정 신호{' '}
          <Tooltip title={SIGNAL_TOOLTIP}>
            <InfoCircleOutlined />
          </Tooltip>
        </>
      ),
      key: 'signals',
      render: (_: unknown, r: DealerCandidateRow) => (
        <Space size={4} wrap>
          {(Object.keys(SIGNAL_LABELS) as (keyof DealerCandidateSignals)[])
            .filter((key) => r.signals[key])
            .map((key) => (
              <Tag key={key} className="admin-status admin-status-warning">
                {SIGNAL_LABELS[key]}
              </Tag>
            ))}
        </Space>
      ),
    },
    { title: '신호 개수', dataIndex: 'signal_count', key: 'signal_count', width: 90 },
    {
      title: (
        <>
          사업자 어휘 언급{' '}
          <Tooltip title='"bảo hành"(보증)·"trả góp"(할부) 등 사업자가 흔히 쓰는 표현 언급 건수 — 참고용이며 후보 판정에는 반영되지 않습니다.'>
            <InfoCircleOutlined />
          </Tooltip>
        </>
      ),
      dataIndex: 'biz_vocab_count',
      key: 'biz_vocab_count',
      width: 130,
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_: unknown, r: DealerCandidateRow) =>
        nudgedIds.has(r.seller_id) ? (
          <Tooltip title="서버가 중복 발송 여부를 추적하지 않아, 이 표시는 현재 화면을 새로고침하기 전까지만 유효합니다.">
            <Tag>이번 세션에서 발송함</Tag>
          </Tooltip>
        ) : (
          <Popconfirm
            title="비즈 프로필 전환 안내를 발송하시겠습니까?"
            description="제재가 아니라 안내 알림입니다. 판매자의 매물 상태는 변경되지 않습니다."
            okText="발송"
            cancelText="취소"
            onConfirm={() =>
              nudgeMutation.mutate(r.seller_id, {
                onSuccess: () => {
                  message.success('비즈 전환 안내를 발송했습니다.')
                  setNudgedIds((prev) => new Set(prev).add(r.seller_id))
                },
                onError: (err) => message.error(err instanceof Error ? err.message : '발송에 실패했습니다.'),
              })
            }
          >
            <Button size="small" loading={nudgeMutation.isPending}>
              비즈 전환 안내 발송
            </Button>
          </Popconfirm>
        ),
    },
  ]

  return (
    <Table<DealerCandidateRow>
      rowKey="seller_id"
      loading={isLoading}
      columns={columns}
      dataSource={data ?? []}
      locale={{ emptyText: '업자 후보로 판정된 판매자가 없습니다' }}
      pagination={false}
    />
  )
}
