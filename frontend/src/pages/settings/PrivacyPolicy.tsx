import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import styles from './LegalPage.module.css';

export default function PrivacyPolicy() {
  const { t } = useTranslation();

  return (
    <>
      <TopBar title={t('settings.privacy')} />
      <div className={styles.body}>
        <div className={styles.card} dangerouslySetInnerHTML={{ __html: t('legal.privacyHtml') }} />
      </div>
    </>
  );
}
