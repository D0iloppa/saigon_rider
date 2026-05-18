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

function extractErrorMessage(err: any, status: number): string {
  const detail = err?.detail;
  if (typeof detail === 'string') return detail;
  if (detail) return JSON.stringify(detail);
  return `HTTP ${status}`;
}

function sessionHeaders(): Record<string, string> {
  const session = loadSession();
  return session?.userId ? { 'X-User-Id': session.userId } : {};
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
      ...sessionHeaders(),
      ...options.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 419 || res.status === 401) handleSessionError();
    const err = await res.json().catch(() => ({}));
    const message = extractErrorMessage(err, res.status);
    toast.error(message);
    throw new Error(message);
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
    headers: { ...sessionHeaders() },
    body,
  });
  if (!res.ok) {
    if (res.status === 419 || res.status === 401) handleSessionError();
    const err = await res.json().catch(() => ({}));
    const message = extractErrorMessage(err, res.status);
    toast.error(message);
    throw new Error(message);
  }
  return res.json();
}

export const api = { delay, realFetch, realFetchForm };
