import { api } from './client';

// SGR-213 P3/P4: 쿠폰/기프티콘 (엔진 reward 엔진 프록시). 실서버 전용(realFetch).
export interface CouponItem {
  catalog_id: number;
  item_code: string;
  item_name: string;
  category_code: string;
  required_rp: number;
  face_value_vnd: number | null;
  thumbnail_url: string | null;
}

export interface RedemptionItem {
  redemption_id: number;
  catalog_id: number | null;
  item_name: string;
  status: string; // REQUESTED | FULFILLED | FAILED | REFUNDED | CANCELLED
  voucher_code: string | null;
  requested_at: string;
  fulfilled_at: string | null;
  expires_at: string | null;
  thumbnail_url: string | null;
}

export async function fetchCoupons(category?: string): Promise<CouponItem[]> {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  return api.realFetch<CouponItem[]>(`/coupons${q}`);
}

export async function redeemCoupon(catalogId: number): Promise<RedemptionItem> {
  return api.realFetch<RedemptionItem>('/coupons/redeem', {
    method: 'POST',
    body: JSON.stringify({ catalog_id: catalogId }),
  });
}

export async function fetchMyCoupons(): Promise<RedemptionItem[]> {
  return api.realFetch<RedemptionItem[]>('/coupons/mine');
}
