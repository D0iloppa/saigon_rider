import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Bike, ChevronDown, MapPin, Megaphone, Store } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import styles from './BizIntro.module.css';

const BENEFITS = [
  { icon: MapPin, key: 'benefitLocation' },
  { icon: Bike, key: 'benefitTarget' },
  { icon: BadgeCheck, key: 'benefitTrust' },
] as const;

const STEPS = ['stepApply', 'stepReview', 'stepPublish'] as const;

const FAQ_KEYS = ['faqEligibility', 'faqDuration', 'faqCost', 'faqReapply'] as const;

const SUPPORT_EMAIL = 'partner@saigon-rider.com';

export default function BizIntro() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.title', { defaultValue: '비즈니스 파트너' })} />
      <div className={styles.body}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.heroEyebrow}>SAIGON RIDER BUSINESS</span>
            <h1>{t('biz.heroTitle', { defaultValue: '동네 라이더에게 내 가게를 알리세요' })}</h1>
            <p>{t('biz.heroDesc', { defaultValue: '사이공 라이더 앱에서 우리 가게를 지도와 피드에 노출해보세요.' })}</p>
          </div>
          <div className={styles.heroIllustration} aria-hidden="true">
            <Store size={58} strokeWidth={1.8} />
            <span className={styles.heroPin}><MapPin size={22} fill="currentColor" /></span>
            <Megaphone className={styles.heroMegaphone} size={27} strokeWidth={2} />
          </div>
        </section>

        <h2 className={styles.sectionTitle}>{t('biz.benefitsTitle', { defaultValue: '파트너 혜택' })}</h2>
        <div className={styles.benefitList}>
          {BENEFITS.map((b) => (
            <div key={b.key} className={styles.benefitItem}>
              <span className={styles.benefitIcon}><b.icon size={21} strokeWidth={2.1} /></span>
              <span className={styles.benefitText}>
                {t(`biz.${b.key}`, { defaultValue: b.key })}
              </span>
            </div>
          ))}
        </div>

        <h2 className={styles.sectionTitle}>{t('biz.stepsTitle', { defaultValue: '이렇게 진행돼요' })}</h2>
        <div className={styles.stepList}>
          {STEPS.map((key, idx) => (
            <div key={key} className={styles.stepItem}>
              <div className={styles.stepNum}>{idx + 1}</div>
              <div className={styles.stepText}>
                <strong>{t(`biz.${key}`, { defaultValue: key })}</strong>
                {idx === 0 && <span>{t('biz.stepApplyDesc', { defaultValue: '가게와 광고 정보를 등록해요' })}</span>}
                {idx === 1 && <span>{t('biz.stepReviewDesc', { defaultValue: '담당자가 내용을 확인해요' })}</span>}
                {idx === 2 && <span>{t('biz.stepPublishDesc', { defaultValue: '승인 후 라이더에게 노출돼요' })}</span>}
              </div>
            </div>
          ))}
        </div>
        <p className={styles.reviewNotice}>
          {t('biz.reviewNotice', { defaultValue: '신청 내용은 담당자가 직접 확인하며, 사유에 따라 반려될 수 있어요.' })}
        </p>

        <h2 className={styles.sectionTitle}>{t('biz.faqTitle', { defaultValue: 'FAQ' })}</h2>
        <div className={styles.faqList}>
          {FAQ_KEYS.map((key, idx) => (
            <div key={key} className={styles.faqItem}>
              <button
                type="button"
                className={styles.faqQuestion}
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
              >
                <span>{t(`biz.${key}Q`, { defaultValue: key })}</span>
                <ChevronDown size={18} className={openFaq === idx ? styles.faqChevOpen : styles.faqChev} />
              </button>
              {openFaq === idx && (
                <p className={styles.faqAnswer}>{t(`biz.${key}A`, { defaultValue: key })}</p>
              )}
            </div>
          ))}
        </div>

        <p className={styles.contactHint}>
          {t('biz.contactHint', { defaultValue: '문의사항은 이메일로 연락주세요' })}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.contactEmail}>{SUPPORT_EMAIL}</a>
        </p>
      </div>

      <div className={styles.footer}>
        <Button onClick={() => navigate('/biz/apply')}>
          {t('biz.applyCta', { defaultValue: '신청하기' })}
        </Button>
      </div>
    </div>
  );
}
