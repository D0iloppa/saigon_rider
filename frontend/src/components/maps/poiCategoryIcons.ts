// POI 카테고리별 아이콘 path 데이터 (동네지도 상시 참조 레이어, Phase A-2) — 24×24 단일 path.
// biz 업종 아이콘(bizCategoryIcons.ts)과 형태를 겹치지 않게 골라, 참조 지점 성격을 시각적으로 구분한다.

export const POI_CAT_ICON_PATH: Record<'landmark' | 'civic', string> = {
  // 랜드마크 — 깃발 (Material 'flag')
  landmark:
    'M14.4 6L14 4H5v17h2v-7h6.6l.4 2h7V6z',
  // 행정·공공기관 — 정부 청사 (Material 'account_balance')
  civic:
    'M12 1L3 6v2h18V6l-9-5zM5 10v7H3v2h18v-2h-2v-7h-2v7h-3v-7h-2v7H9v-7H5z',
};

// 미지의 카테고리 코드 폴백 — 핀 (Material 'place')
export const POI_CAT_ICON_FALLBACK =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z';
