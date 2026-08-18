import { useState } from 'react'
import { Alert, Empty, Skeleton, Table, Tag, Tooltip } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useReporterTrust, type ReporterTrustRow } from '../../api/issues'

/** R-5(017 §12-B) — 검수 큐 정렬 참고자료 전용. 조회 전용, 제재·차단 UI 없음(016 M1 탐지≠차단).
 * 상습 허위신고자도 진짜 사기를 볼 수 있다(016 A2 대칭) — 이 화면에서 신고자를 걸러내거나
 * 신고 접수를 막지 않는다. */
export default function ReporterTrustPage() {
  const [page, setPage] = useState(1)
  const size = 20
  const { data, isLoading, isError, error } = useReporterTrust({ page, size })

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="신고자 신뢰도를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const columns = [
    {
      title: '신고자',
      key: 'reporter',
      render: (_: unknown, r: ReporterTrustRow) => r.reporter_nickname ?? '(닉네임 없음)',
    },
    { title: '총 신고', dataIndex: 'total_reports', key: 'total_reports', width: 90, align: 'right' as const },
    { title: '처리완료', dataIndex: 'resolved_count', key: 'resolved_count', width: 90, align: 'right' as const },
    { title: '기각', dataIndex: 'rejected_count', key: 'rejected_count', width: 90, align: 'right' as const },
    { title: '취소', dataIndex: 'cancelled_count', key: 'cancelled_count', width: 90, align: 'right' as const },
    {
      title: (
        <span>
          기각률{' '}
          <Tooltip title="처리완료+기각 건이 5건 미만이면 표본 부족으로 판정하지 않습니다. 검수 큐 정렬 참고용일 뿐, 신고 접수를 막는 데 쓰이지 않습니다.">
            <InfoCircleOutlined />
          </Tooltip>
        </span>
      ),
      dataIndex: 'rejection_rate',
      key: 'rejection_rate',
      width: 140,
      align: 'right' as const,
      // 표본(5건) 미달이면 백엔드가 null 을 준다 — 0% 로 렌더링하지 않고 "표본 부족"으로 명시한다.
      render: (v: number | null) =>
        v == null ? <Tag color="default">표본 부족</Tag> : `${(v * 100).toFixed(0)}%`,
    },
    {
      title: '최근 신고일',
      dataIndex: 'last_reported_at',
      key: 'last_reported_at',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="조회 전용 참고자료입니다. 신고자 제재나 신고 접수 차단에는 사용하지 않습니다."
      />
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Table<ReporterTrustRow>
          rowKey="reporter_id"
          columns={columns}
          dataSource={data?.items ?? []}
          locale={{ emptyText: <Empty description="신고 이력이 없습니다." /> }}
          pagination={{
            current: page,
            pageSize: size,
            total: data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
          }}
        />
      )}
    </>
  )
}
