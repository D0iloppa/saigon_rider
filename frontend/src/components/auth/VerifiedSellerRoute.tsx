import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useUserStore } from '@/store/useUserStore';
import PrivateRoute from './PrivateRoute';

interface Props {
  children: ReactNode;
}

// PrivateRoute(인증) 위에 전화번호 인증 여부를 추가로 검사 — 인증 로직은 중복하지 않고 합성한다.
function PhoneVerifiedGate({ children }: Props) {
  const phoneVerified = useUserStore((s) => s.user?.phoneVerified);
  const location = useLocation();

  if (!phoneVerified) {
    return <Navigate to="/auth/phone-verify" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default function VerifiedSellerRoute({ children }: Props) {
  return (
    <PrivateRoute>
      <PhoneVerifiedGate>{children}</PhoneVerifiedGate>
    </PrivateRoute>
  );
}
