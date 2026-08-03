import { describe, it, expect } from 'vitest';
import type { Ward } from './master';

// master.ts → i18n.ts 는 모듈 로드 시점에 localStorage 를 읽는다. vitest 기본 환경(node)엔
// localStorage 가 없어 정적 import 만으로 이 테스트가 깨지므로, import 전에 최소 폴리필을 둔다.
(globalThis as { localStorage?: Storage }).localStorage ??= {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as Storage;

const { resolveWardByCoords } = await import('./master');

// 실기기 회귀: 실제 위치가 "Sài Gòn" 동 폴리곤 내부인데도, resolveWardByCoords 가
// 최근접-중심점(haversine) 방식이라 더 가까운 중심을 가진 "Bến Thành" 를 반환해버렸다.
// 테스트 좌표(10.77293, 106.70030)는 saigon-depth1.json 의 37개 동 폴리곤 전체를 훑어
// "Sài Gòn" 에만 속하는(다른 동과 겹치지 않는) 점 중에서 고른 것 — wardRegionAt() 로도
// 실제로 "Sài Gòn" 을 반환함을 확인했다. Bến Thành 중심(10.7707,106.69456)까지 ≈0.67km,
// Sài Gòn 중심(10.7810,106.70418)까지 ≈0.99km 로 Bến Thành 쪽이 더 가깝다.
const SAI_GON_INTERIOR_POINT_NEAR_BEN_THANH_CENTER = { lat: 10.77293, lng: 106.7003 };

const WARDS: Ward[] = [
  {
    id: 42,
    code: 'BEN_THANH',
    city_code: 'HCMC',
    name_vi: 'Bến Thành',
    name_en: 'Ben Thanh',
    name_ko: null,
    center_lat: 10.7707,
    center_lng: 106.69456,
    district: null,
  },
  {
    id: 43,
    code: 'SAI_GON',
    city_code: 'HCMC',
    name_vi: 'Sài Gòn',
    name_en: 'Sai Gon',
    name_ko: null,
    center_lat: 10.781,
    center_lng: 106.70418,
    district: null,
  },
];

describe('resolveWardByCoords', () => {
  it('폴리곤상 Sài Gòn 내부 좌표는, 중심점이 더 가까운 Bến Thành 이 아니라 Sài Gòn 을 반환해야 한다', () => {
    const { lat, lng } = SAI_GON_INTERIOR_POINT_NEAR_BEN_THANH_CENTER;
    const w = resolveWardByCoords(lat, lng, WARDS);
    expect(w?.name_vi).toBe('Sài Gòn');
  });

  it('서비스 폴리곤 밖 좌표는 여전히 null (기존 폴백 동작 유지)', () => {
    // 하노이 좌표 — 호치민 서비스 지역 밖
    const w = resolveWardByCoords(21.0278, 105.8342, WARDS);
    expect(w).toBeNull();
  });
});
