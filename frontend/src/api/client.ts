/**
 * API 클라이언트.
 * - 개발 단계: USE_MOCK=true → 더미 응답
 * - 추후 백엔드 연결: USE_MOCK=false → fetch() 호출
 *
 * 환경변수로 .env 에서 VITE_USE_MOCK=true/false 설정 가능
 */

export const USE_MOCK =
  import.meta.env.VITE_USE_MOCK !== 'false'; // 기본값 true (프로토타입)

export const API_BASE =
  import.meta.env.VITE_API_BASE || 'https://api.saigonrider.app/v1';

async function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// 실제 API 호출 (백엔드 연결 시 사용)
async function realFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('saigon-rider-token');
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export const api = { delay, realFetch };
