import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle, Ban, Building2, ChevronRight, Coffee, Eye, Flag, MoreVertical, Moon, Newspaper, Send, ShoppingBag, Star,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { DEFAULT_AVATAR_URL } from '@/lib/defaults';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { Chip } from '@/components/ui/Chip';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { TrustTierChip } from '@/components/ui/TrustTierChip';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { SessionExpiredError, extractErrorCode } from '@/api/client';
import { fetchUserProfile, reportUser, USER_REPORT_REASONS, type UserReportReason } from '@/api/profile';
import { fetchMyFeed } from '@/api/feed';
import { followUser, unfollowUser } from '@/api/follows';
import { createConversation } from '@/api/dm';
import { fetchListings, blockUser, type ListingCard as MarketListing } from '@/api/market';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import { useConfirmStore } from '@/store/useConfirmStore';
import { formatNumber } from '@/lib/format';
import type { FeedPost, UserProfile as UserProfileData } from '@/api/types';
import sys from '@/styles/system.module.css';
import styles from './UserProfile.module.css';
import ProfileListingCard from './ProfileListingCard';
import ProfileFeedCard from './ProfileFeedCard';

const RAIL_SIZE = 6;

/**
 * 다른 사용자의 프로필 **페이지** (2026-08-13 신설).
 *
 * 종전에는 `components/ProfileCard.tsx` 바텀시트가 이 역할을 했는데, 시트 안에
 * 페이지네이션되는 피드 리스트와 그 위의 댓글 오버레이까지 3층이 쌓여 있었다
 * (대표 지적 2026-08-13 "바텀시트 위에 피드리스트가 있으니까 뭔가 불안해").
 * 제스처 충돌(시트 드래그 vs 리스트 스크롤)·뒤로가기 의미 부재(시트는 URL 이 없다)·
 * "곧 닫을 표면"과 "계속 이어지는 목록"의 신호 모순이 그 구조의 결함이었다.
 *
 * **원칙: 시트는 잎(leaf), 페이지는 탐색(browse).** 인스타그램·Threads·TikTok·당근이 공통으로
 * 남의 프로필을 전체 페이지로 두고, 시트는 댓글·액션 같은 잎에만 쓴다. 그래서 이 화면은
 * 페이지이고, 댓글은 여기서 열지 않는다 — 카드를 탭하면 `/feed/post/:postId` 로 간다
 * (목록에서 응원은 되고 댓글은 상세에서만 — `FeedList` 의 기존 관례와 동일).
 *
 * 상세 설계: `ai-docs/task/active/260813_user_profile_page_task.md`
 */
export default function UserProfile() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useParams<{ userId: string }>();
  const me = useUserStore((s) => s.user);

  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [listings, setListings] = useState<MarketListing[] | null>(null);
  const [listingsError, setListingsError] = useState(false);
  const [listingsTotal, setListingsTotal] = useState(0);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [postsTotal, setPostsTotal] = useState(0);

  const loadPage = useCallback(async (target: string) => {
    setFeedLoading(true);
    try {
      const result = await fetchMyFeed(target, 1, RAIL_SIZE);
      setPosts(result.items);
      setPostsTotal(result.total);
      setFeedError(false);
    } catch {
      // 조회 실패를 "게시물 없음"으로 위장하지 않는다 — 정보 화면에서 같은 결함(조회 실패가
      // '아직 리뷰가 없어요'로 표시)을 이미 고친 선례가 있다.
      setFeedError(true);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const load = useCallback(() => {
    if (!userId) return;
    setProfileLoading(true);
    setLoadError(false);
    fetchUserProfile(userId)
      .then(setProfile)
      .catch(() => setLoadError(true))
      .finally(() => setProfileLoading(false));
    setListings(null);
    setListingsError(false);
    fetchListings({ sellerId: userId, hideSold: true, publicView: true, page: 1, size: RAIL_SIZE })
      .then((result) => { setListings(result.items); setListingsTotal(result.total); })
      .catch(() => { setListings([]); setListingsError(true); });
    setFeedError(false);
    void loadPage(userId);
  }, [userId, loadPage]);

  useEffect(load, [load]);

  async function doFollow() {
    if (!profile || !me) return;
    setToggling(true);
    try {
      await followUser(profile.id);
      setProfile((prev) => (prev ? { ...prev, isFollowing: true, followerCount: prev.followerCount + 1 } : prev));
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError) return;
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setToggling(false);
    }
  }

  async function doUnfollow() {
    if (!profile || !me) return;
    setToggling(true);
    try {
      await unfollowUser(profile.id);
      setProfile((prev) => (prev ? { ...prev, isFollowing: false, followerCount: Math.max(0, prev.followerCount - 1) } : prev));
    } catch (err: unknown) {
      if (err instanceof SessionExpiredError) return;
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setToggling(false);
    }
  }

  function handleToggleFollow() {
    if (!profile || !me) return;
    if (profile.isFollowing) {
      useDialogStore.getState().open({
        message: { mode: 'code', value: 'follow.unfollowConfirm' },
        onConfirm: doUnfollow,
      });
    } else {
      void doFollow();
    }
  }

  async function handleDm() {
    if (!profile) return;
    setDmLoading(true);
    try {
      const conv = await createConversation(profile.id);
      navigate(`/dm/${conv.id}`);
    } catch {
      toast.error(t('follow.dmError'));
    } finally {
      setDmLoading(false);
    }
  }

  async function handleReport(reason: UserReportReason) {
    if (!profile) return;
    try {
      await reportUser(profile.id, reason);
      setReportOpen(false);
      setReported(true);
      toast.success(t('follow.reportDone'));
    } catch (err) {
      setReportOpen(false); // 실패해도 닫는다 — 사유를 바꿔도 결과가 같다(MarketDetail 과 동일)
      // R-3(260819 W3) — 취소한 신고 재시도와 처리 중인 신고 재시도는 다른 문구로 안내한다.
      const code = extractErrorCode(err);
      if (code === 'report_already_cancelled') {
        toast.error(t('support.reportAlreadyCancelledError'));
      } else if (code === 'report_already_pending') {
        toast.error(t('support.reportAlreadyPendingError'));
      } else {
        toast.error(t('follow.reportError'));
      }
    }
  }

  // FR-2 제안 ① — 사유 탭과 접수 사이에 확인 1회(파괴적·비가역 행동, P-1). 신설 없이
  // 앱에 이미 있는 확인 다이얼로그(useConfirmStore)를 쓴다.
  function handleReasonPick(reason: UserReportReason) {
    setReportOpen(false);
    useConfirmStore.getState().open(
      { mode: 'text', value: t('follow.reportConfirm', { defaultValue: '이 사유로 신고할까요?' }) },
      () => void handleReport(reason),
    );
  }

  async function handleBlock() {
    if (!profile) return;
    try {
      await blockUser(profile.id);
      setMoreOpen(false);
      toast.success(t('market.blockDone', { defaultValue: '차단했어요 · 설정 > 차단 사용자 관리에서 해제할 수 있어요' }));
    } catch {
      toast.error(t('market.blockError', { defaultValue: '처리에 실패했어요' }));
    }
  }

  // F-X-02 FR-2(260924 승인안) — 3곳 진입점(매물 상세·프로필·DM) 공용 확인 문구·버튼.
  function handleBlockPick() {
    setMoreOpen(false);
    useConfirmStore.getState().open(
      {
        mode: 'text',
        value: t('follow.blockConfirm', {
          name: profile?.nickname ?? '',
          defaultValue: `${profile?.nickname ?? '이 사용자'}님을 차단할까요? 이 사람의 메시지·매물이 더 이상 보이지 않아요. 상대에게는 알리지 않아요`,
        }),
      },
      () => void handleBlock(),
      { confirmLabel: { mode: 'text', value: t('market.blockConfirm', { defaultValue: '차단' }) } },
    );
  }

  const riderStyleLabel = profile?.riderStyle === 'commuter'
    ? t('profileSetup.styleCommuterTitle')
    : profile?.riderStyle === 'cafe_hunter'
    ? t('profileSetup.styleCafeHunterTitle')
    : profile?.riderStyle === 'night_rider'
    ? t('profileSetup.styleNightRiderTitle')
    : null;
  const RiderStyleIcon = profile?.riderStyle === 'commuter'
    ? Building2
    : profile?.riderStyle === 'cafe_hunter'
    ? Coffee
    : Moon;

  const isOther = !!me && !!profile && me.id !== profile.id;
  // 내 userId 로 들어오면 "다른 사람에게 보이는 내 프로필" 미리보기다 (2026-09-10, 대표 요청 —
  // "내 프로필이 남에게 어떻게 보이는지 확인할 경로가 없다"). 종전에는 여기서 /profile 로
  // 되돌렸는데, 그 리다이렉트가 유일한 확인 경로를 막고 있었다. 구성은 남의 프로필과 동일하고
  // 팔로우·메시지·신고는 isOther 게이트가 이미 숨긴다 — 배너 한 줄로 미리보기임만 밝힌다.
  // 진입은 ProfileMain 의 "다른 사람에게 보이는 내 프로필" 행(navigate(`/profile/${u.id}`)).
  const isSelfPreview = !!me && !!profile && me.id === profile.id;

  return (
    <div className={sys.page}>
      {/* onBack 을 넘기지 않는다 — TopBar 기본 동작이 딥링크(location.key === 'default')일 때
          섹션 root 로 Up 이동하는 가드를 갖고 있다. navigate(-1) 을 직접 주면 공유 링크로
          들어온 사용자가 뒤로가기에서 앱 밖으로 나간다. */}
      <TopBar
        title={profile?.nickname ?? t('userProfile.title', { defaultValue: '프로필' })}
        rightContent={isOther ? (
          <button
            type="button"
            className={styles.moreBtn}
            onClick={() => setMoreOpen(true)}
            aria-label={t('follow.report')}
          >
            <MoreVertical size={20} strokeWidth={2.2} />
          </button>
        ) : undefined}
      />

      <div className={`${sys.scroll} ${styles.scroll}`}>
        {profileLoading ? (
          <SkeletonRows count={2} />
        ) : loadError || !profile ? (
          <StateBlock
            icon={AlertCircle}
            tone="error"
            title={t('userProfile.loadError', { defaultValue: '프로필을 불러오지 못했어요' })}
            actionLabel={t('common.retry', { defaultValue: '다시 시도' })}
            onAction={load}
          />
        ) : (
          <>
            {isSelfPreview && (
              <div className={styles.previewBanner} role="status">
                <Eye size={15} strokeWidth={2.2} />
                <span>{t('userProfile.selfPreview')}</span>
                <button
                  type="button"
                  className={styles.previewEditBtn}
                  onClick={() => navigate('/settings/profile')}
                >
                  {t('settings.editProfile')}
                </button>
              </div>
            )}
            <div className={styles.header}>
              <AppImage
                src={profile.avatarUrl || DEFAULT_AVATAR_URL}
                alt=""
                className={styles.avatar}
                variant="circle"
              />
              <div className={styles.info}>
                <div className={styles.nickRow}>
                  <span className={styles.nickname}>{profile.nickname ?? 'Unknown'}</span>
                  <VerifiedBadge verified={profile.isPhoneVerified} phoneMasked={profile.phoneMasked} />
                  {/* WP-4(2026-09-09, F049) — 서버가 변환한 티어만 받는다(tier prop),
                      원값 manner_temp 는 이 응답에 아예 없다. MarketDetail 의 판매자 신뢰뱃지 그룹과
                      같은 배치 관례(닉네임 행에 인증뱃지와 함께)를 따른다. */}
                  <TrustTierChip tier={profile.trustTier} />
                  {/* P4-4: 맞팔 = 친구 표기 (신규 UI 컴포넌트 없이 기존 Chip 재사용) */}
                  {profile.isFriend && <Chip variant="surface">{t('follow.friends')}</Chip>}
                </div>
                {riderStyleLabel && (
                  <Chip variant="surface"><RiderStyleIcon size={13} /> {riderStyleLabel}</Chip>
                )}
              </div>
            </div>

            <div className={styles.statsRow}>
              <div className={styles.statCell}>
                <span className={`${styles.statNum} num`}>{formatNumber(profile.followerCount)}</span>
                <span className={styles.statLabel}>{t('follow.followers')}</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statCell}>
                <span className={`${styles.statNum} num`}>{formatNumber(profile.followingCount)}</span>
                <span className={styles.statLabel}>{t('follow.following')}</span>
              </div>
            </div>

            {/* FR-1 제안 ③ — 신뢰 섹션을 액션행 위로: 판단 재료를 보고 나서 행동을 고르는 순서 */}
            <section className={styles.trustSection} aria-labelledby="profile-trust-title">
              <h2 id="profile-trust-title">{t('userProfile.trustSection')}</h2>
              {/* FR-1 제안 ⑥ — 평점 없음·거래 0건인 신규 사용자는 "판단 불가"가 "나쁨"으로
                  읽히지 않게 빈 상태 문구로 대체한다(행동 유도 CTA 없음 — 판단 재료일 뿐). */}
              {profile.marketplaceAvgRating === null && profile.marketplaceSoldCount === 0 ? (
                <StateBlock icon={Star} title={t('userProfile.trustEmpty', { defaultValue: '아직 거래 기록이 없는 사용자입니다' })} />
              ) : (
                <dl className={styles.trustGrid}>
                  {profile.memberSince && <div>
                    <dt>{t('userProfile.memberSince')}</dt>
                    <dd className="num">{new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'short' }).format(new Date(profile.memberSince))}</dd>
                  </div>}
                  <div>
                    <dt>{t('userProfile.completedSales')}</dt>
                    <dd className="num">{t('userProfile.countValue', { count: profile.marketplaceSoldCount })}</dd>
                  </div>
                  <div>
                    <dt>{t('userProfile.marketReviews')}</dt>
                    <dd className="num"><Star size={13} /> {profile.marketplaceAvgRating === null ? '—' : profile.marketplaceAvgRating.toFixed(1)} · {profile.marketplaceReviewCount}</dd>
                  </div>
                </dl>
              )}
            </section>

            {/* FR-1 제안 ① — 액션행 위계 반전: DM(연락하기)이 채움 버튼(주행동), 팔로우는
                외곽선(보조). 매물 상세 하단 바([채팅]만 채움)와 같은 위계(B0-4). */}
            {isOther && (
              <div className={styles.actionRow}>
                <Button
                  variant="primary"
                  onClick={handleDm}
                  disabled={dmLoading}
                  loading={dmLoading}
                  className={styles.dmBtn}
                >
                  <Send size={18} strokeWidth={2.2} />
                  {t('follow.dmBtn', { defaultValue: '메시지' })}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleToggleFollow}
                  disabled={toggling}
                  fullWidth={false}
                  className={styles.followBtn}
                >
                  {profile.isFollowing ? t('follow.unfollowBtn') : t('follow.followBtn')}
                </Button>
              </div>
            )}

            <div className={styles.sectionHead}>
              <h2>{t('userProfile.marketSection')}</h2>
              {listings && listings.length > 0 && listingsTotal > listings.length && (
                <button
                  type="button"
                  className={styles.seeMoreBtn}
                  aria-label={`${t('userProfile.marketSection')} ${t('home.seeMore')}`}
                  onClick={() => navigate(`/profile/${userId}/listings`, { state: location.state })}
                >
                  {t('home.seeMore')}
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
            {listings === null ? (
              <SkeletonRows count={2} />
            ) : listingsError ? (
              <StateBlock icon={AlertCircle} tone="error" title={t('userProfile.marketError')} actionLabel={t('common.retry')} onAction={load} />
            ) : listings.length === 0 ? (
              <StateBlock icon={ShoppingBag} title={t('userProfile.marketEmpty')} />
            ) : (
              <div className={styles.rail}>
                {listings.map((listing) => (
                  <div className={styles.railItem} key={listing.id}>
                    <ProfileListingCard listing={listing} onClick={() => navigate(`/market/${listing.id}`)} />
                  </div>
                ))}
              </div>
            )}

            {/* 게시물 — 1행 레일. 카드 구성·문법은 FeedList 와 동일하게 맞춘다(신규 디자인 없음).
                응원은 목록에서 되고 댓글은 상세에서만 — FeedList 의 기존 관례. */}
            <div className={styles.sectionHead}>
              <h2>{t('userProfile.feedSection', { defaultValue: '게시물' })}</h2>
              {posts.length > 0 && postsTotal > posts.length && (
                <button
                  type="button"
                  className={styles.seeMoreBtn}
                  aria-label={`${t('userProfile.feedSection')} ${t('home.seeMore')}`}
                  onClick={() => navigate(`/profile/${userId}/posts`, { state: location.state })}
                >
                  {t('home.seeMore')}
                  <ChevronRight size={14} />
                </button>
              )}
            </div>

            {feedLoading ? (
              <SkeletonRows count={3} />
            ) : feedError ? (
              <StateBlock
                icon={AlertCircle}
                tone="error"
                title={t('userProfile.feedError', { defaultValue: '게시물을 불러오지 못했어요' })}
                actionLabel={t('common.retry', { defaultValue: '다시 시도' })}
                onAction={() => userId && void loadPage(userId)}
              />
            ) : posts.length === 0 ? (
              <StateBlock
                icon={Newspaper}
                title={t('userProfile.feedEmpty', { defaultValue: '아직 작성한 게시물이 없어요' })}
              />
            ) : (
              <div className={styles.rail}>
                {posts.map((p) => (
                  <div className={styles.railItem} key={p.id}>
                    <ProfileFeedCard
                      post={p}
                      onClick={() => navigate(`/feed/post/${p.id}`)}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* FR-2 제안 ② — 더보기 시트를 [신고하기][차단하기(위험 톤)] 2행으로. 신고 사유
          리스트는 [신고하기] 탭 뒤 2단계(별도 시트)로 내린다. 차단은 기존 blockUser() 재사용. */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)}>
        <button
          type="button"
          className={styles.reportItem}
          disabled={reported}
          onClick={() => { setMoreOpen(false); setReportOpen(true); }}
        >
          <Flag size={16} strokeWidth={2.2} />
          {reported ? t('follow.reportedAlready', { defaultValue: '신고함' }) : t('follow.report')}
        </button>
        <button
          type="button"
          className={`${styles.reportItem} ${styles.reportItemDanger}`}
          onClick={handleBlockPick}
        >
          <Ban size={16} strokeWidth={2.2} />
          {t('follow.block', { defaultValue: '이 사용자 차단' })}
        </button>
      </BottomSheet>

      {/* 신고 사유 — 이제 페이지이므로 공용 BottomSheet 를 그대로 쓸 수 있다.
          시트 안 시트였던 종전에는 z-index 가 겹쳐 자체 오버레이를 따로 만들어야 했다.
          FR-2 제안 ① — 사유 탭 → 접수 사이에 확인 1회(handleReasonPick 이 useConfirmStore 를 연다). */}
      <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)}>
        <h2 className={styles.reportTitle}>{t('follow.reportTitle')}</h2>
        {USER_REPORT_REASONS.map((r) => (
          <button key={r} type="button" className={styles.reportItem} onClick={() => handleReasonPick(r)}>
            {t(`follow.reportReason_${r}`)}
          </button>
        ))}
      </BottomSheet>
    </div>
  );
}
