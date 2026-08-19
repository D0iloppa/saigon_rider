import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/Toast';
import { useConfirmStore } from '@/store/useConfirmStore';
import { extractErrorCode } from '@/api/client';
import {
  upsertBizReviewReply,
  deleteBizReviewReply,
  reportBizReview,
  type BizReviewReportReason,
} from '@/api/biz';

export const BIZ_REVIEW_REPORT_REASONS: BizReviewReportReason[] = ['SPAM', 'ABUSE', 'INAPPROPRIATE', 'OTHER'];

interface ModerationTarget {
  id: string;
  ownerReply: string | null;
}

/** 사장님 답글(작성/수정/삭제) + 후기 신고 상태·핸들러 — BizPublic(공개 프로필)·BizDashboard
 * (파트너 라운지) 공용. T 는 각 화면이 쓰는 후기 리스트 아이템 타입(BizReview | BizOwnerReview)
 * — 여기선 id/ownerReply/ownerRepliedAt 갱신에만 필요한 최소 형태로 다룬다. */
export function useReviewModeration<T extends { id: string; ownerReply: string | null; ownerRepliedAt: string | null }>(
  profileId: string | undefined,
  setReviews: (updater: (prev: T[]) => T[]) => void,
) {
  const { t } = useTranslation();
  const openConfirm = useConfirmStore((s) => s.open);

  const [replyTarget, setReplyTarget] = useState<ModerationTarget | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ id: string } | null>(null);
  const [reportReason, setReportReason] = useState<BizReviewReportReason | null>(null);
  const [reportNote, setReportNote] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const handleOpenReply = (review: ModerationTarget) => {
    setReplyBody(review.ownerReply ?? '');
    setReplyTarget(review);
  };

  const handleCloseReply = () => {
    setReplyTarget(null);
    setReplyBody('');
  };

  const handleSubmitReply = async () => {
    if (!profileId || !replyTarget || !replyBody.trim() || replySubmitting) return;
    setReplySubmitting(true);
    try {
      const updated = await upsertBizReviewReply(profileId, replyTarget.id, replyBody.trim());
      setReviews((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...r, ownerReply: updated.ownerReply, ownerRepliedAt: updated.ownerRepliedAt } : r)),
      );
      toast.success(t('biz.review.reply.success', { defaultValue: '답글을 등록했어요' }));
    } catch {
      toast.error(t('biz.review.reply.error', { defaultValue: '답글 등록에 실패했어요' }));
    } finally {
      // 실패해도 시트는 닫는다 (제출 흐름 규약, BizPublic 원본 동작 유지)
      setReplySubmitting(false);
      handleCloseReply();
    }
  };

  const handleDeleteReply = (review: { id: string }) => {
    if (!profileId) return;
    openConfirm(
      { mode: 'text', value: t('biz.review.reply.deleteConfirm', { defaultValue: '답글을 삭제할까요?' }) },
      async () => {
        try {
          await deleteBizReviewReply(profileId, review.id);
          setReviews((prev) =>
            prev.map((r) => (r.id === review.id ? { ...r, ownerReply: null, ownerRepliedAt: null } : r)),
          );
          toast.success(t('biz.review.reply.deleteSuccess', { defaultValue: '답글을 삭제했어요' }));
        } catch {
          toast.error(t('biz.review.reply.deleteError', { defaultValue: '답글 삭제에 실패했어요' }));
        }
      },
    );
  };

  const handleOpenReport = (review: { id: string }) => {
    setReportTarget(review);
  };

  const handleCloseReport = () => {
    setReportTarget(null);
    setReportReason(null);
    setReportNote('');
  };

  const handleSubmitReport = async () => {
    if (!profileId || !reportTarget || !reportReason || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await reportBizReview(profileId, reportTarget.id, reportReason, reportNote.trim() || undefined);
      // 016 M1: 신고 ≠ 즉시 차단 — 큐에 쌓여 운영자 판정 후에만 조치되므로 "삭제됐다"고 오해하지 않게 문구를 명확히 한다.
      toast.success(t('biz.review.report.success', { defaultValue: '신고가 접수되었어요. 검토 후 조치됩니다' }));
    } catch (err) {
      // R-3(260819 W3) — 취소한 신고 재시도와 처리 중인 신고 재시도는 다른 문구로 안내(MarketDetail/UserProfile 미러).
      const code = extractErrorCode(err);
      if (code === 'report_already_cancelled') {
        toast.error(t('support.reportAlreadyCancelledError'));
      } else if (code === 'report_already_pending') {
        toast.error(t('support.reportAlreadyPendingError'));
      } else {
        toast.error(t('biz.review.report.error', { defaultValue: '신고 접수에 실패했어요' }));
      }
    } finally {
      setReportSubmitting(false);
      handleCloseReport();
    }
  };

  return {
    handleOpenReply,
    handleDeleteReply,
    handleOpenReport,
    sheetProps: {
      replyTarget,
      replyBody,
      setReplyBody,
      replySubmitting,
      onCloseReply: handleCloseReply,
      onSubmitReply: handleSubmitReply,
      reportTarget,
      reportReason,
      setReportReason,
      reportNote,
      setReportNote,
      reportSubmitting,
      onCloseReport: handleCloseReport,
      onSubmitReport: handleSubmitReport,
    },
  };
}
