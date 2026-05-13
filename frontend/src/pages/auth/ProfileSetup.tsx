import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { useUserStore } from '@/store/useUserStore';
import type { RiderStyle } from '@/api/types';
import styles from './ProfileSetup.module.css';

const STYLES: { key: RiderStyle; icon: string; title: string; sub: string }[] = [
  { key: 'commuter', icon: '🏙', title: '출퇴근러', sub: 'Quận 1 ↔ Thủ Đức 매일 라이드' },
  { key: 'cafe_hunter', icon: '☕', title: '카페 헌터', sub: '숨은 카페를 찾아 떠나는 라이드' },
  { key: 'night_rider', icon: '🌙', title: '나이트 라이더', sub: 'Bùi Viện의 밤은 짧다' },
];

export default function ProfileSetup() {
  const navigate = useNavigate();
  const setProfile = useUserStore((s) => s.setProfile);

  const [nickname, setNickname] = useState('');
  const [style, setStyle] = useState<RiderStyle | null>('night_rider');

  const isValid = nickname.length >= 2 && nickname.length <= 12 && style;

  const handleSubmit = () => {
    if (!isValid) return;
    setProfile(nickname, style);
    navigate('/home');
  };

  return (
    <>
      <TopBar showBack />
      <div className={styles.body}>
        <h1 className={styles.title}>
          당신은 어떤
          <br />
          라이더인가요?
        </h1>

        <div className={styles.nickField}>
          <span className={styles.nickIcon}>👤</span>
          <input
            placeholder="닉네임 (2~12자)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
          />
          {nickname.length >= 2 && <span className={styles.check}>✓</span>}
        </div>

        <div className={styles.styleList}>
          {STYLES.map((s) => (
            <button
              key={s.key}
              className={`${styles.styleCard} ${style === s.key ? styles.selected : ''}`}
              onClick={() => setStyle(s.key)}
            >
              <span className={styles.styleIcon}>{s.icon}</span>
              <div className={styles.styleText}>
                <h3>{s.title}</h3>
                <p>{s.sub}</p>
              </div>
              <span className={styles.radio}>
                {style === s.key ? '●' : '○'}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.spacer} />

        <Button onClick={handleSubmit} disabled={!isValid}>
          시작하기
        </Button>
      </div>
    </>
  );
}
