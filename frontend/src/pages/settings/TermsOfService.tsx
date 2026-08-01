import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import styles from './LegalPage.module.css';

export default function TermsOfService() {
  const { t } = useTranslation();

  return (
    <>
      <TopBar title={t('settings.terms')} />
      <div className={styles.body}>
        <div className={styles.card} dangerouslySetInnerHTML={{ __html: t('legal.termsHtml') }} />
      </div>
    </>
  );
}
