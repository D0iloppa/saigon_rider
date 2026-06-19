import { api } from './client';

export interface DistrictCount {
  district_id: number;
  lat: number;
  lng: number;
  count: number;
}

export async function fetchDistrictCounts(tab: 'listings' | 'feed'): Promise<DistrictCount[]> {
  const data = await api.realFetch<{ counts: DistrictCount[] }>(
    `/map/district-counts?tab=${tab}`,
  );
  return data.counts;
}
