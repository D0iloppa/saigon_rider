import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Flag, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { LocationChannelProposal } from '@/api/locationChannel';
import { formatDurationShort } from '@/lib/format';
import styles from './DestinationProposalCard.module.css';

interface Props {
  proposal: LocationChannelProposal;
  myId: string | null;
  busy: boolean;
  onVote: (accept: boolean) => void;
  onWithdraw: () => void;
}

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

/**
 * 목적지 변경 제안 카드(§3-3) — 모달 상단. 제안자·장소명·카운트다운·투표 현황.
 * 제안자 본인 = "제안 철회"(ghost), 그 외 = 수락(주 액션 1개) / 거절(ghost).
 * 이미 투표한 참가자는 버튼 대신 내 응답만 표시. 만료(0:00)는 서버 `dest_resolved{expired}` 가 기준 — 카드는 그때 사라진다.
 */
export function DestinationProposalCard({ proposal, myId, busy, onVote, onWithdraw }: Props) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(() => secondsLeft(proposal.expiresAt));

  // 카운트다운 — 카드가 마운트된 동안(모달 열림)만 1초 타이머. 제안이 바뀌면 부모가 key 로 리마운트한다.
  useEffect(() => {
    const id = window.setInterval(() => setLeft(secondsLeft(proposal.expiresAt)), 1000);
    return () => window.clearInterval(id);
  }, [proposal.expiresAt]);

  const isProposer = myId != null && proposal.proposedBy === myId;
  const myVote = myId ? proposal.votes.find((v) => v.userId === myId) : undefined;
  const accepts = proposal.votes.filter((v) => v.accept).length;

  return (
    <div className={styles.card} role="status">
      <div className={styles.header}>
        <span className={styles.title}>
          <Flag size={13} strokeWidth={2.5} /> {t('liveLocation.proposalTitle', { defaultValue: '목적지 변경 제안' })}
        </span>
        <span className={`${styles.timer} num`} data-urgent={left <= 60 || undefined}>
          {formatDurationShort(left)}
        </span>
      </div>

      <div className={styles.body}>
        <strong className={styles.place}>
          {proposal.name || t('liveLocation.destUnnamed', { defaultValue: '지도에서 찍은 위치' })}
        </strong>
        <span className={styles.meta}>
          {isProposer
            ? t('liveLocation.proposalByMe', { defaultValue: '내가 제안했어요' })
            : t('liveLocation.proposalBy', { defaultValue: '{{name}} 님의 제안', name: proposal.proposedByNickname })}
          <span className={styles.dot} />
          <span className="num">
            {t('liveLocation.proposalVotes', {
              defaultValue: '수락 {{n}}/{{m}}',
              n: accepts,
              m: proposal.requiredAcceptCount,
            })}
          </span>
        </span>
      </div>

      <div className={styles.actions}>
        {isProposer ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onWithdraw}>
            {t('liveLocation.proposalWithdraw', { defaultValue: '제안 철회' })}
          </Button>
        ) : myVote ? (
          <span className={styles.voted} data-accept={myVote.accept || undefined}>
            {myVote.accept ? <Check size={14} strokeWidth={2.5} /> : <X size={14} strokeWidth={2.5} />}
            {myVote.accept
              ? t('liveLocation.proposalYouAccepted', { defaultValue: '수락했어요 · 다른 참가자를 기다리는 중' })
              : t('liveLocation.proposalYouRejected', { defaultValue: '거절했어요' })}
          </span>
        ) : (
          <>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onVote(false)}>
              {t('liveLocation.proposalReject', { defaultValue: '거절' })}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onVote(true)}>
              <Check size={14} strokeWidth={2.5} /> {t('liveLocation.proposalAccept', { defaultValue: '수락' })}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
