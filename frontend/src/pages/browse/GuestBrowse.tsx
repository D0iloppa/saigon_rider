import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import MarketMain from '@/pages/market/MarketMain';
import FeedList from '@/pages/feed/FeedList';
import styles from './GuestBrowse.module.css';

type Tab = 'market' | 'community';

/**
 * 비로그인 둘러보기 — 스플래시 [둘러보기] 의 목적지 (F-N-03 FR-2, 대표 결정 2026-10-14).
 * 상단 세그먼트 [상품 | 커뮤니티] 아래에 기존 MarketMain / FeedList 를 그대로 끼운다(포크·복제 없음 —
 * 두 화면은 `embedded` 로 자기 상단 인셋/셸 헤더만 뺀다). 탭은 URL(`?tab=market|community`, 기본 market)에
 * 두어 뒤로가기·새로고침·상세 왕복에도 유지된다. 쓰기·개인화 행동은 각 화면의 useRequireAuth 가 그대로
 * 게이트한다(returnTo = /browse?tab=…). 로그인 사용자는 보던 탭의 회원 화면(/market·/feed)으로 — 쓰기→로그인 후 맥락 유지.
 */
export default function GuestBrowse() {
  const { t } = useTranslation();
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const [searchParams, setSearchParams] = useSearchParams();

  const tab: Tab = searchParams.get('tab') === 'community' ? 'community' : 'market';
  if (isAuthenticated) {
    // tab 만 떼고 나머지 쿼리(view=map, filter 등)는 회원 화면으로 넘긴다 — 로그인 전 보던 상태 유지.
    const rest = new URLSearchParams(searchParams);
    rest.delete('tab');
    const qs = rest.toString();
    return <Navigate to={`${tab === 'community' ? '/feed' : '/market'}${qs ? `?${qs}` : ''}`} replace />;
  }

  const seg = (key: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      data-testid={`browse-seg-${key}`}
      className={`${styles.segTab} ${tab === key ? styles.segTabActive : ''}`}
      // 탭 전환은 push — 뒤로가기가 이전 탭으로 돌아간다. 다른 탭의 쿼리(view·filter)는 함께 버린다.
      onClick={() => { if (tab !== key) setSearchParams({ tab: key }); }}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.segment} role="tablist" aria-label={t('splash.startBtn')}>
          {seg('market', t('browse.tabMarket'))}
          {seg('community', t('browse.tabCommunity'))}
        </div>
      </div>
      <div className={styles.body}>
        {tab === 'market' ? <MarketMain embedded /> : <FeedList embedded />}
      </div>
    </div>
  );
}
