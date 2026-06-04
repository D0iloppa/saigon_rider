import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { native } from '@/lib/native';
import styles from './RideNav.module.css';

/**
 * 경로 안내 미리보기 (목업 28 기반). 실시간 턴바이턴은 준비 중 — 진입 시 안내 다이얼로그를
 * 띄우고 Google 지도 핸드오프를 제공한다. (SGR-269)
 */
export default function RideNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const name = params.get('name') ?? '';
  const lat = params.get('lat');
  const lng = params.get('lng');
  const dist = params.get('dist');
  const hasDest = !!lat && !!lng;

  const [dialogOpen, setDialogOpen] = useState(true);

  const openGoogleMaps = () => {
    if (!hasDest) return;
    // origin 생략 → Google 이 기기 현재 위치를 출발지로 사용. travelmode=two_wheeler.
    native.openUrl(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=two_wheeler`);
    setDialogOpen(false);
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('rideNav.title', '경로 안내')} onBack={() => navigate(-1)} />

      {/* 턴 지시 배너 (미리보기) */}
      <div className={styles.turnBanner}>
        <div className={styles.turnIcon}>🧭</div>
        <div className={styles.turnText}>
          <div className={styles.turnMain}>{name || t('rideNav.destination', '목적지')}</div>
          <div className={styles.turnSub}>{t('rideNav.previewLabel', '경로 미리보기')}</div>
        </div>
        {dist && <div className={styles.turnDist}>{dist}km</div>}
      </div>

      {/* 지도 영역 (미리보기 플레이스홀더) */}
      <div className={styles.mapArea}>
        <div className={styles.routeLine} />
        <div className={styles.previewWatermark}>{t('rideNav.previewLabel', '경로 미리보기')}</div>
      </div>

      {/* 하단 시트 (요약 + 단계) */}
      <div className={styles.sheet}>
        <div className={styles.sheetHandle} />
        <div className={styles.summaryRow}>
          <div>
            <span className={styles.eta}>{t('rideNav.etaPending', '도착 예정 —')}</span>
            <span className={styles.summaryDesc}>{t('rideNav.summaryPending', '실시간 안내 준비 중')}</span>
          </div>
          {dist && <div className={`${styles.distBig} mono`}>{dist}<span className={styles.distUnit}>km</span></div>}
        </div>

        <div className={styles.steps}>
          <div className={styles.stepRow}>
            <span className={styles.stepDot} />
            <span className={styles.stepText}>{t('rideNav.stepStart', '출발 · 내 위치')}</span>
          </div>
          <div className={styles.stepRow}>
            <span className={`${styles.stepDot} ${styles.stepDotMid}`} />
            <span className={styles.stepTextMuted}>{t('rideNav.stepVia', 'Google 지도에서 단계별 안내')}</span>
          </div>
          <div className={styles.stepRow}>
            <span className={`${styles.stepDot} ${styles.stepDotEnd}`} />
            <span className={styles.stepText}>{t('rideNav.stepEnd', '도착')} · {name || t('rideNav.destination', '목적지')}</span>
          </div>
        </div>
      </div>

      <AlertDialog
        open={dialogOpen}
        title={t('rideNav.comingSoonTitle', '실시간 경로 안내 준비 중')}
        message={t('rideNav.comingSoonDesc', '앱 내 길안내는 준비 중입니다. 지금은 Google 지도로 안내받을 수 있어요.')}
        confirmLabel={t('rideNav.openGoogleMaps', 'Google 지도로 이동')}
        cancelLabel={t('common.cancel', '취소')}
        onConfirm={openGoogleMaps}
        onClose={() => navigate(-1)}
      />
    </div>
  );
}
