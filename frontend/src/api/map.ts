import { api } from './client';

export interface DistrictCount {
  /** 집계 단위 id — tab=listings는 ward id, tab=feed는 district id (테이블 조인용 아님) */
  region_id: number;
  lat: number;
  lng: number;
  count: number;
}

export async function fetchDistrictCounts(tab: 'listings' | 'feed', level: 'ward' | 'district' = 'ward'): Promise<DistrictCount[]> {
  const data = await api.realFetch<{ counts: DistrictCount[] }>(
    `/map/district-counts?tab=${tab}&level=${level}`,
  );
  return data.counts;
}
