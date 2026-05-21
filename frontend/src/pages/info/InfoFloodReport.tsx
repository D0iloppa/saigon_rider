import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { floodApi } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import styles from './InfoFloodReport.module.css';

type DepthLevel = 'ankle' | 'knee' | 'thigh' | 'above';

const DEPTH_CODES: DepthLevel[] = ['ankle', 'knee', 'thigh', 'above'];
const DEPTH_EMOJI: Record<DepthLevel, string> = {
  ankle: '🟡',
  knee: '🟠',
  thigh: '🔴',
  above: '🔴⚠️',
};

const DEFAULT_COORDS = { lat: 10.776, lng: 106.700 };

export default function InfoFloodReport() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [depth, setDepth] = useState<DepthLevel | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const baseXP = 30;
  const photoXP = hasPhoto ? 10 : 0;
  const confirmXP = 10;
  const totalXP = baseXP + photoXP + confirmXP;

  const depthLabel = (d: DepthLevel) =>
    t(`info.flood.depth${d.charAt(0).toUpperCase()}${d.slice(1)}`, d);

  async function handleSubmit() {
    if (!depth || submitting) return;
    setSubmitting(true);
    try {
      await floodApi.report({
        lat: DEFAULT_COORDS.lat,
        lng: DEFAULT_COORDS.lng,
        depth_level: depth,
      });
      setDone(true);
      setTimeout(() => navigate(-1), 800);
    } catch {
      setDone(true);
      setTimeout(() => navigate(-1), 800);
    } finally {
      setSubmitting(false);
    }
  }

  const saveBtn = (
    <button
      className={styles.saveBtn}
      onClick={handleSubmit}
      disabled={!depth || submitting}
    >
      {t('common.save')}
    </button>
  );

  return (
    <div className={styles.page}>
      <TopBar
        title={t('info.flood.reportTitle')}
        onBack={() => navigate(-1)}
        rightContent={saveBtn}
      />

      <div className={styles.scroll}>
        {/* Location card */}
        <div className={styles.locationCard}>
          <div className={styles.locationRow}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span className={styles.locationLabel}>📍 {t('info.flood.locationDetected')}</span>
          </div>
          <div className={styles.locationName}>Bình Thạnh · Xô Viết Nghệ Tĩnh</div>
          <div className={styles.locationEdit}>{t('info.flood.locationEditHint')}</div>
        </div>

        {/* Depth selection */}
        <div className={styles.depthTitle}>{t('info.flood.depthQuestion')}</div>
        <div className={styles.depthGrid}>
          {DEPTH_CODES.map((code) => (
            <button
              key={code}
              className={`${styles.depthBtn} ${styles[code]} ${depth === code ? styles.active : ''}`}
              onClick={() => setDepth(code)}
            >
              <div className={styles.depthEmoji}>{DEPTH_EMOJI[code]}</div>
              <div className={`${styles.depthKo} ${depth === code ? styles.depthKoActive : ''}`}>
                {depthLabel(code)}{depth === code ? ' ✓' : ''}
              </div>
              <div className={styles.depthEn}>{code}</div>
            </button>
          ))}
        </div>

        {/* Photo */}
        <div className={styles.photoTitle}>{t('info.flood.photoOption')}</div>
        <button
          className={`${styles.photoBox} ${hasPhoto ? styles.photoBoxActive : ''}`}
          onClick={() => setHasPhoto((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A8E9E" strokeWidth="2" strokeLinecap="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span className={styles.photoLabel}>
            {hasPhoto ? t('info.flood.photoAdded') : t('info.flood.addPhoto')}
          </span>
        </button>

        <div className={styles.divider} />

        {/* XP Reward box */}
        <div className={styles.gpBox}>
          <div className={styles.gpTitle}>{t('info.flood.xpTitle')}</div>
          <div className={styles.gpRow}>
            <span>{t('info.flood.xpReport')}</span>
            <span className={`${styles.mono} ${styles.gpAmount}`}>+{baseXP} XP</span>
          </div>
          <div className={styles.gpRow}>
            <span>{t('info.flood.xpAddPhoto')}</span>
            <span className={`${styles.mono} ${hasPhoto ? styles.gpAmount : styles.gpDim}`}>
              +10 XP{!hasPhoto ? ` ${t('info.flood.xpPhotoSkipped')}` : ''}
            </span>
          </div>
          <div className={styles.gpRow}>
            <span>{t('info.flood.xpConfirm')}</span>
            <span className={`${styles.mono} ${styles.gpAmount}`}>+{confirmXP} XP</span>
          </div>
          <div className={`${styles.gpRow} ${styles.gpTotal}`}>
            <span>{t('info.flood.xpNow')}</span>
            <span className={styles.mono}>⭐ {totalXP} XP</span>
          </div>
        </div>
      </div>

      {/* Sticky CTA */}
      <div className={styles.ctaWrap}>
        <button
          className={`${styles.cta} ${done ? styles.ctaDone : ''}`}
          onClick={handleSubmit}
          disabled={!depth || submitting}
        >
          {done
            ? t('info.flood.ctaDone')
            : submitting
            ? t('info.flood.ctaSubmitting')
            : t('info.flood.ctaSubmit')}
        </button>
      </div>
    </div>
  );
}
