import { useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { TabBar } from './TabBar';
// [게이미피케이션 잠정보류] 게임 허브 FAB — CSS(display:none)로 숨겨져 있으면서도 계속
// 마운트되던 것을 제거(P2-5). 시트의 유일 항목(/info)은 홈 화면 "동네 정보" 카드에서 이미
// 직접 접근 가능해 UI 상 진입점 손실이 없다(InfoHub 자체 허브 화면은 원래도 이 FAB 외에
// 진입 경로가 없었음 — 별건으로 보고). 재개 시 아래 주석 해제 + import 복원.
// import { FloatingActionButton } from './FloatingActionButton';
import { emojiUrl } from '@/lib/emoji';
import styles from './AppShell.module.css';

interface Props {
  children: ReactNode;
  isAuthenticated: boolean;
  splashVisible: boolean;
  splashFade: boolean;
  gifReady: boolean;
  bootstrapError: boolean;
  onBootstrapRetry: () => void;
  onBootstrapLogin: () => void;
}

const HIDE_TABBAR_PATHS = [
  '/splash',
  '/suspended',
  '/auth/',
  '/ride/result/',
  '/ride-nav',
  '/link',
  '/dm/',
  '/market/',
  '/map/profile',
  '/map/favorites',
  '/map/categories',
  '/quest-check/',
  '/feed/post/', // 게시글 상세 — 하단 댓글 입력바가 탭바 자리 사용
  '/feed/new', // 글쓰기 — 탭 오터치로 초안 소실 방지 (P1-7)
  '/feed/edit/', // 글수정 — 위와 동일 사유 (P1-7)
  '/biz/', // 업체 상세 — 업체 전용 문의 CTA가 탭바 자리 사용
];

export function AppShell({
  children, isAuthenticated, splashVisible, splashFade, gifReady,
  bootstrapError, onBootstrapRetry, onBootstrapLogin,
}: Props) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  // 미인증 상태에서는 탭바를 숨긴다 — 눌러도 보호된 화면이라 튕겨나가기만 한다 (P1-9)
  const hideTabBar = !isAuthenticated || HIDE_TABBAR_PATHS.some((p) => pathname.startsWith(p));

  return (
    <div className={styles.shell}>
      <div id="app-frame" className={styles.frame}>
        <div className={styles.viewport}>{children}</div>
        {/* {!hideTabBar && <FloatingActionButton />} — 제거 사유는 위 import 주석 참조 (P2-5) */}
        {!hideTabBar && <TabBar />}
        {splashVisible && (
          <div className={`${styles.splash} ${splashFade ? styles.splashFade : ''}`}>
            {gifReady ? (
              <img src={emojiUrl('1f3cd')} className={styles.splashIcon} alt="" />
            ) : (
              <span className={styles.splashIconEmoji} aria-hidden="true">🏍</span>
            )}
            <span className={styles.splashTitle}>Saigon Rider</span>
            {bootstrapError && (
              <div className={styles.bootstrapError} role="alert">
                <strong>{t('splash.bootstrapErrorTitle')}</strong>
                <p>{t('splash.bootstrapErrorBody')}</p>
                <Button size="md" onClick={onBootstrapRetry}>{t('common.retry')}</Button>
                <button className={styles.bootstrapLogin} onClick={onBootstrapLogin}>
                  {t('splash.bootstrapLogin')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
