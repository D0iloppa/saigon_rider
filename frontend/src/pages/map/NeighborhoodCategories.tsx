import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { fetchBizCategories, bizCategoryLabel, type BizCategory } from '@/api/biz';
import { BizCatIcon } from '@/components/maps/BizCatIcon';
import styles from './NeighborhoodCategories.module.css';

interface CategoryGroup {
  code: string;
  label: string;
  items: BizCategory[];
}

/** 카테고리 전체 페이지 (W3-FE) — 업체 탭 칩 행의 [더보기]에서 진입, 그룹 섹션 그리드. */
export default function NeighborhoodCategories() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [categories, setCategories] = useState<BizCategory[]>([]);
  const lang = i18n.language as 'ko' | 'vi' | 'en';

  useEffect(() => {
    fetchBizCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const groups: CategoryGroup[] = [];
  for (const c of categories) {
    let g = groups.find((x) => x.code === c.groupCode);
    if (!g) {
      const label = lang === 'ko' ? c.groupLabelKo : lang === 'vi' ? c.groupLabelVi : c.groupLabelEn;
      g = { code: c.groupCode, label, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ArrowLeft size={28} />
        </button>
        <h1>{t('map.categoriesTitle')}</h1>
      </header>

      {groups.map((g) => (
        <section key={g.code} className={styles.section}>
          <h2>{g.label}</h2>
          <div className={styles.grid}>
            {g.items.map((c) => (
              <button
                key={c.code}
                type="button"
                className={styles.item}
                onClick={() => navigate(`/map?category=${c.code}`)}
              >
                <span className={styles.itemIcon}><BizCatIcon category={c.code} size={20} /></span>
                <span className={styles.itemLabel}>{bizCategoryLabel(c, lang)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
