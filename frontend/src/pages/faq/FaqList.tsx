import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/layout/TopBar';
import { fetchFaqs, type FaqItem } from '@/api/notices';
import styles from './FaqList.module.css';

const CATEGORY_ORDER = ['GENERAL', 'ACCOUNT', 'MARKET', 'RIDE', 'REWARD'];

export default function FaqList() {
  const { t, i18n } = useTranslation();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    fetchFaqs(i18n.language).then(setFaqs).catch(() => {});
  }, [i18n.language]);

  const grouped = useMemo(() => {
    const map = new Map<string, FaqItem[]>();
    for (const f of faqs) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [faqs]);

  const categoryLabel = (c: string) => t(`faq.category_${c.toLowerCase()}`, c);

  return (
    <>
      <TopBar title={t('faq.title')} />
      <div className={styles.body}>
        {faqs.length === 0 ? (
          <p className={styles.empty}>{t('faq.empty')}</p>
        ) : (
          grouped.map(({ category, items }) => (
            <div key={category} className={styles.section}>
              <div className={styles.sectionTitle}>{categoryLabel(category)}</div>
              {items.map((f) => {
                const open = openId === f.id;
                return (
                  <div key={f.id} className={styles.item}>
                    <div className={styles.question} onClick={() => setOpenId(open ? null : f.id)}>
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
                    </div>
                    {open && <div className={styles.answer}>{f.answer}</div>}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </>
  );
}
