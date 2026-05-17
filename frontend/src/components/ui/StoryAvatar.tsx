import { AppImage } from './AppImage';
import styles from './StoryAvatar.module.css';

interface Props {
  src?: string;
  alt?: string;
  label?: string;
  isMe?: boolean;
  hasStory?: boolean;
}

export function StoryAvatar({ src, alt = '', label, isMe }: Props) {
  return (
    <div className={styles.wrapper}>
      <div className={`${styles.storyAvatar} ${isMe ? styles.isMe : ''}`}>
        {src ? (
          <AppImage src={src} alt={alt} variant="circle" />
        ) : (
          <div className={styles.placeholder}>+</div>
        )}
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
