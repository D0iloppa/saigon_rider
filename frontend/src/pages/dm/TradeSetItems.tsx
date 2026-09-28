import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Send, X } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AppImage } from '@/components/ui/AppImage';
import StateBlock from '@/components/ui/StateBlock';
import { toast } from '@/components/ui/Toast';
import { fetchConversation, fetchTradeSet, sendListingCard, sendBundleCard, type TradeSet, type TradeSetItem } from '@/api/dm';
import { loadSession } from '@/lib/session';
import { useUserStore } from '@/store/useUserStore';
import { formatPriceVnd } from '@/pages/market/marketFormat';
import { tradeSetErrorMessage } from '@/components/dm/tradeSetErrors';
import styles from './TradeSetItems.module.css';

function statusLabelKey(status: TradeSetItem['status']): string {
  if (status === 'RESERVED') return 'dm.tradeSetStatusReserved';
  if (status === 'COMPLETED') return 'dm.tradeSetStatusCompleted';
  return 'dm.tradeSetStatusOnSale';
}

/** F-DM-02 FR-6(260928 실기기 피드백) — 세트 목록 전체 페이지(당근 참조).
 * 세트 바/묶음카드 [자세히 보기]에서 진입. 카드는 2열 그리드, 각 카드에 아이콘 전송 버튼,
 * 하단 고정 요약 바에 묶음 전송 아이콘. [물품 편집]은 구매자만 — 방으로 돌아가 피커를 연다. */
export default function TradeSetItems() {
  const { conversationId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const session = loadSession();
  const myId = session?.userId ?? user?.id;

  const [tradeSet, setTradeSet] = useState<TradeSet | null>(null);
  const [otherNickname, setOtherNickname] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sendingItemId, setSendingItemId] = useState<string | null>(null);
  const [sendingBundle, setSendingBundle] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    Promise.all([fetchConversation(conversationId), fetchTradeSet(conversationId)])
      .then(([conv, ts]) => {
        if (!alive) return;
        setOtherNickname(conv.otherUserNickname ?? '');
        setTradeSet(ts);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const isBuyer = !!tradeSet && myId !== tradeSet.sellerId;
  const sellerNickname = tradeSet && myId === tradeSet.sellerId ? user?.nickname ?? '' : otherNickname;

  // 활성(INQUIRY/RESERVED) 항목 + 세트가 CLOSED(전부 완료)일 때만 COMPLETED 항목도 보여준다.
  const rows = (tradeSet?.items ?? []).filter(
    (it) => it.status === 'INQUIRY' || it.status === 'RESERVED' || (it.status === 'COMPLETED' && tradeSet?.status === 'CLOSED'),
  );
  const activeRows = rows.filter((it) => it.status !== 'COMPLETED');

  const goRoom = () => navigate(`/dm/${conversationId}`, { replace: true });

  const handleEditItems = () => {
    navigate(`/dm/${conversationId}`, { state: { openTradeSetPicker: true } });
  };

  const handleSendItem = async (listingId: string) => {
    if (sendingItemId || sendingBundle) return;
    setSendingItemId(listingId);
    try {
      await sendListingCard(conversationId, listingId);
      goRoom();
    } catch (err) {
      toast.error(tradeSetErrorMessage(err, t));
    } finally {
      setSendingItemId(null);
    }
  };

  const handleSendBundle = async () => {
    if (sendingItemId || sendingBundle || activeRows.length < 2) return;
    setSendingBundle(true);
    try {
      await sendBundleCard(conversationId);
      goRoom();
    } catch (err) {
      toast.error(tradeSetErrorMessage(err, t));
    } finally {
      setSendingBundle(false);
    }
  };

  return (
    <div className={styles.page}>
      <TopBar
        showBack={false}
        title={t('dm.tradeSetListSheetTitle', { nickname: sellerNickname, defaultValue: '{{nickname}}님과 한 번에 거래하는 물품이에요' })}
        leftContent={
          <button type="button" className={styles.headerBtn} onClick={() => navigate(`/dm/${conversationId}`)} aria-label={t('common.close')}>
            <X size={22} strokeWidth={2} />
          </button>
        }
        rightContent={
          isBuyer ? (
            <button type="button" className={styles.editBtn} onClick={handleEditItems}>
              {t('dm.tradeSetEditItems', { defaultValue: '물품편집' })}
            </button>
          ) : undefined
        }
      />

      <div className={styles.body}>
        {loading ? (
          <p className={styles.loadingText}>{t('common.loading')}</p>
        ) : failed || !tradeSet ? (
          <StateBlock icon={AlertCircle} tone="error" title={t('common.errorUnexpected')} />
        ) : (
          <div className={styles.grid}>
            {rows.map((it) => (
              <div key={it.listingId} className={styles.cell}>
                <button type="button" className={styles.cellMain} onClick={() => navigate(`/market/${it.listingId}`)}>
                  <div className={styles.cellThumbWrap}>
                    <AppImage src={it.thumbnailUrl ?? undefined} alt="" className={styles.cellThumb} />
                  </div>
                  <span className={styles.cellTitle}>{it.title}</span>
                  <span className={styles.cellPrice}>{formatPriceVnd(it.agreedPriceVnd ?? it.priceVnd, t)}</span>
                  <span className={styles.cellBadge}>{t(statusLabelKey(it.status))}</span>
                </button>
                <button
                  type="button"
                  className={styles.sendBtn}
                  disabled={sendingItemId === it.listingId || sendingBundle}
                  onClick={() => handleSendItem(it.listingId)}
                  aria-label={t('dm.tradeSetListSheetSendItem', { defaultValue: '물품 정보 보내기' })}
                >
                  <Send size={16} strokeWidth={2.2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {tradeSet && (
        <div className={styles.footer}>
          <span className={styles.footerSummary}>
            {t('dm.tradeSetPickerSummary', { count: rows.length, total: formatPriceVnd(tradeSet.totalVnd, t) })}
          </span>
          {activeRows.length >= 2 && (
            <button
              type="button"
              className={styles.bundleSendBtn}
              disabled={sendingBundle || !!sendingItemId}
              onClick={handleSendBundle}
              aria-label={t('dm.tradeSetListSheetSendBundle', { defaultValue: '묶음 정보 보내기' })}
            >
              <Send size={18} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
