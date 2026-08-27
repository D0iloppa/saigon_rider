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
    const action = params.get('action') ?? '';
    const id = params.get('id');
    let destination = resolveAction(action, id);

    // B-4: 음성메시지 알림 딥링크 — 대화 화면에 자동재생 파라미터를 그대로 넘긴다.
    if (action === 'dm' && id && params.get('voice') === '1') {
      const mid = params.get('mid');
      if (mid) destination = `${destination}?voice=1&mid=${mid}`;
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
