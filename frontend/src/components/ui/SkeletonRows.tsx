import styles from '@/styles/system.module.css';

interface Props {
  /** 표시할 스켈레톤 행 수 — 실제 목록의 평균 노출 행 수와 비슷하게 (기본 3) */
  count?: number;
}

/**
 * 앱 공용 리스트 스켈레톤 — system.module.css 의 .row 레이아웃을 미러링한다.
 * 목록형 로딩에 사용하고, 목록이 아닌 화면은 .skelBar 조합으로 실제 골격을 직접 미러링한다.
 * (규칙: ai-docs/context/design-system.md — 스피너 단독 사용 금지)
 */
export default function SkeletonRows({ count = 3 }: Props) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skelRow}>
          <div className={`${styles.skelBar} ${styles.skelBarWide}`} />
          <div className={`${styles.skelBar} ${styles.skelBarNarrow}`} />
        </div>
      ))}
    </>
  );
}
