import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Receipt, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { extractDetail } from '@/api/client';
import { fetchBizPublicPrices, createBizPrice, deleteBizPrice, type BizPriceItem } from '@/api/biz';
import styles from './BizPriceManage.module.css';

interface LocationState {
  profileId?: string;
}

/** 가격표 등록 — 파트너 라운지 '가격표' 진입점에서 분리된 별도 화면 (BizNewsCreate.tsx 구조 레퍼런스). */
export default function BizPriceManage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const profileId = (location.state as LocationState | null)?.profileId ?? null;

  const [prices, setPrices] = useState<BizPriceItem[] | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profileId) {
      navigate('/biz/manage', { replace: true });
      return;
    }
    fetchBizPublicPrices(profileId)
      .then(setPrices)
      .catch(() => setPrices([]));
  }, [profileId, navigate]);

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
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.priceCreateError', { defaultValue: '가격표 등록에 실패했습니다' })));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBizPrice(id);
      setPrices((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    } catch (err: any) {
      toast.error(extractDetail(err, t('biz.priceDeleteError', { defaultValue: '가격표 삭제에 실패했습니다' })));
    }
  };

  return (
    <div className={styles.page}>
      <TopBar title={t('biz.priceManageTitle', { defaultValue: '가격표 관리' })} />
      <div className={styles.body}>
        {prices === null ? (
          <p className={styles.loading}>{t('common.loading', { defaultValue: '불러오는 중' })}</p>
        ) : prices.length === 0 ? (
          <StateBlock
            icon={Receipt}
            title={t('biz.priceManageEmptyTitle', { defaultValue: '아직 등록한 가격표가 없어요' })}
            desc={t('biz.priceManageEmptyDesc', { defaultValue: '서비스별 가격을 등록해 이웃 라이더에게 보여주세요' })}
          />
        ) : (
          <div className={styles.list}>
            {prices.map((p) => (
              <div key={p.id} className={styles.row}>
                <span className={styles.rowName}>{p.name}</span>
                <span className={styles.rowPrice}>{p.priceVnd.toLocaleString()} VND</span>
                <button
                  type="button"
                  className={styles.rowDelete}
                  onClick={() => handleDelete(p.id)}
                  aria-label={t('biz.priceDeleteCta', { defaultValue: '가격표 삭제' })}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.form}>
          <input
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
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting
              ? t('biz.priceSubmitting', { defaultValue: '등록 중' })
              : t('biz.priceSubmit', { defaultValue: '가격표 추가' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
