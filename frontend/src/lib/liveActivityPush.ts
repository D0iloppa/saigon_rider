import { api } from '@/api/client';
import { loadSession } from '@/lib/session';
import i18n from '@/lib/i18n';
import type { LiveActivityKind } from '@/lib/plugins/liveActivity';

/**
 * iOS Live Activity 푸시토큰을 BFF 에 등록한다 (ai-docs/task/active/260829_live_activity_task.md Phase 3).
 * 등록되면 약속 상태가 바뀔 때 서버(noti_worker → engine → APNs)가 잠금화면 카드를 직접 갱신한다 —
 * 앱이 닫혀 있어도. 실패는 조용히 무시(카드는 부가 표면, 앱이 다시 열리면 로컬 갱신이 따라잡는다).
 * 카드 문구는 서버가 만들어 보내므로 현재 앱 언어를 함께 보낸다.
 */
export async function registerLiveActivityPushToken(e: { kind: LiveActivityKind; subjectId: string; token: string }): Promise<void> {
  if (!loadSession()?.sessionToken || !e.subjectId || !e.token) return;
  try {
    await api.realFetch<void>('/live-activities/token', {
      method: 'POST',
      body: JSON.stringify({
        kind: e.kind,
        subjectId: e.subjectId,
        pushToken: e.token,
        locale: (i18n.resolvedLanguage ?? i18n.language ?? 'vi').split('-')[0],
      }),
    }, 'bff', { silent: true });
  } catch (err) {
    console.warn('[liveActivity] push token register failed', err);
  }
}
