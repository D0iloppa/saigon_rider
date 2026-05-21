import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { repairApi } from '@/api/info';
import { TopBar } from '@/components/layout/TopBar';
import styles from './InfoRepairWrite.module.css';

const MOTO_OPTIONS = [
  'Honda SH 350i',
  'Honda Wave Alpha',
  'Honda Exciter 150',
  'Honda Air Blade',
  'Yamaha NVX 155',
  'Yamaha Sirius',
  'Yamaha Grande',
  'Suzuki Raider R150',
];
const SERVICE_CODES = ['OIL_CHANGE', 'TIRE', 'CHAIN', 'ENGINE', 'BRAKE', 'BATTERY', 'GENERAL_CHECK', 'WASH'];

export default function InfoRepairWrite() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { shopId } = useParams<{ shopId: string }>();

  const serviceOptions = SERVICE_CODES.map((code) => ({
    code,
    label: t(`info.repair.service_${code}`, code),
  }));

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [moto, setMoto] = useState('Honda SH 350i');
  const [service, setService] = useState('OIL_CHANGE');
  const [price, setPrice] = useState('');
  const [comment, setComment] = useState('');
  const [hasPhoto, setHasPhoto] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const hasPrice = price.trim().length > 0 && !isNaN(Number(price));
  const xpReview = 50;
  const xpPhoto = hasPhoto ? 10 : 0;
  const xpPrice = hasPrice ? 10 : 0;
  const totalXP = xpReview + xpPhoto + xpPrice;

  async function handleSubmit() {
    if (rating === 0 || submitting) return;
    setSubmitting(true);
    try {
      await repairApi.writeReview({
        shop_id: Number(shopId),
        service_code: service,
        motorcycle_model: moto,
        rating,
        price_vnd: hasPrice ? Number(price) : undefined,
        comment: comment.trim() || undefined,
        is_anonymous: isAnonymous,
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
      disabled={rating === 0 || submitting}
    >
      {t('common.save')}
    </button>
  );

  return (
    <div className={styles.page}>
      <TopBar
        title={t('info.repair.writeTitle')}
        onBack={() => navigate(-1)}
        rightContent={saveBtn}
      />

      <div className={styles.scroll}>
        {/* Star rating card */}
        <div className={styles.starCard}>
          <div className={styles.starCardLabel}>⭐ {t('info.repair.ratingLabel')}</div>
          <div className={styles.starRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                className={`${styles.star} ${i <= (hoverRating || rating) ? styles.starFilled : styles.starEmpty}`}
                onMouseEnter={() => setHoverRating(i)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(i)}
              >
                ★
              </button>
            ))}
          </div>
          <div className={styles.starGuide}>
            <span>{t('info.repair.rating_bad')}</span>
            <span>{t('info.repair.rating_ok')}</span>
            <span>{t('info.repair.rating_great')}</span>
          </div>
        </div>

        {/* Motorcycle */}
        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>🛵 {t('info.repair.vehicleLabel')}</div>
          <select
            className={styles.select}
            value={moto}
            onChange={(e) => setMoto(e.target.value)}
          >
            {MOTO_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Service */}
        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>🔧 {t('info.repair.serviceLabel')}</div>
          <select
            className={`${styles.select} ${service ? styles.selectActive : ''}`}
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            {serviceOptions.map((s) => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Price */}
        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>💵 {t('info.repair.priceLabel')}</div>
          <div className={styles.priceInputWrap}>
            <input
              className={`${styles.priceInput} ${styles.mono}`}
              type="number"
              placeholder={t('info.repair.pricePlaceholder')}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <span className={styles.priceCurrency}>₫</span>
          </div>
        </div>

        {/* Comment */}
        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>💬 {t('info.repair.commentLabel')}</div>
          <textarea
            className={styles.textarea}
            placeholder={t('info.repair.commentPlaceholder')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
        </div>

        {/* Photo */}
        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>📷 {t('info.repair.photoLabel')}</div>
          <button
            className={`${styles.photoBox} ${hasPhoto ? styles.photoBoxActive : ''}`}
            onClick={() => setHasPhoto((v) => !v)}
          >
            {hasPhoto ? t('info.repair.photoAdded') : t('info.repair.addPhoto')}
          </button>
        </div>

        {/* Anonymous */}
        <button
          className={styles.anonRow}
          onClick={() => setIsAnonymous((v) => !v)}
        >
          <div className={`${styles.checkbox} ${isAnonymous ? styles.checkboxChecked : ''}`}>
            {isAnonymous && '✓'}
          </div>
          <div>
            <div className={styles.anonLabel}>{t('info.repair.anonymous')}</div>
            <div className={styles.anonSub}>{t('info.repair.anonymousDesc')}</div>
          </div>
        </button>

        <div className={styles.divider} />

        {/* XP live calc */}
        <div className={styles.gpBox}>
          <div className={styles.gpTitle}>⭐ {t('info.repair.gpEstimate')}</div>
          <div className={styles.gpRow}>
            <span>{t('info.repair.xpReviewRow')}</span>
            <span className={`${styles.mono} ${styles.gpAmount}`}>+{xpReview} XP</span>
          </div>
          <div className={styles.gpRow}>
            <span>{t('info.repair.xpPhotoRow')}</span>
            <span className={`${styles.mono} ${hasPhoto ? styles.gpAmount : styles.gpDim}`}>
              +10 XP{!hasPhoto ? ` ${t('info.repair.xpIncomplete')}` : ''}
            </span>
          </div>
          <div className={styles.gpRow}>
            <span>{t('info.repair.xpPriceRow')}</span>
            <span className={`${styles.mono} ${hasPrice ? styles.gpAmount : styles.gpDim}`}>
              +10 XP{!hasPrice ? ` ${t('info.repair.xpMissing')}` : ''}
            </span>
          </div>
          <div className={`${styles.gpRow} ${styles.gpTotal}`}>
            <span>{t('info.repair.xpNow')}</span>
            <span className={styles.mono}>⭐ {totalXP} XP</span>
          </div>
        </div>
      </div>

      {/* Sticky CTA */}
      <div className={styles.ctaWrap}>
        <button
          className={`${styles.cta} ${done ? styles.ctaDone : ''}`}
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
        >
          {done
            ? t('info.repair.ctaDone')
            : submitting
            ? t('info.repair.ctaSubmitting')
            : `${t('info.repair.ctaWrite')} (+${totalXP} XP)`}
        </button>
      </div>
    </div>
  );
}
