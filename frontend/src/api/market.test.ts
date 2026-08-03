import { describe, it, expect } from 'vitest';
import type { District } from './master';

// market.ts → i18n.ts 는 모듈 로드 시점에 localStorage 를 읽는다. vitest 기본 환경(node)엔
// localStorage 가 없어 정적 import 만으로 이 테스트가 깨지므로, import 전에 최소 폴리필을 둔다.
(globalThis as { localStorage?: Storage }).localStorage ??= {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as Storage;

const { resolveDistrict } = await import('./market');

// 실기기 회귀: master.test.ts 의 "Sài Gòn vs Bến Thành" 와 동일한 계열 버그가
// resolveDistrict(market.ts) 에도 남아 있었다 — 최근접-중심점(haversine) 방식이라
// 폴리곤상 "Bến Thành" 내부인데도 중심점이 더 가까운 "Nguyễn Thái Bình" 을 반환해버렸다.
// 테스트 좌표(10.76374, 106.69817)는 saigon-depth1.json 의 "Bến Thành" 폴리곤 내부
// 이면서, districts 목록 중 "Nguyễn Thái Bình" 중심점이 더 가까운 좌표로 스캔해 도출.
// (Bến Thành 중심 10.7720,106.6960 까지 ≈0.93km, Nguyễn Thái Bình 중심 10.7660,106.6960
// 까지 ≈0.35km 로 Nguyễn Thái Bình 쪽이 더 가깝다.)
const BEN_THANH_INTERIOR_POINT_NEAR_NGUYEN_THAI_BINH_CENTER = { lat: 10.76374, lng: 106.69817 };

const DISTRICTS: District[] = [
  {
    id: 1,
    code: 'BEN_THANH',
    name_ko: null as unknown as string,
    name_vi: 'Bến Thành',
    name_en: 'Ben Thanh',
    image_url: null,
    center_lat: 10.772,
    center_lng: 106.696,
  },
  {
    id: 2,
    code: 'NGUYEN_THAI_BINH',
    name_ko: null as unknown as string,
    name_vi: 'Nguyễn Thái Bình',
    name_en: 'Nguyen Thai Binh',
    image_url: null,
    center_lat: 10.766,
    center_lng: 106.696,
  },
];

describe('resolveDistrict', () => {
  it('폴리곤상 Bến Thành 내부 좌표는, 중심점이 더 가까운 Nguyễn Thái Bình 이 아니라 Bến Thành 을 반환해야 한다', () => {
    const { lat, lng } = BEN_THANH_INTERIOR_POINT_NEAR_NGUYEN_THAI_BINH_CENTER;
    const d = resolveDistrict(lat, lng, DISTRICTS);
    expect(d?.name_vi).toBe('Bến Thành');
  });

  it('서비스 폴리곤 밖 좌표는 여전히 null (기존 폴백 동작 유지)', () => {
    // 하노이 좌표 — 호치민 서비스 지역 밖
    const d = resolveDistrict(21.0278, 105.8342, DISTRICTS);
    expect(d).toBeNull();
  });

  it('폴리곤 매칭 실패(이름 불일치) 좌표는 기존 최근접-중심점 방식으로 폴백한다', () => {
    // Nguyễn Thái Bình 중심점에 그대로 얹은 좌표 — 폴리곤 이름 매칭 대상이 아니어도
    // (여기선 DISTRICTS 에 매칭될 폴리곤이 없는 임의 위치) 최근접 중심점 로직이 살아있어야 한다.
    const d = resolveDistrict(10.766, 106.696, DISTRICTS);
    expect(d?.name_vi).toBe('Nguyễn Thái Bình');
  });

  // 실기기 회귀: districts.code='SAIGON' 행의 name_vi 가 성조 없는 'Saigon' 으로 시딩돼
  // saigon-depth1.json 폴리곤 이름('Sài Gòn')과 불일치, 폴리곤 매칭이 실패해 실제로는
  // "Sài Gòn" 동인데 최근접-중심점 폴백으로 "Bến Thành" 이 잡히는 버그가 있었다(DB 시딩 결함,
  // 172_districts_saigon_name_vi_fix.sql 로 교정). name_vi 를 'Sài Gòn' 으로 교정한 뒤에도
  // 매칭이 성립하는지 증명한다. 좌표(10.77293, 106.70030)는 master.test.ts 의
  // "Sài Gòn vs Bến Thành" 회귀와 동일 — Sài Gòn 폴리곤 내부이면서 Bến Thành 중심(10.772,106.696)
  // 이 Sài Gòn 중심(10.7665,106.7000)보다 더 가깝다.
  it('폴리곤상 Sài Gòn 내부 좌표는, 중심점이 더 가까운 Bến Thành 이 아니라 Sài Gòn 을 반환해야 한다', () => {
    const SAIGON_DISTRICT: District = {
      id: 50,
      code: 'SAIGON',
      name_ko: null as unknown as string,
      name_vi: 'Sài Gòn',
      name_en: 'Sai Gon',
      image_url: null,
      center_lat: 10.7665,
      center_lng: 106.7,
    };
    const d = resolveDistrict(10.77293, 106.7003, [...DISTRICTS, SAIGON_DISTRICT]);
    expect(d?.name_vi).toBe('Sài Gòn');
  });
});
