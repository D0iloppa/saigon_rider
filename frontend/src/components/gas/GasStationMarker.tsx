import { type BrandToken, formatPriceShort } from './gas-tokens';

interface Props {
  brand: BrandToken;
  refPrice?: number | null;
  is24h?: boolean;
  showPrice?: boolean;
  onClick?: () => void;
}

/**
 * SVG 마커 — SaigonDistrictMap 의 m.type === 'gas' 분기에서 사용.
 * 줌아웃: 도트만 / 줌인: 도트 + 가격 라벨.
 */
export default function GasStationMarker({ brand, refPrice, is24h, showPrice = false, onClick }: Props) {
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      <circle r={showPrice ? 8 : 5} fill={brand.primary} stroke="white" strokeWidth="1.5" />
      {is24h && <circle cx="5" cy="-5" r="2" fill="#FFCC00" stroke="white" strokeWidth="0.5" />}
      {showPrice && refPrice != null && (
        <g transform="translate(0, -14)">
          <rect x="-14" y="-7" width="28" height="11" rx="4" fill={brand.primary} opacity="0.95" />
          <text y="1" fontSize="7" fontWeight="700" fill={brand.textColor} textAnchor="middle">
            {formatPriceShort(refPrice)}
          </text>
        </g>
      )}
    </g>
  );
}
