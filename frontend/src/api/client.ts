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

async function realFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  service: Service = 'bff',
  _opts: { silent?: boolean; rethrow?: boolean } = {},
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const url = `${baseUrl(service)}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...sessionHeaders(),
      ...options.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 419 || res.status === 401) handleSessionError();
    const err = await res.json().catch(() => ({}));
    const message = extractErrorMessage(err, res.status, `${method} ${url}`);
    if (_opts.silent) {
      console.warn(`[silent] ${message}`);
      return null as T;
    }
    if (!_opts.rethrow) toast.error(message);
    throw new Error(message);
  }
  if (res.status === 204) return null as T;
  return res.json();
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
