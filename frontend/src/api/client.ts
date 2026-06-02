/**
 * API 클라이언트 (단일 진입점)
 *
 * service 파라미터로 백엔드를 선택한다.
 *   'bff' (기본값) → /api/bff/* → nginx → bff:8080/api/*
 *   'sre'          → /api/sre/* → nginx → engine:8090/v1/*
 *
 * VITE_USE_MOCK=true(기본) 이면 mock 모드로 동작한다.
 */

import { clearSession, loadSession } from '@/lib/session';
import { toast } from '@/components/ui/Toast';

export const USE_MOCK =
  import.meta.env.VITE_USE_MOCK !== 'false';

export type Service = 'bff' | 'sre';

export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}

export function requireSession() {
  const session = loadSession();
  if (!session?.userId) handleSessionError();
  return session!;
}

let _handleSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void) {
  _handleSessionExpired = handler;
}

function handleSessionError(): never {
  clearSession();
  _handleSessionExpired?.();
  throw new SessionExpiredError();
}

function baseUrl(service: Service = 'bff'): string {
  return `/api/${service}`;
}

async function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function extractErrorMessage(err: any, status: number, call: string): string {
  const detail = err?.detail;
  let msg: string;
  if (typeof detail === 'string') msg = detail;
  else if (detail) msg = JSON.stringify(detail);
  else msg = call;
  return `HTTP ${status} | ${msg}`;
}

function sessionHeaders(): Record<string, string> {
  const session = loadSession();
  return session?.userId ? { 'X-User-Id': session.userId } : {};
}

// 게이트웨이/전송 계층 일시 오류 — 재시도 대상 (간헐적 502 대응, SGR-208)
const RETRYABLE_STATUS = new Set([502, 503, 504]);

async function realFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  service: Service = 'bff',
  _opts: { silent?: boolean; rethrow?: boolean; retries?: number } = {},
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const url = `${baseUrl(service)}${endpoint}`;
  // GET 만 재시도 (비멱등 요청의 중복 실행 방지)
  const retries = method === 'GET' ? (_opts.retries ?? 3) : 0;
  const maxAttempts = retries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...sessionHeaders(),
        ...options.headers,
      },
    });
    if (res.ok) {
      if (res.status === 204) return null as T;
      return res.json();
    }
    if (res.status === 419 || res.status === 401) handleSessionError();
    // 재시도 가능한 오류면 toast 없이 다음 시도 (마지막 시도 제외)
    if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      continue;
    }
    const err = await res.json().catch(() => ({}));
    const message = extractErrorMessage(err, res.status, `${method} ${url}`);
    if (_opts.silent) {
      console.warn(`[silent] ${message}`);
      return null as T;
    }
    if (!_opts.rethrow) toast.error(message);
    throw new Error(message);
  }
  // 도달 불가 — 루프는 항상 return 하거나 throw 한다
  throw new Error(`HTTP request failed | ${method} ${url}`);
}

async function realFetchForm<T>(
  endpoint: string,
  body: FormData,
  service: Service = 'bff',
  _opts: { silent?: boolean } = {},
): Promise<T> {
  const url = `${baseUrl(service)}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sessionHeaders() },
    body,
  });
  if (!res.ok) {
    if (res.status === 419 || res.status === 401) handleSessionError();
    const err = await res.json().catch(() => ({}));
    const message = extractErrorMessage(err, res.status, `POST ${url}`);
    if (_opts.silent) {
      console.warn(`[silent] ${message}`);
      return null as T;
    }
    toast.error(message);
    throw new Error(message);
  }
  return res.json();
}

export const api = { delay, realFetch, realFetchForm };
