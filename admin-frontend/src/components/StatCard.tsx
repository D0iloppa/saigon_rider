import { Card, Tag, Tooltip } from 'antd'
import type { KeyboardEvent, ReactNode } from 'react'
import type { MetricState } from '../api/dashboard'

const STATE_META: Record<MetricState, { label: string; tone: 'success' | 'warning' | 'neutral' | 'error'; tooltip: string; dim?: boolean }> = {
  live: { label: '정상', tone: 'success', tooltip: '정상 수집·정상 측정 중인 지표입니다.' },
  partial: { label: '부분표본', tone: 'warning', tooltip: '표본이 모집단보다 적어 실제 값과 차이가 있을 수 있습니다.' },
  cold: { label: '데이터 없음', tone: 'neutral', tooltip: '계측은 연결돼 있으나 아직 데이터가 0건입니다.', dim: true },
  not_wired: { label: '미계측', tone: 'error', tooltip: '계측이 연결되지 않아 값이 없습니다. 0이 아닙니다.', dim: true },
  stale: { label: '갱신 지연', tone: 'warning', tooltip: '마지막 갱신이 오래돼 최신 값이 아닐 수 있습니다.' },
}

function StateBadge({ state, coverage }: { state: MetricState; coverage?: number | null }) {
  const meta = STATE_META[state]
  const tooltip = coverage != null ? `${meta.tooltip} (커버리지 ${(coverage * 100).toFixed(0)}%)` : meta.tooltip
  return (
    <Tooltip title={tooltip}>
      <Tag className={`admin-status admin-status-${meta.tone}`}>{meta.label}</Tag>
    </Tooltip>
  )
}

export default function StatCard({
  title,
  value,
  suffix,
  detail,
  icon,
  tone = 'default',
  onClick,
  state,
  coverage,
}: {
  title: string
  value: string | number
  suffix?: string
  detail?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'warning' | 'error'
  onClick?: () => void
  state?: MetricState
  coverage?: number | null
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onClick()
  }
  const dim = state ? STATE_META[state].dim : false

  return (
    <Card className={`admin-stat-card admin-stat-${tone}${onClick ? ' is-clickable' : ''}`} onClick={onClick} onKeyDown={handleKeyDown} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="admin-stat-heading">
        {icon && <span className="admin-stat-icon">{icon}</span>}
        <span>{title}</span>
        {state && <StateBadge state={state} coverage={coverage} />}
      </div>
      <div className={`admin-stat-value${dim ? ' admin-stat-dim' : ''}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}{suffix && <small>{suffix}</small>}
      </div>
      {detail && <div className="admin-stat-detail">{detail}</div>}
    </Card>
  )
}
