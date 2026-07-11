import { BIZ_CAT_ICON_PATH } from './bizCategoryIcons';

// 업종 아이콘 인라인 렌더 — 칩·업체 카드용 (지도 핀은 SaigonMapV5 가 path 데이터를 직접 그림)
export function BizCatIcon({ category, size = 14, className }: { category: string; size?: number; className?: string }) {
  const d = BIZ_CAT_ICON_PATH[category];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
