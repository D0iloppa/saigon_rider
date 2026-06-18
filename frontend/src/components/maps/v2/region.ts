/**
 * SaigonMapV2 가 선택(탭/locate/default) 시 emit 하는 지역(동) 표현.
 * 페이지(Home·날씨·침수·주유·정비)는 이 객체로 상단 라벨·info 좌표·영역 필터를 통일한다.
 */
export interface SelectedRegion {
  /** 동 이름 (OSM Vietnamese, 예: "Bến Thành") */
  name: string;
  /** centroid 좌표 — 날씨 등 단일 좌표 조회용 */
  lat: number;
  lng: number;
  /** 동 경계 (lat/lng 링) — 주유/침수/정비 등 목록을 영역 내부로 필터링할 때 사용 */
  poly: { lat: number; lng: number }[];
}

/** 지도에 찍을 마커 (주유/침수/정비 등). depth1=선택동 집계배지, depth2/3=개별 핀(클릭). */
export interface MapMarkerV2 {
  id: string | number;
  lat: number;
  lng: number;
  label?: string;
  onClick?: () => void;
  /** 핀 색 (기본 파랑). 침수처럼 종류별 색 구분 시 사용. */
  color?: string;
  /** 핀 크기 배수 (기본 1). */
  r?: number;
}

/** 좌표가 선택 지역(동) 경계 안인지 — ray casting */
export function regionContains(r: SelectedRegion, lat: number, lng: number): boolean {
  const p = r.poly;
  if (p.length < 3) return true; // 폴리곤 불충분 시 필터 안 함
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const yi = p[i].lat, xi = p[i].lng, yj = p[j].lat, xj = p[j].lng;
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
