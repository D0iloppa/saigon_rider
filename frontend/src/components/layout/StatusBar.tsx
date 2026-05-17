import styles from './StatusBar.module.css';

 
interface Props {
  variant?: 'light' | 'dark';
}

export function StatusBar(_props: Props) {
  return <div className={styles.statusBar} />;
}
