import { Tag } from 'antd'

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral'
type StatusEntry = { tone: Tone; label: string }

const REPORT_STATUS: Record<string, StatusEntry> = {
  PENDING: { tone: 'warning', label: '대기' },
  REVIEWING: { tone: 'info', label: '검토중' },
  RESOLVED: { tone: 'success', label: '처리완료' },
  REJECTED: { tone: 'neutral', label: '기각' },
}

const USER_STATUS: Record<string, StatusEntry> = {
  ACTIVE: { tone: 'success', label: '정상' },
  SUSPENDED: { tone: 'warning', label: '정지' },
  BANNED: { tone: 'error', label: '영구정지' },
}

const LISTING_STATUS: Record<string, StatusEntry> = {
  ON_SALE: { tone: 'success', label: '판매중' },
  RESERVED: { tone: 'info', label: '예약중' },
  SOLD: { tone: 'neutral', label: '판매완료' },
  HIDDEN: { tone: 'warning', label: '숨김' },
  REMOVED: { tone: 'error', label: '삭제됨' },
}

const SUPPORT_STATUS: Record<string, StatusEntry> = {
  OPEN: { tone: 'warning', label: '접수' },
  IN_PROGRESS: { tone: 'info', label: '처리중' },
  RESOLVED: { tone: 'success', label: '해결' },
}

const MAPS = { report: REPORT_STATUS, user: USER_STATUS, listing: LISTING_STATUS, support: SUPPORT_STATUS } as const

/** 신고/유저/매물 상태 → 색상 Tag 공용 매핑. */
export default function StatusTag({ kind, status }: { kind: keyof typeof MAPS; status: string }) {
  const entry = MAPS[kind][status] ?? { tone: 'neutral', label: status }
  return <Tag className={`admin-status admin-status-${entry.tone}`}>{entry.label}</Tag>
}
