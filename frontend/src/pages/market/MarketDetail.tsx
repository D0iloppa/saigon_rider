import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, ArrowUp, Ban, Flag, Globe, Heart, MoreVertical, Pencil, Tag, Trash2, UserCheck } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import StateBlock from '@/components/ui/StateBlock';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { createConversation, proposePriceOffer } from '@/api/dm';
import PriceOfferSheet from '@/components/market/PriceOfferSheet';
import ReportDetailSheet from '@/components/market/ReportDetailSheet';
import { followUser, unfollowUser } from '@/api/follows';
import {
  fetchListing,
  updateListingStatus,
  updateListingPrice,
  withdrawListing,
  bumpListing,
  BUMP_COOLDOWN_MS,
  reportListing,
  blockUser,
  unblockUser,
  fetchBlockedUsers,
  REPORT_REASONS,
  toggleLike,
  localizedName,
  submitDealResult,
  type DealResult,
  type ListingCard,
  type ListingDetail,
  type ListingStatus,
  type ReportReason,
} from '@/api/market';
import { StarIcon } from '@/components/ui/StarIcon';
import { TrustTierChip } from '@/components/ui/TrustTierChip';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { formatPriceVnd, formatResponseRate, relativeTime, statusLabelKey } from './marketFormat';
import { noItemImage } from './noItemImage';
import styles from './MarketDetail.module.css';

// MKT-3: SOLD는 수동 전환 금지(서버 400) — 거래완료는 약속 complete 경로로만. 수동 셀렉터에서 제외(SOLD 뱃지 표시는 별도 유지).
const STATUSES: ListingStatus[] = ['ON_SALE', 'RESERVED'];

export default function MarketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const requireAuth = useRequireAuth();
  const myId = useUserStore((s) => s.user?.id);
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceOpen, setPriceOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerSending, setOfferSending] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    fetchListing(id, myId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id, myId]);

  useEffect(() => { load(); }, [load]);

  const isSeller = !!detail && !!myId && detail.seller.id === myId;

  const handleToggleLike = async () => {
    if (!requireAuth()) return;
    if (!detail || !myId) return;
    try {
      const res = await toggleLike(detail.id, myId);
      setDetail({ ...detail, liked: res.liked, likeCount: res.like_count });
    } catch {
      toast.error(t('market.likeError', { defaultValue: '찜 처리 실패' }));
    }
  };

  // 016 §4-7 #42: 거래 결과 확인 핑 응답 — 4지선다 1탭, 응답 즉시 상세를 다시 불러와 배너·상태를 갱신.
  const [dealPingSubmitting, setDealPingSubmitting] = useState(false);
  const handleDealPingResponse = async (result: DealResult) => {
    if (!detail || dealPingSubmitting) return;
    setDealPingSubmitting(true);
    try {
      await submitDealResult(detail.id, result);
      load();
    } catch {
      toast.error(t('market.dealPingError', { defaultValue: '응답을 처리하지 못했습니다' }));
    } finally {
      setDealPingSubmitting(false);
    }
  };

  const handleChat = async () => {
    if (!requireAuth()) return;
    if (!detail) return;
    try {
      const conv = await createConversation(detail.seller.id, { type: 'listing', id: detail.id });
      navigate(`/dm/${conv.id}`);
    } catch {
      toast.error(t('market.chatError', { defaultValue: '채팅을 시작할 수 없습니다' }));
    }
  };

  // 가격제안: 대화 생성(매물 컨텍스트) → 제안 전송 → 해당 DM 으로 이동
  const handleSendOffer = async (amount: number) => {
    if (!requireAuth()) return;
    if (!detail || offerSending) return;
    setOfferSending(true);
    try {
      const conv = await createConversation(detail.seller.id, { type: 'listing', id: detail.id });
      await proposePriceOffer(conv.id, amount);
      navigate(`/dm/${conv.id}`);
    } catch {
      toast.error(t('market.offerError', { defaultValue: '가격제안을 보낼 수 없습니다' }));
      setOfferSending(false);
    }
  };

  const handleUpdatePrice = async () => {
    if (!detail || !myId) return;
    try {
      await updateListingPrice(detail.id, myId, newPrice ? parseInt(newPrice, 10) : 0);
      setDetail(await fetchListing(detail.id, myId));
      setPriceOpen(false);
    } catch {
      toast.error(t('market.priceError', { defaultValue: '가격 변경 실패' }));
    }
  };

  const handleToggleFollow = async () => {
    if (!requireAuth()) return;
    if (!detail || isSeller) return;
    const wasFollowing = detail.seller.isFollowing;
    try {
      if (wasFollowing) await unfollowUser(detail.seller.id);
      else await followUser(detail.seller.id);
      setDetail({ ...detail, seller: { ...detail.seller, isFollowing: !wasFollowing } });
    } catch {
      toast.error(t('market.followError', { defaultValue: '팔로우 처리 실패' }));
    }
  };

  const handleStatus = async (status: ListingStatus) => {
    if (!detail || !myId || status === detail.status) return;
    try {
      await updateListingStatus(detail.id, myId, status);
      setDetail(await fetchListing(detail.id, myId));
    } catch {
      toast.error(t('market.statusError', { defaultValue: '상태 변경 실패' }));
    }
  };

  // F-7: 판매자 철회 — ACCEPTED 약속이 걸려 있으면 서버가 409 active_appointment 로 거부
  const handleWithdraw = async () => {
    if (!detail || !myId || withdrawing) return;
    setWithdrawing(true);
    try {
      await withdrawListing(detail.id, myId);
      setWithdrawOpen(false);
      // 철회는 삭제가 아니라 상태 — 상세에 머물러 "다시 올리기" 를 바로 누를 수 있게 한다(대표 지시 2026-08-08)
      setDetail(await fetchListing(detail.id, myId));
      toast.success(t('market.withdrawDone', { defaultValue: '매물을 내렸어요. 언제든 다시 올릴 수 있어요' }));
    } catch (err: any) {
      if (/"code":\s*"active_appointment"/.test(err?.message ?? '')) {
        toast.error(t('market.withdrawBlockedByAppointment', { defaultValue: '진행 중인 약속이 있어 철회할 수 없어요. 약속을 먼저 취소해주세요.' }));
      } else {
        toast.error(t('market.withdrawError', { defaultValue: '철회에 실패했어요' }));
      }
    } finally {
      setWithdrawing(false);
    }
  };

  // 대표 지시 2026-08-08: 철회 매물 재판매 — 서버는 WITHDRAWN → ON_SALE 전이만 허용한다
  const handleRelist = async () => {
    if (!detail || !myId) return;
    try {
      await updateListingStatus(detail.id, myId, 'ON_SALE');
      setDetail(await fetchListing(detail.id, myId));
      toast.success(t('market.relistDone', { defaultValue: '다시 판매중으로 올렸어요' }));
    } catch {
      toast.error(t('market.relistError', { defaultValue: '다시 올리기에 실패했어요' }));
    }
  };

  const handleBump = async () => {
    if (!detail) return;
    try {
      await bumpListing(detail.id);
      setDetail(await fetchListing(detail.id, myId));
      toast.success(t('market.bumpDone', { defaultValue: '끌어올렸어요' }));
    } catch {
      toast.error(t('market.bumpCooldown', { defaultValue: '아직 끌어올릴 수 없어요' }));
    }
  };

  const bumpRemainingMs = detail
    ? Math.max(0, Math.min(BUMP_COOLDOWN_MS, BUMP_COOLDOWN_MS - (Date.now() - new Date(detail.bumpedAt).getTime())))
    : 0;
  const canBump = detail?.status === 'ON_SALE' && bumpRemainingMs <= 0;

  // 사유 탭 → 코멘트·사진(둘 다 선택) 입력 단계로 이동 (대표 지적 2026-08-18). 즉시 제출하지 않는다.
  const handleReasonPick = (reason: ReportReason) => {
    if (!requireAuth()) return;
    setReportOpen(false);
    setReportReason(reason);
  };

  const handleReportSubmit = async (note: string, imageContentIds: string[]) => {
    if (!detail || !reportReason) return;
    setReportSubmitting(true);
    try {
      await reportListing(detail.id, reportReason, note || undefined, imageContentIds);
      toast.success(t('market.reportDone', { defaultValue: '신고가 접수되었어요' }));
    } catch {
      // 실패해도 시트를 닫는다 — 열어두면 사용자가 다시 눌러 같은 오류를 반복한다
      // (중복 신고 409 는 다시 시도해도 결과가 같다).
      toast.error(t('market.reportError', { defaultValue: '이미 신고했거나 처리에 실패했어요' }));
    } finally {
      setReportSubmitting(false);
      setReportReason(null);
    }
  };

  // 차단 상태 확인 — 차단/해제 토글 표시용
  useEffect(() => {
    const sid = detail?.seller.id;
    if (!sid || !myId) return;
    fetchBlockedUsers().then((list) => setBlocked(list.some((b) => b.userId === sid))).catch(() => {});
  }, [detail?.seller.id, myId]);

  const handleToggleBlock = async () => {
    if (!requireAuth()) return;
    if (!detail) return;
    try {
      if (blocked) {
        await unblockUser(detail.seller.id);
        setBlocked(false);
        toast.success(t('market.unblockDone', { defaultValue: '차단을 해제했어요' }));
      } else {
        await blockUser(detail.seller.id);
        setBlocked(true);
        toast.success(t('market.blockDone', { defaultValue: '차단했어요' }));
      }
      setMoreOpen(false);
    } catch {
      toast.error(t('market.blockError', { defaultValue: '처리에 실패했어요' }));
    }
  };

  return (
    <div className={styles.root}>
      {/* Top bar */}
      <div className={styles.topbar}>
        <StatusBar variant="dark" />
        <div className={styles.topbarRow}>
          <button className={styles.backBtn} type="button" onClick={() => navigate(-1)} aria-label={t('common.back', { defaultValue: '뒤로' })}>
            <ArrowLeft size={24} strokeWidth={2} />
          </button>
          {!isSeller && detail && (
            <button className={styles.backBtn} type="button" onClick={() => { if (requireAuth()) setMoreOpen(true); }} aria-label={t('market.more', { defaultValue: '더보기' })}>
              <MoreVertical size={24} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className={styles.scroll}>
          <div className={`shimmer ${styles.heroSkeleton}`} />
          <div className={styles.body}>
            <div className={`shimmer ${styles.lineSkeleton}`} />
            <div className={`shimmer ${styles.lineSkeleton}`} style={{ width: '60%' }} />
          </div>
        </div>
      ) : !detail ? (
        <div className={styles.scroll}>
          <StateBlock
            icon={AlertCircle}
            tone="error"
            title={t('market.loadError', { defaultValue: '매물을 불러오지 못했어요' })}
            actionLabel={t('common.retry')}
            onAction={load}
          />
        </div>
      ) : (
        <>
          <div className={styles.scroll}>
            {detail.imageUrls.length > 0 ? (
              <div className={styles.hero}>
                <ImageCarousel urls={detail.imageUrls} />
              </div>
            ) : (
              <div className={styles.hero}>
                <AppImage src={noItemImage()} alt={detail.title} />
              </div>
            )}

            <div className={styles.body}>
              {/* Seller */}
              <div className={styles.sellerBlock}>
                <div className={styles.sellerRow}>
                  <AppImage src={detail.seller.avatarUrl ?? undefined} alt="" className={styles.sellerAvatar} variant="circle" />
                  <div className={styles.sellerInfo}>
                    <span className={styles.sellerName}>{detail.businessName ?? detail.seller.nickname ?? '—'}</span>
                    <span className={styles.sellerSub}>
                      Lv.{detail.seller.level}
                      {detail.district ? ` · ${localizedName(detail.district)}` : ''}
                    </span>
                  </div>
                  {!isSeller && (
                    <button
                      className={`${styles.regularBtn} ${detail.seller.isFollowing ? styles.regularBtnActive : ''}`}
                      onClick={handleToggleFollow}
                    >
                      {detail.seller.isFollowing
                        ? t('market.following', { defaultValue: '팔로잉' })
                        : t('market.follow', { defaultValue: '팔로우' })}
                    </button>
                  )}
                  {detail.status !== 'ON_SALE' && (
                    <span className={`${styles.statusBadge} ${detail.status === 'SOLD' ? styles.statusSold : ''}`}>
                      {t(statusLabelKey(detail.status))}
                    </span>
                  )}
                </div>
                <div className={styles.trustBadges}>
                  <TrustTierChip temp={detail.seller.mannerTemp} />
                  <VerifiedBadge verified={detail.seller.isPhoneVerified} phoneMasked={detail.seller.phoneMasked} />
                  <span className={styles.trustChip}>
                    <StarIcon size={12} />
                    {' '}{detail.seller.avgRating !== null ? detail.seller.avgRating.toFixed(1) : '—'}
                  </span>
                  <span className={styles.trustChip}>
                    {t('market.reviewCount', { count: detail.seller.reviewCount, defaultValue: `거래 ${detail.seller.reviewCount}건` })}
                  </span>
                  {detail.seller.soldCount > 0 && (
                    <span className={styles.trustChip}>
                      {t('market.soldCount', { count: detail.seller.soldCount, defaultValue: `판매 ${detail.seller.soldCount}건` })}
                    </span>
                  )}
                  {formatResponseRate(detail.seller.responseRate, t) && (
                    <span className={styles.trustChip}>
                      {formatResponseRate(detail.seller.responseRate, t)}
                    </span>
                  )}
                </div>
              </div>

              {/* 016 §4-6 #41: 등록증 명의 불일치 — 핵심 위험 신호, 제목 위에 눈에 띄게 배치 */}
              {detail.paperStatus === 'MISMATCH' && (
                <span className={styles.paperMismatchBadge}>
                  <AlertCircle size={13} strokeWidth={2.4} />
                  {t('market.paperMismatchBadge', { defaultValue: '등록증 명의 불일치' })}
                </span>
              )}

              {/* 016 §4-7 #42: 거래 결과 확인 핑 — 판매자 본인에게만, 미응답 핑이 있을 때만 노출. */}
              {isSeller && detail.pendingDealPing && (
                <div className={styles.dealPingSection}>
                  <p className={styles.dealPingTitle}>
                    {t('market.dealPingQuestion', { defaultValue: '이 매물, 거래되셨나요?' })}
                  </p>
                  <div className={styles.dealPingButtons}>
                    <button
                      type="button"
                      className={styles.dealPingBtn}
                      disabled={dealPingSubmitting}
                      onClick={() => handleDealPingResponse('SOLD')}
                    >
                      {t('market.dealPingSold', { defaultValue: '거래됐어요' })}
                    </button>
                    <button
                      type="button"
                      className={styles.dealPingBtn}
                      disabled={dealPingSubmitting}
                      onClick={() => handleDealPingResponse('STILL_SELLING')}
                    >
                      {t('market.dealPingStillSelling', { defaultValue: '아직 판매중이에요' })}
                    </button>
                    <button
                      type="button"
                      className={styles.dealPingBtn}
                      disabled={dealPingSubmitting}
                      onClick={() => handleDealPingResponse('SOLD_ELSEWHERE')}
                    >
                      {t('market.dealPingSoldElsewhere', { defaultValue: '다른 곳에서 팔았어요' })}
                    </button>
                    <button
                      type="button"
                      className={styles.dealPingBtn}
                      disabled={dealPingSubmitting}
                      onClick={() => handleDealPingResponse('GAVE_UP')}
                    >
                      {t('market.dealPingGaveUp', { defaultValue: '판매를 포기했어요' })}
                    </button>
                  </div>
                </div>
              )}

              {/* Title + meta */}
              <h1 className={styles.title}>{detail.title}</h1>
              <p className={styles.meta}>
                {detail.category ? localizedName(detail.category) : ''}
                {detail.category ? ' · ' : ''}
                {relativeTime(detail.createdAt, t)}
                {` · ${t('market.viewCount', { count: detail.viewCount, defaultValue: `조회 ${detail.viewCount}` })}`}
              </p>

              {/* Price */}
              <div className={styles.priceRow}>
                {detail.originalPriceVnd != null && detail.originalPriceVnd > detail.priceVnd && (
                  <span className={styles.dropBadge}>{t('market.priceDrop', { defaultValue: '가격내림' })}</span>
                )}
                <span className={`${styles.price} num`}>{formatPriceVnd(detail.priceVnd, t)}</span>
                {detail.originalPriceVnd != null && detail.originalPriceVnd > detail.priceVnd && (
                  <span className={`${styles.origPrice} num`}>{formatPriceVnd(detail.originalPriceVnd, t)}</span>
                )}
                {detail.isNegotiable && (
                  <span className={styles.negotiable}>{t('market.negotiable', { defaultValue: '가격 제안 가능' })}</span>
                )}
              </div>

              {/* Description (서버가 조회 언어로 번역해 제공) */}
              {detail.translationFailed && (
                <p className={styles.translationNote}><Globe size={12} strokeWidth={2} /> {t('common.translationUnavailable')}</p>
              )}
              {detail.description && <p className={styles.description}>{detail.description}</p>}

              {/* 016 §4-6 #41, D-35=(a): 명의이전 체크리스트 — 거래완료(SOLD) 매물에 노출.
                  ⚠ L-6 법무 미확인: 절차·기한을 단정하지 않고 관할 기관 확인 고지를 함께 둔다. */}
              {detail.status === 'SOLD' && (
                <div className={styles.titleTransferSection}>
                  <p className={styles.titleTransferTitle}>
                    {t('market.titleTransferChecklistTitle', { defaultValue: '명의이전 체크리스트' })}
                  </p>
                  <ul className={styles.titleTransferList}>
                    <li>{t('market.titleTransferStep1', { defaultValue: '공증 매매계약서 작성' })}</li>
                    <li>{t('market.titleTransferStep2', { defaultValue: '기존 번호판·등록증 반납' })}</li>
                    <li>{t('market.titleTransferStep3', { defaultValue: '관할 기관에 신규 등록 신청' })}</li>
                  </ul>
                  <p className={styles.titleTransferNotice}>
                    {t('market.titleTransferNotice', {
                      defaultValue: '일반적으로 알려진 절차이며, 최신 규정·기한·과태료는 관할 기관에 직접 확인하세요.',
                    })}
                  </p>
                </div>
              )}

              {/* Seller's other listings */}
              {detail.otherListings.length > 0 && (
                <div className={styles.otherSection}>
                  <h2 className={styles.otherTitle}>
                    {t('market.sellerOther', {
                      name: detail.seller.nickname ?? '',
                      defaultValue: `${detail.seller.nickname ?? '판매자'}님의 다른 매물`,
                    })}
                  </h2>
                  <div className={styles.otherRow}>
                    {detail.otherListings.map((o) => (
                      <OtherCard key={o.id} item={o} onClick={() => navigate(`/market/${o.id}`)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom action bar */}
          {isSeller ? (
            detail.status === 'SOLD' ? null : detail.status === 'WITHDRAWN' || detail.status === 'EXPIRED' ? (
            // 내려둔(철회) 또는 자동만료(016 §4-1 #36) 매물: 다시 올리기 + 고쳐서 올리기 경로만
            // 남긴다 — 끌올·상태전환은 판매중일 때만. 서버도 두 상태를 동일하게 취급(_RECOVERABLE_STATUSES).
            <div className={styles.sellerControls}>
              <div className={styles.sellerLikes}>
                <Heart size={16} strokeWidth={2.2} />
                {t('market.likeCount', { count: detail.likeCount, defaultValue: `찜 ${detail.likeCount}` })}
              </div>
              <button className={styles.priceEditBtn} type="button" onClick={() => navigate(`/market/${detail.id}/edit`)}>
                <Pencil size={16} strokeWidth={2.2} />
                {t('market.editListing', { defaultValue: '매물 수정' })}
              </button>
              <div className={styles.statusBar}>
                <button className={`${styles.statusOpt} ${styles.statusOptActive}`} onClick={handleRelist}>
                  {t('market.relist', { defaultValue: '다시 올리기' })}
                </button>
              </div>
            </div>
            ) : (
            <div className={styles.sellerControls}>
              <div className={styles.sellerLikes}>
                <Heart size={16} strokeWidth={2.2} />
                {t('market.likeCount', { count: detail.likeCount, defaultValue: `찜 ${detail.likeCount}` })}
              </div>
              {detail.status === 'ON_SALE' && (
                <button className={styles.priceEditBtn} type="button" onClick={handleBump} disabled={!canBump}>
                  <ArrowUp size={16} strokeWidth={2.4} />
                  {canBump
                    ? t('market.bump', { defaultValue: '끌어올리기' })
                    : t('market.bumpWait', {
                        hours: Math.ceil(bumpRemainingMs / 3_600_000),
                        defaultValue: `${Math.ceil(bumpRemainingMs / 3_600_000)}시간 후 끌어올리기`,
                      })}
                </button>
              )}
              <button
                className={styles.priceEditBtn}
                type="button"
                onClick={() => {
                  setNewPrice(String(detail.priceVnd));
                  setPriceOpen(true);
                }}
              >
                <Tag size={16} strokeWidth={2.2} />
                {t('market.editPrice', { defaultValue: '가격 수정' })}
              </button>
              <button className={styles.priceEditBtn} type="button" onClick={() => navigate(`/market/${detail.id}/edit`)}>
                <Pencil size={16} strokeWidth={2.2} />
                {t('market.editListing', { defaultValue: '매물 수정' })}
              </button>
              <button className={styles.priceEditBtn} type="button" onClick={() => setWithdrawOpen(true)}>
                <Trash2 size={16} strokeWidth={2.2} />
                {t('market.withdraw', { defaultValue: '매물 철회' })}
              </button>
              <div className={styles.statusBar}>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    className={`${styles.statusOpt} ${detail.status === s ? styles.statusOptActive : ''}`}
                    onClick={() => handleStatus(s)}
                  >
                    {t(statusLabelKey(s))}
                  </button>
                ))}
              </div>
            </div>
            )
          ) : (
            <div className={styles.actionBar}>
              <button
                className={`${styles.likeBtn} ${detail.liked ? styles.likeBtnActive : ''}`}
                onClick={handleToggleLike}
                aria-label={t('market.wishlist', { defaultValue: '찜' })}
              >
                <Heart size={22} strokeWidth={2} fill={detail.liked ? 'currentColor' : 'none'} />
                <span className="num">{detail.likeCount}</span>
              </button>
              {detail.status === 'ON_SALE' && detail.isNegotiable && (
                <div className={styles.offerBtn}>
                  <Button variant="secondary" onClick={() => { if (requireAuth()) setOfferOpen(true); }}>
                    {t('market.makeOffer', { defaultValue: '가격제안' })}
                  </Button>
                </div>
              )}
              <div className={styles.chatBtn}>
                {detail.status === 'ON_SALE' ? (
                  <Button variant="primary" onClick={handleChat}>
                    {t('market.chat', { defaultValue: '채팅하기' })}
                  </Button>
                ) : (
                  <Button variant="secondary" disabled>
                    {t(statusLabelKey(detail.status))}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 가격제안 시트 (구매자) */}
          <PriceOfferSheet
            open={offerOpen}
            onClose={() => setOfferOpen(false)}
            listingTitle={detail.title}
            listingThumbnailUrl={detail.imageUrls[0] ?? null}
            listingPriceVnd={detail.priceVnd}
            onSubmit={handleSendOffer}
            submitting={offerSending}
          />

          {/* 가격 수정 시트 (판매자) */}
          <BottomSheet open={priceOpen} onClose={() => setPriceOpen(false)}>
            <div className={styles.priceSheet}>
              <h2 className={styles.priceSheetTitle}>{t('market.editPrice', { defaultValue: '가격 수정' })}</h2>
              <div className={styles.priceField}>
                <span className={styles.pricePrefix}>₫</span>
                <input
                  className={styles.priceInput}
                  inputMode="numeric"
                  value={newPrice ? parseInt(newPrice, 10).toLocaleString('vi-VN') : ''}
                  onChange={(e) => setNewPrice(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                />
              </div>
              <p className={styles.priceHint}>{t('market.priceDropHint', { defaultValue: '기존보다 낮추면 가격내림 배지가 붙어요' })}</p>
              <div className={styles.priceSubmit}>
                <Button onClick={handleUpdatePrice}>{t('common.save', { defaultValue: '저장' })}</Button>
              </div>
            </div>
          </BottomSheet>

          {/* 철회 확인 (판매자) */}
          <BottomSheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)}>
            <div className={styles.priceSheet}>
              <h2 className={styles.priceSheetTitle}>{t('market.withdrawConfirmTitle', { defaultValue: '매물을 철회할까요?' })}</h2>
              <p className={styles.priceHint}>{t('market.withdrawConfirmBody', { defaultValue: '철회하면 되돌릴 수 없고 피드·검색에서 사라져요.' })}</p>
              <div className={styles.priceSubmit}>
                <Button variant="secondary" onClick={handleWithdraw} disabled={withdrawing}>
                  {withdrawing ? t('market.withdrawing', { defaultValue: '철회 중' }) : t('market.withdrawConfirm', { defaultValue: '철회하기' })}
                </Button>
              </div>
            </div>
          </BottomSheet>

          {/* 더보기: 신고/차단 (비판매자) */}
          <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)}>
            <div className={styles.moreSheet}>
              {/* R-2(017 §12-B): 이미 신고한 매물이면 버튼을 비활성화한다 — 종전엔 눌러야만
                  409 로 알 수 있었다. 신고는 매물당 1회이므로 사유를 바꿔도 결과가 같다. */}
              <button
                className={styles.moreItem}
                disabled={detail.isReportedByMe}
                onClick={() => {
                  setMoreOpen(false);
                  setReportOpen(true);
                }}
              >
                <Flag size={16} strokeWidth={2.2} />
                {detail.isReportedByMe
                  ? t('market.reportedAlready', { defaultValue: '신고함' })
                  : t('market.report', { defaultValue: '신고하기' })}
              </button>
              <button className={`${styles.moreItem} ${blocked ? '' : styles.moreDanger}`} onClick={handleToggleBlock}>
                {blocked ? <UserCheck size={16} strokeWidth={2.2} /> : <Ban size={16} strokeWidth={2.2} />}
                {blocked
                  ? t('market.unblock', { defaultValue: '차단 해제' })
                  : t('market.block', { defaultValue: '이 사용자 차단' })}
              </button>
            </div>
          </BottomSheet>

          {/* 신고 사유 */}
          <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)}>
            <div className={styles.moreSheet}>
              <h2 className={styles.priceSheetTitle}>{t('market.reportTitle', { defaultValue: '신고 사유' })}</h2>
              {REPORT_REASONS.map((r) => (
                <button key={r} className={styles.moreItem} onClick={() => handleReasonPick(r)}>
                  {t(`market.reportReason_${r}`)}
                </button>
              ))}
            </div>
          </BottomSheet>

          {/* 신고 코멘트 + 사진(둘 다 선택) — 대표 지적 2026-08-18 */}
          <ReportDetailSheet
            open={reportReason !== null}
            onClose={() => setReportReason(null)}
            onSubmit={handleReportSubmit}
            submitting={reportSubmitting}
          />
        </>
      )}
    </div>
  );
}

function OtherCard({ item, onClick }: { item: ListingCard; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button className={styles.otherCard} type="button" onClick={onClick}>
      <span className={styles.otherThumb}>
        <AppImage src={item.thumbnailUrl ?? noItemImage()} alt={item.title} className={styles.otherThumbImg} />
      </span>
      <p className={styles.otherCardTitle}>{item.title}</p>
      <p className={`${styles.otherCardPrice} num`}>{formatPriceVnd(item.priceVnd, t)}</p>
    </button>
  );
}
