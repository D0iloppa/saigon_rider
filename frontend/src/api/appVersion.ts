import { api } from './client';

export interface AppConfig {
  dmPollInterval: number;
  googleClientId: string;
}

export async function fetchAppConfig(): Promise<AppConfig> {
  try {
    const raw = await api.realFetch<{ dm_poll_interval: number; google_client_id: string }>('/app-config');
    return {
      dmPollInterval: raw.dm_poll_interval ?? 30,
      googleClientId: raw.google_client_id ?? '',
    };
  } catch {
    return { dmPollInterval: 30, googleClientId: '' };
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
