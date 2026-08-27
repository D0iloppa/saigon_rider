import { useTranslation } from 'react-i18next';
import { Mic } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { setWalkieTalkieConsent } from '@/lib/walkieTalkieConsent';
import styles from './WalkieTalkieConsentModal.module.css';

interface Props {
  open: boolean;
  /** 동의 버튼을 눌렀을 때 호출 — 실제 녹음 시작은 이 컴포넌트 범위 밖이라 A-7 이 배선한다. */
  onConsent: () => void;
  onClose: () => void;
}

/**
 * 워키토키(음성메시지) 최초 사용 동의 모달 (A-9).
 *
 * 녹음 기능(A-4~A-7)과 독립적으로 만들어졌다 — 버튼을 눌러도 실제 녹음은 시작되지 않고
 * onConsent 콜백만 호출한다. A-7 이 "마이크 버튼 탭 → 미동의면 이 모달, 동의면 즉시 녹음"
 * 분기를 hasWalkieTalkieConsent() 로 배선하면 된다.
 *
 * D-6(2026-08-27 확정): 전송한 음성메시지는 상대가 재생을 완료하면 자동 삭제된다 —
 * 사용자가 오해 없이 알아야 하는 보관정책이라 고지 문구에 명시한다.
 */
export function WalkieTalkieConsentModal({ open, onConsent, onClose }: Props) {
  const { t } = useTranslation();

  const handleConsent = () => {
    setWalkieTalkieConsent();
    onConsent();
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <div className={styles.iconWrap}>
          <Mic size={22} strokeWidth={2} />
        </div>
        <strong className={styles.title}>{t('walkieTalkie.consentTitle')}</strong>
        <p className={styles.desc}>{t('walkieTalkie.consentBody')}</p>
        <p className={styles.retention}>{t('walkieTalkie.consentRetention')}</p>

        <div className={styles.actions}>
          <Button variant="ghost" size="md" fullWidth={false} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="md" fullWidth={false} onClick={handleConsent}>
            {t('walkieTalkie.consentAgree')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
