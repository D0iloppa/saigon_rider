import { useEffect, useState } from 'react';
import { fetchPoiMapItems } from '@/api/poi';
import { buildPoiLayer } from '@/components/maps/poiLayer';
import type { MapMarkerV2 } from '@/components/maps/v2/region';

export interface PoiBbox { N: number; S: number; E: number; W: number }

/**
 * bbox 변화마다 POI 참조 레이어를 재조회 (BizLocationPicker/BizPublic 공용,
 * 동네지도 NeighborhoodMapCanvas와 동일 트리거 패턴). AbortController로 경합 요청을 취소한다.
 */
export function usePoiMarkers(bbox: PoiBbox | null, lang: string): MapMarkerV2[] {
  const [poiMarkers, setPoiMarkers] = useState<MapMarkerV2[]>([]);

  useEffect(() => {
    if (!bbox) { setPoiMarkers([]); return; }
    let cancelled = false;
    const controller = new AbortController();
    fetchPoiMapItems({ minLat: bbox.S, maxLat: bbox.N, minLng: bbox.W, maxLng: bbox.E, signal: controller.signal })
      .then((items) => { if (!cancelled) setPoiMarkers(buildPoiLayer(items, lang)); })
      .catch(() => { if (!cancelled) setPoiMarkers([]); });
    return () => { cancelled = true; controller.abort(); };
  }, [bbox, lang]);

  return poiMarkers;
}
