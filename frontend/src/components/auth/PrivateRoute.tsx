import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useUserStore } from '@/store/useUserStore';

interface Props {
  children: ReactNode;
}

export default function PrivateRoute({ children }: Props) {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/splash" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
