import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Check, ShieldAlert } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { RadioCircle } from '@/components/ui/RadioCircle';
import { toast } from '@/components/ui/Toast';
import { api, extractDetail } from '@/api/client';
import { native } from '@/lib/native';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useUserStore } from '@/store/useUserStore';
import {
  createBusinessAd,
  fetchAdTiers,
  fetchBusinessProfiles,
  type AdTier,
  type BizVerificationStatus,
} from '@/api/biz';
import styles from './BizAdsNew.module.css';

interface LocationState {
  profileId?: string;
}

// 3스텝: 소재 → 플랜 → 게시
const STEP_COUNT = 3;

export default function BizAdsNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUserStore((s) => s.user);
  const stateProfileId = (location.state as LocationState | null)?.profileId;

  const [step, setStep] = useState(0);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<BizVerificationStatus | null>(null);
  const [tiers, setTiers] = useState<AdTier[]>([]);
  const [tierId, setTierId] = useState<string | null>(null);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isOngoing, setIsOngoing] = useState(true); // 상시 게시 기본 ON
  const [endDate, setEndDate] = useState('');
  const [imageContentId, setImageContentId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const kb = useKeyboard();
  // iOS 네이티브는 키보드가 순수 오버레이라 스크롤해도 키보드에 가려진다 —
  // 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다. (ai-docs/context/keyboard-ux.md 케이스 1)
  const isIosNative = native.platform === 'ios';

  // state 프로필 우선, 없으면 첫 APPROVED 폴백 — 검증 상태(verificationStatus)도 함께 확보 (게이트 안내용)
  useEffect(() => {
    let cancelled = false;
    fetchBusinessProfiles()
      .then((list) => {
        if (cancelled) return;
        const target =
          (stateProfileId ? list.find((p) => p.id === stateProfileId) : undefined) ??
          list.find((p) => p.status === 'APPROVED');
        if (target) {
          setProfileId(target.id);
          setVerificationStatus(target.verificationStatus);
        } else {
          navigate('/biz/status', { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) navigate('/biz/status', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [stateProfileId, navigate]);

  useEffect(() => {
    let cancelled = false;
    fetchAdTiers()
      .then((list) => {
        if (cancelled) return;
        setTiers(list);
        if (list.length === 1) setTierId(list[0].id);
      })
      .catch((err: any) => {
        if (!cancelled) {
          toast.error(extractDetail(err, t('biz.adTierLoadError', { defaultValue: '광고 등급을 불러오지 못했습니다' })));
        }
      })
      .finally(() => {
        if (!cancelled) setTiersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const todayDate = new Date().toISOString().slice(0, 10);
  const periodInvalid = !isOngoing && !!endDate && endDate < todayDate;

  // 스텝별 진행 가능 조건
  const creativeReady = !uploadingImage && !!imageContentId && title.trim().length > 0;
  const planReady = !tiersLoading && !!tierId;
  const publishReady = isOngoing || !periodInvalid;
  const canNext = step === 0 ? creativeReady : planReady;
  const canSubmit = !submitting && !!profileId && creativeReady && planReady && publishReady;

  // 플랜 비교 축: 노출 순번 배정 배수 = 티어 가중치 / 최소 가중치 (ad_tiers.exposure_weight — 서버 SoT)
  const minWeight = tiers.reduce((m, tier) => Math.min(m, Math.max(1, tier.exposureWeight)), Infinity);
  const maxWeight = tiers.reduce((m, tier) => Math.max(m, Math.max(1, tier.exposureWeight)), 0);
  const topWeightCount = tiers.filter((tier) => Math.max(1, tier.exposureWeight) === maxWeight).length;

  const stepLabels = [
    t('biz.adStepCreative', { defaultValue: '소재' }),
    t('biz.adStepPlan', { defaultValue: '플랜' }),
    t('biz.adStepPublish', { defaultValue: '게시' }),
  ];

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
    if (!canSubmit || !profileId || !tierId || !imageContentId) return;
    setSubmitting(true);
    try {
      const ad = await createBusinessAd({
        profileId,
        tierId,
        title: title.trim(),
        body: body.trim() || null,
        imageContentId,
        isOngoing,
        endsAt: !isOngoing && endDate ? `${endDate}T23:59:59+07:00` : null,
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

      {/* 스텝 인디케이터 */}
      <div className={styles.steps}>
        {stepLabels.map((label, i) => (
          <div
            key={label}
            className={`${styles.step} ${i === step ? styles.stepActive : ''} ${i < step ? styles.stepDone : ''}`}
          >
            <span className={`${styles.stepNum} num`}>
              {i < step ? <Check size={12} strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={styles.stepLabel}>{label}</span>
          </div>
        ))}
      </div>

      <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
        {step === 0 && (
          <>
            {/* Image (required) — 등록 화면의 로컬 미리보기는 blob 이라 <img> (BizApply 패턴) */}
            <label className={styles.photoBox}>
              {imagePreview ? (
                <img src={imagePreview} alt="" className={styles.photoPreview} />
              ) : (
                <span className={styles.photoPlaceholder}>
                  <Camera size={16} strokeWidth={2} aria-hidden />
                  {t('biz.adImagePlaceholder', { defaultValue: '광고 이미지 (필수)' })}
                </span>
              )}
              {uploadingImage && (
                <div className={styles.photoOverlay}>{t('biz.uploading', { defaultValue: '업로드 중…' })}</div>
              )}
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
          </>
        )}

        {step === 1 && (
          <>
            {/* 플랜 피커 — /biz/ad-tiers 데이터 주도 (티어 개수 확장 대응) */}
            {tiersLoading ? (
              <p className={styles.tierMessage}>{t('common.loading', { defaultValue: '불러오는 중...' })}</p>
            ) : tiers.length > 0 ? (
              <>
              <p className={styles.planHeading}>
                {t('biz.adPlanHeading', { defaultValue: '어떤 플랜이 맞을까요?' })}
              </p>
              <p className={styles.planSubtitle}>
                {t('biz.adPlanSubtitle', {
                  defaultValue: '두 플랜은 광고 자리 배정 방식이 달라요. 노출 순번을 비교해 보세요.',
                })}
              </p>
              <div className={styles.planList} role="radiogroup">
                {tiers.map((tier) => {
                  const selected = tierId === tier.id;
                  const weight = Math.max(1, tier.exposureWeight);
                  const multiplier = Number((weight / minWeight).toFixed(1));
                  const recommended = tiers.length > 1 && topWeightCount === 1 && weight === maxWeight;
                  return (
                  <label
                    key={tier.id}
                    className={`${styles.planCard} ${selected ? styles.planCardSelected : ''}`}
                  >
                    <input
                      className={styles.planRadio}
                      type="radio"
                      name="ad-tier"
                      value={tier.id}
                      checked={selected}
                      onChange={() => setTierId(tier.id)}
                    />
                    {(recommended || selected) && (
                      <div className={styles.planBadges}>
                        {recommended && (
                          <span className={styles.planBadgeRecommend}>
                            {t('biz.adPlanRecommend', { defaultValue: '적극적으로 알리고 싶다면' })}
                          </span>
                        )}
                        {selected && (
                          <span className={styles.planBadgeSelected}>
                            {t('biz.adPlanSelected', { defaultValue: '선택됨' })}
                          </span>
                        )}
                      </div>
                    )}
                    <div className={styles.planHead}>
                      <RadioCircle checked={tierId === tier.id} />
                      <strong className={styles.planName}>{tier.name}</strong>
                      <span className={`${styles.planPrice} num`}>
                        {tier.monthlyPriceVnd.toLocaleString('vi-VN')} ₫
                        <small>/{t('biz.month', { defaultValue: '월' })}</small>
                      </span>
                    </div>
                    {/* 비교 축 — 두 플랜을 같은 기준으로 나란히 읽게 한다 */}
                    <div className={styles.planMetric}>
                      <span className={styles.planMetricLabel}>
                        {t('biz.adPlanWeightLabel', { defaultValue: '노출 순번 배정' })}
                      </span>
                      <span className={`${styles.planMetricValue} num`}>×{multiplier}</span>
                    </div>
                    {tier.features.length > 0 && (
                      <ul className={styles.planFeatures}>
                        {tier.features.map((f, i) => (
                          <li key={i}>
                            <Check size={12} strokeWidth={2.5} aria-hidden />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </label>
                  );
                })}
              </div>
              <p className={styles.planNote}>
                {t('biz.adPlanExposureNote', {
                  defaultValue: '위 내용은 광고 노출 방식 설계 기준이에요. 실제 노출 개시 시점은 별도로 안내드려요.',
                })}
              </p>
              </>
            ) : (
              <p className={styles.tierMessage}>
                {t('biz.adTierEmpty', { defaultValue: '현재 신청 가능한 광고 등급이 없습니다.' })}
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            {/* 상시 게시 토글 (기본 ON) */}
            <div className={styles.pubRow}>
              <div className={styles.pubText}>
                <p className={styles.pubTitle}>{t('biz.adPeriodAlways', { defaultValue: '상시 게시' })}</p>
                <p className={styles.pubDesc}>
                  {t('biz.adOngoingDesc', { defaultValue: '승인 후 직접 중단할 때까지 계속 게시돼요' })}
                </p>
              </div>
              <Toggle checked={isOngoing} onChange={setIsOngoing} />
            </div>

            {/* 이벤트 광고 — 종료일 (선택) */}
            {!isOngoing && (
              <>
                <p className={styles.label}>{t('biz.adPeriodLabel', { defaultValue: '게시 종료일 (선택)' })}</p>
                <input
                  type="date"
                  className={styles.input}
                  value={endDate}
                  min={todayDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <p className={styles.periodHint}>
                  {t('biz.adEndDateHint', {
                    defaultValue: '이벤트 광고라면 종료일을 지정하세요. 종료일이 지나면 자동으로 내려가요.',
                  })}
                </p>
                {periodInvalid && (
                  <p className={styles.periodError}>
                    {t('biz.adPeriodInvalid', { defaultValue: '종료일은 오늘 이후여야 해요' })}
                  </p>
                )}
              </>
            )}

            {/* 유료 게시 게이트 안내 — 차단 아님, verified 전에는 노출 제외라 검증 제출 유도 */}
            {verificationStatus !== null && verificationStatus !== 'verified' && (
              <div className={styles.verifyNotice}>
                <ShieldAlert size={16} strokeWidth={2} aria-hidden className={styles.verifyNoticeIcon} />
                <div className={styles.verifyNoticeBody}>
                  <p>
                    {verificationStatus === 'docs_submitted'
                      ? t('biz.verifGateReviewing', {
                          defaultValue: '사업자등록증 검증을 심사하고 있어요. 검증 완료 후 광고가 노출돼요.',
                        })
                      : t('biz.verifGateNotice', {
                          defaultValue: '유료 게시하려면 사업자등록증 검증이 필요해요. 광고 등록은 지금 가능하지만, 검증 완료 전에는 노출되지 않아요.',
                        })}
                  </p>
                  {verificationStatus !== 'docs_submitted' && (
                    <button
                      type="button"
                      className={styles.verifyNoticeCta}
                      onClick={() => navigate('/biz/verification', { state: { profileId } })}
                    >
                      {t('biz.verifGateCta', { defaultValue: '검증 제출하기' })}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* D3 [등록→심사→게시] 고지 */}
            <p className={styles.notice}>
              {t('biz.adReviewNotice', { defaultValue: '제출한 광고는 심사 후 게시돼요. 통상 24시간 이내 결과를 알려드려요.' })}
            </p>
          </>
        )}
      </div>

      <div className={styles.footer}>
        {step > 0 && (
          <Button variant="secondary" fullWidth={false} className={styles.footerBack} onClick={() => setStep(step - 1)}>
            {t('biz.adStepPrev', { defaultValue: '이전' })}
          </Button>
        )}
        {step < STEP_COUNT - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
            {t('biz.adStepNext', { defaultValue: '다음' })}
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
            {submitting ? t('biz.submitting', { defaultValue: '제출 중' }) : t('biz.submit', { defaultValue: '제출' })}
          </Button>
        )}
      </div>
    </div>
  );
}
