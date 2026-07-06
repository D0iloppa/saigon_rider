import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './SearchBox.module.css';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  onClick?: () => void;
  onSubmit?: (value: string) => void;
}

export function SearchBox({
  value, onChange, placeholder, className = '', readOnly = false, autoFocus = false, onClick, onSubmit,
}: SearchBoxProps) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.searchBox} ${className}`.trim()} onClick={onClick}>
      <Search size={18} className={styles.searchIcon} />
      <input
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={60}
        readOnly={readOnly}
        autoFocus={autoFocus}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSubmit?.(value); }}
      />
      {value && (
        <button
          type="button"
          className={styles.clear}
          onClick={(e) => { e.stopPropagation(); onChange(''); }}
          aria-label={t('common.clear', { defaultValue: '지우기' })}
        >
          <X size={16} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
