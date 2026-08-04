import { describe, it, expect } from 'vitest';
import { findNearestDistrict } from './district-data';

// 실기기 회귀: market.test.ts 의 "Sài Gòn vs Bến Thành" 와 동일한 계열 버그가
// findNearestDistrict(district-data.ts) 에도 있었다 — 최근접-중심점(haversine) 방식이라
// 폴리곤상 "Sài Gòn" 내부인데도 중심점이 더 가까운 "Bến Thành" 을 반환해버렸다.
// HCMC_DISTRICTS 의 Bến Thành gps(10.7720,106.6960)/Sài Gòn gps(10.7665,106.7000) 가
// market.test.ts 의 SAIGON_DISTRICT/BEN_THANH 중심좌표와 동일해, 동일 좌표로 재현된다.
describe('findNearestDistrict', () => {
  it('폴리곤상 Sài Gòn 내부 좌표는, 중심점이 더 가까운 Bến Thành 이 아니라 Sài Gòn 을 반환해야 한다', () => {
    const d = findNearestDistrict(10.77293, 106.7003);
    expect(d?.nameVi).toBe('Sài Gòn');
  });

  // 폴리곤 매칭 실패(depth1 에 없는 동/이름 불일치) 좌표는 기존 최근접-중심점 폴백을 그대로 써야 한다.
  // 좌표는 market.test.ts 의 "Nguyễn Thái Bình 중심점" 재현 좌표와 동일 — HCMC_DISTRICTS 의
  // Nguyễn Thái Bình gps(10.7660,106.6960) 에 그대로 얹은 값.
  it('폴리곤 매칭 대상이 아닌 좌표는 기존 최근접-중심점 방식으로 폴백한다', () => {
    const d = findNearestDistrict(10.766, 106.696);
    expect(d?.nameVi).toBe('Nguyễn Thái Bình');
  });
});
