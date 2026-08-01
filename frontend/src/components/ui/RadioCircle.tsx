import React from 'react';
import styles from './RadioCircle.module.css';

interface Props {
  checked?: boolean;
}

export function RadioCircle({ checked = false }: Props) {
  return (
    <div className={`${styles.radioCircle} ${checked ? styles.checked : ''}`} />
  );
}
