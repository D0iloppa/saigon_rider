import { Space, Tag } from 'antd'
import type { AdminListingFlag } from '../api/listings'

// T-4: 검수 6기준 중 기계 판정 가능한 항목만 표시(사진 2장 미만 / 가격 0동 / 카테고리 미지정 / 근접중복).
// "업체당 5건 초과"는 서버 등록 게이트(T-3)가 이미 막아 발생할 수 없어 목록에 없다.
const FLAG_LABELS: Record<AdminListingFlag, string> = {
  LOW_PHOTOS: '사진부족',
  ZERO_PRICE: '가격0동',
  NO_CATEGORY: '카테고리없음',
  DUPLICATE: '중복의심',
}

/** 매물 자동 플래그 배지. 없으면 아무것도 렌더링하지 않는다(깨끗한 매물은 사람이 덜 봐도 되게). */
export default function ListingFlags({ flags }: { flags: AdminListingFlag[] }) {
  if (flags.length === 0) return null
  return (
    <Space size={4} wrap>
      {flags.map((flag) => (
        <Tag key={flag} className="admin-status admin-status-warning">
          {FLAG_LABELS[flag] ?? flag}
        </Tag>
      ))}
    </Space>
  )
}
