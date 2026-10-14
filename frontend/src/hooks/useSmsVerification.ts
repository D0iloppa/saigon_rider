import { useEffect, useState } from 'react';
import { fetchAppConfig } from '@/api/appVersion';

// 서버 플래그 SMS_VERIFICATION(app-config.sms_verification) — 세션당 1회만 조회해 공유.
let cached: Promise<boolean> | null = null;

function loadSmsVerification(): Promise<boolean> {
  cached ??= fetchAppConfig().then((cfg) => cfg.smsVerification).catch(() => false);
  return cached;
}

/** 휴대폰(SMS) 인증 화면/진입점 노출 여부. loaded 전에는 enabled=false (조회 실패도 false). */
export function useSmsVerification(): { enabled: boolean; loaded: boolean } {
  const [state, setState] = useState({ enabled: false, loaded: false });
  useEffect(() => {
    let alive = true;
    loadSmsVerification().then((enabled) => {
      if (alive) setState({ enabled, loaded: true });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
