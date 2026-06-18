import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MoreVertical } from 'lucide-react';
import { StatusBar } from '@/components/layout/StatusBar';
import { AppImage } from '@/components/ui/AppImage';
import { ImageCarousel } from '@/components/ui/ImageCarousel';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { toast } from '@/components/ui/Toast';
import { useUserStore } from '@/store/useUserStore';
import { createConversation } from '@/api/dm';
import { followUser, unfollowUser } from '@/api/follows';
import {
  fetchListing,
  updateListingStatus,
  updateListingPrice,
  bumpListing,
  BUMP_COOLDOWN_MS,
  reportListing,
  blockUser,
  REPORT_REASONS,
  toggleLike,
  localizedName,
  type ListingCard,
  type ListingDetail,
  type ListingStatus,
  type ReportReason,
} from '@/api/market';
import { formatMannerTemp, formatPriceVnd, mannerEmoji, relativeTime, statusLabelKey } from './marketFormat';
import styles from './MarketDetail.module.css';

const STATUSES: ListingStatus[] = ['ON_SALE', 'RESERVED', 'SOLD'];

export default function MarketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const myId = useUserStore((s) => s.user?.id);
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceOpen, setPriceOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchListing(id, myId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id, myId]);

  const isSeller = !!detail && !!myId && detail.seller.id === myId;

  const handleToggleLike = async () => {
    if (!detail || !myId) return;
    try {
      const res = await toggleLike(detail.id, myId);
      setDetail({ ...detail, liked: res.liked, likeCount: res.like_count });
    } catch {
      toast.error(t('market.likeError', { defaultValue: '찜 처리 실패' }));
    }
  };

  const handleChat = async () => {
    if (!detail) return;
    try {
      const conv = await createConversation(detail.seller.id, { type: 'listing', id: detail.id });
      navigate(`/dm/${conv.id}`);
    } catch {
      toast.error(t('market.chatError', { defaultValue: '채팅을 시작할 수 없습니다' }));
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
    if (!detail || isSeller) return;
    const wasFollowing = detail.seller.isFollowing;
    try {
      if (wasFollowing) await unfollowUser(detail.seller.id);
      else await followUser(detail.seller.id);
      setDetail({ ...detail, seller: { ...detail.seller, isFollowing: !wasFollowing } });
    } catch {
      toast.error(t('market.followError', { defaultValue: '단골 처리 실패' }));
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

  const handleReport = async (reason: ReportReason) => {
    if (!detail) return;
    try {
      await reportListing(detail.id, reason);
      setReportOpen(false);
      toast.success(t('market.reportDone', { defaultValue: '신고가 접수되었어요' }));
    } catch {
      toast.error(t('market.reportError', { defaultValue: '이미 신고했거나 처리에 실패했어요' }));
    }
  };

  const handleBlock = async () => {
    if (!detail) return;
    try {
      await blockUser(detail.seller.id);
      setMoreOpen(false);
      toast.success(t('market.blockDone', { defaultValue: '차단했어요' }));
      navigate(-1);
    } catch {
      toast.error(t('market.blockError', { defaultValue: '차단 처리에 실패했어요' }));
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
            <button className={styles.backBtn} type="button" onClick={() => setMoreOpen(true)} aria-label={t('market.more', { defaultValue: '더보기' })}>
              <MoreVertical size={24} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {loading || !detail ? (
        <div className={styles.scroll}>
          <div className={`shimmer ${styles.heroSkeleton}`} />
          <div className={styles.body}>
            <div className={`shimmer ${styles.lineSkeleton}`} />
            <div className={`shimmer ${styles.lineSkeleton}`} style={{ width: '60%' }} />
          </div>
        </div>
      ) : (
        <>
          <div className={styles.scroll}>
            {detail.imageUrls.length > 0 && (
              <div className={styles.hero}>
                <ImageCarousel urls={detail.imageUrls} />
              </div>
            )}

            <div className={styles.body}>
              {/* Seller */}
              <div className={styles.sellerRow}>
                <AppImage src={detail.seller.avatarUrl ?? undefined} alt="" className={styles.sellerAvatar} variant="circle" />
                <div className={styles.sellerInfo}>
                  <span className={styles.sellerName}>{detail.seller.nickname ?? '—'}</span>
                  <span className={styles.sellerSub}>
                    Lv.{detail.seller.level}
                    {detail.district ? ` · ${localizedName(detail.district)}` : ''}
                  </span>
                </div>
                <span className={styles.mannerBadge} title={t('market.mannerTemp', { defaultValue: '매너온도' })}>
                  {mannerEmoji(detail.seller.mannerTemp)} {formatMannerTemp(detail.seller.mannerTemp)}
                </span>
                {!isSeller && (
                  <button
                    className={`${styles.regularBtn} ${detail.seller.isFollowing ? styles.regularBtnActive : ''}`}
                    onClick={handleToggleFollow}
                  >
                    {detail.seller.isFollowing
                      ? t('market.regular', { defaultValue: '단골' })
                      : t('market.makeRegular', { defaultValue: '단골 맺기' })}
                  </button>
                )}
                {detail.status !== 'ON_SALE' && (
                  <span className={`${styles.statusBadge} ${detail.status === 'SOLD' ? styles.statusSold : ''}`}>
                    {t(statusLabelKey(detail.status))}
                  </span>
                )}
              </div>

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
                <span className={styles.price}>{formatPriceVnd(detail.priceVnd, t)}</span>
                {detail.originalPriceVnd != null && detail.originalPriceVnd > detail.priceVnd && (
                  <span className={styles.origPrice}>{formatPriceVnd(detail.originalPriceVnd, t)}</span>
                )}
                {detail.isNegotiable && (
                  <span className={styles.negotiable}>{t('market.negotiable', { defaultValue: '가격 제안 가능' })}</span>
                )}
              </div>

              {/* Description (서버가 조회 언어로 번역해 제공) */}
              {detail.description && <p className={styles.description}>{detail.description}</p>}

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
            <div className={styles.sellerControls}>
              {detail.status === 'ON_SALE' && (
                <button className={styles.priceEditBtn} type="button" onClick={handleBump} disabled={!canBump}>
                  ⬆️{' '}
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
                💲 {t('market.editPrice', { defaultValue: '가격 수정' })}
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
          ) : (
            <div className={styles.actionBar}>
              <button
                className={`${styles.likeBtn} ${detail.liked ? styles.likeBtnActive : ''}`}
                onClick={handleToggleLike}
                aria-label={t('market.wishlist', { defaultValue: '찜' })}
              >
                {detail.liked ? '♥' : '♡'} {detail.likeCount}
              </button>
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

          {/* 더보기: 신고/차단 (비판매자) */}
          <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)}>
            <div className={styles.moreSheet}>
              <button
                className={styles.moreItem}
                onClick={() => {
                  setMoreOpen(false);
                  setReportOpen(true);
                }}
              >
                🚩 {t('market.report', { defaultValue: '신고하기' })}
              </button>
              <button className={`${styles.moreItem} ${styles.moreDanger}`} onClick={handleBlock}>
                🚫 {t('market.block', { defaultValue: '이 사용자 차단' })}
              </button>
            </div>
          </BottomSheet>

          {/* 신고 사유 */}
          <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)}>
            <div className={styles.moreSheet}>
              <h2 className={styles.priceSheetTitle}>{t('market.reportTitle', { defaultValue: '신고 사유' })}</h2>
              {REPORT_REASONS.map((r) => (
                <button key={r} className={styles.moreItem} onClick={() => handleReport(r)}>
                  {t(`market.reportReason_${r}`)}
                </button>
              ))}
            </div>
          </BottomSheet>
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
        <AppImage src={item.thumbnailUrl ?? undefined} alt={item.title} className={styles.otherThumbImg} />
      </span>
      <p className={styles.otherCardTitle}>{item.title}</p>
      <p className={styles.otherCardPrice}>{formatPriceVnd(item.priceVnd, t)}</p>
    </button>
  );
}
