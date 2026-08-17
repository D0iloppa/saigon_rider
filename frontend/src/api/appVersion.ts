import { api } from './client';
import { native } from '@/lib/native';

export interface AppConfig {
  dmPollInterval: number;
  googleClientId: string;
  isDev: boolean;
  otpDevBypass: boolean;
  keywordAlertMaxCount: number;
}

export async function fetchAppConfig(): Promise<AppConfig> {
  try {
    const raw = await api.realFetch<{
      dm_poll_interval: number;
      google_client_id: string;
      is_dev: boolean;
      otp_dev_bypass?: boolean;
      keyword_alert_max_count?: number;
    }>('/app-config');
    return {
      dmPollInterval: raw.dm_poll_interval ?? 30,
      googleClientId: raw.google_client_id ?? '',
      isDev: raw.is_dev ?? false,
      otpDevBypass: raw.otp_dev_bypass ?? false,
      keywordAlertMaxCount: raw.keyword_alert_max_count ?? 20,
    };
  } catch {
    return { dmPollInterval: 30, googleClientId: '', isDev: false, otpDevBypass: false, keywordAlertMaxCount: 20 };
  }
}

export interface AppVersionInfo {
  id: number;
  version: string;
  platform: string;
  buildNumber: string | null;
  releaseNote: string | null;
  isForceUpdate: boolean;
  isActive: boolean;
  releasedAt: string | null;
}

export interface AppVersionCurrent {
  primary: AppVersionInfo | null;
  ios: AppVersionInfo | null;
  android: AppVersionInfo | null;
}

export async function fetchCurrentVersion(): Promise<AppVersionCurrent> {
  const raw = await api.realFetch<{
    primary: Record<string, unknown> | null;
    ios: Record<string, unknown> | null;
    android: Record<string, unknown> | null;
  }>('/app-version/current');

  const map = (r: Record<string, unknown> | null): AppVersionInfo | null => {
    if (!r) return null;
    return {
      id: r.id as number,
      version: r.version as string,
      platform: r.platform as string,
      buildNumber: (r.build_number as string) ?? null,
      releaseNote: (r.release_note as string) ?? null,
      isForceUpdate: (r.is_force_update as boolean) ?? false,
      isActive: (r.is_active as boolean) ?? true,
      releasedAt: (r.released_at as string) ?? null,
    };
  };

  return {
    primary: map(raw.primary),
    ios: map(raw.ios),
    android: map(raw.android),
  };
}

/** "1.2.3" 형태 비교. 파싱 불가하면 null(판정 불가 — 호출부는 fail-open 해야 함) */
function compareVersions(a: string, b: string): number | null {
  const pa = a.trim().split('.').map(Number);
  const pb = b.trim().split('.').map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN) || pa.length === 0 || pb.length === 0) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * F-19: 강제 업데이트 판정. 판정 불가(설치본 버전을 모름/파싱 실패)면 항상 false —
 * "강제 업데이트가 아닐 때 절대 차단되지 않음"을 넘어 "판정할 수 없을 때도 차단하지 않음"까지 보장한다.
 */
export function shouldForceUpdate(installedVersion: string, info: AppVersionInfo | null): boolean {
  if (!info || !info.isForceUpdate) return false;
  if (installedVersion === 'unknown') return false;
  const cmp = compareVersions(installedVersion, info.version);
  return cmp !== null && cmp < 0;
}

/** 현재 플랫폼(ios/android/web)에 맞는 최신 릴리스 정보를 고른다. web(브라우저)은 항상 최신이라 대상 아님. */
export function pickPlatformVersion(v: AppVersionCurrent): AppVersionInfo | null {
  if (native.platform === 'ios') return v.ios;
  if (native.platform === 'android') return v.android;
  return null;
}
