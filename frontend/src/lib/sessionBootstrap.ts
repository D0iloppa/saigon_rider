import type { Session } from './session';

export type SessionBootstrapResult = 'ready' | 'restricted' | 'retryable-error';

interface Dependencies<User> {
  session: Session | null;
  verify: (userId: string, sessionToken: string) => Promise<User>;
  login: (user: User) => void;
  clear: () => void;
  logout: () => void;
  isExpired: (error: unknown) => boolean;
  isRestricted: (error: unknown) => boolean;
}

export async function bootstrapSession<User>(deps: Dependencies<User>): Promise<SessionBootstrapResult> {
  if (!deps.session) return 'ready';
  try {
    const user = await deps.verify(deps.session.userId, deps.session.sessionToken);
    deps.login(user);
    return 'ready';
  } catch (error) {
    if (deps.isRestricted(error)) return 'restricted';
    if (deps.isExpired(error)) {
      deps.clear();
      deps.logout();
      return 'ready';
    }
    return 'retryable-error';
  }
}

export function leaveBootstrapForLogin(clear: () => void, logout: () => void, navigate: () => void): void {
  clear();
  logout();
  navigate();
}
