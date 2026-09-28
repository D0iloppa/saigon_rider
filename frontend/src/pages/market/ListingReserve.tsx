import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Users } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { extractErrorCode } from '@/api/client';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useUserStore } from '@/store/useUserStore';
import {
  fetchListing,
  fetchListingChats,
  reserveListingFor,
  completeListingFor,
  type ListingDetail,
  type ListingChatCounterpart,
} from '@/api/market';
import { relativeTime } from './marketFormat';
import { noItemImage } from './noItemImage';
import styles from './ListingReserve.module.css';

/** F-S0-02 FR-6 선택 모드 — "예약자 선택"(status pill → 예약중) / "구매자 선택"(→ 거래완료) 공용 화면.
 * 대표 추가 피드백 260928(당근 참조), trade-request-flow-design.md §3.2 "예약자 선택 화면 상세". */
export default function ListingReserve() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'complete' ? 'complete' : 'reserve';
  const navigate = useNavigate();
  const { t } = useTranslation();
  const myId = useUserStore((s) => s.user?.id);

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [chats, setChats] = useState<ListingChatCounterpart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    Promise.all([fetchListing(id, myId), fetchListingChats(id)])
      .then(([l, c]) => { setListing(l); setChats(c); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id, myId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (conversationId: string | null) => {
    if (!id || submitting) return;
    setSubmitting(true);
    try {
      if (mode === 'reserve') {
        if (!conversationId) return;
        await reserveListingFor(id, conversationId);
        toast.success(t('market.reserveDone', { defaultValue: '예약자를 선택했어요' }));
      } else {
        await completeListingFor(id, conversationId);
        toast.success(t('market.completeDone', { defaultValue: '거래완료로 표시했어요' }));
      }
      navigate(`/market/${id}`, { replace: true });
    } catch (err) {
      const code = extractErrorCode(err);
      if (code === 'listing_reservation_conflict') {
        toast.error(t('market.listingReservationConflict', { defaultValue: '이미 다른 분과 거래가 진행 중이에요' }));
      } else if (code === 'counterpart_required') {
        toast.error(t('market.counterpartRequired', { defaultValue: '상대를 선택해주세요' }));
      } else {
        toast.error(t('market.reserveError', { defaultValue: '처리에 실패했어요' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOutsideAppComplete = () => {
    useConfirmStore.getState().open(
      { mode: 'text', value: t('market.outsideAppCompleteConfirmBody', { defaultValue: '앱 밖에서 판 거래로 기록하면 상대·후기 없이 거래완료로 종료돼요.' }) },
      () => void handleSubmit(null),
      { confirmLabel: { mode: 'text', value: t('market.completeConfirm', { defaultValue: '거래완료' }) } },
    );
  };

  const handleCompletePick = () => {
    if (!selected) return;
    useConfirmStore.getState().open(
      { mode: 'text', value: t('market.completeConfirmBody', { defaultValue: '거래완료로 표시하면 되돌릴 수 없어요.' }) },
      () => void handleSubmit(selected),
      { confirmLabel: { mode: 'text', value: t('market.completeConfirm', { defaultValue: '거래완료' }) } },
    );
  };

  return (
    <div className={styles.root}>
      <TopBar title={mode === 'complete' ? t('market.selectBuyerTitle', { defaultValue: '구매자 선택' }) : t('market.selectReserverTitle', { defaultValue: '예약자 선택' })} />
      {loading ? (
        <div className={`shimmer ${styles.rowSkeleton}`} />
      ) : error || !listing ? (
        <StateBlock
          icon={AlertCircle}
          tone="error"
          title={t('market.loadError', { defaultValue: '불러오지 못했어요' })}
          actionLabel={t('common.retry')}
          onAction={load}
        />
      ) : (
        <>
          <div className={styles.itemHeader}>
            <p className={styles.itemHeaderLabel}>{t('market.tradeItemLabel', { defaultValue: '거래할 물품' })}</p>
            <div className={styles.itemRow}>
              <AppImage src={listing.imageUrls[0] ?? noItemImage()} alt={listing.title} className={styles.itemThumb} />
              <span className={styles.itemTitle}>{listing.title}</span>
            </div>
          </div>

          <div className={styles.scroll}>
            {chats.length === 0 ? (
              <StateBlock
                icon={Users}
                title={t('market.reserveCandidatesEmpty', { defaultValue: '이 매물로 대화한 상대가 없어요' })}
                desc={t('market.reserveCandidatesEmptySub', { defaultValue: '채팅에서 먼저 대화를 시작해주세요' })}
              />
            ) : (
              chats.map((c) => (
                <label key={c.conversationId} className={styles.candidateRow}>
                  <AppImage src={c.counterpartAvatarUrl ?? undefined} alt="" className={styles.candidateAvatar} variant="circle" />
                  <div className={styles.candidateBody}>
                    <span className={styles.candidateName}>{c.counterpartNickname ?? '—'}</span>
                    {c.lastMessageAt && (
                      <span className={styles.candidateSub}>
                        {t('market.lastChatAgo', { time: relativeTime(c.lastMessageAt, t), defaultValue: `마지막 대화 ${relativeTime(c.lastMessageAt, t)}` })}
                      </span>
                    )}
                  </div>
                  <input
                    type="radio"
                    name="counterpart"
                    checked={selected === c.conversationId}
                    onChange={() => setSelected(c.conversationId)}
                  />
                </label>
              ))
            )}
          </div>

          <div className={styles.footer}>
            {mode === 'complete' && (
              <button className={styles.outsideAppBtn} type="button" onClick={handleOutsideAppComplete} disabled={submitting}>
                {t('market.completeOutsideApp', { defaultValue: '앱 밖에서 팔았어요' })}
              </button>
            )}
            <Button
              onClick={mode === 'reserve' ? () => void handleSubmit(selected) : handleCompletePick}
              disabled={!selected || submitting}
            >
              {mode === 'complete'
                ? t('market.completeConfirm', { defaultValue: '거래완료' })
                : t('market.selectReserverCta', { defaultValue: '예약자 선택' })}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
