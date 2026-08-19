import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { BizReviewReportReason } from '@/api/biz';
import { BIZ_REVIEW_REPORT_REASONS } from '@/hooks/useReviewModeration';
import styles from './ReviewModerationSheets.module.css';

interface Props {
  replyTarget: { id: string } | null;
  replyBody: string;
  setReplyBody: (v: string) => void;
  replySubmitting: boolean;
  onCloseReply: () => void;
  onSubmitReply: () => void;
  reportTarget: { id: string } | null;
  reportReason: BizReviewReportReason | null;
  setReportReason: (r: BizReviewReportReason) => void;
  reportNote: string;
  setReportNote: (v: string) => void;
  reportSubmitting: boolean;
  onCloseReport: () => void;
  onSubmitReport: () => void;
}

/** 답글 작성/신고 바텀시트 2종 — BizPublic.tsx 원본 JSX 를 그대로 옮긴 순수 리팩토링.
 * useReviewModeration() 의 sheetProps 를 그대로 펼쳐서 넘기면 된다. */
export default function ReviewModerationSheets({
  replyTarget,
  replyBody,
  setReplyBody,
  replySubmitting,
  onCloseReply,
  onSubmitReply,
  reportTarget,
  reportReason,
  setReportReason,
  reportNote,
  setReportNote,
  reportSubmitting,
  onCloseReport,
  onSubmitReport,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      <BottomSheet open={replyTarget !== null} onClose={onCloseReply}>
        <div className={styles.replySheet}>
          <h2 className={styles.replySheetTitle}>{t('biz.review.reply.title', { defaultValue: '후기에 답글 남기기' })}</h2>
          <textarea
            className={styles.replyTextarea}
            value={replyBody}
            maxLength={500}
            rows={4}
            placeholder={t('biz.review.reply.placeholder', { defaultValue: '고객에게 전할 답변을 남겨주세요' })}
            onChange={(e) => setReplyBody(e.target.value)}
          />
          <div className={styles.replySheetActions}>
            <button
              type="button"
              className={styles.replySheetSubmit}
              disabled={!replyBody.trim() || replySubmitting}
              onClick={onSubmitReply}
            >
              {replySubmitting ? t('biz.review.reply.submitting', { defaultValue: '등록 중…' }) : t('biz.review.reply.submit', { defaultValue: '등록' })}
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={reportTarget !== null} onClose={onCloseReport}>
        <div className={styles.reportSheet}>
          <h2 className={styles.replySheetTitle}>{t('biz.review.report.title', { defaultValue: '후기 신고' })}</h2>
          <div className={styles.reportReasonList}>
            {BIZ_REVIEW_REPORT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className={reportReason === reason ? styles.reportReasonBtnActive : styles.reportReasonBtn}
                onClick={() => setReportReason(reason)}
              >
                {t(`biz.review.report.reason_${reason}`)}
              </button>
            ))}
          </div>
          <textarea
            className={styles.reportNoteInput}
            value={reportNote}
            maxLength={500}
            rows={3}
            placeholder={t('biz.review.report.notePlaceholder', { defaultValue: '자세한 내용을 알려주세요 (선택)' })}
            onChange={(e) => setReportNote(e.target.value)}
          />
          <div className={styles.replySheetActions}>
            <button
              type="button"
              className={styles.replySheetSubmit}
              disabled={!reportReason || reportSubmitting}
              onClick={onSubmitReport}
            >
              {reportSubmitting
                ? t('biz.review.report.submitting', { defaultValue: '접수 중…' })
                : t('biz.review.report.submit', { defaultValue: '신고 접수' })}
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
