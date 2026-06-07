import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUserStore } from '@/store/useUserStore';

/**
 * Deep-link entry point: /link?action=<action>[&id=<id>]
 *
 * Supported actions:
 *   home                    → /home
 *   quests                  → /quests
 *   quest&id=<questId>      → /quests/:questId
 *   dm&id=<conversationId>  → /dm/:conversationId
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
    if (!isAuthenticated) {
      navigate('/splash', { replace: true });
      return;
    }

    const action = params.get('action') ?? '';
    const id = params.get('id');

    const destination = resolveAction(action, id);
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
    case 'feed':                   return '/feed';
    case 'profile':                return '/profile';
    case 'settings':               return '/settings';
    case 'settings/notifications': return '/settings/notifications';
    case 'settings/language':      return '/settings/language';
    case 'settings/account':       return '/settings/account';
    default:                       return '/home';
  }
}
