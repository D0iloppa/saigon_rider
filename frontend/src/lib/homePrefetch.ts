import { fetchListings, fetchAds, type ListingCard, type MarketAd } from '@/api/market';
import { fetchBizNewsFeed, type BizNewsFeedItem } from '@/api/biz';
import { ADS_ENABLED } from '@/lib/adPlacement';
import { NEARBY_RADIUS_KM } from '@/store/useLocationStore';
import { BEN_THANH_FALLBACK } from '@/lib/mapDefaults';

/**
 * 홈 데이터 프리페치 — 스플래시가 뜬 동안(App.tsx) 부팅 작업과 병렬로 홈의 첫 조회를 미리
 * 시작해둔다. 위치 스토어가 아직 측위 전(초기 화면과 동일하게 중심가 Bến Thành 좌표)이므로
 * HomePage 가 기본으로 쓰는 좌표와 같은 기준이다 — coords 가 이 좌표와 다르면(이미 GPS 측위
 * 완료) HomePage 는 이 결과를 쓰지 않고 스스로 새로 조회한다(중복 요청 없음, 단지 재사용 안 함).
 */

let started = false;
let nearbyPromise: Promise<ListingCard[]> | null = null;
let recentPromise: Promise<ListingCard[]> | null = null;
let bizNewsPromise: Promise<BizNewsFeedItem[]> | null = null;
let adsPromise: Promise<MarketAd[]> | null = null;

function preloadThumbs(urls: (string | null | undefined)[]) {
  urls.filter((u): u is string => !!u).slice(0, 4).forEach((url) => {
    new Image().src = url;
  });
}

export function startHomePrefetch() {
  if (started) return;
  started = true;
  const { lat, lng } = BEN_THANH_FALLBACK;

  nearbyPromise = fetchListings({ lat, lng, sort: 'distance', size: 8, radiusKm: NEARBY_RADIUS_KM })
    .then((p) => { preloadThumbs(p.items.map((i) => i.thumbnailUrl)); return p.items; })
    .catch(() => []);

  recentPromise = fetchListings({ lat, lng, sort: 'recent', hideSold: true, size: 8 })
    .then((p) => { preloadThumbs(p.items.map((i) => i.thumbnailUrl)); return p.items; })
    .catch(() => []);

  bizNewsPromise = fetchBizNewsFeed(10)
    .then((items) => { preloadThumbs(items.map((n) => n.photos[0] ?? n.photoUrl)); return items; })
    .catch(() => []);

  if (ADS_ENABLED) adsPromise = fetchAds(null).catch(() => []);
}

export function getHomePrefetch() {
  return { nearbyPromise, recentPromise, bizNewsPromise, adsPromise };
}

/** 부팅 작업과 함께 기다릴 홈 데이터 준비 완료(성공/실패 무관) — 스플래시 대기용. */
export function homeDataReady(): Promise<unknown> {
  return Promise.allSettled([nearbyPromise, recentPromise, bizNewsPromise, adsPromise]);
}
