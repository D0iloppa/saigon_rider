import styles from './Toggle.module.css';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled }: Props) {
  return (
    <button
      className={`${styles.toggle} ${checked ? styles.on : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
    >
      <span className={styles.thumb} />
    </button>
  );
}
