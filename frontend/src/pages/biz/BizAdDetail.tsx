import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { extractDetail } from '@/api/client';
import { fetchBusinessAd, stopBusinessAd, resumeBusinessAd, type BusinessAd, type BusinessAdStatus } from '@/api/biz';
import styles from './BizAdDetail.module.css';
import { formatVnDate } from '@/lib/vnTime';

const CHIP_CLASS: Record<BusinessAdStatus, string> = {
  PENDING: 'chipPending',
  APPROVED: 'chipApproved',
  REJECTED: 'chipRejected',
  STOPPED: 'chipStopped',
};

export default function BizAdDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [ad, setAd] = useState<BusinessAd | null>(null);
  const [failed, setFailed] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchBusinessAd(id)
      .then((a) => {
        if (!cancelled) setAd(a);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const statusLabel = (s: BusinessAdStatus) =>
    s === 'PENDING' ? t('biz.adStatusPending', { defaultValue: '심사중' })
    : s === 'APPROVED' ? t('biz.adStatusApproved', { defaultValue: '게시중' })
    : s === 'REJECTED' ? t('biz.adStatusRejected', { defaultValue: '반려' })
    : t('biz.adStatusStopped', { defaultValue: '게시 중단' });

  const fmtDate = (iso: string) => formatVnDate(iso, i18n.language);
  const period = (a: BusinessAd) =>
    !a.startsAt && !a.endsAt
      ? t('biz.adPeriodAlways', { defaultValue: '상시 게시' })
      : `${a.startsAt ? fmtDate(a.startsAt) : '—'} ~ ${a.endsAt ? fmtDate(a.endsAt) : '—'}`;

  const handleStop = async () => {
    if (!ad) return;
    setActing(true);
    try {
      setAd(await stopBusinessAd(ad.id));
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.adActionError', { defaultValue: '처리에 실패했습니다' })));
    } finally {
      setActing(false);
    }
  };

  const handleResume = async () => {
    if (!ad) return;
    setActing(true);
    try {
      setAd(await resumeBusinessAd(ad.id));
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.adActionError', { defaultValue: '처리에 실패했습니다' })));
    } finally {
      setActing(false);
    }
  };

  if (failed) {
    return (
      <div className={styles.page}>
        <TopBar title={t('biz.adDetailTitle', { defaultValue: '광고 상세' })} />
        <div className={styles.body}>
          <p className={styles.loading}>{t('biz.adLoadError', { defaultValue: '광고를 불러오지 못했습니다' })}</p>
        </div>
      </div>
    );
  }

  if (ad === null) {
    return (
      <div className={styles.page}>
        <TopBar title={t('biz.adDetailTitle', { defaultValue: '광고 상세' })} />
        <div className={styles.body}>
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.adDetailTitle', { defaultValue: '광고 상세' })} />
      <div className={styles.body}>
        <AppImage src={ad.imageUrl ?? undefined} alt="" className={styles.adImage} />

        <div className={styles.headerRow}>
          <h2 className={styles.adTitle}>{ad.title}</h2>
          <span className={`${styles.chip} ${styles[CHIP_CLASS[ad.reviewStatus]]}`}>{statusLabel(ad.reviewStatus)}</span>
        </div>
        {ad.body && <p className={styles.adBody}>{ad.body}</p>}
        <p className={styles.adPeriod}>{period(ad)}</p>

        {ad.reviewStatus === 'PENDING' && (
          <p className={styles.pendingDesc}>
            {t('biz.adPendingDesc', { defaultValue: '소재를 심사하고 있어요. 통상 24시간 이내 결과를 알려드려요.' })}
          </p>
        )}

        {ad.reviewStatus === 'REJECTED' && (
          <div className={styles.rejectBox}>
            {ad.rejectReason || t('biz.rejectReasonEmpty', { defaultValue: '반려 사유가 등록되지 않았습니다.' })}
          </div>
        )}
      </div>

      {(ad.reviewStatus === 'APPROVED' || ad.reviewStatus === 'STOPPED') && (
        <div className={styles.footer}>
          {ad.reviewStatus === 'APPROVED' ? (
            <Button variant="secondary" onClick={handleStop} disabled={acting}>
              {t('biz.adStopCta', { defaultValue: '게시 중단' })}
            </Button>
          ) : (
            <Button onClick={handleResume} disabled={acting}>
              {t('biz.adResumeCta', { defaultValue: '게시 재개' })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
