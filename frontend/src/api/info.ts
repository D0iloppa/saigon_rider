import { USE_MOCK, api } from './client';

// ── Types ─────────────────────────────────────────────────────────

export interface WeatherCurrent {
  temp_c: number;
  feels_like_c: number;
  condition: string;
  condition_desc: string;
  emoji: string;
  humidity: number;
  wind_kmh: number;
  rain_prob_1h: number;
}

export interface ForecastHour {
  time: string;
  temp_c: number;
  condition: string;
  emoji: string;
  rain_prob: number;
}

export interface WeatherData {
  location: { lat: number; lng: number; district: string };
  current: WeatherCurrent;
  forecast: { next_24h: ForecastHour[] };
  recommendation_code: string; // CLEAR | RAIN_MED | RAIN_HIGH — i18n 으로 번역
}

export interface RainRadarData {
  tile_url: string;
  last_updated: number;
}

export interface FloodReport {
  report_id: number;
  district_code: string;
  street_name: string | null;
  depth_level: 'ankle' | 'knee' | 'thigh' | 'above';
  photo_url: string | null;
  reported_at: string;
  confidence_score: number;
  status: 'ACTIVE' | 'RESOLVED' | 'EXPIRED';
  lat: number;
  lng: number;
  distance_km?: number;
  time_ago?: string;
}

export interface FloodHotspot {
  hotspot_id: number;
  district_code: string;
  street_name: string | null;
  flood_count_30d: number;
  avg_depth_level: string | null;
  centroid_lat?: number | null;
  centroid_lng?: number | null;
  last_flood_at?: string | null;
  updated_at?: string | null;
}

export type FloodTrustLevel = 'PENDING' | 'CONFIRMED' | 'VERIFIED';

export interface FloodReportWithTrust extends FloodReport {
  trust_level: FloodTrustLevel;
  minutes_ago?: number;
}

export interface FloodRisk {
  risk_id: number;
  hotspot_id: number | null;
  district_code: string | null;
  street_name: string | null;
  lat: number;
  lng: number;
  rain_prob: number;
  risk_level: 'MEDIUM' | 'HIGH';
  depth_hint: string | null;
  predicted_date: string;
}

export interface FloodMapData {
  hotspots: FloodHotspot[];
  reports: FloodReportWithTrust[];
  risks?: FloodRisk[];
  fetched_at: string;
}

export interface GasStation {
  station_id: number;
  brand: string | null;
  name: string | null;
  phone: string | null;
  district_code: string | null;
  street_name: string | null;
  distance_km: number;
  opening_hours: string | null;
  lat: number;
  lng: number;
  price_vnd: number | null;
  wait_minutes: number | null;
  wait_confidence: number | null;
  wait_reported_at: string | null;
}

export interface RepairShop {
  shop_id: number;
  name: string;
  district_code: string | null;
  street_name: string | null;
  phone: string | null;
  opening_hours: string | null;
  brand_focus: string | null;
  is_verified: boolean;
  lat: number;
  lng: number;
  distance_km: number;
  avg_rating: number | null;
  review_count: number;
  avg_price: number | null;
  keywords?: { keyword: string; sentiment: string }[];
}

export interface RepairReview {
  review_id: number;
  reviewer_nickname?: string;
  service_code: string;
  motorcycle_model: string | null;
  rating: number;
  price_vnd: number | null;
  comment: string | null;
  is_anonymous: boolean;
  reviewed_at: string;
  upvotes: number;
  source?: string;
}

export interface RepairDetail {
  shop: RepairShop;
  stats: { avg_rating: number; review_count: number; avg_price: number | null } | null;
  price_by_service: Record<string, number>;
  recent_reviews: RepairReview[];
}

// ── Mock data ─────────────────────────────────────────────────────

const MOCK_WEATHER: WeatherData = {
  location: { lat: 10.776, lng: 106.700, district: 'Q1' },
  current: {
    temp_c: 32,
    feels_like_c: 36,
    condition: 'Clouds',
    condition_desc: 'Partly cloudy',
    emoji: '⛅',
    humidity: 78,
    wind_kmh: 12,
    rain_prob_1h: 80,
  },
  forecast: {
    next_24h: [
      { time: '15:00', temp_c: 32, condition: 'Clear',         emoji: '☀️', rain_prob: 10 },
      { time: '16:00', temp_c: 31, condition: 'Clouds',        emoji: '⛅', rain_prob: 30 },
      { time: '17:00', temp_c: 30, condition: 'Thunderstorm',  emoji: '⛈', rain_prob: 80 },
      { time: '18:00', temp_c: 29, condition: 'Thunderstorm',  emoji: '⛈', rain_prob: 95 },
      { time: '19:00', temp_c: 29, condition: 'Rain',          emoji: '🌧', rain_prob: 70 },
      { time: '20:00', temp_c: 28, condition: 'Drizzle',       emoji: '🌦', rain_prob: 40 },
      { time: '21:00', temp_c: 28, condition: 'Clouds',        emoji: '⛅', rain_prob: 20 },
      { time: '22:00', temp_c: 27, condition: 'Clear',         emoji: '🌙', rain_prob: 5  },
    ],
  },
  recommendation_code: 'CLEAR',
};

const MOCK_FLOODS: FloodReport[] = [
  {
    report_id: 1, district_code: 'BinhThanh', street_name: 'Xô Viết Nghệ Tĩnh',
    depth_level: 'knee', photo_url: null, reported_at: new Date(Date.now() - 1800000).toISOString(),
    confidence_score: 8, status: 'ACTIVE', lat: 10.810, lng: 106.710, distance_km: 2.3,
    time_ago: '30 min ago',
  },
  {
    report_id: 2, district_code: 'Q4', street_name: 'Đoàn Văn Bơ',
    depth_level: 'ankle', photo_url: null, reported_at: new Date(Date.now() - 3600000).toISOString(),
    confidence_score: 3, status: 'ACTIVE', lat: 10.758, lng: 106.707, distance_km: 1.5,
    time_ago: '1 hour ago',
  },
];

const MOCK_HOTSPOTS: FloodHotspot[] = [
  { hotspot_id: 1, district_code: 'Q4',         street_name: 'Lò Lu',             flood_count_30d: 18, avg_depth_level: 'knee'  },
  { hotspot_id: 2, district_code: 'BinhThanh',  street_name: 'Xô Viết Nghệ Tĩnh', flood_count_30d: 14, avg_depth_level: 'ankle' },
  { hotspot_id: 3, district_code: 'ThuDuc',     street_name: 'Phạm Văn Đồng',     flood_count_30d: 12, avg_depth_level: 'ankle' },
];

const MOCK_GAS: GasStation[] = [
  {
    station_id: 1, brand: 'Petrolimex', name: 'Petrolimex · Trần Hưng Đạo',
    district_code: 'Q1', street_name: 'Trần Hưng Đạo', distance_km: 1.2,
    phone: null,
    opening_hours: '06:00–22:00', lat: 10.770, lng: 106.699,
    price_vnd: 25420, wait_minutes: 5, wait_confidence: 2, wait_reported_at: null,
  },
  {
    station_id: 2, brand: 'PV Oil', name: 'PV Oil · Lê Lai',
    district_code: 'Q1', street_name: 'Lê Lai', distance_km: 1.8,
    phone: null,
    opening_hours: '24/7', lat: 10.773, lng: 106.698,
    price_vnd: 25380, wait_minutes: 0, wait_confidence: 5, wait_reported_at: null,
  },
  {
    station_id: 3, brand: 'Petrolimex', name: 'Petrolimex · Nguyễn Trãi',
    district_code: 'Q1', street_name: 'Nguyễn Trãi', distance_km: 2.3,
    phone: null,
    opening_hours: '06:00–22:00', lat: 10.768, lng: 106.696,
    price_vnd: 25420, wait_minutes: null, wait_confidence: null, wait_reported_at: null,
  },
];

const MOCK_REPAIR: RepairShop[] = [
  {
    shop_id: 1, name: 'Honda Head 2S · Phú Nhuận', district_code: 'PhuNhuan',
    street_name: '123 Phan Đăng Lưu', phone: '028 1234 5678', opening_hours: '07:00–19:00',
    brand_focus: 'Honda', is_verified: true, lat: 10.798, lng: 106.674, distance_km: 2.1,
    avg_rating: 4.7, review_count: 87, avg_price: 250000,
    keywords: [
      { keyword: 'Honest', sentiment: 'positive' },
      { keyword: 'Genuine Honda parts', sentiment: 'positive' },
      { keyword: 'Fast', sentiment: 'positive' },
    ],
  },
  {
    shop_id: 2, name: 'Hùng Auto Shop', district_code: 'Q1',
    street_name: '45 Nguyễn Trãi', phone: null, opening_hours: '08:00–18:00',
    brand_focus: 'All', is_verified: false, lat: 10.771, lng: 106.697, distance_km: 1.4,
    avg_rating: 4.5, review_count: 43, avg_price: 180000,
    keywords: [
      { keyword: 'Good value', sentiment: 'positive' },
      { keyword: 'Friendly', sentiment: 'positive' },
    ],
  },
  {
    shop_id: 3, name: 'Tâm Motor', district_code: 'Q1',
    street_name: '12 Lê Lợi', phone: null, opening_hours: '07:00–20:00',
    brand_focus: 'All', is_verified: false, lat: 10.774, lng: 106.701, distance_km: 0.8,
    avg_rating: 3.2, review_count: 12, avg_price: 350000,
    keywords: [
      { keyword: 'Overpriced', sentiment: 'negative' },
      { keyword: 'Expensive', sentiment: 'negative' },
    ],
  },
];

const MOCK_REPAIR_DETAIL: RepairDetail = {
  shop: MOCK_REPAIR[0],
  stats: { avg_rating: 4.7, review_count: 87, avg_price: 250000 },
  price_by_service: { OIL_CHANGE: 250000, TIRE: 800000, CHAIN: 600000, BRAKE: 350000 },
  recent_reviews: [
    {
      review_id: 1, reviewer_nickname: 'Anh Tuấn', service_code: 'OIL_CHANGE',
      motorcycle_model: 'Honda SH 350i', rating: 5, price_vnd: 250000,
      comment: 'Honest shop. Used genuine Honda parts and finished in 30 min.',
      is_anonymous: false, reviewed_at: new Date(Date.now() - 86400000).toISOString(), upvotes: 12,
    },
    {
      review_id: 2, reviewer_nickname: 'Chị Mai', service_code: 'TIRE',
      motorcycle_model: 'Honda Wave', rating: 4, price_vnd: 790000,
      comment: 'Fast and friendly. Will come back!',
      is_anonymous: false, reviewed_at: new Date(Date.now() - 259200000).toISOString(), upvotes: 5,
    },
  ],
};

// ── API functions ─────────────────────────────────────────────────

export const weatherApi = {
  async get(lat: number, lng: number): Promise<WeatherData> {
    if (USE_MOCK) return api.delay(MOCK_WEATHER, 300);
    return api.realFetch<WeatherData>(`/info/weather?lat=${lat}&lng=${lng}`, {}, 'bff', { silent: true });
  },
  async getRainRadar(lat: number, lng: number): Promise<RainRadarData> {
    if (USE_MOCK) return api.delay({
      tile_url: 'https://tilecache.rainviewer.com/v2/radar/mock/256/{z}/{x}/{y}/2/1_1.png',
      last_updated: Math.floor(Date.now() / 1000),
    }, 200);
    return api.realFetch<RainRadarData>(`/info/weather/rain-radar?lat=${lat}&lng=${lng}`, {}, 'bff', { silent: true });
  },
  async notifyRain(label: string, lat: number, lng: number): Promise<{ ok: boolean; gp_earned: number }> {
    if (USE_MOCK) return api.delay({ ok: true, gp_earned: 5 }, 200);
    return api.realFetch<{ ok: boolean; gp_earned: number }>('/info/weather/notify-rain', {
      method: 'POST',
      body: JSON.stringify({ label, lat, lng }),
    });
  },
};

export const floodApi = {
  async getActive(lat: number, lng: number, radius_km = 5): Promise<{ floods: FloodReport[] }> {
    if (USE_MOCK) return api.delay({ floods: MOCK_FLOODS }, 300);
    return api.realFetch<{ floods: FloodReport[] }>(
      `/info/flood/active?lat=${lat}&lng=${lng}&radius_km=${radius_km}`, {}, 'bff', { silent: true },
    );
  },
  async report(data: { lat: number; lng: number; depth_level: string; photo_url?: string }): Promise<{ report_id: number; gp_earned: number }> {
    if (USE_MOCK) return api.delay({ report_id: 999, gp_earned: 10 }, 500);
    return api.realFetch<{ report_id: number; gp_earned: number }>('/info/flood/report', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async confirm(report_id: number, confirmation_type: string): Promise<{ confirmed: boolean; gp_earned: number }> {
    if (USE_MOCK) return api.delay({ confirmed: true, gp_earned: 5 }, 300);
    return api.realFetch<{ confirmed: boolean; gp_earned: number }>(
      `/info/flood/confirm/${report_id}`,
      { method: 'POST', body: JSON.stringify({ confirmation_type }) },
    );
  },
  async getHotspots(district_code?: string): Promise<{ hotspots: FloodHotspot[] }> {
    if (USE_MOCK) return api.delay({ hotspots: MOCK_HOTSPOTS }, 200);
    const q = district_code ? `?district_code=${district_code}` : '';
    return api.realFetch<{ hotspots: FloodHotspot[] }>(`/info/flood/hotspots${q}`, {}, 'bff', { silent: true });
  },
  async getMapData(lat: number, lng: number, radius_km = 5): Promise<FloodMapData> {
    if (USE_MOCK) {
      return api.delay(
        {
          hotspots: MOCK_HOTSPOTS,
          reports: MOCK_FLOODS.map((f) => ({
            ...f,
            trust_level:
              (f.confidence_score ?? 0) >= 3
                ? ('VERIFIED' as const)
                : (f.confidence_score ?? 0) >= 1
                  ? ('CONFIRMED' as const)
                  : ('PENDING' as const),
            minutes_ago: Math.max(
              0,
              Math.floor((Date.now() - new Date(f.reported_at).getTime()) / 60000),
            ),
          })),
          fetched_at: new Date().toISOString(),
        },
        300,
      );
    }
    return api.realFetch<FloodMapData>(
      `/info/flood/map-data?lat=${lat}&lng=${lng}&radius_km=${radius_km}`, {}, 'bff', { silent: true },
    );
  },
};

export const gasApi = {
  async getNearby(lat: number, lng: number, radius_km = 5, fuel_type = 'RON95'): Promise<{ stations: GasStation[] }> {
    if (USE_MOCK) return api.delay({ stations: MOCK_GAS }, 300);
    return api.realFetch<{ stations: GasStation[] }>(
      `/info/gas/nearby?lat=${lat}&lng=${lng}&radius_km=${radius_km}&fuel_type=${fuel_type}`, {}, 'bff', { silent: true },
    );
  },
  async reportWait(station_id: number, wait_minutes: number): Promise<{ wait_id: number; rp_earned: number }> {
    if (USE_MOCK) return api.delay({ wait_id: 999, rp_earned: 5 }, 300);
    return api.realFetch<{ wait_id: number; rp_earned: number }>('/info/gas/wait-report', {
      method: 'POST',
      body: JSON.stringify({ station_id, wait_minutes }),
    });
  },
  /** 신규 주유소 제보 → 대기큐(PENDING). admin confirm 시에만 반영. */
  async reportStation(body: { name: string; lat: number; lng: number; phone?: string; note?: string }): Promise<{ submission_id: number; status: string }> {
    if (USE_MOCK) return api.delay({ submission_id: 999, status: 'PENDING' }, 300);
    return api.realFetch<{ submission_id: number; status: string }>('/info/gas/report', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async getPrices(): Promise<{ fuel_type: string; price_vnd: number }[]> {
    if (USE_MOCK) return api.delay([{ fuel_type: 'RON95', price_vnd: 25420 }], 100);
    return api.realFetch<{ fuel_type: string; price_vnd: number }[]>('/info/gas/prices', {}, 'bff', { silent: true });
  },
  /** v2: 오늘의 브랜드×연료별 참고가 매트릭스 + 갱신 시각. */
  async getTodayPrices(): Promise<TodayPrices> {
    if (USE_MOCK) {
      return api.delay({
        PETROLIMEX: { RON95_III: { price: 21560, effective_time: new Date().toISOString() } },
        MARKET_AVG: { RON95_III: { price: 21540, effective_time: new Date().toISOString() } },
        updated_at: '16:30',
        updated_at_iso: new Date().toISOString(),
      }, 200);
    }
    return api.realFetch<TodayPrices>('/info/gas/today-prices', {}, 'bff', { silent: true });
  },
  /** v2: 주유소 상세 (바텀시트용). */
  async getStation(station_id: number): Promise<GasStationDetail> {
    if (USE_MOCK) {
      return api.delay({
        station_id,
        name: 'Mock Station',
        brand: 'Petrolimex',
        brand_normalized: 'PETROLIMEX',
        lat: 10.78, lng: 106.7,
        is_24h: true,
        reference_price: { RON95_III: 21560, E5_RON92_II: 20890, source: 'PETROLIMEX 공식', updated_at: '16:30', updated_at_iso: new Date().toISOString() },
        crowd_price: null,
      } as GasStationDetail, 200);
    }
    return api.realFetch<GasStationDetail>(`/info/gas/station/${station_id}`, {}, 'bff', { silent: true });
  },
};

export interface TodayPrices {
  [brand: string]:
    | { [fuel: string]: { price: number; effective_time: string } }
    | string
    | null
    | undefined;
  updated_at?: string | null;
  updated_at_iso?: string | null;
}

export interface GasStationDetail {
  station_id: number;
  name: string | null;
  brand: string | null;
  brand_normalized: string;
  lat: number;
  lng: number;
  is_24h: boolean;
  district_code: string | null;
  street_name: string | null;
  opening_hours: string | null;
  phone: string | null;
  reference_price: {
    RON95_III?: number;
    RON95_V?: number;
    E5_RON92_II?: number;
    source: string;
    updated_at: string | null;
    updated_at_iso: string | null;
  };
  crowd_price: null;
}

export const repairApi = {
  async getNearby(lat: number, lng: number, radius_km = 5, service_code?: string, motorcycle_model?: string): Promise<{ shops: RepairShop[] }> {
    if (USE_MOCK) return api.delay({ shops: MOCK_REPAIR }, 400);
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius_km: String(radius_km) });
    if (service_code) params.set('service_code', service_code);
    if (motorcycle_model) params.set('motorcycle_model', motorcycle_model);
    return api.realFetch<{ shops: RepairShop[] }>(`/info/repair/nearby?${params}`, {}, 'bff', { silent: true });
  },
  async getDetail(shop_id: number): Promise<RepairDetail> {
    if (USE_MOCK) return api.delay(MOCK_REPAIR_DETAIL, 300);
    return api.realFetch<RepairDetail>(`/info/repair/${shop_id}`, {}, 'bff', { silent: true });
  },
  /** 전체 리뷰 목록 (페이지네이션). 상세 '전체 보기'에서 사용. */
  async getReviews(shop_id: number, offset = 0, limit = 20): Promise<{ reviews: RepairReview[]; total: number; has_more: boolean }> {
    if (USE_MOCK) {
      const all = MOCK_REPAIR_DETAIL.recent_reviews;
      return api.delay({ reviews: all.slice(offset, offset + limit), total: all.length, has_more: offset + limit < all.length }, 300);
    }
    return api.realFetch<{ reviews: RepairReview[]; total: number; has_more: boolean }>(
      `/info/repair/${shop_id}/reviews?offset=${offset}&limit=${limit}`, {}, 'bff', { silent: true },
    );
  },
  /** 신규 정비소 제보 → 대기큐(PENDING). admin confirm 시에만 반영. */
  async reportShop(body: { name: string; lat: number; lng: number; phone?: string; note?: string }): Promise<{ submission_id: number; status: string }> {
    if (USE_MOCK) return api.delay({ submission_id: 999, status: 'PENDING' }, 300);
    return api.realFetch<{ submission_id: number; status: string }>('/info/repair/report', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async writeReview(data: {
    shop_id: number; service_code: string; motorcycle_model?: string;
    rating: number; price_vnd?: number; comment?: string; photo_url?: string; is_anonymous?: boolean;
  }): Promise<{ review_id: number; rp_earned: number }> {
    if (USE_MOCK) return api.delay({ review_id: 999, rp_earned: 70 }, 500);
    return api.realFetch<{ review_id: number; rp_earned: number }>('/info/repair/review', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async addShop(data: { name: string; lat: number; lng: number; phone?: string }): Promise<{ shop_id: number; status: string }> {
    if (USE_MOCK) return api.delay({ shop_id: 999, status: 'PENDING_VERIFICATION' }, 300);
    return api.realFetch<{ shop_id: number; status: string }>('/info/repair/add-shop', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ── 경로 미리보기 (SGR-269) ────────────────────────────────────────

export interface RouteStep {
  instruction: string;
  distance_text: string;
  maneuver?: string | null;
}

export interface RouteData {
  /** GOOGLE_MAPS_API_KEY 미설정/호출 실패 시 false → 프론트는 "준비 중" 폴백. */
  configured: boolean;
  distance_m?: number | null;
  duration_s?: number | null;
  distance_text?: string | null;
  duration_text?: string | null;
  polyline?: string | null;
  steps: RouteStep[];
}

export const routeApi = {
  /** 현재 위치(origin)→목적지(dest) 경로. 키 없으면 configured:false. */
  async getRoute(
    origin: { lat: number; lng: number },
    dest: { lat: number; lng: number },
  ): Promise<RouteData | null> {
    const params = new URLSearchParams({
      origin_lat: String(origin.lat),
      origin_lng: String(origin.lng),
      dest_lat: String(dest.lat),
      dest_lng: String(dest.lng),
    });
    return api.realFetch<RouteData>(`/info/route?${params}`, {}, 'bff', { silent: true });
  },
};
