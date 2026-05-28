import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppImage } from '@/components/ui/AppImage';
import { floodApi, type FloodReport } from '@/api/info';
import { getDepth, TRUST_TOKENS, formatTimeAgo, type FloodTrustLevel } from './flood-tokens';
import styles from './FloodDetailSheet.module.css';

interface Props {
  report: (FloodReport & { trust_level?: FloodTrustLevel; minutes_ago?: number }) | null;
  onClose: () => void;
  onConfirmed?: () => void;
}

export default function FloodDetailSheet({ report, onClose, onConfirmed }: Props) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  if (!report) return null;

  const depth = getDepth(report.depth_level);
  const trustLevel: FloodTrustLevel = report.trust_level ?? 'PENDING';
  const trust = TRUST_TOKENS[trustLevel];

  const minutesAgo =
    report.minutes_ago ??
    Math.max(0, Math.floor((Date.now() - new Date(report.reported_at).getTime()) / 60000));

  async function submit(confirmation_type: 'still_flooded' | 'resolved' | 'false') {
    if (!report || submitting) return;
    setSubmitting(true);
    try {
      await floodApi.confirm(report.report_id, confirmation_type);
      onConfirmed?.();
      onClose();
    } catch {
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle} />

        <div className={styles.headerRow}>
          <span
            className={styles.badge}
            style={{ background: depth.fillColor, color: depth.textColor }}
          >
            {depth.emoji} {t(depth.labelKey, depth.code)}
          </span>
          <span
            className={styles.trustBadge}
            style={{ background: trust.bgColor, color: trust.color }}
          >
            {trust.icon} {t(trust.labelKey, trustLevel)}
          </span>
        </div>

        <div className={styles.title}>
          {report.district_code}
          {report.street_name ? ` · ${report.street_name}` : ''}
        </div>
        <div className={styles.meta}>{formatTimeAgo(minutesAgo)}</div>

        {report.photo_url && (
          <AppImage src={report.photo_url} alt="" className={styles.photo} />
        )}

        <div className={styles.stats}>
          <span>{t('info.flood.confidence', { count: report.confidence_score })}</span>
          {report.distance_km != null && <span>· {report.distance_km.toFixed(1)} km</span>}
        </div>

        <div className={styles.btnRow}>
          <button
            className={`${styles.btn} ${styles.btnConfirm}`}
            onClick={() => submit('still_flooded')}
            disabled={submitting}
          >
            {t('info.flood.btnStillFlooded')}
          </button>
          <button
            className={`${styles.btn} ${styles.btnResolved}`}
            onClick={() => submit('resolved')}
            disabled={submitting}
          >
            {t('info.flood.btnResolved')}
          </button>
          <button
            className={`${styles.btn} ${styles.btnFalse}`}
            onClick={() => submit('false')}
            disabled={submitting}
          >
            {t('info.flood.btnFalse')}
          </button>
        </div>
      </div>
    </div>
  );
}
