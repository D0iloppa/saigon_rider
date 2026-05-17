import { useState, useCallback } from 'react';
import styles from './AppImage.module.css';

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** skeleton shape: rect (default) or circle (avatars) */
  variant?: 'rect' | 'circle';
}

export function AppImage({ variant = 'rect', className = '', onLoad, ...imgProps }: Props) {
  const [loaded, setLoaded] = useState(false);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setLoaded(true);
      onLoad?.(e);
    },
    [onLoad],
  );

  return (
    <span className={`${styles.wrapper} ${className}`} data-variant={variant}>
      {!loaded && <span className={styles.skeleton} />}
      <img
        {...imgProps}
        className={`${styles.img} ${loaded ? styles.visible : ''}`}
        onLoad={handleLoad}
      />
    </span>
  );
}
