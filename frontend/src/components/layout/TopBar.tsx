import { useLocation, useNavigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBar } from './StatusBar';
import styles from './TopBar.module.css';

interface Props {
  title?: string;
  showBack?: boolean;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  transparent?: boolean;
  onBack?: () => void;
}

// 딥링크/새 탭 등 앱 내 history 가 없을 때 Up 이 착지할 섹션 root.
// prefix 는 긴 것부터 매칭되도록 순서 유지(없어도 되지만 명확성을 위해).
const SECTION_ROOTS: Array<[string, string]> = [
  ['/map', '/map'],
  ['/market', '/market'],
  ['/feed', '/feed'],
  ['/biz', '/biz/intro'],
  ['/dm', '/dm'],
  ['/quests', '/quests'],
  ['/notifications', '/profile'],
  ['/followers', '/profile'],
  ['/following', '/profile'],
  ['/friends', '/profile'],
  ['/trades', '/profile'],
  ['/profile', '/profile'],
];

function getSectionRoot(pathname: string): string {
  const match = SECTION_ROOTS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  return match ? match[1] : '/home';
}

export function TopBar({
  title,
  showBack = true,
  leftContent,
  rightContent,
  transparent = false,
  onBack,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <header className={`${styles.topbar} ${transparent ? styles.transparent : ''}`}>
      <StatusBar variant={transparent ? 'light' : 'dark'} />
      <div className={styles.content}>
        <div className={styles.left}>
          {showBack ? (
            <button
              className={styles.iconBtn}
              onClick={() => {
                if (onBack) {
                  onBack();
                  return;
                }
                // react-router 는 앱 세션의 최초 진입 엔트리에 key === 'default' 를 부여한다.
                // 딥링크/새 탭으로 들어와 앱 내 history 가 없는 경우 -1 은 앱 밖으로 나가거나
                // 빈 history 로 이탈할 수 있으므로, 이때는 섹션 root 로 이동시킨다(Up).
                if (location.key === 'default') {
                  navigate(getSectionRoot(location.pathname), { replace: true });
                } else {
                  navigate(-1);
                }
              }}
              aria-label={t('common.back')}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : leftContent ? (
            leftContent
          ) : null}
        </div>
        {title && <h1 className={styles.title}>{title}</h1>}
        <div className={styles.right}>{rightContent}</div>
      </div>
    </header>
  );
}
