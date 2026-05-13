import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { useUserStore } from '@/store/useUserStore';
import styles from './Settings.module.css';

export default function AccountSettings() {
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);

  if (!user) return null;

  const handleDelete = () => {
    if (
      confirm(
        '정말 탈퇴하시겠어요?\n모든 라이딩 기록, 배지, 골드가 영구 삭제됩니다.'
      )
    ) {
      logout();
      navigate('/splash');
    }
  };

  return (
    <>
      <TopBar title="계정 관리" />
      <div className={styles.body}>
        <div className={styles.sectionCard}>
          <div className={styles.row} style={{ cursor: 'default' }}>
            <span className={styles.rowLabel}>휴대폰</span>
            <span className={styles.rowValue}>{user.phone}</span>
            <button className={styles.copyBtn}>변경</button>
          </div>
          <div className={styles.row} style={{ cursor: 'default' }}>
            <span className={styles.rowLabel}>가입일</span>
            <span className={styles.rowValue}>2025.11.03</span>
          </div>
          <div className={styles.row} style={{ cursor: 'default' }}>
            <span className={styles.rowLabel}>계정 ID</span>
            <span className={styles.rowValue}>A-979D3W…</span>
            <button
              className={styles.copyBtn}
              onClick={() => {
                navigator.clipboard?.writeText('A-979D3WXWXB6VAV');
                alert('복사됨');
              }}
            >
              복사
            </button>
          </div>
        </div>

        <button
          className={styles.row}
          style={{
            width: '100%',
            background: 'var(--surface)',
            borderRadius: 18,
            marginTop: 16,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <span className={styles.rowIcon}>💾</span>
          <span className={styles.rowLabel}>내 데이터 다운로드</span>
          <span className={styles.arrow}>›</span>
        </button>

        <div className={styles.danger}>
          <div className={styles.dangerHead}>
            <span>⚠</span>
            계정 탈퇴
          </div>
          <p className={styles.dangerText}>
            모든 라이딩 기록, 배지, 골드, XP가 영구 삭제됩니다. 이 작업은 되돌릴 수 없어요.
          </p>
          <button
            className={styles.row}
            style={{
              width: '100%',
              border: '1.5px solid var(--danger)',
              borderRadius: 14,
              padding: 12,
              color: 'var(--danger)',
              fontWeight: 700,
              justifyContent: 'center',
              gap: 6,
            }}
            onClick={handleDelete}
          >
            계정 탈퇴
          </button>
        </div>
      </div>
    </>
  );
}
