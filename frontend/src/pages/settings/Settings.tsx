import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { Toggle } from '@/components/ui/Toggle';
import { useUserStore } from '@/store/useUserStore';
import { useState } from 'react';
import styles from './Settings.module.css';

export default function Settings() {
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);
  const [dark, setDark] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    if (confirm('정말 로그아웃 하시겠어요?')) {
      logout();
      navigate('/splash');
    }
  };

  return (
    <>
      <TopBar title="설정" />
      <div className={styles.body}>
        <div
          className={styles.profileCard}
          onClick={() => navigate('/profile')}
        >
          <img src={user.avatarUrl} alt="" />
          <div className={styles.profileInfo}>
            <div className={styles.profileNick}>{user.nickname}</div>
            <div className={styles.profileSub}>프로필 보기</div>
          </div>
          <span className={styles.arrow}>›</span>
        </div>

        <Section title="알림">
          <Row
            icon="🔔"
            label="알림 설정"
            arrow
            onClick={() => navigate('/settings/notifications')}
          />
        </Section>

        <Section title="앱">
          <Row
            icon="🌐"
            label="언어"
            value={
              user.language === 'ko' ? '한국어' : user.language === 'vi' ? 'Tiếng Việt' : 'English'
            }
            arrow
            onClick={() => navigate('/settings/language')}
          />
          <Row
            icon="🌙"
            label="다크 모드"
            right={<Toggle checked={dark} onChange={setDark} />}
          />
          <Row icon="📍" label="위치 권한" value="허용됨" />
        </Section>

        <Section title="계정">
          <Row
            icon="👤"
            label="계정 관리"
            arrow
            onClick={() => navigate('/settings/account')}
          />
          <Row icon="🔒" label="개인정보" arrow />
          <Row icon="📄" label="이용약관" arrow />
        </Section>

        <Section title="기타">
          <Row icon="ⓘ" label="앱 정보" value="v1.0.0" />
          <Row icon="💬" label="고객센터" arrow />
        </Section>

        <button className={styles.logout} onClick={handleLogout}>
          로그아웃
        </button>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.sectionCard}>{children}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  arrow,
  right,
  onClick,
}: {
  icon: string;
  label: string;
  value?: string;
  arrow?: boolean;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button className={styles.row} onClick={onClick}>
      <span className={styles.rowIcon}>{icon}</span>
      <span className={styles.rowLabel}>{label}</span>
      {value && <span className={styles.rowValue}>{value}</span>}
      {right}
      {arrow && <span className={styles.arrow}>›</span>}
    </button>
  );
}
