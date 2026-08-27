import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle, Building2, Coffee, Flame, MessageCircle, MoreVertical, Moon, Newspaper, Send,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { LevelBadge } from '@/components/ui/LevelBadge';
import StateBlock from '@/components/ui/StateBlock';
import SkeletonRows from '@/components/ui/SkeletonRows';
import { Chip } from '@/components/ui/Chip';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import { SessionExpiredError, extractErrorCode } from '@/api/client';
import { fetchUserProfile, reportUser, USER_REPORT_REASONS, type UserReportReason } from '@/api/profile';
import { fetchMyFeed, toggleCheer } from '@/api/feed';
import { followUser, unfollowUser } from '@/api/follows';
import { createConversation } from '@/api/dm';
import { useUserStore } from '@/store/useUserStore';
import { useDialogStore } from '@/store/useDialogStore';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import type { FeedPost, UserProfile as UserProfileData } from '@/api/types';
import sys from '@/styles/system.module.css';
import styles from './UserProfile.module.css';

const PAGE_SIZE = 10;

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const me = useUserStore((s) => s.user);

  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);

  // 내 프로필은 이 화면이 아니라 /profile(ProfileMain) 이 담당한다 — 진입점들이 이미 분기하지만
  // 딥링크로 직접 들어온 경우도 있으므로 여기서도 되돌린다.
  useEffect(() => {
    if (me && userId && me.id === userId) navigate('/profile', { replace: true });
  }, [me, userId, navigate]);

  const loadPage = useCallback(async (target: string, page: number, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (append) setFeedLoadingMore(true);
    else setFeedLoading(true);
    try {
      const result = await fetchMyFeed(target, page, PAGE_SIZE);
      setPosts((prev) => (append ? [...prev, ...result.items] : result.items));
      pageRef.current = page;
      setHasMore(page * PAGE_SIZE < result.total);
      setFeedError(false);
    } catch {
      // 조회 실패를 "게시물 없음"으로 위장하지 않는다 — 정보 화면에서 같은 결함(조회 실패가
      // '아직 리뷰가 없어요'로 표시)을 이미 고친 선례가 있다. 이어붙이기 실패는 이미 받아둔
      // 목록을 지우지 않고 조용히 두되, 첫 페이지 실패는 오류+재시도로 드러낸다.
      if (!append) setFeedError(true);
    } finally {
      loadingRef.current = false;
      setFeedLoading(false);
      setFeedLoadingMore(false);
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
    pageRef.current = 1;
    loadingRef.current = false;
    setHasMore(true);
    setFeedError(false);
    void loadPage(userId, 1, false);
  }, [userId, loadPage]);

  useEffect(load, [load]);

  // 무한 스크롤 — 바닥 근처에서 다음 페이지.
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!userId || !hasMore || loadingRef.current) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
      void loadPage(userId, pageRef.current + 1, true);
    }
  };

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

  async function handleCheer(post: FeedPost, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { cheered, count } = await toggleCheer(post.id);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, iCheered: cheered, cheerCount: count } : p)));
    } catch {
      // 조용한 실패 + unhandled rejection 을 남기지 않는다.
      toast.error(t('feed.cheerError', { defaultValue: '잠시 후 다시 시도해 주세요' }));
    }
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
            onClick={() => setReportOpen(true)}
            aria-label={t('follow.report')}
          >
            <MoreVertical size={20} strokeWidth={2.2} />
          </button>
        ) : undefined}
      />

      <div className={`${sys.scroll} ${styles.scroll}`} onScroll={onScroll}>
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
            <div className={styles.header}>
              <AppImage
                src={profile.avatarUrl || '/saigon-default.jpg'}
                alt=""
                className={styles.avatar}
                variant="circle"
              />
              <div className={styles.info}>
                <div className={styles.nickRow}>
                  <span className={styles.nickname}>{profile.nickname ?? 'Unknown'}</span>
                  <LevelBadge level={profile.level} />
                  <VerifiedBadge verified={profile.isPhoneVerified} phoneMasked={profile.phoneMasked} />
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

            {isOther && (
              <div className={styles.actionRow}>
                <Button
                  variant={profile.isFollowing ? 'secondary' : 'primary'}
                  onClick={handleToggleFollow}
                  disabled={toggling}
                  className={styles.followBtn}
                >
                  {profile.isFollowing ? t('follow.unfollowBtn') : t('follow.followBtn')}
                </Button>
                <button
                  type="button"
                  className={styles.dmBtn}
                  onClick={handleDm}
                  disabled={dmLoading}
                  aria-label={t('follow.dmBtn', { defaultValue: '메시지' })}
                >
                  <Send size={18} strokeWidth={2.2} />
                </button>
              </div>
            )}

            {/* 게시물 — 2열 그리드. 카드 구성·문법은 FeedList 와 동일하게 맞춘다(신규 디자인 없음).
                응원은 목록에서 되고 댓글은 상세에서만 — FeedList 의 기존 관례. */}
            <div className={styles.sectionLabel}>{t('userProfile.feedSection', { defaultValue: '게시물' })}</div>

            {feedLoading ? (
              <SkeletonRows count={3} />
            ) : feedError ? (
              <StateBlock
                icon={AlertCircle}
                tone="error"
                title={t('userProfile.feedError', { defaultValue: '게시물을 불러오지 못했어요' })}
                actionLabel={t('common.retry', { defaultValue: '다시 시도' })}
                onAction={() => userId && void loadPage(userId, 1, false)}
              />
            ) : posts.length === 0 ? (
              <StateBlock
                icon={Newspaper}
                title={t('userProfile.feedEmpty', { defaultValue: '아직 작성한 게시물이 없어요' })}
              />
            ) : (
              <div className={styles.feedGrid}>
                {posts.map((p) => (
                  <article
                    key={p.id}
                    className={styles.feedCard}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/feed/post/${p.id}`)}
                    onKeyDown={(e) => {
                      // 내부 응원 버튼에서 버블링된 키다운은 무시(그 버튼 자체가 반응한다)
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/feed/post/${p.id}`);
                      }
                    }}
                  >
                    <div className={styles.feedThumb}>
                      {p.photoUrl ? (
                        <AppImage src={p.photoUrl} alt="" className={styles.feedPhoto} />
                      ) : (
                        <span className={styles.feedPlaceholder}><Newspaper size={22} /></span>
                      )}
                    </div>
                    <span className={styles.feedBody}>
                      <span className={styles.feedTime}>{formatRelativeTime(p.createdAt)}</span>
                      <span className={styles.feedCaption}>{p.caption ?? t('feed.noCaption')}</span>
                      <span className={styles.feedMeta}>
                        <button
                          type="button"
                          className={`${styles.cheerBtn} ${p.iCheered ? styles.cheerBtnActive : ''}`}
                          onClick={(e) => void handleCheer(p, e)}
                        >
                          <Flame size={12} />
                          {p.cheerCount > 0 && <span>{p.cheerCount}</span>}
                        </button>
                        {p.commentCount > 0 && <span className={styles.commentCount}><MessageCircle size={12} />{p.commentCount}</span>}
                      </span>
                    </span>
                  </article>
                ))}
              </div>
            )}

            {feedLoadingMore && <SkeletonRows count={1} />}
          </>
        )}
      </div>

      {/* 신고 사유 — 이제 페이지이므로 공용 BottomSheet 를 그대로 쓸 수 있다.
          시트 안 시트였던 종전에는 z-index 가 겹쳐 자체 오버레이를 따로 만들어야 했다. */}
      <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)}>
        <h2 className={styles.reportTitle}>{t('follow.reportTitle')}</h2>
        {USER_REPORT_REASONS.map((r) => (
          <button key={r} type="button" className={styles.reportItem} onClick={() => void handleReport(r)}>
            {t(`follow.reportReason_${r}`)}
          </button>
        ))}
      </BottomSheet>
    </div>
  );
}
