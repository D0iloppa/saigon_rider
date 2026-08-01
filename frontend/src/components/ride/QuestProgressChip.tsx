import styles from './QuestProgressChip.module.css';

interface QuestProgressChipProps {
  title: string;
  subtitle?: string;
}

/** 좌측 "퀘스트 진행중" 플로팅 칩 (quest 전용). */
export default function QuestProgressChip({ title, subtitle }: QuestProgressChipProps) {
  return (
    <div className={styles.chip}>
      <span className={styles.dot} />
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        {subtitle && <div className={styles.sub}>{subtitle}</div>}
      </div>
    </div>
  );
}
