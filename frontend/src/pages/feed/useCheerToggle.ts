import { useTranslation } from 'react-i18next';
import { extractErrorCode } from '@/api/client';
import { toggleCheer } from '@/api/feed';
import type { FeedPost } from '@/api/types';
import { toast } from '@/components/ui/Toast';

// FeedPostCard 의 onCheer 핸들러 — 응원 토글 후 목록 상태를 갱신한다(피드·그룹 게시판·좋아요한 글 공유).
// removeOnUncheer: 해제 시 목록에서 제거(좋아요한 글).
export function useCheerToggle(
  setPosts: React.Dispatch<React.SetStateAction<FeedPost[]>>,
  opts: { removeOnUncheer?: boolean } = {},
) {
  const { t } = useTranslation();
  return async (p: FeedPost, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { cheered, count } = await toggleCheer(p.id);
      setPosts((prev) => (!cheered && opts.removeOnUncheer
        ? prev.filter((x) => x.id !== p.id)
        : prev.map((x) => (x.id === p.id ? { ...x, iCheered: cheered, cheerCount: count } : x))));
    } catch (err) {
      toast.error(t(extractErrorCode(err) === 'group_member_required' ? 'feed.groupMemberRequired' : 'common.errorUnexpected'));
    }
  };
}
