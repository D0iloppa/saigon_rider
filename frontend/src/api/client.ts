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
import { TimeoutError, createAttemptSignal, retryCount } from './requestPolicy';

export { TimeoutError } from './requestPolicy';

export const USE_MOCK =
  import.meta.env.VITE_USE_MOCK !== 'false';

export type Service = 'bff' | 'sre';

export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}

export type AccountRestrictionCode = 'account_suspended' | 'account_banned';

/** 탈퇴(soft-delete) 계정 로그인 — 409 account_deleted. 전역 토스트 대신 복구 안내 화면에서 처리한다. */
export class AccountDeletedError extends Error {
  deletedAt: string | null;
  restorableUntil: string | null;
  restoreToken: string | null;
  constructor(detail: { deleted_at?: string; restorable_until?: string; restore_token?: string }) {
    super('Account deleted');
    this.name = 'AccountDeletedError';
    this.deletedAt = detail.deleted_at ?? null;
    this.restorableUntil = detail.restorable_until ?? null;
    this.restoreToken = detail.restore_token ?? null;
  }
}

export class AccountRestrictedError extends Error {
  code: AccountRestrictionCode;
  until: string | null;
  constructor(code: AccountRestrictionCode, until: string | null) {
    super('Account restricted');
    this.name = 'AccountRestrictedError';
    this.code = code;
    this.until = until;
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

let _handleAccountRestricted: ((code: AccountRestrictionCode, until: string | null) => void) | null = null;

export function setAccountRestrictedHandler(handler: (code: AccountRestrictionCode, until: string | null) => void) {
  _handleAccountRestricted = handler;
}

function handleSessionError(): never {
  // 애초에 세션이 없던 419/401(예: 비로그인 상태에서 도는 DM 폴링)은 "세션 만료"가 아니다 —
  // 로그아웃·강제 이동·오류 토스트 없이 조용히 실패시킨다. 실제로 세션을 갖고 있다가
  // 만료된 경우에만 기존 만료 처리(로그아웃 + 스플래시 이동 + 토스트)를 수행한다.
  const hadSession = !!loadSession()?.userId;
  clearSession();
  if (hadSession) _handleSessionExpired?.();
  throw new SessionExpiredError();
}

// T&S 제재(정지/밴) — 세션은 유지한 채(정지 해제 후 재로그인 불필요) 전용 화면으로 유도
function handleAccountRestricted(code: AccountRestrictionCode, until: string | null): never {
  _handleAccountRestricted?.(code, until);
  throw new AccountRestrictedError(code, until);
}

function baseUrl(service: Service = 'bff'): string {
  return `/api/${service}`;
}

async function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// 보안: restore_token(소비 즉시 세션 발급)·session_token 류는 어떤 에러 응답에서도 사용자
// 표시 문자열(토스트/인라인 에러)에 싣지 않는다 — 화면·스크린샷 노출이 곧 계정 탈취다.
const SENSITIVE_DETAIL_KEYS = ['restore_token', 'session_token'];

function sanitizeDetail(detail: any): any {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return detail;
  const safe = { ...detail };
  for (const key of SENSITIVE_DETAIL_KEYS) delete safe[key];
  return safe;
}

function extractErrorMessage(err: any, status: number, call: string): string {
  const detail = err?.detail;
  // 422(FastAPI 검증 오류)는 detail 이 배열이고 그 안에 요청 본문(input)이 그대로 되비친다.
  // 위 sanitizeDetail 은 배열을 통과시키므로 여기서 막지 않으면 내부 필드명과 user_id 가
  // 사용자 토스트에 찍힌다(실제 발생: 회원가입 화면에 age_confirmed·user_id 노출).
  // 검증 오류는 사용자가 고칠 수 있는 정보가 아니다 — 진단은 콘솔로만 남긴다.
  if (status === 422) {
    console.warn('[api] validation error', call, detail);
    return `HTTP 422 | ${call}`;
  }
  let msg: string;
  if (typeof detail === 'string') msg = detail;
  else if (detail) msg = JSON.stringify(sanitizeDetail(detail));
  else msg = call;
  return `HTTP ${status} | ${msg}`;
}

function sessionHeaders(): Record<string, string> {
  const session = loadSession();
  return session?.userId && session.sessionToken
    ? { 'X-User-Id': session.userId, 'X-Session-Token': session.sessionToken }
    : {};
}

// 게이트웨이/전송 계층 일시 오류 — 재시도 대상 (간헐적 502 대응, SGR-208)
const RETRYABLE_STATUS = new Set([502, 503, 504]);

const DEFAULT_TIMEOUT_MS = 10_000;

function externalAbortReason(signal: AbortSignal | null | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError');
}

async function retryDelay(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  if (signal?.aborted) throw externalAbortReason(signal);
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(externalAbortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function realFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  service: Service = 'bff',
  _opts: { silent?: boolean; rethrow?: boolean; retries?: number; keepSessionOn401?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const url = `${baseUrl(service)}${endpoint}`;
  // 안전한 조회만 제한적으로 재시도한다. 쓰기 요청은 timeout 여부와 무관하게 재실행하지 않는다.
  const retries = retryCount(method, _opts.retries);
  const maxAttempts = retries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptSignal = createAttemptSignal(options.signal, _opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        signal: attemptSignal.signal,
        headers: {
          'Content-Type': 'application/json',
          ...sessionHeaders(),
          ...options.headers,
        },
      });
    } catch (error) {
      attemptSignal.cleanup();
      if (options.signal?.aborted) throw externalAbortReason(options.signal);
      const normalized = attemptSignal.didTimeout() ? new TimeoutError() : error;
      if (attempt < maxAttempts && (normalized instanceof TimeoutError || normalized instanceof TypeError)) {
        await retryDelay(300 * attempt, options.signal);
        continue;
      }
      throw normalized;
    }
    attemptSignal.cleanup();
    if (res.ok) {
      if (method === 'HEAD' || res.status === 204) return null as T;
      return res.json();
    }

    // 정지/밴 계정 — 모든 인증 API가 403(로그인은 401)로 반환. 세션 만료 판정보다 우선 확인.
    if (res.status === 401 || res.status === 403) {
      const body: any = await res.json().catch(() => ({}));
      const code = body?.detail?.code;
      if (code === 'account_suspended' || code === 'account_banned') {
        handleAccountRestricted(code, body?.detail?.until ?? null);
      }
      // OTP 검증(401=코드 오류) 등 세션 만료가 아닌 401 응답 호출부는 keepSessionOn401 로 강제 로그아웃을 건너뜀
      if (res.status === 401 && !_opts.keepSessionOn401) handleSessionError();
      const message = extractErrorMessage(body, res.status, `${method} ${url}`);
      if (_opts.silent) {
        console.warn(`[silent] ${message}`);
        return null as T;
      }
      if (!_opts.rethrow) toast.error(message);
      throw new Error(message);
    }

    if (res.status === 419) handleSessionError();
    // 재시도 가능한 오류면 toast 없이 다음 시도 (마지막 시도 제외)
    if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
      await retryDelay(300 * attempt, options.signal);
      continue;
    }
    const err = await res.json().catch(() => ({}));
    // 탈퇴 계정 로그인(409 account_deleted) — 토스트로 새지 않고 복구 안내 화면으로 라우팅
    if (res.status === 409 && err?.detail?.code === 'account_deleted') {
      throw new AccountDeletedError(err.detail);
    }
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
  _opts: { silent?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const url = `${baseUrl(service)}${endpoint}`;
  const attemptSignal = createAttemptSignal(undefined, _opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: attemptSignal.signal,
      headers: { ...sessionHeaders() },
      body,
    });
  } catch (error) {
    throw attemptSignal.didTimeout() ? new TimeoutError() : error;
  } finally {
    attemptSignal.cleanup();
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      const errBody: any = await res.json().catch(() => ({}));
      const code = errBody?.detail?.code;
      if (code === 'account_suspended' || code === 'account_banned') {
        handleAccountRestricted(code, errBody?.detail?.until ?? null);
      }
      if (res.status === 401) handleSessionError();
      const message = extractErrorMessage(errBody, res.status, `POST ${url}`);
      if (_opts.silent) {
        console.warn(`[silent] ${message}`);
        return null as T;
      }
      toast.error(message);
      throw new Error(message);
    }
    if (res.status === 419) handleSessionError();
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

/** rethrow:true 호출부용 — 429/409(어뷰징 가드류, 서버가 사람이 읽을 문장을 detail 로 준다고
 *  보장되는 상태코드)만 상세를 노출하고, 그 외(422 검증오류 JSON·502 등 raw 응답·네트워크 오류)는
 *  fallback 문구를 쓴다. 다른 상태코드까지 열면 기술적 내용이 그대로 노출될 수 있다. */
export function extractDetail(err: unknown, fallback: string): string {
  const match = /^HTTP (?:429|409) \| (.+)$/.exec((err as any)?.message ?? '');
  return match ? match[1] : fallback;
}

export const api = { delay, realFetch, realFetchForm };
