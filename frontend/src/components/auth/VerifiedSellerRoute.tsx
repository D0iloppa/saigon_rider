import { ReactNode } from 'react';
import PrivateRoute from './PrivateRoute';

interface Props {
  children: ReactNode;
}

// 작성 화면은 로그인 사용자에게 먼저 열고, 전화 인증은 MarketCreate 의 게시 직전에 검사한다.
// 입력 전에 인증으로 보내면 OTP 실패·앱 전환 시 공급자가 폼에도 도달하지 못한다.
export default function VerifiedSellerRoute({ children }: Props) {
  return <PrivateRoute>{children}</PrivateRoute>;
}
