import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SearchX } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import StateBlock from '@/components/ui/StateBlock';
import styles from './NotFound.module.css';

/**
 * 404 — App.tsx 의 와일드카드 라우트("*")에서 렌더된다(P2-7).
 * 이 라우트는 오타 URL/삭제된 매물 링크가 설명 없이 홈으로 흡수되던 문제를 없애기 위한 것으로,
 * /link(LinkRouter)나 PrivateRoute 리다이렉트가 여기로 새는 게 아니라 둘 다 각자의 유효 경로
 * (/home, /splash 등)로 직접 이동하므로 그 흐름과는 무관하다.
 */
export default function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className={styles.root}>
      <StatusBar variant="dark" />
      <div className={styles.body}>
        <StateBlock
          icon={SearchX}
          title={t('notFound.title')}
          desc={t('notFound.desc')}
          actionLabel={t('notFound.goHome')}
          onAction={() => navigate('/home', { replace: true })}
        />
        <button type="button" className={styles.backLink} onClick={() => navigate(-1)}>
          {t('notFound.goBack')}
        </button>
      </div>
    </div>
  );
}
