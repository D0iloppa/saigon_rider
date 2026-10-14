import { useEffect, useState } from 'react';
import { fetchAppConfig } from '@/api/appVersion';

// 서버 플래그 SMS_VERIFICATION(app-config.sms_verification) — true 만 세션 캐시.
// fetchAppConfig 는 실패 시 기본값(false)을 돌려주므로, false 는 캐시하지 않고 다음 마운트에 재조회한다.
let cached: Promise<boolean> | null = null;

function loadSmsVerification(): Promise<boolean> {
  cached ??= fetchAppConfig().then((cfg) => {
    if (!cfg.smsVerification) cached = null;
    return cfg.smsVerification;
  });
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
