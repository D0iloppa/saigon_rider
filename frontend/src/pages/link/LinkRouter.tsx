import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';
import { saveReturnTo } from '@/lib/returnTo';

/**
 * Deep-link entry point: /link?action=<action>[&id=<id>]
 *
 * Supported actions:
 *   home                    → /home
 *   quests                  → /quests
 *   quest&id=<questId>      → /quests/:questId
 *   dm&id=<conversationId>  → /dm/:conversationId
 *   dm&id=<conversationId>&voice=1&mid=<messageId> → /dm/:conversationId?voice=1&mid=<messageId>
 *     (B-4: 음성메시지 알림 탭 — 해당 대화로 이동 후 해당 메시지 자동재생)
 *   biz                     → /biz/intro
 *   biz&id=<profileId>      → /biz/status (PENDING/REJECTED 안내, APPROVED 는 status 화면이 /biz/manage 로 리다이렉트)
 *   bizad&id=<adId>         → /biz/ads/:adId (광고 심사 결과 딥링크, SGR-312 BP-4)
 *   feed                    → /feed
 *   profile                 → /profile
 *   settings                → /settings
 *   settings/notifications  → /settings/notifications
 *   settings/language       → /settings/language
 *   settings/account        → /settings/account
 *
 * Unauthenticated users are redirected to /splash.
 * Unknown actions fall back to /home.
 */
export default function LinkRouter() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);

  useEffect(() => {
    // 콜드 스타트 레이스 대응: NotificationBridge 가 드레인한 navigateTo 가 URL 쿼리보다 먼저
    // sessionStorage 에 남아있을 수 있다 — URL 에 action 이 없을 때만 이어받는다.
    const pending = sessionStorage.getItem('pending_deeplink');
    const effectiveParams = params.get('action') ? params : pending ? new URLSearchParams(`action=${pending}`) : params;
    sessionStorage.removeItem('pending_deeplink');

    const action = effectiveParams.get('action') ?? '';
    const id = effectiveParams.get('id');
    let destination = resolveAction(action, id);

    // B-4: 음성메시지 알림 딥링크 — 대화 화면에 자동재생 파라미터를 그대로 넘긴다.
    if (action === 'dm' && id && effectiveParams.get('voice') === '1') {
      const mid = effectiveParams.get('mid');
      if (mid) destination = `${destination}?voice=1&mid=${mid}`;
    }

    // Live Activity(경로안내 카드) 탭 복귀 — `ride&lat=..&lng=..&name=..` 를 RideNav 의 nav 파라미터로 되살린다.
    if (action === 'ride') {
      const q = new URLSearchParams({ type: 'nav' });
      for (const k of ['lat', 'lng', 'name', 'radius']) { // RideNav.laDeepLink 가 싣는 키와 동일 집합
        const v = effectiveParams.get(k);
        if (v) q.set(k, v);
      }
      destination = `/ride-nav?${q.toString()}`;
    }

    if (!isAuthenticated) {
      // 로그인 후 이 딥링크가 가리키던 화면으로 돌아갈 수 있도록 목적지를 보관한다. (P0-2)
      saveReturnTo(destination);
      navigate('/splash', { replace: true });
      return;
    }

    navigate(destination, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function resolveAction(action: string, id: string | null): string {
  switch (action) {
    case 'home':                   return '/home';
    case 'quests':                 return '/quests';
    case 'quest':                  return id ? `/quests/${id}` : '/quests';
    case 'dm':                     return id ? `/dm/${id}` : '/dm';
    case 'ride':                   return '/ride-nav'; // 파라미터는 위 action==='ride' 분기가 붙인다
    case 'market':                 return id ? `/market/${id}` : '/market';
    case 'biz':                     return id ? '/biz/status' : '/biz/intro';
    case 'bizad':                  return id ? `/biz/ads/${id}` : '/biz/manage';
    case 'feed':                   return '/feed';
    case 'profile':                return '/profile';
    case 'settings':               return '/settings';
    case 'settings/notifications': return '/settings/notifications';
    case 'settings/language':      return '/settings/language';
    case 'settings/account':       return '/settings/account';
    default:                       return '/home';
  }
}
