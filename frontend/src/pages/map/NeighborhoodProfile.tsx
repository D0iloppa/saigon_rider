import { ArrowLeft, Heart, MapPinned, Pencil, ShoppingBag, Store, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { AppImage } from '@/components/ui/AppImage';
import styles from './NeighborhoodProfile.module.css';

/**
 * 동네지도 전용 프로필 목업.
 * 백엔드의 동네 활동·후기·장소 모델이 준비되기 전까지 화면 상태는 로컬 고정값만 사용한다.
 */
export default function NeighborhoodProfile() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const nickname = user?.nickname || t('map.neighborhoodProfile.defaultNickname');
  const shortcuts = [
    { label: t('map.neighborhoodProfile.shortcuts.coupons'), Icon: Ticket },
    { label: t('map.neighborhoodProfile.shortcuts.orders'), Icon: ShoppingBag },
    { label: t('map.neighborhoodProfile.shortcuts.wishlist'), Icon: Heart },
    { label: t('map.neighborhoodProfile.shortcuts.favorites'), Icon: Store },
  ];

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ArrowLeft size={28} />
        </button>
        <h1>{t('map.neighborhoodProfile.title')}</h1>
      </header>

      <section className={styles.userRow}>
        <div className={styles.avatar}>
          {user?.avatarUrl ? <AppImage src={user.avatarUrl} alt="" variant="circle" /> : <span>{nickname.charAt(0).toUpperCase()}</span>}
        </div>
        <div><strong>{nickname}</strong><p>{t('map.neighborhoodProfile.activityComingSoon')}</p></div>
      </section>

      <section className={styles.shortcuts}>
        {shortcuts.map(({ label, Icon }) => (
          <button type="button" className={styles.shortcut} key={label} aria-disabled="true">
            <span><Icon size={25} strokeWidth={2} /></span>{label}
          </button>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>{t('map.neighborhoodProfile.reviews')}</h2><button type="button" aria-disabled="true"><Pencil size={18} /> {t('map.neighborhoodProfile.writeReview')}</button></div>
        <div className={styles.reviewSummary}>
          <div><span>{t('map.neighborhoodProfile.averageRating')}</span><strong className={styles.star}>★ -</strong></div>
          <div><span>{t('map.neighborhoodProfile.totalViews')}</span><strong>0</strong></div>
          <div><span>{t('map.neighborhoodProfile.helpfulCount')}</span><strong>0</strong></div>
        </div>
        <div className={styles.notice}><span>🏷️</span><strong>{t('map.neighborhoodProfile.reviewNotice')}</strong><button type="button" aria-disabled="true">{t('common.more')}</button></div>
        <p className={styles.empty}>{t('map.neighborhoodProfile.noReviews')}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('map.neighborhoodProfile.placeSuggestion')}</h2>
        <div className={styles.placeEmpty}>
          <MapPinned size={34} strokeWidth={1.7} />
          <p>{t('map.neighborhoodProfile.placeHint')}</p>
          <button type="button" aria-disabled="true">{t('map.neighborhoodProfile.addPlace')}</button>
        </div>
      </section>
    </main>
  );
}
