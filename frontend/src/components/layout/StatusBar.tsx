import styles from './StatusBar.module.css';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Props {
  variant?: 'light' | 'dark';
}

export function StatusBar(_props: Props) {
  return <div className={styles.statusBar} />;
}
