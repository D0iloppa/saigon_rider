import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { LOCATION_SHARE_CONSENT_VERSION } from '@/lib/locationShareConsent';
import styles from './LocationShareConsentModal.module.css';

interface Props {
  open: boolean;
  /** 동의 버튼을 눌렀을 때 호출 — 호출부가 이 값을 `POST .../location-share` body(`consent_version`)로 전송한다. */
  onConsent: (consentVersion: string) => void;
  onClose: () => void;
}

/**
 * 거래중 실시간 위치공유 동의 모달 (P5).
 *
 * M-7(설계서 §10) 확정: 동의는 워키토키처럼 "최초 1회"가 아니라 **약속(appointment)마다** 받는다.
 * 서버가 `consented_at`을 이미 가지고 있으므로(같은 약속에 재동의 불필요), 호출부는
 * `GET .../location-share` 응답의 `my_status`가 `"not_started"`일 때만 이 모달을 띄우면 된다.
 * 워키토키처럼 localStorage 에 영구 동의 플래그를 두지 않는다(M-9: 기능별 동의 각각).
 */
export function LocationShareConsentModal({ open, onConsent, onClose }: Props) {
  const { t } = useTranslation();

  const handleConsent = () => {
    onConsent(LOCATION_SHARE_CONSENT_VERSION);
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <div className={styles.iconWrap}>
          <MapPin size={22} strokeWidth={2} />
        </div>
        <strong className={styles.title}>{t('locationShare.consentTitle')}</strong>
        <p className={styles.desc}>{t('locationShare.consentBody')}</p>
        <p className={styles.retention}>{t('locationShare.consentRetention')}</p>

        <div className={styles.actions}>
          <Button variant="ghost" size="md" fullWidth={false} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="md" fullWidth={false} onClick={handleConsent}>
            {t('locationShare.consentAgree')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
