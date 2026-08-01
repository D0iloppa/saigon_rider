import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { native } from '@/lib/native';

/**
 * 푸시 알림 클릭 → 딥링크 라우팅 브리지.
 *
 * BrowserRouter 내부에 항상 마운트되어:
 *  - 앱 실행 중 알림 클릭: native.onNotificationClick → /link?action=<navigateTo>
 *  - 콜드 스타트(앱 종료 상태) 알림 진입: native.getPendingNotification 1회 drain
 *
 * navigateTo 형식은 LinkRouter 쿼리 규약과 동일 (예: "dm&id=<convId>").
 */
export default function NotificationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    let unsub = () => {};

    native
      .onNotificationClick((e) => {
        if (e.navigateTo) navigate(`/link?action=${e.navigateTo}`);
      })
      .then((u) => {
        unsub = u;
      });

    native.getPendingNotification().then((navigateTo) => {
      if (navigateTo) navigate(`/link?action=${navigateTo}`);
    });

    return () => unsub();
  }, [navigate]);

  return null;
}
