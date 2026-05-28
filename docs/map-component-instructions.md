# Saigon Rider — 지도 컴포넌트 코드 작업 지시서 v1.0

> 발행일: 2026-05-27
> 대상: Claude Code (또는 다른 코딩 도구)
> 작업 범위: v2 (168 ward 정확) 지도 시안을 React 컴포넌트로 옮기고 4개 화면에 적용
> 코드베이스: github.com/D0iloppa/saigon_rider
> 소요 시간: 2-3일 (단일 작업자 풀타임)
> 전제: docs/saigon-map-v2-accurate.html 가 이미 사용자가 디자인 검수 완료된 시안

---

## §0. 작업 개요

### 0.1 무엇을 할지

Skywork v2 지도 시안 (`saigon-map-v2-accurate.html`)을 React 컴포넌트로 옮기고, 다음 4곳에 적용:

1. **INFO-HUB-001** — 정보 허브 메인 (작은 미리보기 카드)
2. **INFO-FLOOD-MAP** — 침수 지도 (메인 사용처, 가장 중요)
3. **INFO-REPAIR-LIST** — 정비소 위치 표시
4. **INFO-GAS-LIST** — 주유소 위치 표시

홈 화면의 "사이공 구역" 카드는 이 v2 지도가 아닌 **시안 A (v1 game)** 사용 예정 (별도 작업). 이 지시서는 v2만 다룸.

### 0.2 파일 위치 (이 작업으로 생성/수정될 파일)

```
saigon_rider/
├── frontend/
│   └── src/
│       ├── components/
│       │   └── maps/                              ⭐ 신규 폴더
│       │       ├── SaigonWardMap.tsx              ⭐ 신규 (메인 컴포넌트)
│       │       ├── SaigonWardMap.module.css      ⭐ 신규 (스타일)
│       │       ├── ward-data.ts                  ⭐ 신규 (29 ward 메타데이터)
│       │       └── README.md                     ⭐ 신규 (사용 가이드)
│       ├── pages/
│       │   └── info/
│       │       ├── InfoHub.tsx                   🔧 수정 (미니 지도 추가)
│       │       ├── InfoFloodMap.tsx              🔧 수정 (메인 지도)
│       │       ├── InfoRepairList.tsx            🔧 수정 (위치 표시)
│       │       └── InfoGasList.tsx               🔧 수정 (위치 표시)
│       └── api/
│           └── info.ts                            🔧 수정 (ward 매핑 API)
└── backend/
    └── migrations/
        └── 202605xx_ward_mapping.sql              ⭐ 신규 (DB 매핑)
```

확장자는 코드베이스 컨벤션 따라가 (`.tsx` 또는 `.jsx`). 만약 코드베이스가 `.jsx`만 쓰면 그렇게 맞춰.

---

## §1. Phase 0 — 사전 확인 (15분)

### Task 0.1: 디자인 시안 위치 확인

```bash
# 사용자가 미리 복사해둔 위치
ls saigon_rider/docs/saigon-map-v2-accurate.html
```

없으면 사용자에게 "docs 폴더에 시안 파일 복사해주세요" 요청.

### Task 0.2: 기존 코드베이스 파악

```bash
# 정보 모듈 페이지 폴더 존재 확인 (H 작업 진척 상태 따라 다름)
ls saigon_rider/frontend/src/pages/info/ 2>/dev/null || echo "정보 모듈 페이지 아직 없음"

# 디자인 토큰 위치 확인
find saigon_rider/frontend/src -name "*.css" -path "*tokens*" -o -name "tokens.*"

# 기존 라우터 확인
grep -r "info/" saigon_rider/frontend/src --include="*.tsx" --include="*.jsx" | head -5
```

### Task 0.3: 의존성 확인

지도는 외부 라이브러리 X. 순수 SVG. 추가 패키지 설치 불필요.

---

## §2. Phase 1 — 메인 컴포넌트 작성 (4-6시간)

### Task 1.1: ward-data.ts 작성

29개 ward 메타데이터를 코드에서 사용 가능한 형태로 정의.

`frontend/src/components/maps/ward-data.ts`:

```typescript
/**
 * Saigon Rider — 168 ward 메타데이터 (주요 29개)
 *
 * 2025-07-01 호치민 행정구역 개편 반영.
 * 168개 전체 중 게임/정보 모듈에서 사용할 주요 29개 ward만 정의.
 *
 * 좌표는 SVG viewBox (0 0 400 280) 내부 좌표.
 * 실제 GPS는 lat/lng 컬럼 별도 보유 (백엔드).
 */

export interface Ward {
  /** ward 코드 (영문, URL/DB용) */
  code: string;
  /** 베트남어 풀네임 */
  nameVi: string;
  /** 한국어 표기 */
  nameKo: string;
  /** SVG viewBox 내 중심 좌표 */
  svgCenter: { x: number; y: number };
  /** 실제 GPS (위경도) */
  gps: { lat: number; lng: number };
  /** 구 행정구역 (호환성용) */
  oldDistrict: string;
  /** 권역 (중심/내부/외곽) */
  zone: 'center' | 'inner' | 'outer';
}

export const HCMC_WARDS: Ward[] = [
  // ─── 중심 권역 ───
  { code: 'BEN_NGHE', nameVi: 'Bến Nghé', nameKo: '벤응에', 
    svgCenter: { x: 256, y: 152 }, gps: { lat: 10.7780, lng: 106.7019 },
    oldDistrict: 'Q.1', zone: 'center' },
  { code: 'BEN_THANH', nameVi: 'Bến Thành', nameKo: '벤탄', 
    svgCenter: { x: 240, y: 144 }, gps: { lat: 10.7720, lng: 106.6960 },
    oldDistrict: 'Q.1', zone: 'center' },
  { code: 'SAIGON', nameVi: 'Saigon', nameKo: '사이공', 
    svgCenter: { x: 240, y: 158 }, gps: { lat: 10.7665, lng: 106.7000 },
    oldDistrict: 'Q.1', zone: 'center' },
  { code: 'PHAM_NGU_LAO', nameVi: 'P.N.Lão', nameKo: '팜응우라오', 
    svgCenter: { x: 226, y: 144 }, gps: { lat: 10.7680, lng: 106.6920 },
    oldDistrict: 'Q.1', zone: 'center' },
  { code: 'NGUYEN_THAI_BINH', nameVi: 'N.T.Bình', nameKo: '응우옌타이빈', 
    svgCenter: { x: 220, y: 156 }, gps: { lat: 10.7660, lng: 106.6960 },
    oldDistrict: 'Q.1', zone: 'center' },
  { code: 'CO_GIANG', nameVi: 'Cô Giang', nameKo: '꼬장', 
    svgCenter: { x: 210, y: 152 }, gps: { lat: 10.7625, lng: 106.6905 },
    oldDistrict: 'Q.1', zone: 'center' },
  { code: 'AN_DONG', nameVi: 'An Đông', nameKo: '안동', 
    svgCenter: { x: 178, y: 156 }, gps: { lat: 10.7565, lng: 106.6697 },
    oldDistrict: 'Q.5', zone: 'center' },
  { code: 'CHO_LON', nameVi: 'Chợ Lớn', nameKo: '쩌런 (차이나타운)', 
    svgCenter: { x: 158, y: 152 }, gps: { lat: 10.7519, lng: 106.6588 },
    oldDistrict: 'Q.5', zone: 'center' },
  { code: 'CHANH_HUNG', nameVi: 'Chánh Hưng', nameKo: '짠흥', 
    svgCenter: { x: 198, y: 176 }, gps: { lat: 10.7450, lng: 106.6758 },
    oldDistrict: 'Q.8', zone: 'center' },

  // ─── 동부 권역 (Thủ Đức + Bình Thạnh) ───
  { code: 'BINH_THANH', nameVi: 'Bình Thạnh', nameKo: '빈탄', 
    svgCenter: { x: 232, y: 110 }, gps: { lat: 10.8011, lng: 106.7100 },
    oldDistrict: 'Bình Thạnh', zone: 'inner' },
  { code: 'THAO_DIEN', nameVi: 'Thảo Điền', nameKo: '타오디엔', 
    svgCenter: { x: 290, y: 120 }, gps: { lat: 10.8060, lng: 106.7395 },
    oldDistrict: 'Q.2 (구)', zone: 'inner' },
  { code: 'THU_DUC', nameVi: 'Thủ Đức', nameKo: '투득', 
    svgCenter: { x: 320, y: 100 }, gps: { lat: 10.8500, lng: 106.7717 },
    oldDistrict: 'Thủ Đức', zone: 'inner' },
  { code: 'LINH_TRUNG', nameVi: 'Linh Trung', nameKo: '린쭝', 
    svgCenter: { x: 340, y: 88 }, gps: { lat: 10.8717, lng: 106.7717 },
    oldDistrict: 'Thủ Đức', zone: 'inner' },
  { code: 'LINH_XUAN', nameVi: 'Linh Xuân', nameKo: '린쑤안', 
    svgCenter: { x: 358, y: 78 }, gps: { lat: 10.8800, lng: 106.7717 },
    oldDistrict: 'Thủ Đức', zone: 'inner' },

  // ─── 남부 권역 (Q.7) ───
  { code: 'TAN_MY', nameVi: 'Tân Mỹ', nameKo: '떤미', 
    svgCenter: { x: 242, y: 220 }, gps: { lat: 10.7261, lng: 106.7228 },
    oldDistrict: 'Q.7', zone: 'inner' },
  { code: 'TAN_THUAN', nameVi: 'Tân Thuận', nameKo: '떤투언', 
    svgCenter: { x: 260, y: 208 }, gps: { lat: 10.7550, lng: 106.7364 },
    oldDistrict: 'Q.7', zone: 'inner' },
  { code: 'PHU_MY', nameVi: 'Phú Mỹ', nameKo: '푸미 (Phú Mỹ Hưng)', 
    svgCenter: { x: 222, y: 222 }, gps: { lat: 10.7228, lng: 106.7178 },
    oldDistrict: 'Q.7', zone: 'inner' },

  // ─── 북부 권역 ───
  { code: 'HOA_HUNG', nameVi: 'Hòa Hưng', nameKo: '호아흥', 
    svgCenter: { x: 188, y: 120 }, gps: { lat: 10.7744, lng: 106.6717 },
    oldDistrict: 'Q.10', zone: 'inner' },
  { code: 'HOA_BINH', nameVi: 'Hòa Bình', nameKo: '호아빈', 
    svgCenter: { x: 162, y: 116 }, gps: { lat: 10.7703, lng: 106.6453 },
    oldDistrict: 'Q.11', zone: 'inner' },
  { code: 'GO_VAP', nameVi: 'Gò Vấp', nameKo: '고밥', 
    svgCenter: { x: 160, y: 88 }, gps: { lat: 10.8386, lng: 106.6664 },
    oldDistrict: 'Gò Vấp', zone: 'inner' },
  { code: 'TAN_BINH', nameVi: 'Tân Bình', nameKo: '떤빈 (공항)', 
    svgCenter: { x: 198, y: 96 }, gps: { lat: 10.8014, lng: 106.6531 },
    oldDistrict: 'Tân Bình', zone: 'inner' },
  { code: 'TAN_THOI_HIEP', nameVi: 'Tân Thới Hiệp', nameKo: '떤터이히엡', 
    svgCenter: { x: 142, y: 60 }, gps: { lat: 10.8611, lng: 106.6406 },
    oldDistrict: 'Q.12', zone: 'outer' },
  { code: 'THOI_AN', nameVi: 'Thới An', nameKo: '터이안', 
    svgCenter: { x: 122, y: 72 }, gps: { lat: 10.8728, lng: 106.6544 },
    oldDistrict: 'Q.12', zone: 'outer' },
  { code: 'BINH_TAN', nameVi: 'Bình Tân', nameKo: '빈떤', 
    svgCenter: { x: 124, y: 132 }, gps: { lat: 10.8036, lng: 106.5914 },
    oldDistrict: 'Bình Tân', zone: 'inner' },

  // ─── 외곽 ───
  { code: 'CU_CHI', nameVi: 'Củ Chi', nameKo: '꾸찌', 
    svgCenter: { x: 80, y: 26 }, gps: { lat: 11.0000, lng: 106.5000 },
    oldDistrict: 'Củ Chi', zone: 'outer' },
  { code: 'HOC_MON', nameVi: 'Hóc Môn', nameKo: '혹몬', 
    svgCenter: { x: 118, y: 53 }, gps: { lat: 10.8886, lng: 106.5958 },
    oldDistrict: 'Hóc Môn', zone: 'outer' },
  { code: 'BINH_CHANH', nameVi: 'Bình Chánh', nameKo: '빈짠', 
    svgCenter: { x: 88, y: 170 }, gps: { lat: 10.7500, lng: 106.5500 },
    oldDistrict: 'Bình Chánh', zone: 'outer' },
  { code: 'NHA_BE', nameVi: 'Nhà Bè', nameKo: '냐베', 
    svgCenter: { x: 188, y: 244 }, gps: { lat: 10.6900, lng: 106.7400 },
    oldDistrict: 'Nhà Bè', zone: 'outer' },
  { code: 'CAN_GIO', nameVi: 'Cần Giờ', nameKo: '깐저', 
    svgCenter: { x: 320, y: 250 }, gps: { lat: 10.4144, lng: 106.9333 },
    oldDistrict: 'Cần Giờ', zone: 'outer' },
];

/** 코드로 ward 조회 */
export function getWardByCode(code: string): Ward | undefined {
  return HCMC_WARDS.find(w => w.code === code);
}

/** GPS 좌표로 가장 가까운 ward 찾기 (단순 거리 계산) */
export function findNearestWard(lat: number, lng: number): Ward | null {
  if (!HCMC_WARDS.length) return null;
  
  let nearest = HCMC_WARDS[0];
  let minDist = Infinity;
  
  for (const w of HCMC_WARDS) {
    const dLat = w.gps.lat - lat;
    const dLng = w.gps.lng - lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < minDist) {
      minDist = dist;
      nearest = w;
    }
  }
  return nearest;
}

/** GPS 좌표를 SVG viewBox 좌표로 변환 (대략적, 호치민 한정) */
export function gpsToSvg(lat: number, lng: number): { x: number; y: number } {
  // 호치민 대략 bounding box (실제 시안에 맞춰서 보정)
  const HCMC_LAT_MIN = 10.40;
  const HCMC_LAT_MAX = 11.10;
  const HCMC_LNG_MIN = 106.40;
  const HCMC_LNG_MAX = 107.00;
  
  const x = ((lng - HCMC_LNG_MIN) / (HCMC_LNG_MAX - HCMC_LNG_MIN)) * 400;
  const y = 280 - ((lat - HCMC_LAT_MIN) / (HCMC_LAT_MAX - HCMC_LAT_MIN)) * 280;
  
  return { x: Math.max(0, Math.min(400, x)), y: Math.max(0, Math.min(280, y)) };
}
```

### Task 1.2: SaigonWardMap.tsx 작성 — 메인 컴포넌트

`frontend/src/components/maps/SaigonWardMap.tsx`:

```typescript
import React, { useMemo } from 'react';
import styles from './SaigonWardMap.module.css';
import { HCMC_WARDS, gpsToSvg } from './ward-data';

/** 지도 위에 표시할 마커 */
export interface MapMarker {
  /** 마커 종류 (색/아이콘 결정) */
  type: 'me' | 'flood' | 'repair' | 'gas' | 'custom';
  /** GPS 좌표 (lat/lng) */
  lat: number;
  lng: number;
  /** 마커 라벨 (옵션) */
  label?: string;
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 추가 데이터 (커스텀용) */
  data?: unknown;
}

export interface SaigonWardMapProps {
  /** 강조 표시할 ward 코드 목록 */
  highlightedWards?: string[];
  /** 강조 컬러 (기본 brand 오렌지) */
  highlightColor?: string;
  /** 위험 표시 ward (침수 등, 빨강) */
  dangerWards?: string[];
  /** 마커 목록 */
  markers?: MapMarker[];
  /** 컴포넌트 높이 (기본 320px) */
  height?: number | string;
  /** 라벨 표시 여부 (기본 true). 작은 미리보기는 false 권장 */
  showLabels?: boolean;
  /** 범례 표시 여부 (기본 false, INFO-FLOOD-MAP에서만 true) */
  showLegend?: boolean;
  /** 컨테이너 배경색 (기본 시안의 #EEF7F5) */
  background?: string;
  /** 클릭 가능 여부 (false면 마커 클릭 비활성) */
  interactive?: boolean;
}

/**
 * Saigon Ward Map — 168 ward 정확한 행정구역 지도
 *
 * 사용처:
 *   1. INFO-HUB-001 (미니 미리보기, showLabels=false, height=120)
 *   2. INFO-FLOOD-MAP (메인, showLegend=true, dangerWards=활성침수)
 *   3. INFO-REPAIR-LIST (markers=정비소)
 *   4. INFO-GAS-LIST (markers=주유소)
 *
 * 시안 출처: docs/saigon-map-v2-accurate.html
 * SVG viewBox: 0 0 400 280
 */
export default function SaigonWardMap({
  highlightedWards = [],
  highlightColor = '#FFBB8A',
  dangerWards = [],
  markers = [],
  height = 320,
  showLabels = true,
  showLegend = false,
  background = '#EEF7F5',
  interactive = true,
}: SaigonWardMapProps) {
  // 마커를 SVG 좌표로 변환
  const svgMarkers = useMemo(() => {
    return markers.map(m => ({
      ...m,
      svg: gpsToSvg(m.lat, m.lng),
    }));
  }, [markers]);

  return (
    <div
      className={styles.mapContainer}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        background,
      }}
    >
      <svg
        viewBox="0 0 400 280"
        xmlns="http://www.w3.org/2000/svg"
        xmlLang="vi"
        className={styles.mapSvg}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="wardShadow">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.12" />
          </filter>
          <filter id="pinShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* 배경 */}
        <rect width="400" height="280" fill={background} />

        {/* ═══ 주요 도로 (Võ Nguyên Giáp, Phạm Văn Đồng, Nguyễn Văn Linh) ═══ */}
        <line x1="262" y1="92" x2="335" y2="62" stroke="#C8C8C8" strokeWidth="1.8" opacity="0.65" />
        <line x1="195" y1="68" x2="295" y2="58" stroke="#C8C8C8" strokeWidth="1.8" opacity="0.65" />
        <line x1="130" y1="185" x2="238" y2="188" stroke="#C8C8C8" strokeWidth="1.5" opacity="0.6" />

        {/* ═══ 사이공 강 ═══ */}
        <path
          d="M 262,88 C 268,106 272,122 268,140 C 264,158 258,176 252,194 C 248,212 250,230 256,246"
          stroke="#6ED8D0"
          strokeWidth="6"
          fill="none"
          opacity="0.85"
        />
        {/* 강 어귀 (Cần Giờ 방면) */}
        <path
          d="M 256,246 C 270,256 290,260 310,258 C 325,256 340,250 350,245"
          stroke="#6ED8D0"
          strokeWidth="8"
          fill="none"
          opacity="0.7"
        />

        {/* ═══ ward 폴리곤 + 라벨 — 29개 ═══ */}
        {/*
          전체 SVG는 docs/saigon-map-v2-accurate.html 의 첫 번째 SVG 본문을
          그대로 복사해서 여기 붙여넣기.
          단, fill/stroke 컬러는 props로 동적 변경되도록 변환.
          
          작업 방법:
          1. docs/saigon-map-v2-accurate.html 열기
          2. <svg viewBox="0 0 400 280"> ~ </svg> 내부 콘텐츠 복사
          3. <polygon ... fill="..."/> 부분을 highlightedWards/dangerWards 체크하도록 수정
          
          예시 (Bến Nghé 폴리곤):
        */}
        {/* Bến Nghé (옛 Q.1) */}
        <polygon
          points="240,142 270,140 274,158 268,170 244,168 238,154"
          fill={
            dangerWards.includes('BEN_NGHE') ? '#FEE2E2'
            : highlightedWards.includes('BEN_NGHE') ? highlightColor
            : '#FFFFFF'
          }
          stroke={
            dangerWards.includes('BEN_NGHE') ? '#EF4444'
            : highlightedWards.includes('BEN_NGHE') ? '#FF5A1F'
            : '#D1D5DB'
          }
          strokeWidth={
            highlightedWards.includes('BEN_NGHE') || dangerWards.includes('BEN_NGHE')
              ? 1.5 : 1
          }
          filter="url(#wardShadow)"
        />
        {showLabels && (
          <text x="256" y="156" fontFamily="Inter, sans-serif" fontSize="7"
                fontWeight="600" fill="#374151" textAnchor="middle">
            Bến Nghé
          </text>
        )}

        {/*
          ⚠️ 작업 안내:
          위 Bến Nghé 패턴을 시안의 모든 29개 ward에 동일 적용.
          시안의 SVG 본문을 그대로 복사하되, <polygon> 의 fill/stroke만
          dangerWards/highlightedWards 체크 ternary 로 변환.
          
          나머지 28개 ward 코드는 ward-data.ts 의 HCMC_WARDS 배열 참고:
          BEN_THANH, SAIGON, PHAM_NGU_LAO, NGUYEN_THAI_BINH, CO_GIANG,
          AN_DONG, CHO_LON, CHANH_HUNG, BINH_THANH, THAO_DIEN,
          THU_DUC, LINH_TRUNG, LINH_XUAN, TAN_MY, TAN_THUAN, PHU_MY,
          HOA_HUNG, HOA_BINH, GO_VAP, TAN_BINH, TAN_THOI_HIEP, THOI_AN,
          BINH_TAN, CU_CHI, HOC_MON, BINH_CHANH, NHA_BE, CAN_GIO
        */}

        {/* ═══ 다리 마커 ═══ */}
        <text x="270" y="105" fontSize="11" textAnchor="middle">▲</text>
        <text x="270" y="118" fontSize="6" fill="#6B7280" textAnchor="middle">Cầu Sài Gòn</text>
        <text x="252" y="200" fontSize="11" textAnchor="middle">▲</text>
        <text x="252" y="213" fontSize="6" fill="#6B7280" textAnchor="middle">Cầu Phú Mỹ</text>
        <text x="278" y="148" fontSize="9" textAnchor="middle">▲</text>
        <text x="278" y="160" fontSize="6" fill="#6B7280" textAnchor="middle">Thủ Thiêm</text>

        {/* ═══ 마커 (사용자가 props로 전달) ═══ */}
        {svgMarkers.map((m, i) => (
          <g
            key={i}
            transform={`translate(${m.svg.x}, ${m.svg.y})`}
            style={{ cursor: interactive && m.onClick ? 'pointer' : 'default' }}
            onClick={() => interactive && m.onClick?.()}
          >
            {m.type === 'me' && (
              <>
                <circle r="6" fill="#FF5A1F" filter="url(#pinShadow)" />
                <circle r="3" fill="white" />
                {m.label && (
                  <text y="-10" fontSize="7" fontWeight="700" fill="#FF5A1F"
                        textAnchor="middle">{m.label}</text>
                )}
              </>
            )}
            {m.type === 'flood' && (
              <>
                <text fontSize="14" textAnchor="middle" dy="4">💧</text>
                {m.label && (
                  <text y="14" fontSize="6" fontWeight="600" fill="#EF4444"
                        textAnchor="middle">{m.label}</text>
                )}
              </>
            )}
            {m.type === 'repair' && (
              <>
                <text fontSize="12" textAnchor="middle" dy="4">🔧</text>
                {m.label && (
                  <text y="14" fontSize="6" fontWeight="600" fill="#374151"
                        textAnchor="middle">{m.label}</text>
                )}
              </>
            )}
            {m.type === 'gas' && (
              <>
                <text fontSize="12" textAnchor="middle" dy="4">⛽</text>
                {m.label && (
                  <text y="14" fontSize="6" fontWeight="600" fill="#374151"
                        textAnchor="middle">{m.label}</text>
                )}
              </>
            )}
          </g>
        ))}
      </svg>

      {/* 범례 (옵션) */}
      {showLegend && (
        <div className={styles.legend}>
          <div className={styles.legendTitle}>범례</div>
          <div className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: '#FF5A1F' }} />
            내 위치
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendIcon}>💧</span> 침수 활성
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendIcon}>🔧</span> 정비소
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendLine} /> 주요 도로
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendIcon}>▲</span> 다리
          </div>
        </div>
      )}
    </div>
  );
}
```

⚠️ **중요**: 위 코드는 Bến Nghé 1개 ward만 예시로 적었어요. 나머지 28개 ward는 **시안 HTML(`docs/saigon-map-v2-accurate.html`)의 SVG 본문을 그대로 복사**해서 같은 패턴으로 fill/stroke ternary 변환하세요.

### Task 1.3: SaigonWardMap.module.css 작성

`frontend/src/components/maps/SaigonWardMap.module.css`:

```css
.mapContainer {
  position: relative;
  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.mapSvg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* 범례 */
.legend {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: #374151;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.legendTitle {
  font-size: 10px;
  font-weight: 700;
  color: #6B7280;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.legendItem {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  white-space: nowrap;
}

.legendDot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.legendIcon {
  display: inline-block;
  width: 14px;
  text-align: center;
}

.legendLine {
  display: inline-block;
  width: 16px;
  height: 2px;
  background: #C8C8C8;
}

/* 모바일 최적화 */
@media (max-width: 480px) {
  .legend {
    font-size: 10px;
    padding: 8px 10px;
  }
}
```

### Task 1.4: README.md 작성

`frontend/src/components/maps/README.md`:

```markdown
# SaigonWardMap

Saigon Rider — 168 ward 정확한 행정구역 지도 컴포넌트.

## 사용처

| 화면 | 용도 | Props |
|---|---|---|
| INFO-HUB | 미니 미리보기 | height=120, showLabels=false |
| INFO-FLOOD-MAP | 침수 신고 메인 | showLegend=true, dangerWards=[...] |
| INFO-REPAIR-LIST | 정비소 위치 | markers=[type:'repair', ...] |
| INFO-GAS-LIST | 주유소 위치 | markers=[type:'gas', ...] |

## 기본 사용법

```tsx
import SaigonWardMap from '@/components/maps/SaigonWardMap';
import { findNearestWard } from '@/components/maps/ward-data';

// 1. 사용자 위치만 표시
<SaigonWardMap
  markers={[
    { type: 'me', lat: 10.7780, lng: 106.7019, label: '나의 위치' }
  ]}
  highlightedWards={['BEN_NGHE']}
/>

// 2. 침수 활성 표시
<SaigonWardMap
  dangerWards={['BINH_THANH', 'TAN_MY']}
  markers={floods.map(f => ({
    type: 'flood',
    lat: f.lat,
    lng: f.lng,
    label: `${f.depth_level}`,
    onClick: () => navigate(`/info/flood/${f.report_id}`),
  }))}
  showLegend={true}
  height={400}
/>

// 3. 정비소 리스트
<SaigonWardMap
  markers={shops.map(s => ({
    type: 'repair',
    lat: s.lat,
    lng: s.lng,
    label: s.name,
    onClick: () => navigate(`/info/repair/${s.shop_id}`),
  }))}
  height={300}
/>
```

## 좌표 시스템

- SVG viewBox: `0 0 400 280`
- GPS → SVG 변환: `gpsToSvg(lat, lng)` 사용
- ward 좌표는 `HCMC_WARDS` 배열에 미리 정의됨

## 디자인 토큰

- 배경: `#EEF7F5`
- 사이공 강: `#6ED8D0`
- 일반 ward 채움: `#FFFFFF`
- 일반 ward 보더: `#D1D5DB`
- 강조 ward: `#FFBB8A` + `#FF5A1F`
- 위험 ward (침수): `#FEE2E2` + `#EF4444`
- 도로: `#C8C8C8` (opacity 0.65)
```

---

## §3. Phase 2 — 4개 화면에 적용 (각 2-3시간)

### Task 2.1: InfoHub.tsx — 미니 미리보기

`frontend/src/pages/info/InfoHub.tsx` 수정:

```tsx
import SaigonWardMap from '@/components/maps/SaigonWardMap';
import { findNearestWard } from '@/components/maps/ward-data';

// 기존 InfoHub 컴포넌트 내부에서, 4개 정보 카드 아래에 추가:
<section className={styles.miniMapSection}>
  <h3>지금 우리 동네</h3>
  <SaigonWardMap
    height={140}
    showLabels={false}
    showLegend={false}
    highlightedWards={userWard ? [userWard.code] : []}
    dangerWards={activeFloods.map(f => findNearestWard(f.lat, f.lng)?.code).filter(Boolean) as string[]}
    markers={[
      ...(userLocation ? [{
        type: 'me' as const,
        lat: userLocation.lat,
        lng: userLocation.lng,
      }] : []),
      ...activeFloods.slice(0, 3).map(f => ({
        type: 'flood' as const,
        lat: f.lat,
        lng: f.lng,
      })),
    ]}
    interactive={false}
  />
  <button onClick={() => navigate('/info/flood')} className={styles.expandButton}>
    지도 크게 보기 →
  </button>
</section>
```

### Task 2.2: InfoFloodMap.tsx — 메인 침수 지도

`frontend/src/pages/info/InfoFloodMap.tsx`:

```tsx
import SaigonWardMap, { MapMarker } from '@/components/maps/SaigonWardMap';
import { findNearestWard } from '@/components/maps/ward-data';

const InfoFloodMap = () => {
  const [floods, setFloods] = useState<FloodReport[]>([]);
  const { location } = useGeolocation();

  // 침수 ward 자동 계산
  const dangerWardCodes = useMemo(() => {
    return floods
      .map(f => findNearestWard(f.lat, f.lng)?.code)
      .filter((c): c is string => !!c);
  }, [floods]);

  const markers: MapMarker[] = useMemo(() => {
    const result: MapMarker[] = [];
    
    if (location) {
      result.push({
        type: 'me',
        lat: location.lat,
        lng: location.lng,
        label: '나',
      });
    }
    
    floods.forEach(f => {
      result.push({
        type: 'flood',
        lat: f.lat,
        lng: f.lng,
        label: f.depth_level === 'knee' ? '무릎' : f.depth_level === 'thigh' ? '허벅지' : '발목',
        onClick: () => setSelectedFlood(f),
        data: f,
      });
    });
    
    return result;
  }, [floods, location]);

  return (
    <div className={styles.floodMapPage}>
      <header>
        <h1>침수 지도</h1>
        <span className={styles.activeCount}>활성 {floods.length}건</span>
      </header>

      <SaigonWardMap
        dangerWards={dangerWardCodes}
        markers={markers}
        showLabels={true}
        showLegend={true}
        height={420}
        interactive={true}
      />

      {/* 활성 침수 리스트 */}
      <section className={styles.floodList}>
        {floods.map(f => (
          <FloodCard key={f.report_id} flood={f} />
        ))}
      </section>

      {/* FAB 신고 버튼 */}
      <button
        className={styles.fab}
        onClick={() => navigate('/info/flood/report')}
      >
        + 침수 신고
      </button>
    </div>
  );
};
```

### Task 2.3: InfoRepairList.tsx 수정

```tsx
import SaigonWardMap from '@/components/maps/SaigonWardMap';

// 기존 리스트 위에 지도 토글 추가
<div className={styles.viewToggle}>
  <button onClick={() => setView('list')}>리스트</button>
  <button onClick={() => setView('map')}>지도</button>
</div>

{view === 'map' && (
  <SaigonWardMap
    height={400}
    markers={shops.map(s => ({
      type: 'repair' as const,
      lat: s.lat,
      lng: s.lng,
      label: s.name,
      onClick: () => navigate(`/info/repair/${s.shop_id}`),
    }))}
    showLegend={false}
  />
)}
```

### Task 2.4: InfoGasList.tsx 수정

InfoRepairList와 동일 패턴, type='gas' 사용.

---

## §4. Phase 3 — DB 마이그레이션 (1-2시간)

### Task 3.1: ward 매핑 테이블 추가

`backend/migrations/202605xx_ward_mapping.sql`:

```sql
-- 168 ward 마스터 테이블
CREATE TABLE IF NOT EXISTS ward (
  ward_code VARCHAR(40) PRIMARY KEY,
  name_vi VARCHAR(100) NOT NULL,
  name_ko VARCHAR(100),
  name_en VARCHAR(100),
  old_district VARCHAR(40),
  zone VARCHAR(20) CHECK (zone IN ('center', 'inner', 'outer')),
  center_lat DECIMAL(10, 7) NOT NULL,
  center_lng DECIMAL(10, 7) NOT NULL,
  svg_x INT,
  svg_y INT,
  geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ward_geom ON ward USING GIST(geom);
CREATE INDEX idx_ward_old_district ON ward(old_district);

-- 시드 데이터 (frontend의 ward-data.ts 와 동기)
INSERT INTO ward (ward_code, name_vi, name_ko, old_district, zone, center_lat, center_lng, svg_x, svg_y) VALUES
  ('BEN_NGHE',          'Bến Nghé',       '벤응에',          'Q.1',         'center', 10.7780, 106.7019, 256, 152),
  ('BEN_THANH',         'Bến Thành',      '벤탄',            'Q.1',         'center', 10.7720, 106.6960, 240, 144),
  ('SAIGON',            'Saigon',         '사이공',          'Q.1',         'center', 10.7665, 106.7000, 240, 158),
  ('PHAM_NGU_LAO',      'Phạm Ngũ Lão',   '팜응우라오',      'Q.1',         'center', 10.7680, 106.6920, 226, 144),
  ('NGUYEN_THAI_BINH',  'Nguyễn Thái Bình','응우옌타이빈',    'Q.1',         'center', 10.7660, 106.6960, 220, 156),
  ('CO_GIANG',          'Cô Giang',       '꼬장',            'Q.1',         'center', 10.7625, 106.6905, 210, 152),
  ('AN_DONG',           'An Đông',        '안동',            'Q.5',         'center', 10.7565, 106.6697, 178, 156),
  ('CHO_LON',           'Chợ Lớn',        '쩌런',            'Q.5',         'center', 10.7519, 106.6588, 158, 152),
  ('CHANH_HUNG',        'Chánh Hưng',     '짠흥',            'Q.8',         'center', 10.7450, 106.6758, 198, 176),
  ('BINH_THANH',        'Bình Thạnh',     '빈탄',            'Bình Thạnh',  'inner',  10.8011, 106.7100, 232, 110),
  ('THAO_DIEN',         'Thảo Điền',      '타오디엔',        'Q.2',         'inner',  10.8060, 106.7395, 290, 120),
  ('THU_DUC',           'Thủ Đức',        '투득',            'Thủ Đức',     'inner',  10.8500, 106.7717, 320, 100),
  ('LINH_TRUNG',        'Linh Trung',     '린쭝',            'Thủ Đức',     'inner',  10.8717, 106.7717, 340, 88),
  ('LINH_XUAN',         'Linh Xuân',      '린쑤안',          'Thủ Đức',     'inner',  10.8800, 106.7717, 358, 78),
  ('TAN_MY',            'Tân Mỹ',         '떤미',            'Q.7',         'inner',  10.7261, 106.7228, 242, 220),
  ('TAN_THUAN',         'Tân Thuận',      '떤투언',          'Q.7',         'inner',  10.7550, 106.7364, 260, 208),
  ('PHU_MY',            'Phú Mỹ',         '푸미',            'Q.7',         'inner',  10.7228, 106.7178, 222, 222),
  ('HOA_HUNG',          'Hòa Hưng',       '호아흥',          'Q.10',        'inner',  10.7744, 106.6717, 188, 120),
  ('HOA_BINH',          'Hòa Bình',       '호아빈',          'Q.11',        'inner',  10.7703, 106.6453, 162, 116),
  ('GO_VAP',            'Gò Vấp',         '고밥',            'Gò Vấp',      'inner',  10.8386, 106.6664, 160, 88),
  ('TAN_BINH',          'Tân Bình',       '떤빈',            'Tân Bình',    'inner',  10.8014, 106.6531, 198, 96),
  ('TAN_THOI_HIEP',     'Tân Thới Hiệp',  '떤터이히엡',      'Q.12',        'outer',  10.8611, 106.6406, 142, 60),
  ('THOI_AN',           'Thới An',        '터이안',          'Q.12',        'outer',  10.8728, 106.6544, 122, 72),
  ('BINH_TAN',          'Bình Tân',       '빈떤',            'Bình Tân',    'inner',  10.8036, 106.5914, 124, 132),
  ('CU_CHI',            'Củ Chi',         '꾸찌',            'Củ Chi',      'outer',  11.0000, 106.5000,  80, 26),
  ('HOC_MON',           'Hóc Môn',        '혹몬',            'Hóc Môn',     'outer',  10.8886, 106.5958, 118, 53),
  ('BINH_CHANH',        'Bình Chánh',     '빈짠',            'Bình Chánh',  'outer',  10.7500, 106.5500,  88, 170),
  ('NHA_BE',            'Nhà Bè',         '냐베',            'Nhà Bè',      'outer',  10.6900, 106.7400, 188, 244),
  ('CAN_GIO',           'Cần Giờ',        '깐저',            'Cần Giờ',     'outer',  10.4144, 106.9333, 320, 250)
ON CONFLICT (ward_code) DO NOTHING;

-- 기존 테이블에 ward_code 컬럼 추가 (호환성 유지)
ALTER TABLE flood_report     ADD COLUMN IF NOT EXISTS ward_code VARCHAR(40) REFERENCES ward(ward_code);
ALTER TABLE gas_station      ADD COLUMN IF NOT EXISTS ward_code VARCHAR(40) REFERENCES ward(ward_code);
ALTER TABLE repair_shop      ADD COLUMN IF NOT EXISTS ward_code VARCHAR(40) REFERENCES ward(ward_code);

CREATE INDEX IF NOT EXISTS idx_flood_ward ON flood_report(ward_code);
CREATE INDEX IF NOT EXISTS idx_gas_ward ON gas_station(ward_code);
CREATE INDEX IF NOT EXISTS idx_repair_ward ON repair_shop(ward_code);
```

### Task 3.2: 기존 데이터 ward 매핑 백필

```sql
-- gas_station에 가장 가까운 ward 자동 매핑
UPDATE gas_station gs
SET ward_code = (
  SELECT w.ward_code
  FROM ward w
  ORDER BY w.geom <-> gs.geom
  LIMIT 1
)
WHERE gs.ward_code IS NULL;

-- repair_shop도 동일
UPDATE repair_shop rs
SET ward_code = (
  SELECT w.ward_code FROM ward w
  ORDER BY w.geom <-> rs.geom LIMIT 1
)
WHERE rs.ward_code IS NULL;

-- 검증
SELECT COUNT(*) FROM gas_station WHERE ward_code IS NULL;   -- 0이어야 함
SELECT COUNT(*) FROM repair_shop WHERE ward_code IS NULL;   -- 0이어야 함
```

---

## §5. Phase 4 — 검수 + 통합 테스트

### Task 4.1: 시각 검수 체크리스트

```
□ /info → InfoHub 미니 지도 표시됨 (140px 높이)
□ /info/flood → 메인 지도 표시 + 범례 우상단
□ 침수 신고 1건 추가 → 해당 ward 빨강 + 💧 마커
□ /info/repair → "지도" 토글 클릭 → 정비소 핀 다수
□ /info/gas → 지도 토글 클릭 → 주유소 핀 다수
□ 모바일 viewport (393×852) 에서 지도 깨지지 않음
□ 한국어 + 베트남어 라벨 모두 다이아크리틱 깨짐 없음
□ ward 클릭 → onClick 핸들러 호출됨 (interactive=true 일 때)
```

### Task 4.2: 자동 검증

```bash
# 컴포넌트 빌드 통과 확인
cd frontend && npm run build

# DB 마이그레이션 적용
cd ../backend && alembic upgrade head 또는 psql 직접 실행

# ward 시드 확인
psql $DATABASE_URL -c "SELECT COUNT(*) FROM ward;"
# 기대값: 29

# ward_code 백필 확인
psql $DATABASE_URL -c "
SELECT 
  (SELECT COUNT(*) FROM gas_station WHERE ward_code IS NULL) AS gas_missing,
  (SELECT COUNT(*) FROM repair_shop WHERE ward_code IS NULL) AS repair_missing;
"
# 기대값: 둘 다 0
```

---

## §6. 작업 순서 (요약)

```
Phase 0 (15분):     디자인 시안 위치 확인 + 코드베이스 파악
Phase 1 (4-6시간):  SaigonWardMap.tsx + ward-data.ts + CSS + README
Phase 2 (8-12시간): 4개 화면에 적용
Phase 3 (1-2시간):  DB 마이그레이션 + ward 시드 + 백필
Phase 4 (1시간):    검수 + 통합 테스트

총 2-3일 (풀타임)
```

---

## §7. 코드에게 던질 첫 메시지

```
Saigon Rider 지도 컴포넌트 작업 시작.

【디자인 시안】
docs/saigon-map-v2-accurate.html (Skywork 결과물, 사용자 검수 완료)
- viewBox: 0 0 400 280
- 29개 ward 폴리곤 + 사이공 강 + 도로 + 다리 + 범례 포함
- 베트남어 다이아크리틱 정확

【작업 지시서】
docs/map-component-instructions.md (이 문서)

【작업 범위】
1. components/maps/SaigonWardMap.tsx 메인 컴포넌트 생성
2. components/maps/ward-data.ts 29 ward 메타데이터
3. components/maps/SaigonWardMap.module.css 스타일
4. 4개 화면에 적용 (InfoHub, InfoFloodMap, InfoRepairList, InfoGasList)
5. backend ward 테이블 + 매핑 마이그레이션

【중요】
- 시안 HTML의 SVG 본문을 그대로 복사하되, fill/stroke는 props로 동적 변경
- 코드베이스가 .tsx 인지 .jsx 인지 확인 후 맞춰서 작성
- 베트남어 다이아크리틱 절대 깨지지 않게 (UTF-8)
- 위임형 진행: 모호한 결정은 합리적으로 정하고 결과 알려줘

Phase 0부터 시작해줘.
```

---

## §8. 문제 해결 가이드

| 문제 | 해결 |
|---|---|
| 베트남어 라벨 깨짐 | SVG에 `xml:lang="vi"` + font Inter or Noto Sans 사용 |
| 폴리곤 좌표 입력 오류 | 시안 HTML 그대로 복사 (수동 입력 X) |
| 마커가 viewBox 밖 | `gpsToSvg()` 의 bounding box 조정 |
| ward 매핑 부정확 | PostGIS `<->` operator (KNN) 사용, 폴리곤 사용은 Phase 2 |
| 모바일에서 라벨 너무 작음 | showLabels=false 로 미니 모드 사용 |

---

## §9. 한 줄 정리

**"v2 지도 시안 (29 ward + 사이공 강 + 도로)을 SaigonWardMap React 컴포넌트로 옮기고, 4개 정보 화면(허브/침수/정비소/주유소)에 적용. ward 테이블 + GPS-ward 매핑 백필. 2-3일 작업."**

이게 v1 출시 지도 시스템의 완성 작업입니다.

---

(끝)
