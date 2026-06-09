/**
 * Saigon Rider — 168 district 메타데이터 (주요 29개)
 *
 * 2025-07-01 호치민 행정구역 개편 반영.
 * 시안 출처: docs/saigon-map-v2-accurate.html
 * SVG viewBox: 0 0 400 280
 */

export type DistrictZone = 'center' | 'inner' | 'outer';
export type DistrictSpecial = 'new_district'; // Saigon (점선 오렌지 보더, 신설)

export interface District {
  code: string;
  nameVi: string;
  nameKo: string;
  /** 시안 SVG 의 polygon points (그대로) */
  polygon: string;
  /** 라벨 텍스트 위치 + 사이즈 */
  label: { x: number; y: number; fontSize: number; text?: string };
  /** GPS (lat/lng) */
  gps: { lat: number; lng: number };
  /** 구 행정구역 (호환성) */
  oldDistrict: string;
  zone: DistrictZone;
  special?: DistrictSpecial;
}

export const HCMC_DISTRICTS: District[] = [
  // ─── 외곽 commune ───
  { code: 'CU_CHI', nameVi: 'Củ Chi', nameKo: '꾸찌', oldDistrict: 'Củ Chi', zone: 'outer',
    polygon: '55,12 118,10 118,42 100,45 102,42 65,40',
    label: { x: 88, y: 28, fontSize: 6 },
    gps: { lat: 11.0000, lng: 106.5000 } },
  { code: 'HOC_MON', nameVi: 'Hóc Môn', nameKo: '혹몬', oldDistrict: 'Hóc Môn', zone: 'outer',
    polygon: '100,45 150,42 150,62 128,65 102,62',
    label: { x: 126, y: 55, fontSize: 6 },
    gps: { lat: 10.8886, lng: 106.5958 } },
  { code: 'BINH_CHANH', nameVi: 'Bình Chánh', nameKo: '빈짠', oldDistrict: 'Bình Chánh', zone: 'outer',
    polygon: '72,155 118,148 120,192 108,208 82,205 68,195',
    label: { x: 92, y: 178, fontSize: 5.5 },
    gps: { lat: 10.7500, lng: 106.5500 } },
  { code: 'NHA_BE', nameVi: 'Nhà Bè', nameKo: '냐베', oldDistrict: 'Nhà Bè', zone: 'outer',
    polygon: '178,210 225,208 228,235 215,245 190,248 178,238',
    label: { x: 202, y: 228, fontSize: 6 },
    gps: { lat: 10.6900, lng: 106.7400 } },
  { code: 'CAN_GIO', nameVi: 'Cần Giờ', nameKo: '깐저', oldDistrict: 'Cần Giờ', zone: 'outer',
    polygon: '192,248 225,245 230,270 215,272 192,270',
    label: { x: 210, y: 260, fontSize: 5.5 },
    gps: { lat: 10.4144, lng: 106.9333 } },

  // ─── 북부 권역 ───
  { code: 'TAN_THOI_HIEP', nameVi: 'Tân Thới Hiệp', nameKo: '떤터이히엡', oldDistrict: 'Q.12', zone: 'outer',
    polygon: '158,52 192,48 195,68 178,72 160,68',
    label: { x: 176, y: 63, fontSize: 6 },
    gps: { lat: 10.8611, lng: 106.6406 } },
  { code: 'THOI_AN', nameVi: 'Thới An', nameKo: '터이안', oldDistrict: 'Q.12', zone: 'outer',
    polygon: '130,52 158,50 160,68 145,72 132,65',
    label: { x: 145, y: 62, fontSize: 6 },
    gps: { lat: 10.8728, lng: 106.6544 } },
  { code: 'TAN_BINH', nameVi: 'Tân Bình', nameKo: '떤빈', oldDistrict: 'Tân Bình', zone: 'inner',
    polygon: '155,75 192,70 192,88 175,92 158,88',
    label: { x: 174, y: 83, fontSize: 6, text: 'Tân Bình ✈' },
    gps: { lat: 10.8014, lng: 106.6531 } },
  { code: 'GO_VAP', nameVi: 'Gò Vấp', nameKo: '고밥', oldDistrict: 'Gò Vấp', zone: 'inner',
    polygon: '182,65 215,62 218,82 202,88 182,85',
    label: { x: 200, y: 78, fontSize: 6 },
    gps: { lat: 10.8386, lng: 106.6664 } },
  { code: 'HOA_BINH', nameVi: 'Hòa Bình', nameKo: '호아빈', oldDistrict: 'Q.11', zone: 'inner',
    polygon: '130,102 155,98 158,115 148,122 132,118',
    label: { x: 143, y: 112, fontSize: 6 },
    gps: { lat: 10.7703, lng: 106.6453 } },
  { code: 'HOA_HUNG', nameVi: 'Hòa Hưng', nameKo: '호아흥', oldDistrict: 'Q.10', zone: 'inner',
    polygon: '155,98 182,92 185,108 172,115 158,112',
    label: { x: 169, y: 108, fontSize: 6 },
    gps: { lat: 10.7744, lng: 106.6717 } },

  // ─── 서부 ───
  { code: 'BINH_TAN', nameVi: 'Bình Tân', nameKo: '빈떤', oldDistrict: 'Bình Tân', zone: 'inner',
    polygon: '88,108 130,100 132,125 118,132 90,128',
    label: { x: 110, y: 118, fontSize: 6 },
    gps: { lat: 10.8036, lng: 106.5914 } },

  // ─── 동부 권역 (Thủ Đức + Bình Thạnh) ───
  { code: 'THU_DUC', nameVi: 'Thủ Đức', nameKo: '투득', oldDistrict: 'Thủ Đức', zone: 'inner',
    polygon: '310,65 348,60 358,85 348,108 322,118 305,112 298,98 310,82',
    label: { x: 330, y: 90, fontSize: 7 },
    gps: { lat: 10.8500, lng: 106.7717 } },
  { code: 'LINH_TRUNG', nameVi: 'Linh Trung', nameKo: '린쭝', oldDistrict: 'Thủ Đức', zone: 'inner',
    polygon: '250,78 275,75 275,85 272,98 252,95',
    label: { x: 262, y: 88, fontSize: 6 },
    gps: { lat: 10.8717, lng: 106.7717 } },
  { code: 'LINH_XUAN', nameVi: 'Linh Xuân', nameKo: '린쑤안', oldDistrict: 'Thủ Đức', zone: 'inner',
    polygon: '275,85 310,80 315,98 295,102 272,98',
    label: { x: 292, y: 93, fontSize: 6 },
    gps: { lat: 10.8800, lng: 106.7717 } },
  { code: 'THAO_DIEN', nameVi: 'Thảo Điền', nameKo: '타오디엔', oldDistrict: 'Q.2', zone: 'inner',
    polygon: '250,108 275,102 278,118 265,122 250,120',
    label: { x: 263, y: 114, fontSize: 6 },
    gps: { lat: 10.8060, lng: 106.7395 } },
  { code: 'BINH_THANH', nameVi: 'Bình Thạnh', nameKo: '빈탄', oldDistrict: 'Bình Thạnh', zone: 'inner',
    polygon: '222,105 258,100 262,120 250,130 235,128 225,118',
    label: { x: 242, y: 116, fontSize: 6 },
    gps: { lat: 10.8011, lng: 106.7100 } },

  // ─── 중심부 City Core ───
  { code: 'CHO_LON', nameVi: 'Chợ Lớn', nameKo: '쩌런', oldDistrict: 'Q.5', zone: 'center',
    polygon: '130,135 148,128 145,138 140,150 128,148',
    label: { x: 137, y: 141, fontSize: 5.5 },
    gps: { lat: 10.7519, lng: 106.6588 } },
  { code: 'AN_DONG', nameVi: 'An Đông', nameKo: '안동', oldDistrict: 'Q.5', zone: 'center',
    polygon: '148,128 172,122 175,138 168,148 155,145 145,138',
    label: { x: 158, y: 137, fontSize: 6 },
    gps: { lat: 10.7565, lng: 106.6697 } },
  { code: 'CHANH_HUNG', nameVi: 'Chánh Hưng', nameKo: '짠흥', oldDistrict: 'Q.8', zone: 'center',
    polygon: '128,158 158,155 160,175 148,182 128,178',
    label: { x: 143, y: 170, fontSize: 5.5 },
    gps: { lat: 10.7450, lng: 106.6758 } },
  { code: 'NGUYEN_THAI_BINH', nameVi: 'Nguyễn Thái Bình', nameKo: '응우옌타이빈', oldDistrict: 'Q.1', zone: 'center',
    polygon: '185,122 200,118 200,130 185,130 178,128',
    label: { x: 190, y: 127, fontSize: 5, text: 'N.T.Bình' },
    gps: { lat: 10.7660, lng: 106.6960 } },
  { code: 'CO_GIANG', nameVi: 'Cô Giang', nameKo: '꼬장', oldDistrict: 'Q.1', zone: 'center',
    polygon: '172,128 185,122 185,130 175,138 168,135',
    label: { x: 177, y: 132, fontSize: 5 },
    gps: { lat: 10.7625, lng: 106.6905 } },
  { code: 'PHAM_NGU_LAO', nameVi: 'Phạm Ngũ Lão', nameKo: '팜응우라오', oldDistrict: 'Q.1', zone: 'center',
    polygon: '175,138 185,130 182,148 175,155 168,148',
    label: { x: 176, y: 144, fontSize: 5, text: 'P.N.Lão' },
    gps: { lat: 10.7680, lng: 106.6920 } },
  { code: 'BEN_THANH', nameVi: 'Bến Thành', nameKo: '벤탄', oldDistrict: 'Q.1', zone: 'center',
    polygon: '185,130 200,125 200,135 205,155 192,158 182,148',
    label: { x: 193, y: 143, fontSize: 6 },
    gps: { lat: 10.7720, lng: 106.6960 } },
  { code: 'SAIGON', nameVi: 'Saigon', nameKo: '사이공', oldDistrict: 'Q.1', zone: 'center', special: 'new_district',
    polygon: '200,118 220,115 225,128 215,128 200,128',
    label: { x: 212, y: 124, fontSize: 5.5 },
    gps: { lat: 10.7665, lng: 106.7000 } },
  { code: 'BEN_NGHE', nameVi: 'Bến Nghé', nameKo: '벤응에', oldDistrict: 'Q.1', zone: 'center',
    polygon: '200,128 215,128 225,132 228,145 220,155 205,155',
    label: { x: 213, y: 142, fontSize: 6 },
    gps: { lat: 10.7780, lng: 106.7019 } },

  // ─── 남부 권역 ───
  { code: 'PHU_MY', nameVi: 'Phú Mỹ', nameKo: '푸미', oldDistrict: 'Q.7', zone: 'inner',
    polygon: '192,175 225,172 228,195 215,208 195,210 185,200',
    label: { x: 206, y: 192, fontSize: 6 },
    gps: { lat: 10.7228, lng: 106.7178 } },
  { code: 'TAN_MY', nameVi: 'Tân Mỹ', nameKo: '떤미', oldDistrict: 'Q.7', zone: 'inner',
    polygon: '175,162 195,160 192,175 185,185 172,182',
    label: { x: 182, y: 172, fontSize: 6 },
    gps: { lat: 10.7261, lng: 106.7228 } },
  { code: 'TAN_THUAN', nameVi: 'Tân Thuận', nameKo: '떤투언', oldDistrict: 'Q.7', zone: 'inner',
    polygon: '210,158 232,155 235,175 225,180 210,178',
    label: { x: 220, y: 169, fontSize: 5.5 },
    gps: { lat: 10.7550, lng: 106.7364 } },
];

/** 코드로 district 조회 */
export function getDistrictByCode(code: string): District | undefined {
  return HCMC_DISTRICTS.find((d) => d.code === code);
}

/**
 * district_code(예: BINH_THANH, QUAN_8)를 사람이 읽을 표기로. 정적 데이터에 있으면 nameVi,
 * 없으면 QUAN_N→"Quận N" / SNAKE_CASE→Title Case 로 폴백. (raw 코드 노출 방지)
 */
export function districtLabelByCode(code: string): string {
  if (!code) return '';
  const d = getDistrictByCode(code);
  if (d) return d.nameVi;
  const quan = code.match(/^QUAN_(\d+)$/);
  if (quan) return `Quận ${quan[1]}`;
  return code
    .split('_')
    .map((w) => (w ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/** GPS 좌표로 가장 가까운 district (단순 유클리드) */
export function findNearestDistrict(lat: number, lng: number): District | null {
  if (!HCMC_DISTRICTS.length) return null;
  let nearest = HCMC_DISTRICTS[0];
  let minDist = Infinity;
  for (const d of HCMC_DISTRICTS) {
    const dLat = d.gps.lat - lat;
    const dLng = d.gps.lng - lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < minDist) {
      minDist = dist;
      nearest = d;
    }
  }
  return nearest;
}

/**
 * 좌표가 HCMC 권역 안인지(가장 가까운 구역 centroid 와의 거리 ≤ maxKm) 판정.
 * 내 위치가 HCMC 밖이면 거리 기준을 선택 구역 centroid 로 바꾸기 위한 판정용.
 */
export function isWithinHcmc(lat: number, lng: number, maxKm = 25): boolean {
  const n = findNearestDistrict(lat, lng);
  if (!n) return false;
  const dy = (n.gps.lat - lat) * 110.57;
  const dx = (n.gps.lng - lng) * 111.32 * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(dx, dy) <= maxKm;
}

/** 두 좌표 간 거리(km). isWithinHcmc/isWithinDistrictRadius 와 동일 근사(110.57/111.32). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dy = (lat2 - lat1) * 110.57;
  const dx = (lng2 - lng1) * 111.32 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** 구역 리스트/뱃지/메인 카운트 공통 반경(km). 중심부 ward 과분할(Voronoi) 보정용. */
export const DISTRICT_RADIUS_KM = 2;

/**
 * 좌표가 특정 구역(code) centroid 반경 radiusKm 이내인지.
 * 주유/정비 리스트·지도 뱃지·메인 미니카운트가 동일 기준을 쓰도록 공유. code 불명이면 true(필터 안 함).
 */
export function isWithinDistrictRadius(
  lat: number,
  lng: number,
  code: string | null,
  radiusKm = DISTRICT_RADIUS_KM,
): boolean {
  if (!code) return true;
  const d = getDistrictByCode(code);
  if (!d) return true;
  const dy = (d.gps.lat - lat) * 110.57;
  const dx = (d.gps.lng - lng) * 111.32 * Math.cos((lat * Math.PI) / 180);
  return Math.hypot(dx, dy) <= radiusKm;
}

/**
 * GPS → SVG viewBox 좌표 변환.
 * 시안의 district 좌표가 정확한 GPS 투영이 아니라 디자인 배치 좌표이기 때문에,
 * 외부 마커는 district GPS 와 SVG 위치 쌍으로 학습된 affine 근사를 쓰는 대신
 * 가장 가까운 district 의 라벨 좌표 + 작은 offset 으로 떨어뜨리는 방식이 안정적.
 *
 * 이 함수는 fallback (지도 밖 좌표) 용도. 일반적인 마커 배치는
 * findNearestDistrict().label 좌표 사용 권장.
 */
export function gpsToSvg(lat: number, lng: number): { x: number; y: number } {
  const nearest = findNearestDistrict(lat, lng);
  if (nearest) return { x: nearest.label.x, y: nearest.label.y };
  // bounding box fallback
  const LAT_MIN = 10.40, LAT_MAX = 11.10, LNG_MIN = 106.40, LNG_MAX = 107.00;
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 400;
  const y = 280 - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * 280;
  return { x: Math.max(0, Math.min(400, x)), y: Math.max(0, Math.min(280, y)) };
}
