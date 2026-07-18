import { Tag } from 'antd'

type StatusEntry = { color: string; label: string }

const REPORT_STATUS: Record<string, StatusEntry> = {
  PENDING: { color: 'gold', label: '대기' },
  REVIEWING: { color: 'blue', label: '검토중' },
  RESOLVED: { color: 'green', label: '처리완료' },
  REJECTED: { color: 'default', label: '기각' },
}

const USER_STATUS: Record<string, StatusEntry> = {
  ACTIVE: { color: 'green', label: '정상' },
  SUSPENDED: { color: 'orange', label: '정지' },
  BANNED: { color: 'red', label: '영구정지' },
}

const LISTING_STATUS: Record<string, StatusEntry> = {
  ON_SALE: { color: 'green', label: '판매중' },
  RESERVED: { color: 'blue', label: '예약중' },
  SOLD: { color: 'default', label: '판매완료' },
  HIDDEN: { color: 'orange', label: '숨김' },
  REMOVED: { color: 'red', label: '삭제됨' },
}

const MAPS = { report: REPORT_STATUS, user: USER_STATUS, listing: LISTING_STATUS } as const

/** 신고/유저/매물 상태 → 색상 Tag 공용 매핑. */
export default function StatusTag({ kind, status }: { kind: keyof typeof MAPS; status: string }) {
  const entry = MAPS[kind][status] ?? { color: 'default', label: status }
  return <Tag color={entry.color}>{entry.label}</Tag>
}
