import type { MapMarkerV2 } from '@/components/maps/v2/region';
import type { PoiMapItem } from '@/api/poi';
import { POI_CAT_ICON_PATH, POI_CAT_ICON_FALLBACK } from '@/components/maps/poiCategoryIcons';

// POI 상시 참조 레이어 색 — POI 는 "지표(landmark)" 참조용이므로 저채도 뮤트 톤으로
// 배경에 후퇴시킨다 (업체 마커 아래 위계). SaigonMapV5 라벨 디클러터의 poiTier 색 판별과
// 값이 결합돼 있으므로 함께 변경할 것. ※ 색은 시작값.
const POI_LANDMARK_COLOR = '#74847f'; // landmark — 그레이-틸 뮤트
const POI_CIVIC_COLOR = '#8b909a';    // civic — 쿨 그레이 뮤트

// POI 참조 레이어(지표 마커) 빌드 — L3 상세지도의 일부. renderPoiLayer 역할.
// 이름 라벨은 현재 언어(name_ko/vi/en) 우선, 없으면 name_ko 폴백.
// 마커 위계 역전(2026-07-21): POI 는 위치 파악용 "지표"일 뿐 사용자가 찾는 대상이 아니다 —
// 작게(r 1.0 < biz 1.6)·저채도 뮤트 색으로 배경에 후퇴시키고, 호출부에서 배열 앞쪽(z-order 아래)에 깐다.
// 게이트는 상단 L3_ENABLED(부활 플래그) — 끄면 이 레이어를 조회·렌더하지 않는다.
export const buildPoiLayer = (poiItems: PoiMapItem[], lang: string): MapMarkerV2[] =>
  poiItems.map((p) => ({
    id: `poi:${p.id}`,
    lat: p.lat,
    lng: p.lng,
    kind: 'poi',
    r: 1.0,
    color: p.category === 'landmark' ? POI_LANDMARK_COLOR : POI_CIVIC_COLOR,
    icon: POI_CAT_ICON_PATH[p.category as 'landmark' | 'civic'] ?? POI_CAT_ICON_FALLBACK,
    label: (lang === 'vi' ? p.nameVi : lang === 'en' ? p.nameEn : p.nameKo) || p.nameKo,
  }));
