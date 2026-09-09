import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Plus, Ticket } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { extractDetail } from '@/api/client';
import { fetchBizCoupons, createBizCoupon, stopBizCoupon, redeemBizCoupon, type BizCoupon } from '@/api/biz';
import { useKeyboard } from '@/hooks/useKeyboard';
import { native } from '@/lib/native';
import { formatRelativeTime } from '@/lib/format';
import sys from '@/styles/system.module.css';
import styles from './BizCouponManage.module.css';

interface LocationState {
  profileId?: string;
}

/** 쿠폰 발행/관리 — 파트너 라운지 '가격표' 관리(BizPriceManage.tsx) 구조 미러. F061. */
export default function BizCouponManage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const profileId = (location.state as LocationState | null)?.profileId ?? null;

  const [coupons, setCoupons] = useState<BizCoupon[] | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const kb = useKeyboard();

  useEffect(() => {
    if (!profileId) {
      navigate('/biz/manage', { replace: true });
      return;
    }
    let cancelled = false;
    fetchBizCoupons(profileId)
      .then((list) => { if (!cancelled) setCoupons(list); })
      .catch(() => {
        if (!cancelled) { setCoupons([]); setLoadError(true); }
      });
    return () => { cancelled = true; };
  }, [profileId, navigate, reloadKey]);

  if (!profileId) return null;

  const canSubmit = !submitting && title.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await createBizCoupon({ profileId, title: title.trim(), description: description.trim() || null });
      setCoupons((prev) => (prev ? [created, ...prev] : [created]));
      setTitle('');
      setDescription('');
    } catch (err: unknown) {
      toast.error(extractDetail(err, t('biz.couponCreateError', { defaultValue: '쿠폰 발행에 실패했습니다' })));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStop = async (coupon: BizCoupon) => {
    try {
      const updated = await stopBizCoupon(coupon.id);
      setCoupons((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev);
    } catch (err: unknown) {
      toast.error(extractDetail(err, t('biz.couponStopError', { defaultValue: '쿠폰 중단에 실패했습니다' })));
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim() || redeeming) return;
    setRedeeming(true);
    try {
      await redeemBizCoupon(redeemCode.trim());
      toast.success(t('biz.couponRedeemSuccess', { defaultValue: '쿠폰을 사용 처리했습니다' }));
      setRedeemCode('');
      setReloadKey((key) => key + 1);
    } catch (err: unknown) {
      toast.error(extractDetail(err, t('biz.couponRedeemError', { defaultValue: '쿠폰 사용 처리에 실패했습니다' })));
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.couponManageTitle', { defaultValue: '쿠폰 관리' })} />
      <div className={styles.body} style={{ paddingBottom: native.isNative && kb.visible ? `calc(${kb.height}px + 16px)` : undefined }}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>{t('biz.couponManageEyebrow', { defaultValue: '가게 쿠폰' })}</span>
            <h1>{t('biz.couponManageTitle', { defaultValue: '쿠폰 관리' })}</h1>
            <p>{t('biz.couponManagePurpose', { defaultValue: '고객이 받아갈 수 있는 판촉 쿠폰을 발행하고 매장에서 사용 처리하세요.' })}</p>
            {coupons !== null && !loadError && <span className={`${styles.count} num`}>{t('biz.couponManageCount', { count: coupons.length, defaultValue: '{{count}}개 발행됨' })}</span>}
          </div>
          <Button onClick={() => titleInputRef.current?.focus()}>
            <Plus size={17} />{t('biz.couponSubmit', { defaultValue: '쿠폰 추가' })}
          </Button>
        </section>

        <div className={sys.sectionHead}><h2 className={sys.sectionLabel}>{t('biz.couponRedeemTitle', { defaultValue: '쿠폰 사용 처리' })}</h2></div>
        <div className={styles.redeemForm}>
          <input
            className={styles.input}
            placeholder={t('biz.couponRedeemPlaceholder', { defaultValue: '고객이 보여준 쿠폰 코드' })}
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value)}
          />
          <Button onClick={handleRedeem} disabled={!redeemCode.trim()} loading={redeeming}>
            {t('biz.couponRedeemCta', { defaultValue: '사용 처리' })}
          </Button>
        </div>

        <div className={sys.sectionHead}><h2 className={sys.sectionLabel}>{t('biz.couponListTitle', { defaultValue: '발행한 쿠폰' })}</h2></div>
        {loadError ? (
          <div className={`${sys.card} ${styles.emptyCard}`}><StateBlock icon={AlertCircle} tone="error" title={t('biz.couponLoadError', { defaultValue: '쿠폰을 불러오지 못했습니다' })} actionLabel={t('common.retry')} onAction={() => { setLoadError(false); setCoupons(null); setReloadKey((key) => key + 1); }} /></div>
        ) : coupons === null ? (
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        ) : coupons.length === 0 ? (
          <div className={`${sys.card} ${styles.emptyCard}`}><StateBlock
            icon={Ticket}
            title={t('biz.couponManageEmptyTitle', { defaultValue: '아직 발행한 쿠폰이 없어요' })}
            desc={t('biz.couponManageEmptyDesc', { defaultValue: '첫 쿠폰을 발행해 단골에게 알려보세요' })}
          /></div>
        ) : (
          <div className={styles.list}>
            {coupons.map((c) => (
              <div key={c.id} className={styles.row}>
                <span className={styles.rowMain}>
                  <strong className={styles.rowTitle}>{c.title}</strong>
                  <small>{t('biz.couponClaimedCount', { count: c.claimedCount, defaultValue: '{{count}}명 수령 · ' })}{t('biz.priceCreatedAt', { time: formatRelativeTime(c.createdAt) })}</small>
                </span>
                <span className={c.stoppedAt ? styles.badgeStopped : styles.badgeActive}>
                  {c.stoppedAt ? t('biz.couponStatusStopped', { defaultValue: '발행 중단' }) : t('biz.couponStatusActive', { defaultValue: '발행중' })}
                </span>
                {!c.stoppedAt && (
                  <button type="button" className={styles.rowStop} onClick={() => handleStop(c)}>
                    {t('biz.couponStopCta', { defaultValue: '중단' })}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={sys.sectionHead}><div><h2 className={sys.sectionLabel}>{t('biz.couponFormTitle', { defaultValue: '쿠폰 발행' })}</h2></div></div>
        <div className={styles.form}>
          <input
            ref={titleInputRef}
            className={styles.input}
            placeholder={t('biz.couponTitlePlaceholder', { defaultValue: '쿠폰 이름 (예: 첫 방문 10% 할인)' })}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
          <textarea
            className={styles.textarea}
            placeholder={t('biz.couponDescPlaceholder', { defaultValue: '설명 (선택)' })}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
          />
          <Button onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
            {submitting
              ? t('biz.couponSubmitting', { defaultValue: '발행 중' })
              : t('biz.couponSubmit', { defaultValue: '쿠폰 추가' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
