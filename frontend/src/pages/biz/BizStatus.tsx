import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { fetchBusinessProfiles, type BusinessProfile } from '@/api/biz';
import styles from './BizStatus.module.css';

const SUPPORT_EMAIL = 'partner@saigon-rider.com';

export default function BizStatus() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<BusinessProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBusinessProfiles()
      .then((list) => {
        if (cancelled) return;
        // 미신청 → 안내 화면으로. APPROVED 보유 → 관리 화면으로 (단일 진입점 설계).
        if (list.length === 0) {
          navigate('/biz/intro', { replace: true });
          return;
        }
        if (list.some((p) => p.status === 'APPROVED')) {
          navigate('/biz/manage', { replace: true });
          return;
        }
        setProfiles(list);
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (profiles === null) {
    return (
      <div className={styles.page}>
        <TopBar title={t('biz.statusTitle', { defaultValue: '심사 상태' })} />
        <div className={styles.body}>
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.statusTitle', { defaultValue: '심사 상태' })} />
      <div className={styles.body}>
        {profiles.map((p) => (
          <div key={p.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardName}>{p.name}</span>
              <span className={p.status === 'REJECTED' ? styles.badgeRejected : styles.badgePending}>
                {p.status === 'REJECTED'
                  ? t('biz.statusRejected', { defaultValue: '반려' })
                  : t('biz.statusPending', { defaultValue: '심사중' })}
              </span>
            </div>
            {p.status === 'PENDING' && (
              <p className={styles.cardDesc}>
                {t('biz.pendingDesc', { defaultValue: '신청이 접수되었습니다. 통상 24시간 이내 심사 결과를 알려드려요.' })}
              </p>
            )}
            {p.status === 'REJECTED' && (
              <>
                <p className={styles.rejectReason}>
                  {p.rejectReason || t('biz.rejectReasonEmpty', { defaultValue: '반려 사유가 등록되지 않았습니다.' })}
                </p>
                <Button
                  size="sm"
                  fullWidth={false}
                  onClick={() => navigate('/biz/apply', { state: { reapplyProfile: p } })}
                >
                  {t('biz.reapplyCta', { defaultValue: '재신청' })}
                </Button>
              </>
            )}
          </div>
        ))}

        <p className={styles.contactHint}>
          {t('biz.contactHint', { defaultValue: '문의사항은 이메일로 연락주세요' })}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.contactEmail}>{SUPPORT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}
