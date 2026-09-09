import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { extractDetail } from '@/api/client';
import { fetchBizPublicPrices, createBizPrice, deleteBizPrice, type BizPriceItem } from '@/api/biz';
import { useKeyboard } from '@/hooks/useKeyboard';
import { native } from '@/lib/native';
import { formatRelativeTime } from '@/lib/format';
import sys from '@/styles/system.module.css';
import styles from './BizPriceManage.module.css';

interface LocationState {
  profileId?: string;
}

/** 가격표 등록 — 파트너 라운지 '가격표' 진입점에서 분리된 별도 화면 (BizNewsCreate.tsx 구조 레퍼런스). */
export default function BizPriceManage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const profileId = (location.state as LocationState | null)?.profileId ?? null;

  const [prices, setPrices] = useState<BizPriceItem[] | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<BizPriceItem | null>(null);
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'display' | 'name' | 'priceLow'>('display');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const kb = useKeyboard();

  useEffect(() => {
    if (!profileId) {
      navigate('/biz/manage', { replace: true });
      return;
    }
    let cancelled = false;
    fetchBizPublicPrices(profileId)
      .then((list) => { if (!cancelled) setPrices(list); })
      .catch(() => {
        if (!cancelled) { setPrices([]); setLoadError(true); }
      });
    return () => { cancelled = true; };
  }, [profileId, navigate, reloadKey]);

  const visiblePrices = useMemo(() => {
    if (!prices) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase(i18n.language);
    return prices
      .filter((item) => !normalizedQuery || item.name.toLocaleLowerCase(i18n.language).includes(normalizedQuery))
      .sort((a, b) => sortOrder === 'name'
        ? a.name.localeCompare(b.name, i18n.language)
        : sortOrder === 'priceLow'
          ? a.priceVnd - b.priceVnd
          : a.sortOrder - b.sortOrder);
  }, [i18n.language, prices, query, sortOrder]);

  if (!profileId) return null;

  const priceNum = Number(price);
  const canSubmit = !submitting && name.trim().length > 0 && price.trim().length > 0 && priceNum >= 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await createBizPrice({ profileId, name: name.trim(), priceVnd: priceNum });
      setPrices((prev) => (prev ? [...prev, created] : [created]));
      setName('');
      setPrice('');
    } catch (err: unknown) {
      toast.error(extractDetail(err, t('biz.priceCreateError', { defaultValue: '가격표 등록에 실패했습니다' })));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBizPrice(deleteTarget.id);
      setPrices((prev) => (prev ? prev.filter((p) => p.id !== deleteTarget.id) : prev));
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(extractDetail(err, t('biz.priceDeleteError', { defaultValue: '가격표 삭제에 실패했습니다' })));
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.priceManageTitle', { defaultValue: '가격표 관리' })} />
      <div className={styles.body} style={{ paddingBottom: native.isNative && kb.visible ? `calc(${kb.height}px + 16px)` : undefined }}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>{t('biz.priceManageEyebrow')}</span>
            <h1>{t('biz.priceManageTitle')}</h1>
            <p>{t('biz.priceManagePurpose')}</p>
            {prices !== null && !loadError && <span className={`${styles.count} num`}>{t('biz.priceManageCount', { count: prices.length })}</span>}
          </div>
          <Button onClick={() => nameInputRef.current?.focus()}>
            <Plus size={17} />{t('biz.priceSubmit')}
          </Button>
        </section>

        {prices !== null && !loadError && prices.length > 0 && <section className={styles.controls} aria-label={t('biz.priceControlsLabel')}>
          <label className={styles.searchField}>
            <Search size={17} aria-hidden="true" />
            <span className={styles.srOnly}>{t('biz.priceSearchLabel')}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('biz.priceSearchPlaceholder')} type="search" />
          </label>
          <select className={styles.sortSelect} value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'display' | 'name' | 'priceLow')} aria-label={t('biz.priceSortLabel')}>
            <option value="display">{t('biz.priceSortDisplay')}</option>
            <option value="name">{t('biz.priceSortName')}</option>
            <option value="priceLow">{t('biz.priceSortPriceLow')}</option>
          </select>
          <p>{t('biz.priceLoadedScope')}</p>
        </section>}

        <div className={sys.sectionHead}><h2 className={sys.sectionLabel}>{t('biz.priceListTitle')}</h2>{query.trim() && <span className={`${styles.resultCount} num`}>{t('biz.priceSearchCount', { count: visiblePrices.length })}</span>}</div>
        {loadError ? (
          <div className={`${sys.card} ${styles.emptyCard}`}><StateBlock icon={AlertCircle} tone="error" title={t('biz.priceLoadError')} actionLabel={t('common.retry')} onAction={() => { setLoadError(false); setPrices(null); setReloadKey((key) => key + 1); }} /></div>
        ) : prices === null ? (
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        ) : prices.length === 0 ? (
          <div className={`${sys.card} ${styles.emptyCard}`}><StateBlock
            icon={Receipt}
            title={t('biz.priceManageEmptyTitle')}
            desc={t('biz.priceManageEmptyDesc')}
          /></div>
        ) : visiblePrices.length === 0 ? (
          <div className={`${sys.card} ${styles.emptyCard}`}><StateBlock icon={Search} title={t('biz.priceSearchEmptyTitle')} desc={t('biz.priceSearchEmptyDesc')} actionLabel={t('biz.priceSearchReset')} onAction={() => setQuery('')} /></div>
        ) : (
          <div className={styles.list}>
            {visiblePrices.map((p) => (
              <div key={p.id} className={styles.row}>
                <span className={styles.rowMain}><strong className={styles.rowName}>{p.name}</strong><small>{t('biz.priceCreatedAt', { time: formatRelativeTime(p.createdAt) })}</small></span>
                <span className={`${styles.rowPrice} num`}>{p.priceVnd.toLocaleString(i18n.language)} ₫</span>
                <button
                  type="button"
                  className={styles.rowDelete}
                  onClick={() => setDeleteTarget(p)}
                  aria-label={t('biz.priceDeleteCta')}
                >
                  <Trash2 size={15} />{t('biz.priceDeleteCta')}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={sys.sectionHead}><div><h2 className={sys.sectionLabel}>{t('biz.priceFormTitle')}</h2><p className={styles.sectionDesc}>{t('biz.priceFormDesc')}</p></div></div>
        <div className={styles.form}>
          <input
            ref={nameInputRef}
            className={styles.input}
            placeholder={t('biz.priceNamePlaceholder', { defaultValue: '품목/서비스명' })}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          <input
            className={styles.input}
            placeholder={t('biz.pricePlaceholder', { defaultValue: '가격 (VND)' })}
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
          />
          <Button onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
            {submitting
              ? t('biz.priceSubmitting', { defaultValue: '등록 중' })
              : t('biz.priceSubmit', { defaultValue: '가격표 추가' })}
          </Button>
        </div>
      </div>
      <AlertDialog
        open={deleteTarget !== null}
        title={t('biz.priceDeleteCta')}
        message={t('biz.priceDeleteConfirm', { name: deleteTarget?.name ?? '' })}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        confirmLabel={t('biz.priceDeleteCta')}
      />
    </div>
  );
}
