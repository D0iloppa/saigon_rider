import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useUserStore } from '@/store/useUserStore';

interface Props {
  children: ReactNode;
}

export default function PrivateRoute({ children }: Props) {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const user = useUserStore((s) => s.user);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/splash" replace state={{ from: location }} />;
  }

  // F-9 우회 차단: 서버가 명시적으로 null(=동의 미기록)을 준 경우에만 막는다.
  // 필드 자체가 없는(undefined) 판정 불가 상태는 fail-open — 차단하지 않는다.
  if (user?.consentAgreedAt === null) {
    return <Navigate to="/auth/profile-setup" replace />;
  }

  return <>{children}</>;
}
