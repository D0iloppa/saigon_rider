import { useNavigate } from 'react-router-dom';
import { ChevronRight, Users } from 'lucide-react';
import type { FeedPost } from '@/api/types';
import styles from './FeedList.module.css';

// 그룹 글의 출처 칩 — 탭하면 그룹으로(카드/상세 클릭으로 버블링되지 않는다).
export function GroupSourceChip({ group }: { group: NonNullable<FeedPost['group']> }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={styles.groupChip}
      data-testid="post-group-chip"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/group/${group.slug ?? group.id}`);
      }}
    >
      <Users size={12} strokeWidth={2.2} className={styles.groupChipIcon} />
      <span>{group.name}</span>
      <ChevronRight size={12} strokeWidth={2.2} className={styles.groupChipIcon} />
    </button>
  );
}
