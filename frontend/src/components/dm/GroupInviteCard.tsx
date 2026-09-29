import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CardMessage } from '@/components/dm/CardMessage';
import cardStyles from '@/components/dm/CardMessage.module.css';
import { GroupCover } from '@/pages/community/GroupCard';
import { pickTopicLabel } from '@/pages/community/groupTopics';
import styles from './GroupInviteCard.module.css';

interface Props {
  meta: Record<string, any> | null | undefined;
  isMine: boolean;
  timeLabel: string;
}

// 그룹 초대 카드 — 서버 스냅샷(이름·커버·주제·인원)과 [그룹 보기] 링크만. 가입은 그룹 페이지의 [가입하기]로만 (대표 판정 260929).
export function GroupInviteCard({ meta, isMine, timeLabel }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const groupId: string | undefined = meta?.groupId;
  const topicLabel = pickTopicLabel(meta?.topicLabels ?? null, i18n.language);

  return (
    <CardMessage
      type="group_invite"
      isMine={isMine}
      headerLabel={t('communityGroup.inviteCardLabel')}
      timeLabel={timeLabel}
    >
      <div data-testid="invite-card">
        <div className={styles.groupRow}>
          <GroupCover name={meta?.groupName ?? ''} coverUrl={meta?.coverUrl ?? null} className={styles.cover} />
          <div className={styles.info}>
            <div className={cardStyles.cardTitle}>{meta?.groupName ?? ''}</div>
            <div className={cardStyles.cardSubtitle}>
              {topicLabel && `${topicLabel} · `}
              {t('communityGroup.memberCount', { count: meta?.memberCount ?? 0 })}
            </div>
          </div>
        </div>
        <div className={cardStyles.cardButtonSlot}>
          <button type="button" className={styles.viewBtn} onClick={() => navigate(`/group/${groupId}`)}>
            {t('communityGroup.inviteCardView')}
          </button>
        </div>
      </div>
    </CardMessage>
  );
}
