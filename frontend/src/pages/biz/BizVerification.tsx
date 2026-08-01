import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, FileCheck } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, extractDetail } from '@/api/client';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import {
  fetchBusinessProfiles,
  submitBizVerification,
  type BusinessProfile,
  type BizVerificationStatus,
} from '@/api/biz';
import styles from './BizVerification.module.css';

interface LocationState {
  profileId?: string;
}

const BADGE_CLASS: Record<BizVerificationStatus, string> = {
  pending: 'badgePending',
  docs_submitted: 'badgeSubmitted',
  verified: 'badgeVerified',
  rejected: 'badgeRejected',
};

export default function BizVerification() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUserStore((s) => s.user);
  const stateProfileId = (location.state as LocationState | null)?.profileId;

  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  // 문서는 민감정보라 서버가 원문 URL 을 내려주지 않는다 — 기제출분은 content id 만 유지 (제출됨 표시)
  const [licenseId, setLicenseId] = useState<string | null>(null);
  const [licensePreview, setLicensePreview] = useState<string | null>(null);
  const [signboardId, setSignboardId] = useState<string | null>(null);
  const [signboardPreview, setSignboardPreview] = useState<string | null>(null);
  const [repName, setRepName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브 키보드 오버레이 대응 (ai-docs/context/keyboard-ux.md 케이스 1)
  const isIosNative = native.platform === 'ios';

  useEffect(() => {
    let cancelled = false;
    fetchBusinessProfiles()
      .then((list) => {
        if (cancelled) return;
        const target =
          (stateProfileId ? list.find((p) => p.id === stateProfileId) : undefined) ??
          list.find((p) => p.status === 'APPROVED') ??
          list[0];
        if (!target) {
          navigate('/biz/intro', { replace: true });
          return;
        }
        setProfile(target);
        setLicenseId(target.bizLicenseContentId);
        setSignboardId(target.signboardContentId);
        setRepName(target.repName ?? '');
      })
      .catch(() => {
        if (!cancelled) navigate('/biz/status', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [stateProfileId, navigate]);

  const makeUploadHandler =
    (setId: (v: string) => void, setPreview: (v: string | null) => void) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setPreview(URL.createObjectURL(file));
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('owner_type', 'user');
        if (user) form.append('owner_id', user.id);
        // F-06 잔여: 사업자등록증/간판은 검증 문서 — 업로드 시점에 비공개로 지정
        form.append('is_private', 'true');
        const res = await api.realFetchForm<{ id: string }>('/contents/upload', form);
        setId(res.id);
      } catch (err: any) {
        toast.error(err.message ?? t('biz.uploadError', { defaultValue: '사진 업로드 실패' }));
        setPreview(null);
      } finally {
        setUploading(false);
      }
    };

  const handleSubmit = async () => {
    if (!profile || !licenseId || uploading || submitting) return;
    setSubmitting(true);
    try {
      const updated = await submitBizVerification({
        profileId: profile.id,
        bizLicenseContentId: licenseId,
        signboardContentId: signboardId,
        repName: repName.trim() || null,
      });
      setProfile(updated);
      toast.success(t('biz.verifSubmitted', { defaultValue: '검증 서류를 제출했어요. 심사 후 알려드릴게요.' }));
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.verifSubmitError', { defaultValue: '검증 제출에 실패했습니다' })));
    } finally {
      setSubmitting(false);
    }
  };

  if (profile === null) {
    return (
      <div className={styles.page}>
        <TopBar title={t('biz.verifTitle', { defaultValue: '사업자 검증' })} />
        <div className={styles.body}>
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        </div>
      </div>
    );
  }

  const vs = profile.verificationStatus;
  const statusLabel =
    vs === 'verified'
      ? t('biz.verifStatusVerified', { defaultValue: '검증 완료' })
      : vs === 'docs_submitted'
        ? t('biz.verifStatusSubmitted', { defaultValue: '검토 중' })
        : vs === 'rejected'
          ? t('biz.verifStatusRejected', { defaultValue: '반려' })
          : t('biz.verifStatusPending', { defaultValue: '검증 전' });

  const renderDocBox = (
    preview: string | null,
    submittedId: string | null,
    placeholder: string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  ) => (
    <label className={styles.photoBox}>
      {preview ? (
        // 로컬 blob 미리보기 — <img> (BizApply 패턴)
        <img src={preview} alt="" className={styles.photoPreview} />
      ) : submittedId ? (
        <span className={styles.photoSubmitted}>
          <FileCheck size={16} strokeWidth={2} aria-hidden />
          {t('biz.verifDocSubmitted', { defaultValue: '제출된 문서 (다시 올리면 교체돼요)' })}
        </span>
      ) : (
        <span className={styles.photoPlaceholder}>
          <Camera size={16} strokeWidth={2} aria-hidden />
          {placeholder}
        </span>
      )}
      {uploading && <div className={styles.photoOverlay}>{t('biz.uploading', { defaultValue: '업로드 중…' })}</div>}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={onChange}
      />
    </label>
  );

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.verifTitle', { defaultValue: '사업자 검증' })} />
      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
        {/* 상태 카드 */}
        <div className={styles.statusCard}>
          <div className={styles.statusHead}>
            <span className={styles.statusName}>{profile.name}</span>
            <span className={`${styles.badge} ${styles[BADGE_CLASS[vs]]}`}>{statusLabel}</span>
          </div>
          {vs === 'rejected' && (
            <p className={styles.rejectReason}>
              {profile.verificationRejectReason ||
                t('biz.rejectReasonEmpty', { defaultValue: '반려 사유가 등록되지 않았습니다.' })}
            </p>
          )}
          {vs === 'docs_submitted' && (
            <p className={styles.statusDesc}>
              {t('biz.verifReviewingDesc', { defaultValue: '제출한 서류를 검토하고 있어요. 통상 24시간 이내 결과를 알려드려요.' })}
            </p>
          )}
          {vs === 'verified' && (
            <p className={styles.statusDesc}>
              {t('biz.verifVerifiedDesc', { defaultValue: '사업자 검증이 완료됐어요. 유료 광고를 게시할 수 있어요.' })}
            </p>
          )}
          {vs === 'pending' && (
            <p className={styles.statusDesc}>
              {t('biz.verifDesc', { defaultValue: '유료 광고를 게시하려면 사업자등록증 검증이 필요해요. 서류는 검증 용도로만 사용돼요.' })}
            </p>
          )}
        </div>

        {vs !== 'verified' && (
          <>
            {/* 사업자등록증 (필수) */}
            <p className={styles.label}>{t('biz.verifLicenseLabel', { defaultValue: '사업자등록증 (필수)' })}</p>
            {renderDocBox(
              licensePreview,
              profile.bizLicenseContentId,
              t('biz.verifLicensePlaceholder', { defaultValue: '사업자등록증 사진 올리기' }),
              makeUploadHandler(setLicenseId, setLicensePreview),
            )}

            {/* 간판 사진 (선택) */}
            <p className={styles.label}>{t('biz.verifSignboardLabel', { defaultValue: '간판 사진 (선택)' })}</p>
            {renderDocBox(
              signboardPreview,
              profile.signboardContentId,
              t('biz.verifSignboardPlaceholder', { defaultValue: '가게 간판 사진 올리기' }),
              makeUploadHandler(setSignboardId, setSignboardPreview),
            )}

            {/* 대표자명 (선택) */}
            <p className={styles.label}>{t('biz.verifRepNameLabel', { defaultValue: '대표자명 (선택)' })}</p>
            <input
              className={styles.input}
              placeholder={t('biz.verifRepNamePlaceholder', { defaultValue: '사업자등록증상 대표자명' })}
              value={repName}
              onChange={(e) => setRepName(e.target.value)}
              maxLength={80}
            />
          </>
        )}
      </div>

      {vs !== 'verified' && (
        <div className={styles.footer}>
          <Button onClick={handleSubmit} disabled={!licenseId || uploading || submitting}>
            {submitting
              ? t('biz.submitting', { defaultValue: '제출 중' })
              : t('biz.verifSubmitCta', { defaultValue: '검증 제출' })}
          </Button>
        </div>
      )}
    </div>
  );
}
