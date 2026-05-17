import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { fetchUserProfile } from '@/api/profile';
import { followUser, unfollowUser } from '@/api/follows';
import { useUserStore } from '@/store/useUserStore';
import { formatNumber } from '@/lib/format';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import type { UserProfile } from '@/api/types';
import styles from './ProfileCard.module.css';

interface Props {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}

export function ProfileCard({ userId, open, onClose }: Props) {
  const { t } = useTranslation();
  const me = useUserStore((s) => s.user);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!open || !userId) {
      setProfile(null);
      return;
    }
    setLoading(true);
    fetchUserProfile(userId, me?.id)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [open, userId, me?.id]);

  async function handleToggleFollow() {
    if (!profile || !me) return;
    setToggling(true);
    try {
      if (profile.isFollowing) {
        await unfollowUser(profile.id);
        toast.success(t('follow.unfollowBtn'));
      } else {
        await followUser(profile.id);
        toast.success(t('follow.followBtn') + '!');
      }
      setProfile((prev) => prev ? { ...prev, isFollowing: !prev.isFollowing } : prev);
    } catch (err: any) {
      const msg = typeof err?.message === 'string' ? err.message : String(err ?? 'Error');
      toast.error(msg);
    } finally {
      setToggling(false);
    }
  }

  const riderStyleLabel = profile?.riderStyle === 'commuter'
    ? t('profileSetup.styleCommuterTitle')
    : profile?.riderStyle === 'cafe_hunter'
    ? t('profileSetup.styleCafeHunterTitle')
    : profile?.riderStyle === 'night_rider'
    ? t('profileSetup.styleNightRiderTitle')
    : null;

  return (
    <BottomSheet open={open} onClose={onClose} height="half">
      <div className={styles.root}>
        {loading ? (
          <div className={styles.loading}>{t('common.loading')}</div>
        ) : profile ? (
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
                </div>
                {riderStyleLabel && (
                  <Chip variant="surface">🌙 {riderStyleLabel}</Chip>
                )}
              </div>
            </div>

            <div className={styles.statsRow}>
              <div className={styles.statCell}>
                <span className={styles.statNum}>{formatNumber(profile.followerCount)}</span>
                <span className={styles.statLabel}>{t('follow.followers')}</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statCell}>
                <span className={styles.statNum}>{formatNumber(profile.followingCount)}</span>
                <span className={styles.statLabel}>{t('follow.following')}</span>
              </div>
            </div>

            {me && me.id !== profile.id && (
              <Button
                variant={profile.isFollowing ? 'secondary' : 'primary'}
                onClick={handleToggleFollow}
                disabled={toggling}
                className={styles.followBtn}
              >
                {profile.isFollowing ? t('follow.unfollowBtn', '언팔로우') : t('follow.followBtn')}
              </Button>
            )}
          </>
        ) : (
          <div className={styles.loading}>{t('common.error', 'Error')}</div>
        )}
      </div>
    </BottomSheet>
  );
}
