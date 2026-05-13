import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import styles from './Splash.module.css';

export default function Splash() {
  const navigate = useNavigate();

  return (
    <div className={styles.root}>
      <div className={styles.bg} />
      <div className={styles.noise} />

      <div className={styles.content}>
        <div className={styles.hero}>
          <p className={styles.tag}>Where every ride becomes a quest.</p>
          <h1 className={styles.title}>
            SAIGON
            <br />
            RIDER
          </h1>
        </div>

        <div className={styles.sheet}>
          <Button onClick={() => navigate('/auth/phone')}>시작하기</Button>
          <button
            className={styles.loginBtn}
            onClick={() => navigate('/auth/phone')}
          >
            이미 계정이 있어요
          </button>
          <p className={styles.legal}>
            계속을 누르면 <a>이용약관</a>과 <a>개인정보처리방침</a>에 동의합니다.
          </p>
        </div>
      </div>

      <div className={styles.langChip}>🇰🇷 KO ▾</div>
    </div>
  );
}
