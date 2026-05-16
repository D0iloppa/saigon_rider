import i18n from '@/lib/i18n';
import { USE_MOCK, api } from './client';

export interface District {
  id: number;
  code: string;
  name_ko: string;
  name_vi: string;
  name_en: string;
  image_url: string | null;
}

export interface RiderType {
  id: number;
  code: string;
  name_ko: string;
  name_vi: string;
  name_en: string;
  icon: string | null;
}

export interface SafetyGrade {
  id: number;
  code: string;
  name_ko: string;
  name_vi: string;
  name_en: string;
}

export function localizedName(item: District | RiderType | SafetyGrade): string {
  const lang = i18n.language as 'ko' | 'vi' | 'en';
  return item[`name_${lang}`] || item.name_en || item.name_ko;
}

const MOCK_DISTRICTS: District[] = [
  { id: 1,  code: 'QUAN_1',     name_ko: '1군',      name_vi: 'Quận 1',     name_en: 'District 1', image_url: null },
  { id: 2,  code: 'QUAN_3',     name_ko: '3군',      name_vi: 'Quận 3',     name_en: 'District 3', image_url: null },
  { id: 6,  code: 'QUAN_7',     name_ko: '7군',      name_vi: 'Quận 7',     name_en: 'District 7', image_url: null },
  { id: 11, code: 'BINH_THANH', name_ko: '빈탄군',   name_vi: 'Bình Thạnh', name_en: 'Binh Thanh', image_url: null },
  { id: 14, code: 'PHU_NHUAN',  name_ko: '푸뉴언군', name_vi: 'Phú Nhuận',  name_en: 'Phu Nhuan',  image_url: null },
  { id: 17, code: 'THU_DUC',    name_ko: '투득시',   name_vi: 'Thủ Đức',    name_en: 'Thu Duc',    image_url: null },
];

const MOCK_RIDER_TYPES: RiderType[] = [
  { id: 1, code: 'COMMUTER',    name_ko: '출퇴근 라이더', name_vi: 'Người đi làm',   name_en: 'Commuter',    icon: '🏢' },
  { id: 2, code: 'CAFE_HUNTER', name_ko: '카페 헌터',    name_vi: 'Thợ săn cà phê', name_en: 'Cafe Hunter', icon: '☕' },
  { id: 3, code: 'NIGHT_RIDER', name_ko: '나이트 라이더', name_vi: 'Người đua đêm',  name_en: 'Night Rider', icon: '🌙' },
];

const MOCK_SAFETY_GRADES: SafetyGrade[] = [
  { id: 1, code: 'A', name_ko: '안전', name_vi: 'An toàn',    name_en: 'Safe' },
  { id: 2, code: 'B', name_ko: '보통', name_vi: 'Trung bình', name_en: 'Average' },
  { id: 3, code: 'C', name_ko: '위험', name_vi: 'Nguy hiểm',  name_en: 'Risky' },
];

export async function fetchDistricts(): Promise<District[]> {
  if (USE_MOCK) return api.delay(MOCK_DISTRICTS, 0);
  return api.realFetch<District[]>('/master/districts');
}

export async function fetchRiderTypes(): Promise<RiderType[]> {
  if (USE_MOCK) return api.delay(MOCK_RIDER_TYPES, 0);
  return api.realFetch<RiderType[]>('/master/rider-types');
}

export async function fetchSafetyGrades(): Promise<SafetyGrade[]> {
  if (USE_MOCK) return api.delay(MOCK_SAFETY_GRADES, 0);
  return api.realFetch<SafetyGrade[]>('/master/safety-grades');
}
