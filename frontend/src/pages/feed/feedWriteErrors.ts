import type { TFunction } from 'i18next';
import { toast } from '@/components/ui/Toast';
import { extractDetail, extractErrorCode } from '@/api/client';

/** 피드 쓰기(글·좋아요·댓글) 에러 → 토스트 문구. 그룹 비멤버(403 group_member_required)는 가입 안내,
 * 그 외는 서버 detail(429/409/403 사람이 읽는 문장) 우선, 없으면 fallback. */
export function feedWriteErrorMessage(err: unknown, t: TFunction, fallback?: string): string {
  if (extractErrorCode(err) === 'group_member_required') return t('feed.groupMemberRequired');
  return extractDetail(err, fallback ?? t('common.errorUnexpected'));
}

/** 쓰기 에러 토스트. 그룹 비멤버(group_member_required)이고 글의 그룹을 알면 [그룹 보기] 액션을 붙인다. */
export function toastFeedWriteError(
  err: unknown,
  t: TFunction,
  navigate: (to: string) => void,
  group?: { id: string; slug?: string | null } | null,
) {
  const action = group && extractErrorCode(err) === 'group_member_required'
    ? { label: t('feed.viewGroup'), onClick: () => navigate(`/group/${group.slug ?? group.id}`) }
    : undefined;
  toast.error(feedWriteErrorMessage(err, t), { action });
}
