import { BIZ_CAT_ICON_FALLBACK, BIZ_CAT_ICON_PATH } from './bizCategoryIcons';

// 업종 아이콘 인라인 렌더 — 칩·업체 카드용 (지도 핀은 SaigonMapV5 가 path 데이터를 직접 그림)
// 미지의 코드는 폴백(상점) 아이콘 — DB 카테고리가 앱 배포보다 먼저 늘어나도 깨지지 않는다.
export function BizCatIcon({ category, size = 14, className }: { category: string; size?: number; className?: string }) {
  const d = BIZ_CAT_ICON_PATH[category] ?? BIZ_CAT_ICON_FALLBACK;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
