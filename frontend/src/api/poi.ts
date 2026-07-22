import { api } from './client';

// ── POI 지도 조회 (상시 참조 레이어, Phase A-2) ─────────────────

export interface PoiMapItem {
  id: string;
  category: 'landmark' | 'civic' | string;
  nameKo: string;
  nameVi: string | null;
  nameEn: string | null;
  address: string | null;
  lat: number;
  lng: number;
  photoUrl: string | null;
}

interface PoiMapItemApi {
  id: string;
  category: string;
  name_ko: string;
  name_vi: string | null;
  name_en: string | null;
  address: string | null;
  lat: string | number;
  lng: string | number;
  photo_url: string | null;
}

// ── 모듈 스코프 인메모리 bbox 캐시 (TTL 1시간, containment 방식) ──
// 동네지도 모듈 내부에 캡슐화된 캐시 — 앱 전역 캐싱 인프라(React Query 등)에
// 얹지 않는다. 세션 내에서만 유효(콜드 재시작 시 소멸 — 영속화는 범위 밖, 후속 결정 필요).
//
// 라운딩한 bbox를 캐시 키로 쓰면(이전 구현) 딥줌 뷰포트(최대줌 ~220m)가 격자(1km)보다
// 작아서, 같은 격자 셀 안에서 500m 미만만 팬해도 "다른 실제 위치"의 캐시가 그대로
// 반환되는 오반환이 생긴다. 대신 요청 bbox보다 넓게(폭/높이 50% 확장) 조회해 캐시하고,
// 새 요청은 그 bbox를 완전히 포함하는 신선한 캐시 엔트리가 있을 때만 재사용한다 —
// "현재 보고 있는 영역을 실제로 덮는 캐시만" 히트하므로 오반환이 없고, 확장 조회 덕에
// 작은 팬은 여전히 캐시를 탄다.
const POI_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const POI_BBOX_EXPAND = 0.5; // 조회 bbox를 폭/높이의 50%씩 확장해 캐싱
const POI_CACHE_MAX_ENTRIES = 50; // 무제한 누적 방지 — 초과 시 가장 오래된 항목부터 제거

interface PoiBbox { minLat: number; maxLat: number; minLng: number; maxLng: number }
interface PoiCacheEntry { bbox: PoiBbox; category?: string; q?: string; items: PoiMapItem[]; fetchedAt: number }

const poiCache: PoiCacheEntry[] = [];

function bboxContains(outer: PoiBbox, inner: PoiBbox): boolean {
  return outer.minLat <= inner.minLat && outer.maxLat >= inner.maxLat
    && outer.minLng <= inner.minLng && outer.maxLng >= inner.maxLng;
}

export async function fetchPoiMapItems(params: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  category?: string;
  q?: string;
  signal?: AbortSignal;
}): Promise<PoiMapItem[]> {
  const reqBbox: PoiBbox = { minLat: params.minLat, maxLat: params.maxLat, minLng: params.minLng, maxLng: params.maxLng };
  const now = Date.now();
  for (const entry of poiCache) {
    if (now - entry.fetchedAt >= POI_CACHE_TTL_MS) continue;
    if ((entry.category ?? '') !== (params.category ?? '') || (entry.q ?? '') !== (params.q ?? '')) continue;
    if (bboxContains(entry.bbox, reqBbox)) return entry.items;
  }

  // 확장된 bbox로 조회 — 서버가 이 영역으로 필터해 반환하므로 현재 뷰 items는 그 부분집합.
  // 렌더가 어차피 화면 bbox로 다시 컬링하므로 그대로 반환해도 무방(클라이언트 재필터 불필요).
  const latPad = (params.maxLat - params.minLat) * POI_BBOX_EXPAND;
  const lngPad = (params.maxLng - params.minLng) * POI_BBOX_EXPAND;
  const fetchBbox: PoiBbox = {
    minLat: params.minLat - latPad, maxLat: params.maxLat + latPad,
    minLng: params.minLng - lngPad, maxLng: params.maxLng + lngPad,
  };

  const qs = new URLSearchParams({
    min_lat: String(fetchBbox.minLat),
    max_lat: String(fetchBbox.maxLat),
    min_lng: String(fetchBbox.minLng),
    max_lng: String(fetchBbox.maxLng),
  });
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  qs.set('size', '100');
  const all: PoiMapItemApi[] = [];
  let page = 1;
  for (;;) {
    qs.set('page', String(page));
    const res = await api.realFetch<{ items: PoiMapItemApi[]; has_more: boolean }>(
      `/poi/public/map?${qs}`,
      { signal: params.signal },
    );
    all.push(...(res.items ?? []));
    if (!res.has_more) break;
    page++;
  }
  const items = all.map((p) => ({
    id: p.id,
    category: p.category,
    nameKo: p.name_ko,
    nameVi: p.name_vi,
    nameEn: p.name_en,
    address: p.address,
    lat: Number(p.lat),
    lng: Number(p.lng),
    photoUrl: p.photo_url,
  }));
  poiCache.push({ bbox: fetchBbox, category: params.category, q: params.q, items, fetchedAt: now });
  if (poiCache.length > POI_CACHE_MAX_ENTRIES) poiCache.shift();
  return items;
}
