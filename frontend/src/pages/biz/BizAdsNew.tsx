import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, extractDetail } from '@/api/client';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import { createBusinessAd, fetchBusinessProfiles } from '@/api/biz';
import styles from './BizAdsNew.module.css';

interface LocationState {
  profileId?: string;
}

export default function BizAdsNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUserStore((s) => s.user);
  const stateProfileId = (location.state as LocationState | null)?.profileId;

  const [profileId, setProfileId] = useState<string | null>(stateProfileId ?? null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [imageContentId, setImageContentId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 스크롤해도 키보드에 가려진다 —
  // 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다. (ai-docs/context/keyboard-ux.md 케이스 1)
  const isIosNative = native.platform === 'ios';

  // 딥링크 등 state 없이 진입 시 — 첫 APPROVED 프로필로 폴백 (없으면 status 화면으로)
  useEffect(() => {
    if (stateProfileId) return;
    let cancelled = false;
    fetchBusinessProfiles()
      .then((list) => {
        if (cancelled) return;
        const approved = list.find((p) => p.status === 'APPROVED');
        if (approved) setProfileId(approved.id);
        else navigate('/biz/status', { replace: true });
      })
      .catch(() => {
        if (!cancelled) navigate('/biz/status', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [stateProfileId, navigate]);

  const periodInvalid = !!startDate && !!endDate && endDate < startDate;
  const canSubmit =
    !submitting && !uploadingImage && !!profileId && !!imageContentId && title.trim().length > 0 && !periodInvalid;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('owner_type', 'user');
      if (user) form.append('owner_id', user.id);
      const res = await api.realFetchForm<{ id: string }>('/contents/upload', form);
      setImageContentId(res.id);
    } catch (err: any) {
      toast.error(err.message ?? t('biz.uploadError', { defaultValue: '사진 업로드 실패' }));
      setImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !profileId || !imageContentId) return;
    setSubmitting(true);
    try {
      const ad = await createBusinessAd({
        profileId,
        title: title.trim(),
        body: body.trim() || null,
        imageContentId,
        startsAt: startDate ? `${startDate}T00:00:00+07:00` : null,
        endsAt: endDate ? `${endDate}T23:59:59+07:00` : null,
      });
      navigate(`/biz/ads/${ad.id}`, { replace: true });
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.adCreateError', { defaultValue: '광고 등록에 실패했습니다' })));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.adNewTitle', { defaultValue: '광고 등록' })} />
      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
        {/* Image (required) — 등록 화면의 로컬 미리보기는 blob 이라 <img> (BizApply 패턴) */}
        <label className={styles.photoBox}>
          {imagePreview ? (
            <img src={imagePreview} alt="" className={styles.photoPreview} />
          ) : (
            <span className={styles.photoPlaceholder}>
              📷 {t('biz.adImagePlaceholder', { defaultValue: '광고 이미지 (필수)' })}
            </span>
          )}
          {uploadingImage && <div className={styles.photoOverlay}>⏳</div>}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleImageSelect}
          />
        </label>

        {/* Title */}
        <p className={styles.label}>{t('biz.adTitleLabel', { defaultValue: '광고 제목' })}</p>
        <input
          className={styles.input}
          placeholder={t('biz.adTitlePlaceholder', { defaultValue: '광고 제목을 입력하세요' })}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />

        {/* Body */}
        <p className={styles.label}>{t('biz.adBodyLabel', { defaultValue: '광고 문구 (선택)' })}</p>
        <input
          className={styles.input}
          placeholder={t('biz.adBodyPlaceholder', { defaultValue: '간단한 소개 문구를 입력하세요' })}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={160}
        />

        {/* Period */}
        <p className={styles.label}>{t('biz.adPeriodLabel', { defaultValue: '게시 기간 (선택)' })}</p>
        <div className={styles.periodRow}>
          <input
            type="date"
            className={styles.input}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className={styles.periodDash}>~</span>
          <input type="date" className={styles.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {periodInvalid && (
          <p className={styles.periodError}>
            {t('biz.adPeriodInvalid', { defaultValue: '종료일은 시작일 이후여야 해요' })}
          </p>
        )}

        {/* D3 [등록→심사→게시] 고지 */}
        <p className={styles.notice}>
          {t('biz.adReviewNotice', { defaultValue: '제출한 광고는 심사 후 게시돼요. 통상 24시간 이내 결과를 알려드려요.' })}
        </p>
      </div>

      <div className={styles.footer}>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {submitting ? t('biz.submitting', { defaultValue: '제출 중' }) : t('biz.submit', { defaultValue: '제출' })}
        </Button>
      </div>
    </div>
  );
}
