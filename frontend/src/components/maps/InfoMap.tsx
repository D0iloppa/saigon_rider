import type { ReactNode } from 'react';
import SaigonDistrictMap, { type MapMarker } from './SaigonDistrictMap';
import type { District } from './district-data';

export type InfoMapVariant = 'card' | 'section' | 'mini' | 'fullscreen';

/** variant 별로 지도 chrome(높이·라벨·범례·줌·인터랙션)을 고정해 페이지 간 drift 를 막는다. */
const PRESET: Record<
  InfoMapVariant,
  { height: number | string; showLabels: boolean; showLegend: boolean; zoomable: boolean; interactive: boolean }
> = {
  card: { height: 360, showLabels: true, showLegend: true, zoomable: true, interactive: true },
  // section: 홈처럼 다른 콘텐츠가 많은 페이지에 임베드되는 지도 (카드보다 낮게)
  section: { height: 300, showLabels: true, showLegend: true, zoomable: true, interactive: true },
  mini: { height: 140, showLabels: false, showLegend: false, zoomable: false, interactive: false },
  fullscreen: { height: '100%', showLabels: true, showLegend: true, zoomable: true, interactive: true },
};

export interface InfoMapProps {
  variant?: InfoMapVariant;
  /** variant 프리셋 height 를 페이지별로 덮어쓸 때만 지정 (기본은 프리셋 값). */
  height?: number | string;
  markers?: MapMarker[];
  highlightedDistricts?: string[];
  highlightColor?: string;
  dangerDistricts?: string[];
  focusDistrictCode?: string | null;
  singleBadgeDistrictCode?: string | null;
  onDistrictClick?: (district: District) => void;
  onLocate?: (code: string | null) => void;
  locateOnMount?: boolean;
  children?: ReactNode;
}

/**
 * 정보 지도 표준 프리셋. 모든 화면(메인 WorldMap · 침수 · 주유 · 정비 · 허브 미니맵)은
 * 이 래퍼를 통해 동일한 chrome 으로 렌더한다. content(markers/children/highlight)만 주입.
 */
export default function InfoMap({ variant = 'card', children, ...content }: InfoMapProps) {
  return (
    <SaigonDistrictMap {...PRESET[variant]} {...content}>
      {children}
    </SaigonDistrictMap>
  );
}
