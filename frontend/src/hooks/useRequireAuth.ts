import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { saveReturnTo } from '@/lib/returnTo';
import { useUserStore } from '@/store/useUserStore';

/** 공개 조회 화면의 쓰기 행동만 인증 흐름으로 보내고, 현재 화면은 로그인 후 복귀용으로 보관한다. */
export function useRequireAuth(): () => boolean {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const consentAgreedAt = useUserStore((s) => s.user?.consentAgreedAt);

  return useCallback(() => {
    if (isAuthenticated && consentAgreedAt !== null) return true;

    saveReturnTo(location.pathname + location.search + location.hash);
    navigate(isAuthenticated ? '/auth/profile-setup' : '/auth/oauth');
    return false;
  }, [consentAgreedAt, isAuthenticated, location.hash, location.pathname, location.search, navigate]);
}
