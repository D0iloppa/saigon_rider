import { gpsToSvg } from '@/components/maps/district-data';

interface Props {
  lat: number;
  lng: number;
  onClick?: () => void;
  /** 마커 색 (기본: 실제 제보 빨강). 예측=주황, 상습=회색. */
  color?: string;
  /** 마커 반지름 (SVG 단위). */
  r?: number;
}

/**
 * 침수 지도 위치 마커 — 작은 점. `<SaigonDistrictMap>` children 슬롯(SVG)에 넣어 사용.
 * 세 층 공용: 실제 제보(빨강)·예측 위험(주황)·상습 핫스팟(회색)을 색으로 구분.
 */
export default function FloodMarker({ lat, lng, onClick, color = '#EF3B3B', r = 1.8 }: Props) {
  const { x, y } = gpsToSvg(lat, lng);
  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <circle r={r} fill={color} stroke="#fff" strokeWidth="0.7" />
    </g>
  );
}
