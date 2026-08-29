import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { native } from '@/lib/native';

/**
 * 푸시 알림 클릭 → 딥링크 라우팅 브리지.
 *
 * BrowserRouter 내부에 항상 마운트되어:
 *  - 앱 실행 중 알림 클릭: native.onNotificationClick → /link?action=<navigateTo>
 *  - 콜드 스타트(앱 종료 상태) 알림 진입: native.getPendingNotification 드레인
 *  - 앱 재개(resume): 콜드 스타트 드레인이 iOS 알림 전달과 경합해(레이스) 놓친 케이스를 재드레인
 *
 * navigateTo 형식은 LinkRouter 쿼리 규약과 동일 (예: "dm&id=<convId>").
 *
 * getPendingNotification() 은 네이티브 버퍼를 소거하지 않으므로(레이스 대응), 실제로 라우팅에
 * 반영한 뒤에만 ackPendingNotification() 을 호출해 소거한다 — 그 사이 앱이 죽어도 다음 드레인에서
 * 다시 잡힌다. sessionStorage 에도 남겨 LinkRouter 가 콜드 스타트 시점(action 쿼리 없이 뜨는 경우)에도
 * 이어받을 수 있게 한다.
 */
export default function NotificationBridge() {
  const navigate = useNavigate();
  const lastDeliveredRef = useRef<string | null>(null);

  useEffect(() => {
    const deliver = async (navigateTo: string) => {
      if (navigateTo === lastDeliveredRef.current) return;
      lastDeliveredRef.current = navigateTo;
      // 키는 "LinkRouter 마운트 전에 일어나는 부트스트랩 리다이렉트" 를 넘기기 위한 것이라
      // navigate 보다 먼저 써야 한다. 라우팅을 건 직후 여기서 직접 지워, 소거가 LinkRouter
      // 마운트 이펙트에 의존하지 않게 한다(그쪽도 지우지만 중복 소거라 무해).
      sessionStorage.setItem('pending_deeplink', navigateTo);
      navigate(`/link?action=${navigateTo}`);
      sessionStorage.removeItem('pending_deeplink');
      await native.ackPendingNotification();
    };

    const drainPending = () => {
      native.getPendingNotification().then((navigateTo) => {
        if (navigateTo) deliver(navigateTo);
      });
    };

    let unsub = () => {};

    native
      .onNotificationClick((e) => {
        if (e.navigateTo) deliver(e.navigateTo);
      })
      .then((u) => {
        unsub = u;
      });

    // 직전 세션에서 드레인은 됐지만 부트스트랩 리다이렉트에 라우팅이 먹혀 /link 까지 못 간 경우를 이어받는다.
    // deliver() 를 태워 ack·중복제거가 동일하게 적용되게 한다(이후 drainPending 은 중복이라 스킵된다).
    const stored = sessionStorage.getItem('pending_deeplink');
    if (stored) deliver(stored);

    drainPending();

    // 콜드 스타트 드레인이 iOS 알림 전달과 경합(레이스)해 놓칠 수 있어, 재개(resume) 시 재드레인한다.
    const onVisible = () => {
      if (document.visibilityState === 'visible') drainPending();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [navigate]);

  return null;
}
