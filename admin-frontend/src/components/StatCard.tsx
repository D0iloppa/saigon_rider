import { Card } from 'antd'
import type { KeyboardEvent, ReactNode } from 'react'

export default function StatCard({
  title,
  value,
  suffix,
  detail,
  icon,
  tone = 'default',
  onClick,
}: {
  title: string
  value: string | number
  suffix?: string
  detail?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'warning' | 'error'
  onClick?: () => void
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onClick()
  }

  return (
    <Card className={`admin-stat-card admin-stat-${tone}${onClick ? ' is-clickable' : ''}`} onClick={onClick} onKeyDown={handleKeyDown} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="admin-stat-heading">
        {icon && <span className="admin-stat-icon">{icon}</span>}
        <span>{title}</span>
      </div>
      <div className="admin-stat-value">{typeof value === 'number' ? value.toLocaleString() : value}{suffix && <small>{suffix}</small>}</div>
      {detail && <div className="admin-stat-detail">{detail}</div>}
    </Card>
  )
}
