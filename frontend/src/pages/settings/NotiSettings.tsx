import { useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Toggle } from '@/components/ui/Toggle';
import styles from './Settings.module.css';

const SECTIONS = [
  {
    title: '퀘스트',
    items: ['추천 퀘스트', '만료 임박', '이벤트 시작'],
  },
  {
    title: '결과',
    items: ['퀘스트 완료', '레벨업', '배지 획득'],
  },
  {
    title: '소셜',
    items: ['응원 받음', '댓글', '친구 신청'],
  },
];

export default function NotiSettings() {
  const [state, setState] = useState<Record<string, boolean>>({
    '추천 퀘스트': true,
    '만료 임박': true,
    '이벤트 시작': false,
    '퀘스트 완료': true,
    '레벨업': true,
    '배지 획득': true,
    '응원 받음': true,
    '댓글': true,
    '친구 신청': false,
  });

  return (
    <>
      <TopBar title="알림 설정" />
      <div className={styles.body}>
        {SECTIONS.map((s) => (
          <div key={s.title} className={styles.section}>
            <h3 className={styles.sectionTitle}>{s.title}</h3>
            <div className={styles.sectionCard}>
              {s.items.map((it) => (
                <div key={it} className={styles.row} style={{ cursor: 'default' }}>
                  <span className={styles.rowLabel}>{it}</span>
                  <Toggle
                    checked={state[it]}
                    onChange={(v) => setState((p) => ({ ...p, [it]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className={styles.caption}>
          중요한 알림(보안·결제)은 끌 수 없어요
        </p>
      </div>
    </>
  );
}
