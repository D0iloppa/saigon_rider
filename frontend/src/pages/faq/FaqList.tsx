import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Search, SearchX, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { fetchFaqs, type FaqItem } from '@/api/notices';
import styles from './FaqList.module.css';

const CATEGORY_ORDER = ['GENERAL', 'ACCOUNT', 'MARKET', 'RIDE', 'REWARD'];

// 베트남어는 성조 부호를 빼고 입력하는 경우가 흔하다(Tieng Viet vs Tiếng Việt).
// NFD 정규화로 결합 성조 부호를 제거하고, đ/Đ 는 결합분해가 안 되는 별도 글자라 따로 치환한다.
function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .normalize('NFC')
    .toLowerCase();
}

export default function FaqList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    fetchFaqs(i18n.language)
      .then((data) => { setFaqs(data); setLoadError(false); })
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setOpenId(null);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, FaqItem[]>();
    for (const f of faqs) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [faqs]);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = normalizeSearch(trimmedQuery);
    return faqs.filter(
      (f) => normalizeSearch(f.question).includes(q) || normalizeSearch(f.answer).includes(q),
    );
  }, [faqs, isSearching, trimmedQuery]);

  const categoryLabel = (c: string) => t(`faq.category_${c.toLowerCase()}`, c);

  const renderItem = (f: FaqItem) => {
    const open = openId === f.id;
    return (
      <div key={f.id} className={styles.item}>
        <button
          type="button"
          className={styles.question}
          aria-expanded={open}
          onClick={() => setOpenId(open ? null : f.id)}
        >
          <span>{f.question}</span>
          <svg
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && <div className={styles.answer}>{f.answer}</div>}
      </div>
    );
  };

  return (
    <>
      <TopBar title={t('faq.title')} />
      <div className={styles.body}>
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={t('faq.searchPlaceholder')}
            maxLength={60}
          />
          {query && (
            <button type="button" className={styles.searchClear} onClick={() => handleQueryChange('')} aria-label={t('faq.searchClear')}>
              <X size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>

        {loadError ? (
          <StateBlock
            icon={AlertCircle}
            tone="error"
            title={t('faq.loadErrorTitle')}
            actionLabel={t('common.retry')}
            onAction={load}
          />
        ) : isSearching ? (
          searchResults.length === 0 ? (
            <StateBlock
              icon={SearchX}
              title={t('faq.searchEmptyTitle')}
              desc={t('faq.searchEmptySub')}
              actionLabel={t('faq.searchEmptyAction')}
              onAction={() => navigate('/settings/support')}
            />
          ) : (
            <div className={styles.section}>{searchResults.map(renderItem)}</div>
          )
        ) : faqs.length === 0 ? (
          <p className={styles.empty}>{t('faq.empty')}</p>
        ) : (
          grouped.map(({ category, items }) => (
            <div key={category} className={styles.section}>
              <div className={styles.sectionTitle}>{categoryLabel(category)}</div>
              {items.map(renderItem)}
            </div>
          ))
        )}
      </div>
    </>
  );
}
