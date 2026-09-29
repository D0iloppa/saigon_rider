import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import type { CommunityGroup } from '@/api/types';
import styles from './Community.module.css';

// 커버 사진이 없으면 이름 첫 글자 타일 — 색은 이름에서 결정적으로 뽑는다.
export function GroupCover({ name, coverUrl, className = '' }: { name: string; coverUrl: string | null; className?: string }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) % 360;
  return (
    <div
      className={`${styles.cover} ${className}`}
      style={coverUrl ? undefined : { background: `hsl(${hash}, 55%, 52%)` }}
    >
      {coverUrl ? (
        <AppImage src={coverUrl} alt="" className={styles.coverImg} />
      ) : (
        <span>{[...name][0]?.toUpperCase() ?? '?'}</span>
      )}
    </div>
  );
}

export function GroupCard({ g }: { g: CommunityGroup }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <button className={styles.card} data-testid="group-card" onClick={() => navigate(`/group/${g.slug ?? g.id}`)}>
      <GroupCover name={g.name} coverUrl={g.coverUrl} />
      <div className={styles.cardInfo}>
        <span className={styles.cardName}>{g.name}</span>
        <span className={styles.cardDesc}>{g.description ?? ''}</span>
        <span className={styles.cardMeta}>
          {t(g.groupType === 'neighborhood' ? 'communityGroup.typeNeighborhood' : 'communityGroup.typeInterest')}
          {' · '}
          {t('communityGroup.memberCount', { count: g.memberCount })}
        </span>
      </div>
      {g.myMembershipStatus === 'ACTIVE' && <span className={styles.joinedBadge}>{t('communityGroup.joined')}</span>}
    </button>
  );
}
