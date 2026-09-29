import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import gd from './GroupDetail.module.css';
import styles from './Community.module.css';

// /feed · /community/groups 공용 셸 — 뒤로가기 없는 "커뮤니티" 헤더 + 1단 [피드|그룹] 세그먼트.
export function CommunityHeader({ active }: { active: 'feed' | 'group' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const seg = (key: 'feed' | 'group', path: string, label: string) => (
    <button
      role="tab"
      aria-selected={active === key}
      data-testid={`community-seg-${key}`}
      className={`${gd.tabBtn} ${active === key ? gd.tabBtnActive : ''}`}
      onClick={() => { if (active !== key) navigate(path, { replace: true }); }}
    >
      {label}
    </button>
  );
  return (
    <>
      <TopBar
        title={t('communityGroup.shellTitle')}
        showBack={false}
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
      <div className={gd.tabRow} role="tablist">
        {seg('feed', '/feed', t('communityGroup.segFeed'))}
        {seg('group', '/community/groups', t('communityGroup.segGroup'))}
      </div>
    </>
  );
}
