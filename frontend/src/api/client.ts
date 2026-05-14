/**
 * API 클라이언트 (단일 진입점)
 *
 * service 파라미터로 백엔드를 선택한다.
 *   'bff' (기본값) → /api/bff/* → nginx → bff:8080/api/*
 *   'sre'          → /api/sre/* → nginx → engine:8090/v1/*
 *
 * VITE_USE_MOCK=true(기본) 이면 mock 모드로 동작한다.
 */

export const USE_MOCK =
  import.meta.env.VITE_USE_MOCK !== 'false';

export type Service = 'bff' | 'sre';

function baseUrl(service: Service = 'bff'): string {
  return `/api/${service}`;
}

async function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function realFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  service: Service = 'bff'
): Promise<T> {
  const res = await fetch(`${baseUrl(service)}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function realFetchForm<T>(
  endpoint: string,
  body: FormData,
  service: Service = 'bff'
): Promise<T> {
  const res = await fetch(`${baseUrl(service)}${endpoint}`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = { delay, realFetch, realFetchForm };
