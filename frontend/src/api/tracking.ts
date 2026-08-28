/**
 * 사용자 트래킹 파이프라인 클라이언트 계약 (init/213, C6).
 * 서버: backend/app/routers/tracking.py (수정 금지 대상) — 그대로 소비만 한다.
 */
import { api } from './client';

export interface FirstTouchUtm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

/** 익명ID 기준 first-touch 유입채널 기록. 서버가 최초 1회만 반영(멱등) — 실패는 조용히 무시. */
export function apiFirstTouch(utm: FirstTouchUtm): Promise<null> {
  return api.realFetch<null>(
    '/tracking/first-touch',
    { method: 'POST', body: JSON.stringify(utm) },
    'bff',
    { silent: true },
  );
}
