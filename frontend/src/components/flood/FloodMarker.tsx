import { gpsToSvg } from '@/components/maps/district-data';
import {
  getDepth,
  freshnessOpacity,
  TRUST_TOKENS,
  type FloodDepthCode,
  type FloodTrustLevel,
} from './flood-tokens';

interface Props {
  lat: number;
  lng: number;
  depth: FloodDepthCode | string;
  trustLevel: FloodTrustLevel;
  minutesAgo: number;
  hasPhoto?: boolean;
  onClick?: () => void;
}

/**
 * 사용자 제보 침수 마커. `<SaigonDistrictMap>` children 슬롯에 넣어 사용.
 * - 깊이별 색
 * - 신선도(분) 기반 opacity 감쇠
 * - VERIFIED 시 펄스 링
 * - 사진 첨부 시 작은 카메라 배지
 */
export default function FloodMarker({
  lat,
  lng,
  depth,
  trustLevel,
  minutesAgo,
  hasPhoto = false,
  onClick,
}: Props) {
  const token = getDepth(depth);
  const trust = TRUST_TOKENS[trustLevel];
  const opacity = freshnessOpacity(minutesAgo);
  const { x, y } = gpsToSvg(lat, lng);
  const verified = trustLevel === 'VERIFIED';

  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: onClick ? 'pointer' : 'default', opacity }}
      onClick={onClick}
    >
      {verified && (
        <circle r="7" fill={token.fillColor} opacity="0.45">
          <animate attributeName="r" values="7;11;7" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
      <circle r="6.5" fill={token.fillColor} stroke="#fff" strokeWidth="1.5" />
      <text
        fontSize="6.5"
        fontWeight={700}
        fill={token.textColor}
        textAnchor="middle"
        dy="2.3"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {token.shortLabel}
      </text>
      {/* 사진 배지 */}
      {hasPhoto && (
        <g transform="translate(5.5, -5.5)">
          <circle r="2.8" fill="#fff" stroke={token.color} strokeWidth="0.6" />
          <text fontSize="3.2" textAnchor="middle" dy="1.1" style={{ pointerEvents: 'none' }}>📷</text>
        </g>
      )}
      {/* 검증 배지 */}
      {verified && (
        <g transform="translate(-5.5, -5.5)">
          <circle r="2.8" fill={trust.bgColor} stroke={trust.color} strokeWidth="0.6" />
          <text
            fontSize="3.6"
            fontWeight={700}
            fill={trust.color}
            textAnchor="middle"
            dy="1.2"
            style={{ pointerEvents: 'none' }}
          >
            ✓
          </text>
        </g>
      )}
    </g>
  );
}
