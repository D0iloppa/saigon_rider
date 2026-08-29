import { apiSetPreferredLanguage } from '@/api/auth';
import { loadSession } from './session';

const SYNCED_KEY = 'preferred_lang_synced';

/**
 * 221: 앱 표시 언어를 서버(users.preferred_lang)에 동기화한다.
 * 서버가 만드는 알림 문안이 수신자 언어로 나가려면 서버도 언어를 알아야 한다.
 * 세션이 있고, 마지막으로 보낸 값과 다를 때만 보낸다(멱등). 실패는 무시 — 다음 호출에서 재시도된다.
 * (lang 을 인자로 받는 이유: i18n.ts 에서도 부르므로 i18n 모듈을 되import 하지 않기 위해.)
 */
export function syncPreferredLang(lang: string): void {
  const session = loadSession();
  if (!session) return;
  // 유저 단위로 기록한다 — 공유기기에서 계정이 바뀌면 이전 유저의 동기화 기록이 새 유저의 동기화를 막으면 안 된다.
  const mark = `${session.userId}:${lang}`;
  if (localStorage.getItem(SYNCED_KEY) === mark) return;
  apiSetPreferredLanguage(session.userId, lang)
    .then(() => localStorage.setItem(SYNCED_KEY, mark))
    .catch(() => undefined);
}
