import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import styles from './Community.module.css';

// /feed · /community/groups 공용 셸 — 뒤로가기 없는 헤더. 좌측이 도메인 전환 [피드 그룹](큰 글자 탭,
// 당근 커뮤니티 탭 문법 — 밑줄형 화면 내 탭과 구분), 우측 ☰ = 내 커뮤니티 허브. (F-CM-01 FR-1 r14)
export function CommunityHeader({ active }: { active: 'feed' | 'group' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const seg = (key: 'feed' | 'group', path: string, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={active === key}
      data-testid={`community-seg-${key}`}
      className={`${styles.domainTab} ${active === key ? styles.domainTabActive : ''}`}
      onClick={() => { if (active !== key) navigate(path, { replace: true }); }}
    >
      {label}
    </button>
  );
  return (
    <TopBar
      showBack={false}
      leftContent={
        <div className={styles.domainTabs} role="tablist" aria-label={t('communityGroup.shellTitle')}>
          {seg('feed', '/feed', t('communityGroup.segFeed'))}
          {seg('group', '/community/groups', t('communityGroup.segGroup'))}
        </div>
      }
      rightContent={
        <button
          className={styles.menuBtn}
          type="button"
          data-testid="community-menu-btn"
          onClick={() => navigate('/community/me')}
          aria-label={t('communityGroup.hubTitle')}
        >
          <Menu size={22} strokeWidth={2.2} />
        </button>
      }
    />
  );
}
