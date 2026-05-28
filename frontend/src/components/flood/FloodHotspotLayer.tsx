import { gpsToSvg } from '@/components/maps/district-data';
import type { FloodHotspot } from '@/api/info';

interface Props {
  hotspots: FloodHotspot[];
  onClick?: (h: FloodHotspot) => void;
}

/**
 * 침수 다발 구역(hotspot) Point 레이어.
 * `<SaigonDistrictMap>` 의 children 으로 주입하여 SVG 좌표계를 그대로 사용한다.
 * flood_count_30d ≥ 10 인 hotspot 은 펄스 애니메이션 적용.
 */
export default function FloodHotspotLayer({ hotspots, onClick }: Props) {
  return (
    <g data-layer="flood-hotspot">
      {hotspots.map((h) => {
        if (h.centroid_lat == null || h.centroid_lng == null) return null;
        const { x, y } = gpsToSvg(h.centroid_lat, h.centroid_lng);
        const isHot = (h.flood_count_30d ?? 0) >= 10;
        return (
          <g
            key={h.hotspot_id}
            transform={`translate(${x}, ${y})`}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
            onClick={() => onClick?.(h)}
          >
            {isHot && (
              <circle r="3" fill="#EF3B3B" opacity="0.35">
                <animate attributeName="r" values="3;9;3" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.45;0;0.45" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <circle r="3" fill="#B91C1C" stroke="#fff" strokeWidth="1" opacity="0.9" />
          </g>
        );
      })}
    </g>
  );
}
